import type { EvalReportV1, EvalRow, SuiteManifest } from '../model/eval-report-v1.js';

export type MeasuredMetric = {
  unit: 'USD' | 'tokens' | 'ms' | 'suite-score';
  direction: 'lower-is-better' | 'higher-is-better' | 'unknown';
  measured: number;
  total: number;
  missing: number;
  coverage?: number;
  sum?: number;
  mean?: number;
  p50?: number;
  p95?: number;
};
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const metric = (rows: EvalRow[], valueOf: (row: EvalRow) => number | undefined, unit: MeasuredMetric['unit'], direction: MeasuredMetric['direction'], sum = true): MeasuredMetric => {
  const values = rows.map(valueOf).filter((value): value is number => value !== undefined).sort((a, b) => a - b);
  const measured = values.length, total = rows.length;
  const base: MeasuredMetric = { unit, direction, measured, total, missing: total - measured, coverage: total ? measured / total : undefined };
  if (!measured) return base;
  // Nearest-rank percentiles; no zero fill for unmeasured rows.
  const sumValue = values.reduce((a, b) => a + b, 0);
  const mean = values.reduce((result, value) => result + value / measured, 0);
  return { ...base, ...(sum && Number.isFinite(sumValue) ? { sum: sumValue } : {}), ...(Number.isFinite(mean) ? { mean } : {}),
    p50: values[Math.max(0, Math.ceil(measured * 0.5) - 1)], p95: values[Math.ceil(measured * 0.95) - 1] };
};
const nonnegative = (value: unknown): number | undefined => finite(value) && value >= 0 ? value : undefined;
export const summarizeTelemetry = (report: EvalReportV1) => {
  const manifests = new Map<string, SuiteManifest[]>();
  for (const manifest of report.suiteManifests ?? []) { const list = manifests.get(manifest.name) ?? []; list.push(manifest); manifests.set(manifest.name, list); }
  const bySuite = new Map<string, EvalRow[]>();
  for (const row of report.rows) { const list = bySuite.get(row.suite) ?? []; list.push(row); bySuite.set(row.suite, list); }
  return {
    // Usage is canonical row.usage telemetry; legacy aliases are not silently mixed into this view.
    cost: metric(report.rows, row => nonnegative(row.usage?.costUsd), 'USD', 'lower-is-better'),
    tokens: metric(report.rows, row => nonnegative(row.usage?.totalTokens), 'tokens', 'unknown'),
    duration: metric(report.rows, row => nonnegative(row.durationMs), 'ms', 'lower-is-better'),
    suites: [...bySuite].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([suite, rows]) => {
      const candidates = manifests.get(suite) ?? [];
      const manifest = candidates.length === 1 ? candidates[0] : undefined;
      return { suite, score: metric(rows, row => candidates.length <= 1 && finite(row.score) && (!manifest?.scoreScale || (row.score >= manifest.scoreScale.min && row.score <= manifest.scoreScale.max)) ? row.score : undefined,
        'suite-score', manifest?.scoreDirection ?? 'unknown', false) };
    }),
    populationCoverage: { dataset: 'unknown' as const, production: 'unknown' as const },
  };
};
