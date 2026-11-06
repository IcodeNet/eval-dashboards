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
  const kappaStatus = total === 0 ? 'no-pairs' : expectedAgreementRate === 1 ? 'degenerate' : 'defined';
  // Unweighted nominal Cohen's kappa; no replacement value for an undefined denominator.
  const kappa = kappaStatus === 'defined'
    ? Math.max(-1, Math.min(1, (agreementRate! - expectedAgreementRate!) / (1 - expectedAgreementRate!)))
    : undefined;
  return { total, agreements, disagreements: total - agreements, agreementRate, expectedAgreementRate, kappa, kappaStatus, labelCounts };
};

/** Aggregate-only path for gates; avoid building unused category/model groups. */
export const measureCalibrationAgreement = (rows: readonly EvalRow[]): CalibrationAgreement => agreement(pairedRows(rows));

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
  `Calibration: pairs=${summary.total}, agreement=${summary.agreementRate === undefined ? 'unknown' : summary.agreementRate.toFixed(3)}, ` +
  `kappa=${summary.kappa === undefined ? `unavailable (${summary.kappaStatus})` : summary.kappa.toFixed(3)}`;
