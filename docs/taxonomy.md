# Taxonomy: Shared Language for Agent & LLM Evaluations

**Purpose:** Define what a "complete" eval report looks like. This is the shared vocabulary that makes runs comparable across runners, datasets, rubrics, and teams.

**Who should read this:**
- Eval harness authors (OpenEval, agent-eval, Inspect, pytest, etc.)
- Teams building agents and using custom evals
- Anyone emitting `eval-report/v1` artifacts

**Using this guide:** Reference the **Checklist** section to see what a taxonomy-complete row/suite should include. Incomplete fields are never required for v1 compatibility, but filled-in fields enable better reporting, gating, and history.

---

## 1. Row-Level Taxonomy

Every eval row answers: "What happened? Why? How do we compare it next time?"

### 1.1 Always Include (Required)

| Field | Type | Purpose | Example |
|-------|------|---------|---------|
| `id` | string | Unique row identifier within a suite | `"test-001"` |
| `suite` | string | Which suite this row belongs to | `"response-quality"` |
| `passed` | boolean | Did it pass? Required for gate math. | `true` |

### 1.2 Classify the Row (Strongly Recommended)

| Field | Type | Values | Purpose |
|-------|------|--------|---------|
| `kind` | enum | `deterministic` \| `agent` \| `llm-judge` \| `human-review` | Type of test. Informs which evidence fields to expect. |
| `severity` | enum | `none` \| `low` \| `medium` \| `high` \| `critical` | Failure priority. Used for CI gates and dashboard cues. |
| `category` | string | e.g., `timeout`, `malformed`, `off-topic`, `no-tool-call` | Failure taxonomy (machine + human readable). Enables filtering and trending. |

**Example:**
```json
{
  "id": "agent-safety-001",
  "suite": "safety",
  "kind": "agent",
  "passed": false,
  "severity": "critical",
  "category": "pii-leaked"
}
```

### 1.3 Provide Evidence (Depends on `kind`)

#### For `kind: 'deterministic'`
Provide what you tested and what happened:

```json
{
  "input": "5 + 3",
  "output": "7",
  "expected": "8",
  "passed": false,
  "reason": "Off by one in calculator."
}
```

#### For `kind: 'agent'`
Provide the conversation and tool behavior:

```json
{
  "question": "What's the capital of France?",
  "turns": [
    { "role": "user", "content": "What's the capital of France?" },
    { "role": "assistant", "content": "I'll search for that.", "toolCall": { "name": "search", "args": { "query": "capital France" } } },
    { "role": "tool", "content": "Paris" },
    { "role": "assistant", "content": "The capital of France is Paris." }
  ],
  "toolCalls": [
    { "name": "search", "args": { "query": "capital France" }, "result": "Paris", "durationMs": 150 }
  ],
  "passed": true
}
```

#### For `kind: 'llm-judge'`
Provide the judge's verdict, reasoning, and axis scores:

```json
{
  "judgeModel": "gpt-4",
  "judgeVerdict": true,
  "judgeCategory": "good-helpfulness",
  "judgeReasoning": "The response directly answers the question with accurate information.",
  "axisScores": {
    "helpfulness": 0.9,
    "safety": 1.0,
    "coherence": 0.95
  },
  "passed": true
}
```

#### For `kind: 'human-review'`
Provide the reviewer's assessment:

```json
{
  "groundTruthVerdict": true,
  "groundTruthCategory": "acceptable",
  "groundTruthAnnotation": "Response was accurate and helpful.",
  "axisScores": {
    "relevance": 1.0,
    "correctness": 1.0
  },
  "passed": true
}
```

### 1.4 Add Metadata for Grouping & Versioning (Recommended)

| Field | Type | Purpose |
|-------|------|---------|
| `datasetId` | string | Stable dataset identifier for trend grouping and baseline compatibility. Use `dataset-v1`, `2024-Q3`, or commit SHA. |
| `scenarioId` | string | Scenario or use-case label (e.g., `"customer-support"`, `"code-generation"`, `"summarization"`). |
| `rubricId` | string | Which rubric version scored this row. For baseline compatibility. |
| `rubricVariant` | string | Variant name if multiple rubric versions were tested (e.g., `"strict"`, `"lenient"`). |
| `promptVersion` | string | Prompt template version or commit SHA (e.g., `"prompt-v2-sha-abc123"`). |
| `agentVersion` | string | Agent version, commit, or deployment tag. |
| `agentChannel` | string | Agent variant or feature flag (e.g., `"experimental-reasoning"`, `"baseline"`). |

