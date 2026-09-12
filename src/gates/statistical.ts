export type StatisticalGateMode = 'off' | 'bootstrap';

export type StatisticalGateConfig = {
  mode?: StatisticalGateMode;
  confidenceLevel?: number;
  bootstrapSamples?: number;
  minPassRateDelta?: number;
};

export type BootstrapPassRateDelta = {
  observedCurrentRate: number;
  observedPreviousRate: number;
  observedDelta: number;
  lowerBound: number;
  upperBound: number;
  confidenceLevel: number;
  bootstrapSamples: number;
};

export const validateStatisticalGateConfig = (
  config?: StatisticalGateConfig,
): string[] => {
  if (!config || config.mode !== 'bootstrap') return [];

  const errors: string[] = [];
  if (
    config.confidenceLevel !== undefined &&
    (config.confidenceLevel <= 0 || config.confidenceLevel >= 1)
  ) {
    errors.push('statistical.confidenceLevel must be > 0 and < 1');
  }
  if (
    config.bootstrapSamples !== undefined &&
    (!Number.isFinite(config.bootstrapSamples) || config.bootstrapSamples < 200)
  ) {
    errors.push('statistical.bootstrapSamples must be >= 200');
  }
  return errors;
};

const quantile = (values: number[], q: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const clampedQ = Math.min(1, Math.max(0, q));
  const index = (sorted.length - 1) * clampedQ;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower] ?? 0;
  const weight = index - lower;
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * weight;
};

const hashSeed = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed: number): (() => number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const bootstrapMean = (values: number[], random: () => number): number => {
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const idx = Math.floor(random() * values.length);
    sum += values[idx] ?? 0;
  }
  return values.length > 0 ? sum / values.length : 0;
};

export const bootstrapPassRateDelta = (
  currentOutcomes: number[],
  previousOutcomes: number[],
  options?: { confidenceLevel?: number; bootstrapSamples?: number; seedHint?: string },
): BootstrapPassRateDelta => {
  const confidenceLevel = options?.confidenceLevel ?? 0.95;
  if (!(confidenceLevel > 0 && confidenceLevel < 1)) {
    throw new Error('statistical.confidenceLevel must be > 0 and < 1');
  }

  const bootstrapSamples = Math.floor(options?.bootstrapSamples ?? 2000);
  if (!Number.isFinite(bootstrapSamples) || bootstrapSamples < 200) {
    throw new Error('statistical.bootstrapSamples must be >= 200');
  }
  const observedCurrentRate =
    currentOutcomes.reduce((sum, value) => sum + value, 0) / currentOutcomes.length;
  const observedPreviousRate =
    previousOutcomes.reduce((sum, value) => sum + value, 0) / previousOutcomes.length;
  const observedDelta = observedCurrentRate - observedPreviousRate;
  const alpha = 1 - confidenceLevel;
  const seed = hashSeed(`${options?.seedHint ?? ''}:${bootstrapSamples}`);
  const random = mulberry32(seed);
  const deltas: number[] = [];

  for (let i = 0; i < bootstrapSamples; i += 1) {
    const sampledCurrentRate = bootstrapMean(currentOutcomes, random);
    const sampledPreviousRate = bootstrapMean(previousOutcomes, random);
    deltas.push(sampledCurrentRate - sampledPreviousRate);
  }

  return {
    observedCurrentRate,
    observedPreviousRate,
    observedDelta,
    lowerBound: quantile(deltas, alpha / 2),
    upperBound: quantile(deltas, 1 - alpha / 2),
    confidenceLevel,
    bootstrapSamples,
  };
};
