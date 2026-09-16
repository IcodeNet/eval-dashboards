# Artifact Format

`@icodenet/eval-dashboards` consumes versioned JSON artifacts. The first contract is `eval-report/v1`.

In this repo, `eval-report/v1` means "version 1 of the eval report JSON contract". It is the value written into `schemaVersion` so the CLI, validators, reporters, gates, and future migration tools know which artifact shape they are reading. An eval runner can be Jest, Vitest, a Python script, an agent harness, or a host-application-specific script; as long as it emits this JSON shape, `eval-dashboards` can validate it and render the same reports.

Think of it as the shared handoff file between eval execution and reporting:

1. A runner evaluates cases and writes JSON with `schemaVersion: 'eval-report/v1'`.
2. `eval-dashboards` reads that artifact from `.evals_output/` or another configured input directory.
3. The package produces checks, history, summaries, and static dashboards from the normalized fields below.

## Why These Fields Exist

- Logs are ephemeral and hard to query; artifact rows are durable and gateable.
- Config drift is a common root cause for live-eval instability; snapshots improve reproducibility.
- Judge/rubric drift can appear as regressions without product changes; governance metadata prevents false narratives.

## Schema source-of-truth and drift guard

- Source model: `src/model/eval-report-v1.ts`
- Published schema: `schemas/eval-report-v1.schema.json`
- Generate/sync command: `pnpm schema:generate`
- CI drift guard command: `pnpm schema:check`

`schema:check` regenerates the schema and fails if `schemas/eval-report-v1.schema.json` differs from the committed file.

## Validation error contract (stable)

When artifact validation fails, runtime consumers expose a stable structured issue shape:

```ts
type ValidationIssue = {
  code: 'VALIDATION_ERROR';
  path: string;    // e.g. 'rows[0].trace.traceId'
  message: string; // human-readable validation message
};
```

Notes:

- `path` is deterministic when the validator can infer a specific field path.
- Top-level shape failures use `path: '$'`.
- Callers can use the first issue path for concise error prefixes while keeping full messages for debugging.

## Check heartbeat output contract (`eval-check-heartbeat/v1`)

When `eval-dashboards check` is run with `--heartbeat-out=<path>`, it writes a machine-readable heartbeat JSON payload:

```json
{
  "schemaVersion": "eval-check-heartbeat/v1",
  "gateRunStatus": "ran",
  "generatedAt": "2026-01-01T00:00:00.000Z",
  "exitCode": 0,
  "runId": "optional-run-id",
  "baselineRunId": "optional-baseline-run-id",
  "message": "optional failure message"
}
```

`gateRunStatus` values:

- `ran`: gate logic executed and produced a normal gate verdict
- `skipped`: check could not run due to missing/no artifacts (exit 3)
- `errored`: invalid config/artifact or runtime failure (typically exit 2)

## What To Emit

- A dedicated `preflight` suite with deterministic probe rows.
- A sanitized `run.configSnapshot` block that never contains secrets.
- Judge/rubric identity fields (`judgeModel`, `rubricId`, `promptVersion`, `rubricContracts`).

## Check result output contract (`eval-check-result/v1` and `/v2`)

`eval-dashboards check --json-out=<path>` writes `eval-check-result/v1`: `schemaVersion`,
`gateRunStatus`, `runId`, `baselineRunId?`, `passed`, `failures[]`, `diagnostics[]`,
`baselineCompatibility?`, `newlyFailingRows[]`, `notifications?`. This shape is unchanged and
remains the default for existing consumers.

`eval-dashboards check --json-v2-out=<path>` additionally writes `eval-check-result/v2`: every
v1 field, plus full audit provenance so an auditor can read a single file and determine which
thresholds were in force, against which dataset/rubric versions, for which commit, without
reading workflow YAML at that commit:

```json
{
  "schemaVersion": "eval-check-result/v2",
  "gateRunStatus": "ran",
  "runId": "run-002",
  "passed": true,
  "failures": [],
  "diagnostics": [],
  "newlyFailingRows": [],
  "resolvedGateConfig": { "minPassRate": 0.9 },
  "suiteProvenance": [
    { "suite": "answer-quality", "datasetVersion": "1.2.0", "rubricVersion": "agent-quality-v1" }
  ],
  "artifactDigests": [
    { "path": "examples/basic-json/run-002.json", "sha256": "..." }
  ],
  "subject": { "commit": "abc123", "release": "build-42" },
  "ciEnvironment": { "provider": "github-actions", "runId": "12345", "runUrl": "https://github.com/org/repo/actions/runs/12345", "actor": "octocat" }
}
```

`--json-v2-out` is additive: it is written alongside (not instead of) `--json-out`, and existing
v1 consumers/pipelines are unaffected whether or not `--json-v2-out` is passed.

