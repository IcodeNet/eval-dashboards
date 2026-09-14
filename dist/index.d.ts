declare const EVAL_REPORT_SCHEMA_VERSION: "eval-report/v1";
declare const EVAL_SEVERITIES: readonly ["none", "low", "medium", "high", "critical"];
declare const EVAL_ROW_KINDS: readonly ["deterministic", "agent", "llm-judge", "human-review"];
declare const EVAL_TARGETS: readonly ["agent", "conversation", "judge", "custom"];
declare const DATASET_SOURCES: readonly ["synthetic", "labelled-synthetic", "production-sample", "manual", "custom"];
declare const GRADER_KINDS: readonly ["deterministic-assertions", "human-labelled-calibration", "llm-judge", "tool-call-check", "custom"];
declare const RISK_AREAS: readonly ["compliance", "pii", "content-safety", "prompt-safety", "tone-of-voice", "factuality", "response-quality", "tool-use", "tool-routing", "groundedness", "relevance", "custom"];
declare const ROW_PROVENANCE_SOURCES: readonly ["synthetic", "labelled-synthetic", "production-review", "incident", "regression", "custom"];
declare const ROW_LIFECYCLE_STATUSES: readonly ["proposed", "active", "deprecated", "quarantined", "custom"];
declare const DATASET_CHANGE_TYPES: readonly ["initial-baseline", "patch", "minor", "major"];
declare const GATE_MODES: readonly ["blocking", "report-only"];
type EvalSeverity = (typeof EVAL_SEVERITIES)[number];
type EvalRowKind = (typeof EVAL_ROW_KINDS)[number];
type EvalTarget = (typeof EVAL_TARGETS)[number];
type DatasetSource = (typeof DATASET_SOURCES)[number];
type GraderKind = (typeof GRADER_KINDS)[number];
type RiskArea = (typeof RISK_AREAS)[number];
type GatePolicy = {
    mode: (typeof GATE_MODES)[number];
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
    source: (typeof ROW_PROVENANCE_SOURCES)[number];
    addedBy?: string;
    reason?: string;
    sourceRef?: string;
};
type RowLifecycle = {
    status: (typeof ROW_LIFECYCLE_STATUSES)[number];
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
type DatasetChangeType = (typeof DATASET_CHANGE_TYPES)[number];
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
type TraceReference = {
    /** Optional portable trace identifier from an observability system. */
    traceId?: string;
    /** Optional portable span identifier associated with this row. */
    spanId?: string;
    /** Optional direct URL to trace evidence for this row. */
    traceUrl?: string;
    /** Optional direct URL to a span-level evidence view for this row. */
    spanUrl?: string;
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
    trace?: TraceReference;
    passed: boolean;
    /**
     * What outcome this row was expected to have, when that differs from
     * "expected to pass" — e.g. an A/B harness's baseline row is expected to
     * fail (proof the case tests something); a passing baseline is the actual
     * anomaly. Omit for the common case where passing is always the goal.
     */
    expectedOutcome?: 'pass' | 'fail';
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
    /**
     * Rows whose outcome matched their `expectedOutcome` (or defaulted to
     * "expected to pass" when unset). Use this, not `passRate`, as the
     * headline signal for suites that intentionally mix rows expected to
     * fail (e.g. an A/B harness's baseline) with rows expected to pass —
     * a flat `passRate` blends the two and produces a misleading number.
     */
    matchedExpectation: number;
    expectationMismatches: number;
    matchedExpectationRate: number;
    severityCounts: Record<EvalSeverity, number>;
    suites: EvalSuiteSummary[];
};
declare const rowKey: (row: Pick<EvalRow, "suite" | "id">) => string;
/**
 * Whether a row's actual pass/fail outcome matches what it was expected to
 * be. Rows without `expectedOutcome` default to "expected to pass", so this
 * agrees with `row.passed` for the common case and only diverges for rows
 * that explicitly declare `expectedOutcome: 'fail'`.
 */
declare const rowMatchedExpectation: (row: Pick<EvalRow, "passed" | "expectedOutcome">) => boolean;
declare const summarizeReport: (report: EvalReportV1) => EvalSummary;

type ValidationResult = {
    ok: true;
    report: EvalReportV1;
} | {
    ok: false;
    errors: string[];
    issues: ValidationIssue[];
};
type ValidationIssue = {
    code: 'VALIDATION_ERROR';
    path: string;
    message: string;
};
declare const validateEvalReport: (value: unknown) => ValidationResult;

declare const assessBaselineCompatibility: (candidateManifests: readonly SuiteManifest[] | undefined, baselineManifests: readonly SuiteManifest[] | undefined, hasComparison: boolean) => BaselineCompatibilityResult | undefined;

type BaselineStrategy = 'rolling' | 'champion';
type HistoryBucket = {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
};
type HistoryRegressionCounts = {
    newlyFailing: number;
    newlyPassing: number;
    persistentFailures: number;
    disappeared: number;
};
type RowStabilityCounts = {
    stable: number;
    flaky: number;
    persistentFailure: number;
};
type RunHistoryEntry = ReturnType<typeof summarizeReport> & {
    bySuite: Record<string, HistoryBucket>;
    byRiskArea: Record<string, HistoryBucket>;
    byKind: Record<string, HistoryBucket>;
    regression: HistoryRegressionCounts;
    /**
     * Cumulative stability counts computed across all runs up to this history entry.
     * These counts are not limited to rows present in only the current run.
     */
    rowStability: RowStabilityCounts;
};
type RunComparison = {
    currentRunId: string;
    previousRunId?: string;
    newlyFailing: EvalRow[];
    newlyPassing: EvalRow[];
    persistentFailures: EvalRow[];
    disappeared: EvalRow[];
};
declare const buildHistory: (reports: EvalReportV1[]) => RunHistoryEntry[];
declare const compareRuns: (current: EvalReportV1, previous?: EvalReportV1) => RunComparison;

type StatisticalGateMode = 'off' | 'bootstrap';
type StatisticalGateConfig = {
    mode?: StatisticalGateMode;
    confidenceLevel?: number;
    bootstrapSamples?: number;
    minPassRateDelta?: number;
};

type NewFailureKeyMode = 'row' | 'scenario' | 'scenario-category' | 'id-category';
type GateConfig = {
    minPassRate?: number;
    /**
     * Minimum rate of rows whose outcome matched their declared
     * `expectedOutcome` (see `rowMatchedExpectation`). Prefer this over
     * `minPassRate` for suites that intentionally mix rows expected to fail
     * (e.g. an A/B harness's baseline) with rows expected to pass — a flat
     * `minPassRate` gate on such a suite blends the two into a misleading
     * number.
     */
    minMatchedExpectationRate?: number;
    maxNewFailures?: number;
    zeroCritical?: boolean;
    failOnBaselineBlocked?: boolean;
    maxWarnings?: number;
    maxWarningsByCode?: Record<string, number>;
    failOnWarningCodes?: string[];
    newFailureKey?: NewFailureKeyMode;
    requiredPassingSuites?: string[];
    statistical?: StatisticalGateConfig;
    calibration?: {
        /** Enable/disable pre-gate calibration evidence checks. Default: auto (on when calibration suite manifest is present). */
        enabled?: boolean;
        /** Calibration suite id used as evidence source. Default: judge-calibration. */
        suite?: string;
        /** Max calibration age in hours. Default: 168 (7 days). */
        maxAgeHours?: number;
        /**
         * Escape hatch: do not fail blocking suites when calibration evidence is
         * missing/stale/mismatched; emit diagnostics only.
         */
        allowBlockingWithoutRecentMatch?: boolean;
    };
};
type GateResult = {
    passed: boolean;
    failures: string[];
    diagnostics: string[];
};
declare const checkGates: (report: EvalReportV1, comparison: RunComparison, config: GateConfig, baselineCompatibility?: BaselineCompatibilityResult, previousReport?: EvalReportV1) => GateResult;

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
type NotificationChannel = 'slack' | 'teams' | 'email';
type WebhookNotificationConfig = {
    webhookUrl?: string;
};
type EmailNotificationConfig = {
    smtpUrl?: string;
    from?: string;
    to?: string | string[];
};
type NotificationsConfig = {
    /** Channels to notify when check gates fail or baseline compatibility is blocked. */
    channels?: NotificationChannel[];
    /** Optional report URL/path included in notification payloads. */
    reportUrl?: string;
    slack?: WebhookNotificationConfig;
    teams?: WebhookNotificationConfig;
    email?: EmailNotificationConfig;
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
    /** Optional gate alerting adapters (Slack/Teams webhook, email via SMTP). */
    notifications?: NotificationsConfig;
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

declare const ADJUDICATION_BUNDLE_SCHEMA_VERSION: "eval-adjudication-bundle/v1";
type ReviewerVerdict = 'pass' | 'fail';
type AdjudicationReview = {
    verdict?: ReviewerVerdict;
    reviewer?: string;
    category?: string;
    note?: string;
    decidedAt?: string;
};
type AdjudicationBundleRow = {
    id: string;
    suite: string;
    unresolvedReason: 'expectation-mismatch';
    currentPassed: boolean;
    expectedOutcome?: 'pass' | 'fail';
    severity?: EvalRow['severity'];
    category?: string;
    reason?: string;
    input?: string;
    output?: string;
    expected?: string;
    judgeVerdict?: boolean;
    judgeCategory?: string;
    judgeReasoning?: string;
    groundTruthVerdict?: boolean;
    groundTruthCategory?: string;
    groundTruthAnnotation?: string;
    review?: AdjudicationReview;
};
type AdjudicationBundleV1 = {
    schemaVersion: typeof ADJUDICATION_BUNDLE_SCHEMA_VERSION;
    bundleId: string;
    generatedAt: string;
    source: {
        runId: string;
        generatedAt: string;
    };
    rows: AdjudicationBundleRow[];
    metadata?: Record<string, unknown>;
};
type MergeAdjudicationResult = {
    report: EvalReportV1;
    applied: number;
    skippedMissingReview: number;
    skippedInvalidVerdict: number;
    unmatchedRows: string[];
};
declare const exportUnresolvedRowsBundle: (report: EvalReportV1, options?: {
    bundleId?: string;
    generatedAt?: string;
    includePassedRows?: boolean;
}) => AdjudicationBundleV1;
declare const mergeAdjudicationBundle: (report: EvalReportV1, bundle: AdjudicationBundleV1, options?: {
    importedAt?: string;
    sourceBundlePath?: string;
    requireRunMatch?: boolean;
}) => MergeAdjudicationResult;
declare const validateAdjudicationBundle: (bundle: unknown) => string[];

type RunnerEvalCaseResult = {
    id?: string;
    suite: string;
    passed: boolean;
    kind?: EvalRow['kind'];
    name?: string;
    question?: string;
    datasetId?: string;
    scenarioId?: string;
    rubricId?: string;
    judgeModel?: string;
    judgeVerdict?: boolean;
    judgeCategory?: string;
    judgeReasoning?: string;
    promptVersion?: string;
    agentChannel?: string;
    agentVersion?: string;
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

export { ADJUDICATION_BUNDLE_SCHEMA_VERSION, type AdjudicationBundleRow, type AdjudicationBundleV1, type AdjudicationReview, BUILT_IN_THEMES, type BaselineCompatibilityIssue, type BaselineCompatibilityResult, type ConversationTurn, type CreateEvalReportArtifactOptions, type DatasetSource, EVAL_REPORT_SCHEMA_VERSION, type EvalReportV1, type EvalReportsConfig, type EvalReportsTheme, type EvalRow, type EvalRowKind, type EvalRun, type EvalSeverity, type EvalSuiteSummary, type EvalSummary, type EvalTarget, type GateConfig, type GatePolicy, type GateResult, type GraderKind, type MergeAdjudicationResult, type PublishOptions, type PublishResult, type PublishTarget, type RegisteredRubric, type RiskArea, type RunComparison, type RunHistoryEntry, type RunnerEvalCaseResult, type RunnerEvalResult, type SuiteManifest, type SuiteRubricContract, type TaxonomyLintIssue, type TaxonomyLintLevel, type TaxonomyLintResult, type ToolCall, type TraceReference, type ValidationIssue, type ValidationResult, type WriteEvalReportArtifactOptions, assessBaselineCompatibility, buildHistory, checkGates, compareRuns, createEvalReportArtifact, exportUnresolvedRowsBundle, formatCount, formatDate, formatDuration, formatPassRate, lintReportTaxonomy, lintReportsTaxonomy, loadConfig, mergeAdjudicationBundle, mergeConfig, publishReport, renderGroupedIndexHtml, resolveTheme, rowKey, rowMatchedExpectation, summarizeReport, validateAdjudicationBundle, validateEvalReport, writeEvalReportArtifact };
