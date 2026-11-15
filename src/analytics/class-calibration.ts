import type { EvalReportV1, EvalRow, LabelScale } from '../model/eval-report-v1.js';
import { isLabelScale, manifestForSuite } from '../model/label-scale.js';
import { measureLabelPairs } from './calibration.js';

export const measureClassCalibration = (rows: readonly EvalRow[], scale: LabelScale) => {
  const pairs = isLabelScale(scale) ? rows.flatMap(row =>
    typeof row.judgeLabel === 'string' && typeof row.groundTruthLabel === 'string' &&
    scale.labels.includes(row.judgeLabel) && scale.labels.includes(row.groundTruthLabel)
      ? [{ judge: row.judgeLabel, human: row.groundTruthLabel }] : []) : [];
  return measureLabelPairs(pairs, isLabelScale(scale) ? scale.labels : []);
};

/** Keep different suite scales separate; never pool incompatible class definitions. */
export const summarizeClassCalibration = (report: EvalReportV1) => report.suites.flatMap(suite => {
  const manifest = manifestForSuite(report, suite.id);
  if (!isLabelScale(manifest?.labelScale)) return [];
  const scale = manifest.labelScale;
  const rows = report.rows.filter(row => manifestForSuite(report, row.suite) === manifest);
  const judges = [...new Set(rows.map(row => row.judgeModel))];
  const categories = [...new Set(rows.map(row => row.groundTruthCategory))];
  return [{ suite: suite.id, labelScale: { labels: [...scale.labels], passLabels: [...scale.passLabels] }, ...measureClassCalibration(rows, scale),
    judgeSummaries: judges.map(judgeModel => ({ judgeModel, ...measureClassCalibration(rows.filter(row => row.judgeModel === judgeModel), scale) })),
    categorySummaries: categories.map(category => ({ category, ...measureClassCalibration(rows.filter(row => row.groundTruthCategory === category), scale) })) }];
});
export type ClassCalibrationSummary = ReturnType<typeof summarizeClassCalibration>[number];
