export type {
  BaselineCompatibilityIssue,
  BaselineCompatibilityResult,
  ConversationTurn,
  DatasetSource,
  EvalReportV1,
  EvalRow,
  EvalRowKind,
  EvalRun,
  EvalSeverity,
  EvalSuiteSummary,
  EvalSummary,
  EvalTarget,
  GatePolicy,
  GraderKind,
  RegisteredRubric,
  RiskArea,
  SuiteManifest,
  SuiteRubricContract,
  ToolCall,
} from './model/eval-report-v1.js';
export { EVAL_REPORT_SCHEMA_VERSION, rowKey, summarizeReport } from './model/eval-report-v1.js';
export { validateEvalReport, type ValidationResult } from './model/validate.js';
export { assessBaselineCompatibility } from './history/baseline-compatibility.js';
export { buildHistory, compareRuns, type RunComparison, type RunHistoryEntry } from './history/history.js';
export { checkGates, type GateConfig, type GateResult } from './gates/check-gates.js';
export {
  lintReportTaxonomy,
  lintReportsTaxonomy,
  type TaxonomyLintIssue,
  type TaxonomyLintLevel,
  type TaxonomyLintResult,
} from './gates/lint-taxonomy.js';
export { publishReport, type PublishOptions, type PublishResult, type PublishTarget } from './publish/publish.js';
export { loadConfig, mergeConfig } from './config/load-config.js';
export type { EvalReportsConfig } from './config/config.js';
export { BUILT_IN_THEMES, resolveTheme, type EvalReportsTheme } from './reporters/themes.js';
export { formatDate, formatPassRate, formatDuration, formatCount } from './utils/format.js';
export { renderGroupedIndexHtml } from './reporters/render.js';