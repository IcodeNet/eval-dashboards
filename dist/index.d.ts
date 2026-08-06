declare const EVAL_REPORT_SCHEMA_VERSION: "eval-report/v1";
type EvalSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';
type EvalRowKind = 'deterministic' | 'agent' | 'llm-judge' | 'human-review';
type EvalTarget = 'agent' | 'conversation' | 'judge' | 'custom';
type DatasetSource = 'synthetic' | 'labelled-synthetic' | 'production-sample' | 'manual' | 'custom';
type GraderKind = 'deterministic-assertions' | 'human-labelled-calibration' | 'llm-judge' | 'tool-call-check' | 'custom';
type RiskArea = 'compliance' | 'pii' | 'content-safety' | 'prompt-safety' | 'tone-of-voice' | 'factuality' | 'response-quality' | 'tool-use' | 'tool-routing' | 'groundedness' | 'relevance' | 'custom';
type GatePolicy = {
    mode: 'blocking' | 'report-only';
    thresholds: Record<string, number>;
};
type ConversationTurn = {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCall?: {
        name: string;
        args: Record<string, unknown>;
    };
    toolResult?: string;
    timestamp?: string;
    durationMs?: number;
};
type ToolCall = {
    name: string;
    args?: Record<string, unknown>;
    result?: string;
    resultIsError?: boolean;
    durationMs?: number;
};
type RowProvenance = {
    source: 'synthetic' | 'labelled-synthetic' | 'production-review' | 'incident' | 'regression' | 'custom';
    addedBy?: string;
    reason?: string;
    sourceRef?: string;
};
type RowLifecycle = {
    status: 'proposed' | 'active' | 'deprecated' | 'quarantined' | 'custom';
    since?: string;
    note?: string;
};
type RowMetadata = Record<string, unknown> & {
    provenance?: RowProvenance;
    lifecycle?: RowLifecycle;
};
type SuiteManifest = {
    name: string;
    target: EvalTarget;
    owner?: string;
    datasetSource: DatasetSource;
    datasetPath?: string;
    datasetVersion: string;
    rubricVersion?: string;
    riskArea: RiskArea;
    graders: GraderKind[];
    gate: GatePolicy;
    description?: string;
};
type RegisteredRubric = {
    axis: string;
    version: string;
    sourcePath?: string;
    summary?: string;
};
type SuiteRubricContract = {
    suiteName: string;
    rubricVersion: string;
    rubrics: RegisteredRubric[];
};
type BaselineCompatibilityIssue = {
    suite: string;
    severity: 'warning' | 'blocking';
    reason: string;
    baselineDatasetVersion?: string;
    candidateDatasetVersion?: string;
    baselineRubricVersion?: string;
    candidateRubricVersion?: string;
};
type BaselineCompatibilityResult = {
    status: 'compatible' | 'warning' | 'blocked';
    issues: BaselineCompatibilityIssue[];
};
type DatasetChangeType = 'initial-baseline' | 'patch' | 'minor' | 'major';
type DatasetRowChanges = {
    added: number;
    updated: number;
    removed: number;
    relabelled: number;
};
type DatasetChangelogEntry = {
    suiteName: string;
    datasetVersion: string;
    rubricVersion: string;
    changedAt: string;
    changeType: DatasetChangeType;
    summary: string;
    rowChanges: DatasetRowChanges;
};
type RunConfigSnapshotValue = string | number | boolean | null;
type RunConfigSnapshot = {
    /** Indicates whether sensitive values were redacted before emission. */
    redacted?: boolean;
    /** Optional emitter/source label (e.g., eval-runner, workflow-step). */
    source?: string;
    /** Sanitized runtime parameters captured for debugging and auditability. */
    values: Record<string, RunConfigSnapshotValue>;
};
type EvalRun = {
    id: string;
    generatedAt: string;
    project?: string;
    team?: string;
    kind?: string;
    branch?: string;
    commit?: string;
    buildId?: string;
    sourceUrl?: string;
    configSnapshot?: RunConfigSnapshot;
};
type EvalSuiteSummary = {
    id: string;
    name?: string;
    total: number;
    passed: number;
    failed: number;
    passRate?: number;
};
type EvalRow = {
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
    groundTruthAxisScores?: Record<string, number>;
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
    metadata?: RowMetadata;
};
type EvalReportV1 = {
    schemaVersion: typeof EVAL_REPORT_SCHEMA_VERSION;
    run: EvalRun;
    suites: EvalSuiteSummary[];
    rows: EvalRow[];
    suiteManifests?: SuiteManifest[];
    rubricContracts?: SuiteRubricContract[];
    baselineCompatibility?: BaselineCompatibilityResult;
    datasetChangelog?: DatasetChangelogEntry[];
    metadata?: Record<string, unknown>;
};
type EvalSummary = {
    run: EvalRun;
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    severityCounts: Record<EvalSeverity, number>;
    suites: EvalSuiteSummary[];
};
declare const rowKey: (row: Pick<EvalRow, "suite" | "id">) => string;
declare const summarizeReport: (report: EvalReportV1) => EvalSummary;