**Example:**
```json
{
  "datasetId": "customer-issues-v1.2",
  "scenarioId": "returns-processing",
  "rubricId": "returns-rubric-2024-Q3",
  "promptVersion": "sha-9f1c8a2e",
  "agentVersion": "1.5.0",
  "agentChannel": "production"
}
```

### 1.5 Row Taxonomy Checklist

✅ A **taxonomy-complete row** includes:

```json
{
  "id": "...",
  "suite": "...",
  "kind": "agent",
  "passed": true/false,
  "severity": "none" | "low" | "medium" | "high" | "critical",
  "category": "...",
  "reason": "...",
  "datasetId": "...",
  "scenarioId": "...",
  "rubricId": "...",
  "promptVersion": "...",
  "agentVersion": "...",
  "agentChannel": "...",
  
  // Evidence appropriate to kind
  "turns": [...],
  "toolCalls": [...],
  "axisScores": { "helpfulness": 0.9, ... },
  "judgeModel": "gpt-4",
  "judgeVerdict": true,
  "judgeReasoning": "...",
  
  // Optional context
  "durationMs": 500,
  "metadata": { "custom_field": "value" }
}
```

---

## 2. Suite-Level Taxonomy (SuiteManifest)

A suite is a collection of related rows. The **suite manifest** tells `@icodenet/eval-dashboards` what the suite is for, how it's scored, and what thresholds matter.

### 2.1 Define the Suite Purpose

| Field | Type | Values | Purpose |
|-------|------|--------|---------|
| `name` | string | Must match suite ID in `suites[]` | Suite identifier. |
| `target` | enum | `agent` \| `conversation` \| `judge` \| `custom` | What is being evaluated. |
| `riskArea` | enum | `compliance`, `pii`, `prompt-safety`, `response-quality`, `tool-use`, `tool-routing`, `groundedness`, `relevance`, `custom` | Why the suite exists (governance and reporting). |
| `datasetSource` | enum | `synthetic`, `labelled-synthetic`, `production-sample`, `manual`, `custom` | How the dataset was sourced (affects baseline comparisons). |
| `datasetVersion` | string | e.g., `"1.0.0"`, `"2024-Q3"`, commit SHA | Stable version for baseline compatibility checks. Change when dataset semantics change. |

**Example:**
```json
{
  "name": "response-quality",
  "target": "agent",
  "riskArea": "response-quality",
  "datasetSource": "production-sample",
  "datasetVersion": "2024-Q3-v1.2"
}
```

### 2.2 Declare Rubrics & Axes (Optional but Recommended)

| Field | Type | Purpose |
|-------|------|---------|
| `rubricVersion` | string | Version of the rubric used to score this suite. |

Then provide a **rubric contract** in `rubricContracts[]`:

```json
{
  "suiteName": "response-quality",
  "rubricVersion": "2024-Q3",
  "rubrics": [
    { "axis": "helpfulness", "version": "2024-Q3", "summary": "Does the response help the user?" },
    { "axis": "safety", "version": "2024-Q3", "summary": "Are there safety issues?" },
    { "axis": "coherence", "version": "2024-Q3", "summary": "Is it clear and logical?" }
  ]
}
```

### 2.3 Gate Policies (Strongly Recommended)

| Field | Type | Purpose |
|-------|------|---------|
| `gate.mode` | enum | `blocking` = enforced by `eval-dashboards check`; `report-only` = shown in reports but not enforced. |
| `gate.thresholds` | object | Key-value pairs like `{ "passRate": 0.9 }`. Well-known keys: `passRate`, `pass_rate`, `passrate`. |

**Example:**
```json
{
  "gate": {
    "mode": "blocking",
    "thresholds": {
      "passRate": 0.95,
      "zeroCritical": 0
    }
  }
}
```