## How To Emit It Safely

- Put probe outcomes in `rows[]` rather than only CI logs.
- Set `run.configSnapshot.redacted=true` when emitting environment-derived values.
- Restrict `run.configSnapshot.values` to non-sensitive scalar values (`string`, `number`, `boolean`, `null`).
- Keep rubric guidance consistent across runs and version changes explicitly.

```ts
export type EvalReportV1 = {
  schemaVersion: 'eval-report/v1';
  run: {
    id: string;
    generatedAt: string;
    project?: string;
    team?: string;
    kind?: string;
    branch?: string;
    commit?: string;
    buildId?: string;
    sourceUrl?: string;
    experimentId?: string;
    variantLabel?: string;
    configSnapshot?: {
      redacted?: boolean;
      source?: string;
      values: Record<string, string | number | boolean | null>;
    };
  };
  suites: EvalSuiteSummary[];
  rows: EvalRow[];
  suiteManifests?: SuiteManifest[];
  rubricContracts?: SuiteRubricContract[];
  baselineCompatibility?: BaselineCompatibilityResult;
  datasetChangelog?: DatasetChangelogEntry[];
  metadata?: Record<string, unknown>;
  tags?: Record<string, string>;
};
```

`run.experimentId` / `run.variantLabel` (both optional strings, validated
leniently with no format constraint): a grouping key for clustering 3+
variant runs (e.g. prompt v1/v2/v3) for side-by-side comparison, beyond the
single baseline-vs-current model. `experimentId` identifies the experiment;
`variantLabel` is a human-readable label for this run's variant within it.
Purely descriptive — no gate reads these fields. Echoed in the HTML report's
run banner and run-metadata card, and in the markdown reporter's run table.

`run.kind` conventions:

- `calibration`: marks a calibration-evidence artifact (for example, `judge-calibration` rows) and excludes that run from automatic baseline selection (`--baseline-strategy`) so calibration-only artifacts do not become report/check baselines.
- Other values are currently free-form and tool-specific.

`tags` (top-level, optional): free-form `Record<string, string>` for ad hoc CI
context beyond the fixed `run.branch` / `run.commit` / `run.buildId` fields —
e.g. `{ "pr": "42", "model": "gpt-4o" }`. Purely descriptive; no gate reads
this field. Echoed in the HTML report's run-metadata card, in the markdown
report's metadata table, and in `--json-out`.

Rows are runner-agnostic:

```ts
export type EvalRow = {
  id: string;
  suite: string;
  kind?: 'deterministic' | 'agent' | 'llm-judge' | 'human-review';
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
  humanReviews?: Array<{
    reviewer: string;
    verdict: string;
    category?: string;
    note?: string;
    decidedAt?: string;
  }>;
  reviewAgreement?: number; // 0-1
  input?: string;
  output?: string;
  expected?: string;
  turns?: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    toolCall?: { name: string; args: Record<string, unknown> };
    toolResult?: string;
    timestamp?: string;
    durationMs?: number;
  }>;
  toolCalls?: Array<{
    name: string;
    args?: Record<string, unknown>;
    result?: string;
    resultIsError?: boolean;
    durationMs?: number;
  }>;
  trace?: {
    traceId?: string;
    spanId?: string;
    traceUrl?: string;
    spanUrl?: string;
    spanType?: string;
  };
  axisScores?: Record<string, number>;
  /** Optional per-axis judge reasoning, one explanation string per axis key. */
  axisReasoning?: Record<string, string>;
  passed: boolean;
  score?: number;
  severity?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  reason?: string;
  durationMs?: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    costUsd?: number;
    model?: string;
  };
  metadata?: Record<string, unknown>;
  complianceRefs?: string[];
};
```

Agent and LLM judge reports should use the first-class optional judge fields instead of hiding core report semantics in `metadata`:

