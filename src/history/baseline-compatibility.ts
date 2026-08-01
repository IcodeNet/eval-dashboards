import type {
    BaselineCompatibilityIssue,
    BaselineCompatibilityResult,
    SuiteManifest,
} from '../model/eval-report-v1.js';

export const assessBaselineCompatibility = (
    candidateManifests: readonly SuiteManifest[] | undefined,
    baselineManifests: readonly SuiteManifest[] | undefined,
    hasComparison: boolean,
): BaselineCompatibilityResult | undefined => {
    if (!hasComparison || !candidateManifests?.length) {
        return undefined;
    }

    if (!baselineManifests?.length) {
        return {
            status: 'warning',
            issues: candidateManifests.map((manifest) => ({
                suite: manifest.name,
                severity: 'warning',
                reason: 'baseline report does not include suite manifest metadata',
                candidateDatasetVersion: manifest.datasetVersion,
                candidateRubricVersion: manifest.rubricVersion,
            })),
        };
    }

    const baselineBySuite = new Map(baselineManifests.map((manifest) => [manifest.name, manifest]));
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