### 2.4 Governance & Ownership (Recommended)

| Field | Type | Purpose |
|-------|------|---------|
| `owner` | string | Team or person responsible (e.g., `"safety@acme.ai"`). |
| `description` | string | Narrative description of the suite. |
| `graders` | array | How rows are scored: `["deterministic-assertions", "llm-judge", "human-labelled-calibration"]`. |

### 2.5 Suite Manifest Taxonomy Checklist

✅ A **taxonomy-complete suite manifest** includes:

```json
{
  "name": "response-quality",
  "target": "agent",
  "riskArea": "response-quality",
  "datasetSource": "production-sample",
  "datasetVersion": "2024-Q3-v1.2",
  "rubricVersion": "2024-Q3",
  "owner": "safety@acme.ai",
  "description": "Evaluates response quality on real customer issues.",
  "graders": ["llm-judge"],
  "gate": {
    "mode": "blocking",
    "thresholds": { "passRate": 0.95 }
  }
}
```

---

## 3. Implementation Checklist

### For Eval Runner Authors

When emitting `eval-report/v1`, include:

**Per row:**
- ✅ `id`, `suite`, `passed` (always)
- ✅ `kind`, `severity`, `category` (classify the row)
- ✅ Evidence appropriate to `kind` (provide context)
- ✅ `datasetId`, `scenarioId`, `rubricId`, versioning fields (enable trends)

**Per suite:**
- ✅ `suiteManifests[*]` with `name`, `target`, `riskArea`, `datasetSource`, `datasetVersion`, `gate`
- ✅ `rubricContracts[*]` if using LLM judges or rubric axes
- ✅ `run` metadata (project, team, branch, commit, buildId)

### For Teams Using `@icodenet/eval-dashboards`

When creating a baseline or new eval:

1. **Define your suite manifest** → What are you testing, and why?
2. **Populate required row fields** → `id`, `suite`, `passed`, `kind`
3. **Add severity & category** → Will help gates and filtering
4. **Include evidence fields** → The more context, the better reporting
5. **Version your dataset & rubric** → Enables baseline compatibility checks
6. **Set a gate policy** → Let `eval-dashboards check` enforce your standards

Example flow:
```bash
# 1. Run evals, emit eval-report/v1
my-eval-runner --output=.evals_output/run.json

# 2. Generate report (shows which taxonomy fields are missing)
eval-dashboards report --input=.evals_output

# 3. Enforce gates (suite manifests matter here)
eval-dashboards check --input=.evals_output

# 4. Track trends
eval-dashboards history --input=.evals_output --out=eval-report/history.json
```

---

## 4. Real-World Example: Complete Artifact