- `kind`: identifies deterministic checks, agent checks, LLM judge checks, or human review rows.
- `datasetId`: stable dataset identifier for trend and baseline grouping.
- `scenarioId`: stable scenario identifier inside a dataset.
- `rubricId`: rubric or criterion identifier applied to the row.
- `judgeModel`: model or judge engine name used to score the row.
- `judgeVerdict`: raw judge verdict before any row-level calibration or outcome mapping.
- `judgeCategory`: judge-assigned failure or success category.
- `judgeReasoning`: short explanation from the judge, suitable for report display.
- `promptVersion`: version of the evaluated prompt, policy, or agent instructions.
- `agentChannel`: channel, environment, or release lane for an evaluated agent.
- `agentVersion`: version of the evaluated agent or workflow.
- `groundTruthVerdict`, `groundTruthCategory`, and `groundTruthAnnotation`: labelled calibration evidence for judge evals.
- `trace.traceId`, `trace.spanId`: portable trace/span identifiers when available.
- `trace.traceUrl`, `trace.spanUrl`: optional deep links to trace evidence that reporters can render as clickable links.
- `trace.spanType`: optional free-form, runner-defined label for the pipeline stage this span represents (e.g. `"retrieval"`, `"generation"`, `"tool"`, `"agent"`). No enum lock-in; purely a label for grouping evidence by pipeline stage. HTML/markdown reporters show it next to trace links when present; no change when absent.
- `complianceRefs`: opaque, free-form compliance/regulatory reference ids this row is evidence for (e.g. `"owasp:llm:01"`, `"nist:ai:measure:1.1"`, `"eu:ai-act"`). Not validated against a canonical list — harnesses own classification, this package only stores and groups/filters by whatever strings are provided. `suiteManifests[].complianceFrameworks?: string[]` is the analogous suite-level field. HTML/markdown/JSON reporters render a "Compliance coverage" grouping by these tags only when at least one row or manifest declares one; there is no UI change when both are absent.

When using judge-based groundedness/relevance suites, ensure rubric guidance does not penalize extra details that remain consistent with reference/context.

### Trace-first evidence pattern

For failure triage, prefer carrying both portable IDs and clickable links:

```json
{
  "id": "agent/tool-timeout-001",
  "suite": "agent",
  "passed": false,
  "severity": "high",
  "category": "tool-timeout",
  "trace": {
    "traceId": "4f5c7c55f9da4b4a",
    "spanId": "a1e243fbe90c9f5d",
    "traceUrl": "https://traces.example.local/trace/4f5c7c55f9da4b4a",
    "spanUrl": "https://traces.example.local/trace/4f5c7c55f9da4b4a/span/a1e243fbe90c9f5d",
    "spanType": "tool"
  }
}
```

End-to-end maintained example:

- Artifact: `examples/basic-json/run-trace-links.json`
- Generate report: `eval-dashboards report --input=examples/basic-json --run-id=run-trace-links --reporter=html --report-dir=eval-report`
- Triage flow: open row `agent/tool-timeout-001` in `eval-report/index.html` and follow the rendered trace/span links.

## Suite Governance

Suites can carry opinionated but portable governance metadata:

```ts
export type SuiteManifest = {
  name: string;
  target: 'agent' | 'conversation' | 'judge' | 'custom';
  owner?: string;
  datasetSource: 'synthetic' | 'labelled-synthetic' | 'production-sample' | 'manual' | 'custom';
  datasetVersion: string;
  rubricVersion?: string;
  riskArea:
    | 'compliance'
    | 'pii'
    | 'content-safety'
    | 'prompt-safety'
    | 'tone-of-voice'
    | 'factuality'
    | 'response-quality'
    | 'tool-use'
    | 'tool-routing'
    | 'groundedness'
    | 'relevance'
    | 'custom';
  graders: Array<
    | 'deterministic-assertions'
    | 'human-labelled-calibration'
    | 'llm-judge'
    | 'tool-call-check'
    | 'custom'
  >;
  datasetPath?: string; // optional source file/URL
  gate: { mode: 'blocking' | 'report-only'; thresholds: Record<string, number> };
  description?: string;
  complianceFrameworks?: string[];
  scoreScale?: { min: number; max: number };
};
```

`rubricVersion` remains optional for compatibility, but is required for governance-critical suites: when `gate.mode` is `blocking`, or when `graders` includes `llm-judge`.

Use `target: 'agent'` for live agent behavior, tool use, channel, prompt, and version checks. Use `target: 'judge'` for judge calibration suites where the evaluated subject is the judge itself.

For fail-fast live pipelines, define a dedicated `preflight` suite (`target: 'custom'`) with deterministic probe rows and gate it via required suite pass checks.

`complianceFrameworks` (optional): opaque, free-form compliance/regulatory framework tags this suite maps to, e.g. `["owasp:llm", "nist:ai:measure:1.1", "eu:ai-act"]`. Deliberately not a canonical enum — classification is harness territory. Combined with `rows[].complianceRefs`, reporters group/filter a "Compliance coverage" view; both fields are additive and produce no UI change when omitted.

`scoreScale` (optional, 4F.18): a declared, non-normalized score range for this suite's rows, `{ min: number; max: number }`, e.g. `{ min: 0, max: 3 }` for a 0-3 Likert rubric. One per suite, not per row — `rows[].score` values for rows in this suite are assumed to fall within `[min, max]`. The HTML reporter uses it to render row score bars/gauges proportionally to the declared scale; suites without it keep the existing default 0-1 assumption, so this is additive with no behavior change when omitted.

Rubric contracts describe the axes used by judge and human-review rows:

```ts
export type SuiteRubricContract = {
  suiteName: string;
  rubricVersion: string;
  rubrics: Array<{ axis: string; version: string; sourcePath?: string; summary?: string }>;
};
```

