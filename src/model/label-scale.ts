import type { EvalReportV1, LabelScale, SuiteManifest } from './eval-report-v1.js';

export const isLabelScale = (value: unknown): value is LabelScale => {
  if (!value || typeof value !== 'object') return false;
  const scale = value as LabelScale;
  return Array.isArray(scale.labels) && scale.labels.length >= 2 &&
    scale.labels.every(label => typeof label === 'string' && label.trim().length > 0) &&
    new Set(scale.labels).size === scale.labels.length && Array.isArray(scale.passLabels) &&
    scale.passLabels.every(label => scale.labels.includes(label)) &&
    new Set(scale.passLabels).size === scale.passLabels.length;
};

/** Resolve canonical suite ids first; ambiguous aliases cannot supply a scale. */
export const manifestForSuite = (report: EvalReportV1, suite: string): SuiteManifest | undefined => {
  const byId = report.suites.filter(summary => summary.id === suite);
  const summaries = byId.length ? byId : report.suites.filter(summary => summary.name === suite);
  if (summaries.length !== 1) return undefined;
  const summary = summaries[0];
  const manifests = (report.suiteManifests ?? []).filter(manifest => manifest.name === summary.id ||
    (manifest.name === summary.name && !report.suites.some(other => other !== summary && other.id === manifest.name)));
  return manifests.length === 1 ? manifests[0] : undefined;
};
