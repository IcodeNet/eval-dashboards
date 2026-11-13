import type { EvalRow } from '../model/eval-report-v1.js';

export type CalibrationAgreement = {
  total: number;
  agreements: number;
  disagreements: number;
  agreementRate: number | undefined;
  expectedAgreementRate: number | undefined;
  kappa: number | undefined;
  kappaStatus: 'defined' | 'no-pairs' | 'degenerate';
  /** Match rate within each human-labelled class, alongside both marginal counts. */
  labelCounts: Array<{ label: boolean; judge: number; human: number; matches: number; agreementRate: number | undefined }>;
};
type Pair = EvalRow & { judgeVerdict: boolean; groundTruthVerdict: boolean };
const pairedRows = (rows: readonly EvalRow[]): Pair[] =>
  rows.filter((row): row is Pair => typeof row.judgeVerdict === 'boolean' && typeof row.groundTruthVerdict === 'boolean');

const kappaFraction = (counts: CalibrationAgreement['labelCounts']) => {
  const positive = counts.find(count => count.label)!;
  const negative = counts.find(count => !count.label)!;
  const bothPass = BigInt(positive.matches), bothFail = BigInt(negative.matches);
  const judgeOnlyPass = BigInt(positive.judge - positive.matches);
  const reviewerOnlyPass = BigInt(positive.human - positive.matches);
  return {
    numerator: 2n * (bothPass * bothFail - judgeOnlyPass * reviewerOnlyPass),
    denominator: (bothPass + judgeOnlyPass) * (judgeOnlyPass + bothFail) +
      (bothPass + reviewerOnlyPass) * (reviewerOnlyPass + bothFail),
  };
};

const agreement = (rows: Pair[]): CalibrationAgreement => {
  const labelCounts = [false, true].map(label => {
    const judge = rows.filter(row => row.judgeVerdict === label).length;
    const human = rows.filter(row => row.groundTruthVerdict === label).length;
    const matches = rows.filter(row => row.judgeVerdict === label && row.groundTruthVerdict === label).length;
    return { label, judge, human, matches, agreementRate: human > 0 ? matches / human : undefined };
  });
  const total = rows.length;
  const agreements = labelCounts.reduce((sum, counts) => sum + counts.matches, 0);
  const agreementRate = total > 0 ? agreements / total : undefined;
  const expectedAgreementRate = total > 0
    ? labelCounts.reduce((sum, counts) => sum + (counts.judge / total) * (counts.human / total), 0)
    : undefined;
  const fraction = kappaFraction(labelCounts);
  const kappaStatus = total === 0 ? 'no-pairs' : fraction.denominator === 0n ? 'degenerate' : 'defined';
  // The count-based form avoids subtracting nearly equal rounded probabilities.
  const kappa = kappaStatus === 'defined'
    ? Number(fraction.numerator) / Number(fraction.denominator)
    : undefined;
  return { total, agreements, disagreements: total - agreements, agreementRate, expectedAgreementRate, kappa, kappaStatus, labelCounts };
};

/** Aggregate-only path for gates; avoid building unused category/model groups. */
export const measureCalibrationAgreement = (rows: readonly EvalRow[]): CalibrationAgreement => agreement(pairedRows(rows));

/** Compare exact counts with the configured decimal minimum, without a tolerance. */
export const meetsMinimumKappa = (summary: CalibrationAgreement, minimum: number): boolean => {
  if (summary.kappaStatus !== 'defined' || !Number.isFinite(minimum)) return false;
  const fraction = kappaFraction(summary.labelCounts);
  const [coefficient, exponent = '0'] = minimum.toString().split('e');
  const decimalPlaces = (coefficient.split('.')[1] ?? '').length;
  const scale = decimalPlaces - Number(exponent);
  const digits = BigInt(coefficient.replace('.', ''));
  const minimumNumerator = scale < 0 ? digits * 10n ** BigInt(-scale) : digits;
  const minimumDenominator = scale > 0 ? 10n ** BigInt(scale) : 1n;
  return fraction.numerator * minimumDenominator >= minimumNumerator * fraction.denominator;
};

/** Descriptive calibration evidence; reporting alone never enables a gate. */
export const summarizeCalibration = (rows: readonly EvalRow[]) => {
  const pairs = pairedRows(rows);
  const suites = new Map<string, Pair[]>();
  const judges = new Map<string | undefined, Pair[]>();
  const categories = new Map<string | undefined, Pair[]>();
  for (const row of pairs) {
    const suite = suites.get(row.suite) ?? []; suite.push(row); suites.set(row.suite, suite);
    const judge = judges.get(row.judgeModel) ?? []; judge.push(row); judges.set(row.judgeModel, judge);
    const category = categories.get(row.groundTruthCategory) ?? []; category.push(row); categories.set(row.groundTruthCategory, category);
  }
  return {
    ...agreement(pairs),
    suiteSummaries: [...suites].map(([suite, values]) => ({ suite, ...agreement(values) })),
    judgeSummaries: [...judges].map(([judgeModel, values]) => ({ judgeModel, ...agreement(values) })),
    categorySummaries: [...categories].map(([category, values]) => ({ category, ...agreement(values) })),
  };
};
export type CalibrationSummary = ReturnType<typeof summarizeCalibration>;

export const describeCalibration = (summary: CalibrationAgreement): string =>
  `Judge review: examples=${summary.total}, agreement=${summary.agreementRate === undefined ? 'unknown' : summary.agreementRate.toFixed(3)}, ` +
  `expected agreement=${summary.expectedAgreementRate === undefined ? 'unknown' : summary.expectedAgreementRate.toFixed(3)}, ` +
  `kappa=${summary.kappa === undefined ? `unavailable (${summary.kappaStatus === 'no-pairs' ? 'missing decisions' : 'everyone chose the same answer'})` : summary.kappa.toFixed(3)}`;