## Baseline Compatibility

When a run is compared with a previous run, `@icodenet/eval-dashboards` can assess whether the comparison is meaningful:


Blocking suite threshold keys supported by `check` include:

- Pass rate: `passRate`, `pass_rate`, `passrate` (minimum pass rate)
- Critical count: `maxCriticalFailures` (maximum critical failing rows)
- Critical rate: `criticalFailureRate` (maximum critical failure ratio)

The contract stays vendor-independent: these fields describe evaluation evidence, not a specific model provider, runner, or hosting platform.

## Dataset Changelog (Optional)

For governed eval programs, artifacts can carry an optional `datasetChangelog` array that records why comparability changed:

```ts
type DatasetChangelogEntry = {
  suiteName: string;
  datasetVersion: string;
  rubricVersion: string;
  changedAt: string;
  changeType: 'initial-baseline' | 'patch' | 'minor' | 'major';
  summary: string;
  rowChanges: {
    added: number;
    updated: number;
    removed: number;
    relabelled: number;
  };
};
```

This field is optional and additive. When present, reports can show dataset/rubric evolution without requiring external changelog files.

## Row Provenance & Lifecycle Conventions

`rows[].metadata` remains extensible, but `eval-report/v1` now documents optional portable conventions for row governance:

```ts
type RowMetadata = {
  // legacy cost field, tolerated for backward compatibility — prefer
  // rows[].usage.costUsd (see "Usage Metrics" above) for new emitters
  costUsd?: number;
  // tolerated aliases accepted by reporters/importers for compatibility:
  // costUSD, usdCost, cost.usd, pricing.costUsd
  provenance?: {
    source:
      | 'synthetic'
      | 'labelled-synthetic'
      | 'production-review'
      | 'incident'
      | 'regression'
      | 'custom';
    addedBy?: string;
    reason?: string;
    sourceRef?: string;
  };
  lifecycle?: {
    status: 'proposed' | 'active' | 'deprecated' | 'quarantined' | 'custom';
    since?: string;
    note?: string;
  };
  // additional runner-specific metadata fields are still allowed
};
```

These fields are optional and additive. Existing artifacts remain valid; runners can adopt them incrementally for auditability and dataset stewardship.

## Usage Metrics (Tokens/Cost/Latency)

`rows[].usage` (4D.2) is the first-class, schema-validated home for token and
cost usage. Latency continues to be reported via the sibling `rows[].durationMs`
field:

```ts
type RowUsageMetrics = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  // canonical cost field for cost-quality frontier reporting, in USD
  costUsd?: number;
  model?: string;
};
```

All fields are optional and additive. Reporters read `usage.costUsd` first and
fall back to the legacy `metadata.costUsd` (and its aliases) so existing
artifacts keep working. New emitters should populate `usage` directly instead
of stashing tokens/cost under `metadata`. The HTML/markdown reporters surface
per-row usage in the row detail view and artifact-wide totals ("Total cost",
"Total tokens") in the run metadata section when any row has `usage` data.

## Human Adjudication Bundle Flow (Optional)

For reviewer-loop workflows (Phase 4B.7), the CLI supports an optional export/import sidecar bundle:

```sh
eval-dashboards adjudicate export --input=.evals_output --out=eval-report/adjudication-bundle.json
eval-dashboards adjudicate import --input=.evals_output --bundle=eval-report/adjudication-bundle-reviewed.json --out=eval-report/adjudicated-run.json
```

Use `--run-id=<id>` on either action when the input directory contains multiple runs.
Keep adjudicated outputs outside the artifact input directory to avoid duplicate run ids in discovery.

Bundle contract:

```ts
type AdjudicationBundleV1 = {
  schemaVersion: 'eval-adjudication-bundle/v1';
  bundleId: string;
  generatedAt: string;
  source: { runId: string; generatedAt: string };
  rows: Array<{
    id: string;
    suite: string;
    unresolvedReason: 'expectation-mismatch';
    currentPassed: boolean;
    expectedOutcome?: 'pass' | 'fail';
    severity?: 'none' | 'low' | 'medium' | 'high' | 'critical';
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
    review?: {
      verdict?: 'pass' | 'fail';
      reviewer?: string;
      category?: string;
      note?: string;
      decidedAt?: string;
    };
  }>;
};
```

On import, reviewer decisions merge into `rows[]` (for example `passed`, `groundTruthVerdict`, `groundTruthCategory`, `groundTruthAnnotation`) and append a provenance trail under `report.metadata.adjudication.imports[]` and row-level `metadata.adjudicationTrail[]`.
If a row already has `metadata.provenance`, import preserves it; otherwise import adds `metadata.provenance.source='production-review'` with bundle linkage.