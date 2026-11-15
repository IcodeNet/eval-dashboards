import { compareVersionKeys, comparisonKeyLabels } from './version-keys.js';
import type {
    BaselineCompatibilityIssue,
    BaselineCompatibilityResult,
    SuiteManifest,
} from '../model/eval-report-v1.js';

/**
 * Determine whether a run's suite manifests (dataset/rubric and optional recorded versions) are
 * compatible with a baseline's, so pass/fail deltas aren't misattributed to
 * a genuine regression when the underlying dataset or rubric actually
 * changed. Returns the status and recorded checks; missing optional keys stay unknown.
 */
export const assessBaselineCompatibility = (
    candidateManifests: readonly SuiteManifest[] | undefined,
    baselineManifests: readonly SuiteManifest[] | undefined,
    hasComparison: boolean,
): BaselineCompatibilityResult | undefined => {
    if (!hasComparison || !candidateManifests?.length) {
        return undefined;
    }

    const baselineBySuite = new Map((baselineManifests ?? []).map(manifest => [manifest.name, manifest]));
    const versionKeys = candidateManifests.flatMap(manifest => compareVersionKeys(manifest, baselineBySuite.get(manifest.name)));
    if (!baselineManifests?.length) {
        return {
            status: 'warning',
            versionKeys,
            issues: candidateManifests.map((manifest) => ({
                suite: manifest.name,
                severity: 'warning',
                reason: 'baseline report does not include suite manifest metadata',
                candidateDatasetVersion: manifest.datasetVersion,
                candidateRubricVersion: manifest.rubricVersion,
            })),
        };
    }

    const issues: BaselineCompatibilityIssue[] = [];

    for (const candidate of candidateManifests) {
        const baseline = baselineBySuite.get(candidate.name);

        if (!baseline) {
            issues.push({
                suite: candidate.name,
                severity: 'warning',
                reason: 'suite is present in the candidate run but absent from the baseline manifest',
                candidateDatasetVersion: candidate.datasetVersion,
                candidateRubricVersion: candidate.rubricVersion,
            });
            continue;
        }

        for (const check of versionKeys.filter(check => check.suite === candidate.name)) {
            if (check.status === 'changed' || (check.status === 'unknown' && (check.candidateValue !== undefined || check.baselineValue !== undefined))) {
                issues.push({ suite: candidate.name,
                    severity: check.status === 'changed' && candidate.gate.mode === 'blocking' ? 'blocking' : 'warning',
                    reason: `${comparisonKeyLabels[check.key]}: ${check.reason}` });
            }
        }

        const datasetMatches = baseline.datasetVersion === candidate.datasetVersion;
        const rubricMatches = baseline.rubricVersion === candidate.rubricVersion;

        if (datasetMatches && rubricMatches) {
            continue;
        }

        const severity = candidate.gate.mode === 'blocking' ? 'blocking' : 'warning';
        issues.push({
            suite: candidate.name,
            severity,
            reason: 'baseline and candidate dataset/rubric versions differ',
            baselineDatasetVersion: baseline.datasetVersion,
            candidateDatasetVersion: candidate.datasetVersion,
            baselineRubricVersion: baseline.rubricVersion,
            candidateRubricVersion: candidate.rubricVersion,
        });
    }

    return {
        status: baselineCompatibilityStatus(issues),
        issues,
        versionKeys,
    };
};

const baselineCompatibilityStatus = (
    issues: readonly BaselineCompatibilityIssue[],
): BaselineCompatibilityResult['status'] => {
    if (issues.some((issue) => issue.severity === 'blocking')) {
        return 'blocked';
    }

    if (issues.length > 0) {
        return 'warning';
    }

    return 'compatible';
};