type ValidationResult = {
    ok: true;
    report: EvalReportV1;
} | {
    ok: false;
    errors: string[];
};
declare const validateEvalReport: (value: unknown) => ValidationResult;

declare const assessBaselineCompatibility: (candidateManifests: readonly SuiteManifest[] | undefined, baselineManifests: readonly SuiteManifest[] | undefined, hasComparison: boolean) => BaselineCompatibilityResult | undefined;

type BaselineStrategy = 'rolling' | 'champion';
type RunHistoryEntry = ReturnType<typeof summarizeReport>;
type RunComparison = {
    currentRunId: string;
    previousRunId?: string;
    newlyFailing: EvalRow[];
    newlyPassing: EvalRow[];
    persistentFailures: EvalRow[];
};
declare const buildHistory: (reports: EvalReportV1[]) => RunHistoryEntry[];
declare const compareRuns: (current: EvalReportV1, previous?: EvalReportV1) => RunComparison;

type NewFailureKeyMode = 'row' | 'scenario' | 'scenario-category' | 'id-category';
type GateConfig = {
    minPassRate?: number;
    maxNewFailures?: number;
    zeroCritical?: boolean;
    failOnBaselineBlocked?: boolean;
    maxWarnings?: number;
    maxWarningsByCode?: Record<string, number>;
    failOnWarningCodes?: string[];
    newFailureKey?: NewFailureKeyMode;
    requiredPassingSuites?: string[];
};
type GateResult = {
    passed: boolean;
    failures: string[];
    diagnostics: string[];
};
declare const checkGates: (report: EvalReportV1, comparison: RunComparison, config: GateConfig, baselineCompatibility?: BaselineCompatibilityResult) => GateResult;

type TaxonomyLintLevel = 'error' | 'warning';
type TaxonomyLintIssue = {
    level: TaxonomyLintLevel;
    code: string;
    message: string;
};
type TaxonomyLintResult = {
    passed: boolean;
    issues: TaxonomyLintIssue[];
};
declare function lintReportTaxonomy(report: EvalReportV1): TaxonomyLintResult;
declare function lintReportsTaxonomy(reports: EvalReportV1[]): TaxonomyLintResult;

type PublishTarget = 'dir' | 'github-pages' | 'azure-static-webapp' | 'azure-storage';
type PublishOptions = {
    target: PublishTarget;
    reportDir: string;
    outDir?: string;
    dryRun?: boolean;
    /** owner/repo, e.g. "icodenet/eval-dashboards" */
    repo?: string;
    /** Branch to push to. Default: gh-pages */
    branch?: string;
    /** GitHub token. Falls back to GITHUB_TOKEN env var. */
    token?: string;
    /** Subdirectory inside the gh-pages branch to publish into. Default: root */
    destPath?: string;
    /** Static Web App resource name (e.g. "my-eval-app") */
    appName?: string;
    /** Azure resource group name. Default: inferred from app name or uses current context */
    resourceGroup?: string;
    /** Storage account name (e.g. "myevalstorageacct") */
    account?: string;
    /** Storage container. Default: $web (static website hosting) */
    container?: string;
};
type PublishResult = {
    target: PublishTarget;
    dryRun: boolean;
    message: string;
    url?: string;
};
declare const publishReport: (options: PublishOptions) => Promise<PublishResult>;

type ThemeVariables = Record<string, string>;
type EvalReportsTheme = {
    name: string;
    colorScheme: 'light' | 'dark';
    variables: ThemeVariables;
};
declare const BUILT_IN_THEMES: Record<string, EvalReportsTheme>;
declare const resolveTheme: (theme: string | Partial<EvalReportsTheme> | undefined) => EvalReportsTheme;

type ReporterName = 'text' | 'json-summary' | 'markdown-summary' | 'html';
declare const renderGroupedIndexHtml: (reports: EvalReportV1[], locale?: string) => string;