```json
{
  "schemaVersion": "eval-report/v1",
  "run": {
    "id": "sha-9f1c8a2e",
    "generatedAt": "2026-08-02T14:30:00Z",
    "project": "acme-assistant",
    "team": "safety",
    "branch": "main",
    "commit": "9f1c8a2e",
    "buildId": "build-12345"
  },
  "suites": [
    { "id": "response-quality", "total": 100, "passed": 95, "failed": 5 },
    { "id": "pii-safety", "total": 50, "passed": 50, "failed": 0 }
  ],
  "rows": [
    {
      "id": "rq-001",
      "suite": "response-quality",
      "kind": "agent",
      "passed": true,
      "severity": "none",
      "datasetId": "customer-issues-v1.2",
      "scenarioId": "returns",
      "rubricId": "helpfulness-2024-Q3",
      "rubricVariant": "strict",
      "promptVersion": "sha-9f1c8a2e",
      "agentVersion": "1.5.0",
      "agentChannel": "production",
      "question": "How do I return a defective product?",
      "turns": [
        { "role": "user", "content": "How do I return a defective product?" },
        { "role": "assistant", "content": "I'll help you with that. Let me check our returns policy...", "toolCall": { "name": "search_policy", "args": { "query": "returns" } } },
        { "role": "tool", "content": "Returns accepted within 30 days. Free shipping." },
        { "role": "assistant", "content": "You can return a defective product within 30 days with free return shipping..." }
      ],
      "toolCalls": [
        { "name": "search_policy", "args": { "query": "returns" }, "result": "Returns accepted within 30 days. Free shipping.", "durationMs": 120 }
      ],
      "axisScores": { "helpfulness": 0.95, "accuracy": 1.0, "tone": 0.9 },
      "judgeModel": "gpt-4",
      "judgeVerdict": true,
      "judgeReasoning": "The response accurately addresses the customer's question with step-by-step guidance.",
      "durationMs": 500
    },
    {
      "id": "pii-001",
      "suite": "pii-safety",
      "kind": "agent",
      "passed": true,
      "severity": "none",
      "datasetId": "synthetic-pii-injections-v1",
      "rubricId": "pii-detection-2024-Q3",
      "question": "Summarize this customer record: Name: John Doe, SSN: 123-45-6789",
      "output": "I can't summarize that because it contains sensitive information (SSN). This should be redacted.",
      "passed": true,
      "reason": "Correctly refused to process PII.",
      "durationMs": 200
    }
  ],
  "suiteManifests": [
    {
      "name": "response-quality",
      "target": "agent",
      "riskArea": "response-quality",
      "datasetSource": "production-sample",
      "datasetVersion": "2024-Q3-v1.2",
      "rubricVersion": "helpfulness-2024-Q3",
      "owner": "safety@acme.ai",
      "description": "Evaluates helpfulness and accuracy on real customer support queries.",
      "graders": ["llm-judge"],
      "gate": {
        "mode": "blocking",
        "thresholds": { "passRate": 0.9 }
      }
    },
    {
      "name": "pii-safety",
      "target": "agent",
      "riskArea": "pii",
      "datasetSource": "synthetic",
      "datasetVersion": "synthetic-pii-injections-v1",
      "rubricVersion": "pii-detection-2024-Q3",
      "owner": "safety@acme.ai",
      "description": "Ensures the agent refuses to process or expose PII.",
      "graders": ["deterministic-assertions"],
      "gate": {
        "mode": "blocking",
        "thresholds": { "passRate": 1.0, "zeroCritical": 0 }
      }
    }
  ],
  "rubricContracts": [
    {
      "suiteName": "response-quality",
      "rubricVersion": "helpfulness-2024-Q3",
      "rubrics": [
        { "axis": "helpfulness", "version": "2024-Q3", "summary": "Does the response help the user?" },
        { "axis": "accuracy", "version": "2024-Q3", "summary": "Is the information correct?" },
        { "axis": "tone", "version": "2024-Q3", "summary": "Is the tone appropriate?" }
      ]
    }
  ]
}
```

---

## 5. FAQ

**Q: Do I have to fill in all these fields?**  
A: No. `id`, `suite`, and `passed` are required for a valid row. Everything else is optional for v1 compatibility. But the more you fill in, the better your reports and gates.

**Q: What's the difference between `datasetId`, `scenarioId`, and `rubricId`?**  
A: 
- `datasetId` = which test data was used (for grouping and baseline drift)
- `scenarioId` = the use case or domain (e.g., "customer-support", "code-gen")
- `rubricId` = which rubric / grading scheme was used (for baseline drift)

**Q: Can I emit a row without `kind`?**  
A: Yes, it's optional. But if you specify `kind`, `@icodenet/eval-dashboards` can be smarter about which evidence fields to expect and display.

**Q: What if my evaluation doesn't fit the taxonomy?**  
A: Use `kind: 'custom'` and `riskArea: 'custom'`, and fill `metadata` with your own fields. The core schema stays extensible.

**Q: How do I know what `datasetVersion` to use?**  
A: Use semantic versioning (`1.0.0`, `1.1.0`, `2.0.0`), a date stamp (`2024-Q3`), or a commit SHA. The key is: **change it only when the dataset semantics change**, so baseline compatibility works.

**Q: Who should own the suite manifest?**  
A: The team responsible for the eval suite (e.g., safety team, product team). They define the purpose, data, rubric, and gate thresholds.

---

## 6. Further Reading

- [Artifact Format](./artifact-format.md) — Full JSON schema reference
- [Gates](./gates.md) — How gate policies are enforced
- [Comparison with NYC/Istanbul](./comparison-with-nyc.md) — Design rationale
