import { COMPARISON_KEYS, type ComparisonKey, type SuiteManifest, type VersionKeyComparison } from '../model/eval-report-v1.js';
import { stripControlCharacters } from '../utils/untrusted-text.js';

export const comparisonKeyLabels: Record<ComparisonKey, string> = {
  modelDigest: 'Model version', promptHash: 'Prompt version', toolContract: 'Tool definitions version', instanceConfig: 'Settings version',
};
const present = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export const compareVersionKeys = (candidate: SuiteManifest, baseline?: SuiteManifest): VersionKeyComparison[] =>
  COMPARISON_KEYS.map(key => {
    const candidateValue = candidate.comparisonKeys?.[key], baselineValue = baseline?.comparisonKeys?.[key];
    const base = { suite: candidate.name, key, candidateValue, baselineValue };
    if (!present(candidateValue) || !present(baselineValue)) return {
      ...base, status: 'unknown', reason: !present(candidateValue) && !present(baselineValue)
        ? 'Neither run recorded this version.' : !present(candidateValue)
          ? 'The current run did not record this version.' : 'The baseline did not record this version.',
    };
    if (candidateValue === baselineValue) return { ...base, status: 'match', reason: 'Both runs recorded the same value.' };
    const treatment = candidate.comparisonTreatments?.[key];
    if (present(treatment)) return { ...base, status: 'treatment', reason: treatment };
    return { ...base, status: 'changed', reason: 'The recorded values differ without a declared experiment change.' };
  });

export const describeVersionKey = (check: VersionKeyComparison): string => stripControlCharacters(
  `${comparisonKeyLabels[check.key]} for ${check.suite}: ${check.status === 'treatment' ? 'planned experiment change' : check.status}; ` +
  `baseline=${check.baselineValue ?? 'not recorded'}, current=${check.candidateValue ?? 'not recorded'}. ${check.reason}`,
).replace(/[\r\n]+/g, ' ');

/** Show actionable differences before bounded display; keep full evidence in JSON. */
export const prioritizeVersionKeys = (checks: readonly VersionKeyComparison[]): VersionKeyComparison[] => {
  const rank = { changed: 0, unknown: 1, treatment: 2, match: 3 };
  return [...checks].sort((left, right) => rank[left.status] - rank[right.status]);
};