type BaselineConfig = {
    /** Baseline run selection strategy when baselineRunId is not specified. */
    strategy?: BaselineStrategy;
    /** Optional lookback window (number of prior runs considered by the strategy). */
    lookback?: number;
};
type EvalReportsConfig = {
    /** Glob patterns or directory for artifact discovery. Default: ['.evals_output/**\/*.json'] */
    input?: string | string[];
    /** Directory where reports are written. Default: 'eval-report' */
    reportDir?: string;
    /** Reporters to run. Default: ['html', 'text'] */
    reporters?: ReporterName[];
    /** Gate configuration applied by eval-dashboards check. */
    gates?: GateConfig;
    /** Built-in theme name ('default' | 'dark' | 'minimal') or a custom theme object. */
    theme?: string | Partial<EvalReportsTheme>;
    /** BCP 47 locale for date/number formatting. Default: 'en-GB' */
    locale?: string;
    /** Baseline comparison selection rules. */
    baseline?: BaselineConfig;
};

/**
 * Load config from the first of: eval-dashboards.config.{ts,js,mjs,cjs}, then
 * package.json#eval-dashboards. Returns an empty object if nothing is found so
 * callers can always destructure safely.
 */
declare const loadConfig: (cwd?: string) => Promise<EvalReportsConfig>;
/** Merge CLI-supplied overrides on top of a loaded config. CLI wins. */
declare const mergeConfig: (base: EvalReportsConfig, overrides: Partial<EvalReportsConfig>) => EvalReportsConfig;

type DateLocale = string;
declare const formatDate: (iso: string, locale?: DateLocale) => string;
declare const formatPassRate: (passed: number, total: number) => string;
declare const formatDuration: (ms: number) => string;
declare const formatCount: (n: number, singular: string, plural?: string) => string;

type RunnerEvalCaseResult = {
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
type RunnerEvalResult<CaseResult extends RunnerEvalCaseResult = RunnerEvalCaseResult> = {
    run?: Partial<EvalRun>;
    cases: CaseResult[];
    suiteManifests?: SuiteManifest[];
    rubricContracts?: SuiteRubricContract[];
    metadata?: Record<string, unknown>;
};
type CreateEvalReportArtifactOptions<CaseResult extends RunnerEvalCaseResult = RunnerEvalCaseResult> = {
    generatedAt?: Date | string;
    rowId?: (caseResult: CaseResult, index: number) => string;
    mapRow?: (caseResult: CaseResult, index: number) => EvalRow;
    createSuiteManifest?: (suiteName: string, rows: EvalRow[]) => SuiteManifest | undefined;
};
type WriteEvalReportArtifactOptions<CaseResult extends RunnerEvalCaseResult = RunnerEvalCaseResult> = CreateEvalReportArtifactOptions<CaseResult> & {
    cleanOutputDir?: boolean;
};
declare const createEvalReportArtifact: <CaseResult extends RunnerEvalCaseResult>(result: RunnerEvalResult<CaseResult>, options?: CreateEvalReportArtifactOptions<CaseResult>) => EvalReportV1;
declare const writeEvalReportArtifact: <CaseResult extends RunnerEvalCaseResult>(filePath: string, result: RunnerEvalResult<CaseResult>, options?: WriteEvalReportArtifactOptions<CaseResult>) => Promise<EvalReportV1>;

export { BUILT_IN_THEMES, type BaselineCompatibilityIssue, type BaselineCompatibilityResult, type ConversationTurn, type CreateEvalReportArtifactOptions, type DatasetSource, EVAL_REPORT_SCHEMA_VERSION, type EvalReportV1, type EvalReportsConfig, type EvalReportsTheme, type EvalRow, type EvalRowKind, type EvalRun, type EvalSeverity, type EvalSuiteSummary, type EvalSummary, type EvalTarget, type GateConfig, type GatePolicy, type GateResult, type GraderKind, type PublishOptions, type PublishResult, type PublishTarget, type RegisteredRubric, type RiskArea, type RunComparison, type RunHistoryEntry, type RunnerEvalCaseResult, type RunnerEvalResult, type SuiteManifest, type SuiteRubricContract, type TaxonomyLintIssue, type TaxonomyLintLevel, type TaxonomyLintResult, type ToolCall, type ValidationResult, type WriteEvalReportArtifactOptions, assessBaselineCompatibility, buildHistory, checkGates, compareRuns, createEvalReportArtifact, formatCount, formatDate, formatDuration, formatPassRate, lintReportTaxonomy, lintReportsTaxonomy, loadConfig, mergeConfig, publishReport, renderGroupedIndexHtml, resolveTheme, rowKey, summarizeReport, validateEvalReport, writeEvalReportArtifact };
