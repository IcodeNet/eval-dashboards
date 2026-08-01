# Artifact Format

`@icodenet/eval-reports` consumes versioned JSON artifacts. The first contract is `eval-report/v1`.

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
  };
  suites: EvalSuiteSummary[];
  rows: EvalRow[];
  suiteManifests?: SuiteManifest[];
  rubricContracts?: SuiteRubricContract[];
  baselineCompatibility?: BaselineCompatibilityResult;
  metadata?: Record<string, unknown>;
};
```

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
  groundTruthVerdict?: boolean;
  groundTruthCategory?: string;
  groundTruthAnnotation?: string;
  input?: string;
  output?: string;
  expected?: string;
  passed: boolean;
  score?: number;
  severity?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  reason?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
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
    | 'prompt-safety'
    | 'response-quality'
    | 'tool-use'
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
  gate: { mode: 'blocking' | 'report-only'; thresholds: Record<string, number> };
  description?: string;
};
```

Use `target: 'agent'` for live agent behavior, tool use, channel, prompt, and version checks. Use `target: 'judge'` for judge calibration suites where the evaluated subject is the judge itself.

Rubric contracts describe the axes used by judge and human-review rows:

```ts
export type SuiteRubricContract = {
  suiteName: string;
  rubricVersion: string;
  rubrics: Array<{ axis: string; version: string; sourcePath?: string; summary?: string }>;
};
```

## Baseline Compatibility

When a run is compared with a previous run, `@icodenet/eval-reports` can assess whether the comparison is meaningful:

- `compatible`: suite dataset and rubric versions match.
- `warning`: metadata is missing, the suite is new, or a report-only suite changed versions.
- `blocked`: a blocking suite changed dataset or rubric version.

The contract stays vendor-independent: these fields describe evaluation evidence, not a specific model provider, runner, or hosting platform.