import type { EvalReportV1 } from '../model/eval-report-v1.js';

export type TaxonomyLintLevel = 'error' | 'warning';

export type TaxonomyLintIssue = {
  level: TaxonomyLintLevel;
  code: string;
  message: string;
};

export type TaxonomyLintResult = {
  passed: boolean;
  issues: TaxonomyLintIssue[];
};

export function lintReportTaxonomy(report: EvalReportV1): TaxonomyLintResult {
  const issues: TaxonomyLintIssue[] = [];
  const suiteIds = new Set(report.suites.map((suite) => suite.id));
  const suiteManifestNames = new Set(report.suiteManifests?.map((manifest) => manifest.name) ?? []);
  const suiteRowCounts = new Map<string, { total: number; passed: number; failed: number }>();
  const rowKeys = new Set<string>();

  for (const row of report.rows) {
    const key = `${row.suite}:${row.id}`;
    if (rowKeys.has(key)) {
      issues.push({
        level: 'error',
        code: 'duplicate-row-key',
        message: `Duplicate row id within suite: ${key}`,
      });
    }
    rowKeys.add(key);

    if (!suiteIds.has(row.suite)) {
      issues.push({
        level: 'error',
        code: 'unknown-suite',
        message: `Row references suite not present in suites summary: ${row.suite}`,
      });
    }

    const counts = suiteRowCounts.get(row.suite) ?? { total: 0, passed: 0, failed: 0 };
    counts.total += 1;
    if (row.passed) counts.passed += 1;
    else counts.failed += 1;
    suiteRowCounts.set(row.suite, counts);

    if (!row.kind) {
      issues.push({
        level: 'warning',
        code: 'missing-kind',
        message: `Row ${key} is missing kind.`,
      });
    }

    if (!row.severity) {
      issues.push({
        level: 'warning',
        code: 'missing-severity',
        message: `Row ${key} is missing severity.`,
      });
    }

    if (!row.category) {
      issues.push({
        level: 'warning',
        code: 'missing-category',
        message: `Row ${key} is missing category.`,
      });
    }

    if (suiteManifestNames.has(row.suite) && row.metadata?.lifecycle?.status === undefined) {
      issues.push({
        level: 'error',
        code: 'missing-row-lifecycle',
        message: `Row ${key} is missing metadata.lifecycle.status required for dataset-governed suites.`,
      });
    }

    if (suiteManifestNames.has(row.suite) && row.metadata?.provenance?.source === undefined) {
      issues.push({
        level: 'error',
        code: 'missing-row-provenance',
        message: `Row ${key} is missing metadata.provenance.source required for dataset-governed suites.`,
      });
    }

    if (row.kind === 'llm-judge') {
      if (row.judgeModel === undefined) {
        issues.push({
          level: 'warning',
          code: 'missing-judge-model',
          message: `LLM-judge row ${key} is missing judgeModel.`,
        });
      }
      if (row.judgeReasoning === undefined) {
        issues.push({
          level: 'warning',
          code: 'missing-judge-reasoning',
          message: `LLM-judge row ${key} is missing judgeReasoning.`,
        });
      }
      if (row.judgeVerdict === undefined) {
        issues.push({
          level: 'warning',
          code: 'missing-judge-verdict',
          message: `LLM-judge row ${key} is missing judgeVerdict.`,
        });
      }
    }

    if (row.kind === 'agent') {
      if (row.turns === undefined && row.toolCalls === undefined) {
        issues.push({
          level: 'warning',
          code: 'missing-agent-evidence',
          message: `Agent row ${key} is missing turns and toolCalls evidence.`,
        });
      }
      if (row.agentVersion === undefined && row.promptVersion === undefined) {
        issues.push({
          level: 'warning',
          code: 'missing-agent-versioning',
          message: `Agent row ${key} is missing agentVersion/promptVersion.`,
        });
      }
    }
  }

  for (const suite of report.suites) {
    const counts = suiteRowCounts.get(suite.id) ?? { total: 0, passed: 0, failed: 0 };
    if (counts.total !== suite.total || counts.passed !== suite.passed || counts.failed !== suite.failed) {
      issues.push({
        level: 'error',
        code: 'suite-summary-mismatch',
        message:
          `Suite summary mismatch for ${suite.id}: expected total/passed/failed ` +
          `${suite.total}/${suite.passed}/${suite.failed}, got ${counts.total}/${counts.passed}/${counts.failed} from rows.`,
      });
    }
  }

  if (report.suiteManifests?.length) {
    for (const suite of report.suites) {
      if (!suiteManifestNames.has(suite.id)) {
        issues.push({
          level: 'warning',
          code: 'missing-suite-manifest',
          message: `Suite ${suite.id} has no matching suite manifest.`,
        });
      }
    }
  }

  return {
    passed: issues.every((issue) => issue.level !== 'error'),
    issues,
  };
}

export function lintReportsTaxonomy(reports: EvalReportV1[]): TaxonomyLintResult {
  const issues = reports.flatMap((report) =>
    lintReportTaxonomy(report).issues.map((issue) => ({
      ...issue,
      message: `[run:${report.run.id}] ${issue.message}`,
    })),
  );

  return {
    passed: issues.every((issue) => issue.level !== 'error'),
    issues,
  };
}
