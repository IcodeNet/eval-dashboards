export const EVAL_REPORT_SCHEMA_VERSION = 'eval-report/v1' as const;

export type EvalSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type EvalRowKind = 'deterministic' | 'agent' | 'llm-judge' | 'human-review';

export type EvalTarget = 'agent' | 'conversation' | 'judge' | 'custom';

export type DatasetSource = 'synthetic' | 'labelled-synthetic' | 'production-sample' | 'manual' | 'custom';

export type GraderKind =
  | 'deterministic-assertions'
  | 'human-labelled-calibration'
  | 'llm-judge'
  | 'tool-call-check'
  | 'custom';

export type RiskArea =
  | 'compliance'
  | 'pii'
  | 'prompt-safety'
  | 'response-quality'
  | 'tool-use'
  | 'tool-routing'
  | 'groundedness'
  | 'relevance'
  | 'custom';

export type GatePolicy = {
  mode: 'blocking' | 'report-only';
  thresholds: Record<string, number>;
};

export type ConversationTurn = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCall?: { name: string; args: Record<string, unknown> };
  toolResult?: string;
  timestamp?: string;
  durationMs?: number;
};

export type ToolCall = {
  name: string;
  args?: Record<string, unknown>;
  result?: string;
  resultIsError?: boolean;
  durationMs?: number;
};

export type SuiteManifest = {
  name: string;
  target: EvalTarget;
  owner?: string;
  datasetSource: DatasetSource;
  datasetVersion: string;
  rubricVersion?: string;
  riskArea: RiskArea;
  graders: GraderKind[];
  gate: GatePolicy;
  description?: string;
};

export type RegisteredRubric = {
  axis: string;
  version: string;
  sourcePath?: string;
  summary?: string;
};

export type SuiteRubricContract = {
  suiteName: string;
  rubricVersion: string;
  rubrics: RegisteredRubric[];
};

export type BaselineCompatibilityIssue = {
  suite: string;
  severity: 'warning' | 'blocking';
  reason: string;
  baselineDatasetVersion?: string;
  candidateDatasetVersion?: string;
  baselineRubricVersion?: string;
  candidateRubricVersion?: string;
};

export type BaselineCompatibilityResult = {
  status: 'compatible' | 'warning' | 'blocked';
  issues: BaselineCompatibilityIssue[];
};

export type EvalRun = {
  id: string;
  generatedAt: string;
  project?: string;
  team?: string;
  kind?: string;
  branch?: string;
  commit?: string;
  buildId?: string;
  sourceUrl?: string;
};

export type EvalSuiteSummary = {
  id: string;
  name?: string;
  total: number;
  passed: number;
  failed: number;
  passRate?: number;
};

export type EvalRow = {
  id: string;
  suite: string;
  kind?: EvalRowKind;
  name?: string;
  question?: string;
  datasetId?: string;
  scenarioId?: string;
  rubricId?: string;
  rubricVariant?: string;
  judgeModel?: string;
  judgeVerdict?: boolean;
  judgeCategory?: string;
  judgeReasoning?: string;
  promptVersion?: string;
  agentChannel?: string;
  agentVersion?: string;
  agentReasoning?: string;
  groundTruthVerdict?: boolean;
  groundTruthCategory?: string;
  groundTruthAnnotation?: string;
  input?: string;
  output?: string;
  expected?: string;
  turns?: ConversationTurn[];
  toolCalls?: ToolCall[];
  axisScores?: Record<string, number>;
  passed: boolean;
  score?: number;
  severity?: EvalSeverity;
  category?: string;
  reason?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

export type EvalReportV1 = {
  schemaVersion: typeof EVAL_REPORT_SCHEMA_VERSION;
  run: EvalRun;
  suites: EvalSuiteSummary[];
  rows: EvalRow[];
  suiteManifests?: SuiteManifest[];
  rubricContracts?: SuiteRubricContract[];
  baselineCompatibility?: BaselineCompatibilityResult;
  metadata?: Record<string, unknown>;
};

export type EvalSummary = {
  run: EvalRun;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  severityCounts: Record<EvalSeverity, number>;
  suites: EvalSuiteSummary[];
};

export const severityOrder: EvalSeverity[] = [
  'none',
  'low',
  'medium',
  'high',
  'critical',
];

export const rowKey = (row: Pick<EvalRow, 'suite' | 'id'>): string => `${row.suite}:${row.id}`;

export const summarizeReport = (report: EvalReportV1): EvalSummary => {
  const total = report.rows.length;
  const passed = report.rows.filter((row) => row.passed).length;
  const failed = total - passed;
  const severityCounts = Object.fromEntries(
    severityOrder.map((severity) => [severity, 0]),
  ) as Record<EvalSeverity, number>;

  for (const row of report.rows) {
    const severity = row.severity ?? 'none';
    severityCounts[severity] += 1;
  }

  return {
    run: report.run,
    total,
    passed,
    failed,
    passRate: total === 0 ? 0 : passed / total,
    severityCounts,
    suites: report.suites,
  };
};