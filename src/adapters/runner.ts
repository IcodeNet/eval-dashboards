import { rm } from 'node:fs/promises';
import path from 'node:path';
import {
  EVAL_REPORT_SCHEMA_VERSION,
  type EvalReportV1,
  type EvalRow,
  type EvalRun,
  type EvalSeverity,
  type EvalSuiteSummary,
  type RowLifecycle,
  type RowProvenance,
  type SuiteManifest,
  type SuiteRubricContract,
} from '../model/eval-report-v1.js';
import { validateEvalReport } from '../model/validate.js';
import { writeJsonFile } from '../io/reports.js';

export type RunnerEvalCaseResult = {
  id?: string;
  suite: string;
  passed: boolean;
  name?: string;
  question?: string;
  input?: string;
  output?: string;
  expected?: string;
  score?: number;
  severity?: EvalSeverity;
  category?: string;
  reason?: string;
  durationMs?: number;
  metadata?: EvalRow['metadata'];
};

export type RunnerEvalResult<CaseResult extends RunnerEvalCaseResult = RunnerEvalCaseResult> = {
  run?: Partial<EvalRun>;
  cases: CaseResult[];
  suiteManifests?: SuiteManifest[];
  rubricContracts?: SuiteRubricContract[];
  metadata?: Record<string, unknown>;
};

export type CreateEvalReportArtifactOptions<CaseResult extends RunnerEvalCaseResult = RunnerEvalCaseResult> = {
  generatedAt?: Date | string;
  rowId?: (caseResult: CaseResult, index: number) => string;
  mapRow?: (caseResult: CaseResult, index: number) => EvalRow;
  createSuiteManifest?: (suiteName: string, rows: EvalRow[]) => SuiteManifest | undefined;
};

export type WriteEvalReportArtifactOptions<CaseResult extends RunnerEvalCaseResult = RunnerEvalCaseResult> =
  CreateEvalReportArtifactOptions<CaseResult> & {
    cleanOutputDir?: boolean;
  };

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : value;

const createDefaultRow = <CaseResult extends RunnerEvalCaseResult>(
  caseResult: CaseResult,
  index: number,
  rowId: (caseResult: CaseResult, index: number) => string,
): EvalRow => ({
  id: rowId(caseResult, index),
  suite: caseResult.suite,
  name: caseResult.name,
  question: caseResult.question,
  input: caseResult.input,
  output: caseResult.output,
  expected: caseResult.expected,
  passed: caseResult.passed,
  score: caseResult.score,
  severity: caseResult.severity,
  category: caseResult.category,
  reason: caseResult.reason,
  durationMs: caseResult.durationMs,
  metadata: caseResult.metadata,
});

const defaultRowMetadata = (): NonNullable<EvalRow['metadata']> => ({
  provenance: { source: 'synthetic' },
  lifecycle: { status: 'active' },
});

const mergeProvenance = (provenance: RowProvenance | undefined): RowProvenance => {
  const defaults: RowProvenance = { source: 'synthetic' };
  if (!provenance) return defaults;

  return {
    ...defaults,
    ...provenance,
    source: provenance.source ?? defaults.source,
  };
};

const mergeLifecycle = (lifecycle: RowLifecycle | undefined): RowLifecycle => {
  const defaults: RowLifecycle = { status: 'active' };
  if (!lifecycle) return defaults;

  return {
    ...defaults,
    ...lifecycle,
    status: lifecycle.status ?? defaults.status,
  };
};

const mergeRowMetadata = (
  metadata: EvalRow['metadata'],
): EvalRow['metadata'] => ({
  ...defaultRowMetadata(),
  ...metadata,
  provenance: mergeProvenance(metadata?.provenance),
  lifecycle: mergeLifecycle(metadata?.lifecycle),
});

const summarizeSuites = (rows: EvalRow[]): EvalSuiteSummary[] => {
  const suites = new Map<string, { total: number; passed: number; failed: number }>();

  for (const row of rows) {
    const current = suites.get(row.suite) ?? { total: 0, passed: 0, failed: 0 };
    current.total += 1;
    if (row.passed) {
      current.passed += 1;
    } else {
      current.failed += 1;
    }
    suites.set(row.suite, current);
  }

  return [...suites.entries()].map(([suiteName, summary]) => ({
    id: suiteName,
    name: suiteName,
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    passRate: summary.total === 0 ? 0 : summary.passed / summary.total,
  }));
};

const validateCreatedReport = (report: EvalReportV1): EvalReportV1 => {
  const result = validateEvalReport(report);

  if (!result.ok) {
    throw new Error(`Invalid eval report artifact: ${result.errors.join(' ')}`);
  }

  return result.report;
};

export const createEvalReportArtifact = <CaseResult extends RunnerEvalCaseResult>(
  result: RunnerEvalResult<CaseResult>,
  options: CreateEvalReportArtifactOptions<CaseResult> = {},
): EvalReportV1 => {
  const generatedAt = toIsoString(options.generatedAt ?? result.run?.generatedAt ?? new Date());
  const runId = result.run?.id ?? `run-${generatedAt}`;
  const rowId = options.rowId ?? ((caseResult: CaseResult, index: number) => caseResult.id ?? `${caseResult.suite}-${index + 1}`);
  const rows = result.cases.map((caseResult, index) => {
    const row = options.mapRow
      ? options.mapRow(caseResult, index)
      : createDefaultRow(caseResult, index, rowId);

    return {
      ...row,
      metadata: mergeRowMetadata(row.metadata ?? caseResult.metadata),
    };
  },
  );
  const suites = summarizeSuites(rows);
  const generatedSuiteManifests = options.createSuiteManifest
    ? suites
      .map((suite) => options.createSuiteManifest?.(suite.id, rows.filter((row) => row.suite === suite.id)))
      .filter((manifest): manifest is SuiteManifest => manifest !== undefined)
    : [];
  const suiteManifests = result.suiteManifests ?? generatedSuiteManifests;

  return validateCreatedReport({
    schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
    run: {
      ...result.run,
      id: runId,
      generatedAt,
    },
    suites,
    rows,
    suiteManifests: suiteManifests.length > 0 ? suiteManifests : undefined,
    rubricContracts: result.rubricContracts,
    metadata: result.metadata,
  });
};

export const writeEvalReportArtifact = async <CaseResult extends RunnerEvalCaseResult>(
  filePath: string,
  result: RunnerEvalResult<CaseResult>,
  options: WriteEvalReportArtifactOptions<CaseResult> = {},
): Promise<EvalReportV1> => {
  const report = createEvalReportArtifact(result, options);

  if (options.cleanOutputDir) {
    await rm(path.dirname(filePath), { recursive: true, force: true });
  }

  await writeJsonFile(filePath, report);
  return report;
};
