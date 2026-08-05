# Newcomer Runbook

## 1) What this repo is and what benefits it gives

### What this repo is

This repository, @icodenet/eval-dashboards, is a reporting layer for AI and LLM evaluation runs.

It takes eval artifacts (JSON files), validates them, and then provides:

- Reports (HTML, text, markdown, JSON summary)
- Quality gates (pass or fail checks for CI)
- History and baseline comparison
- Publishing options for static dashboards

In practical terms: it turns raw eval output provided by your runner as eval artifact files (eval-report/v1 JSON format) into decision-ready reporting for teams.

### Benefits

- Standardization: one shared artifact contract across runners and stacks
- Runner agnostic: Vitest, Jest, plain Node scripts, Python, and custom harnesses can all work
- CI ready: easy to block regressions with gate checks
- Offline first: static reports work without a running server
- Low lock-in: artifacts remain plain JSON under your control

## 2) What do we mean by: "Provide eval artifact files (eval-report/v1 JSON format)"

This means your own eval runner must output one or more JSON files that follow the eval-report/v1 contract.

At minimum:

- Top-level schemaVersion must be eval-report/v1
- Top-level sections should include run, suites, and rows
- Each row must include id, suite, and passed

Conceptual minimal shape:

~~~json
{
	"schemaVersion": "eval-report/v1",
	"run": {
		"id": "local-run-001",
		"generatedAt": "2026-08-05T00:00:00.000Z"
	},
	"suites": [
		{
			"id": "quality",
			"name": "Quality",
			"total": 1,
			"passed": 1,
			"failed": 0
		}
	],
	"rows": [
		{
			"id": "case-001",
			"suite": "quality",
			"passed": true
		}
	]
}
~~~

Use these references for exact fields and validation:

- [Artifact format](artifact-format.md)
- [Schema file](../schemas/eval-report-v1.schema.json)
- [Taxonomy guide](taxonomy.md)

## 3) How will you hook this library into your own repo

This is the recommended onboarding flow.

### Step 1: Install dependency

~~~bash
pnpm add -D @icodenet/eval-dashboards
~~~

or

~~~bash
npm install -D @icodenet/eval-dashboards
~~~

### Step 2: Emit eval-report/v1 artifacts

Run your existing evaluator and write artifact files to a stable folder, commonly .evals_output.

Example contract helper APIs (Node and TypeScript users):

- createEvalReportArtifact
- writeEvalReportArtifact

Reference exports: [src/index.ts](../src/index.ts)

Typical pattern:

~~~ts
import { writeEvalReportArtifact } from '@icodenet/eval-dashboards';

await writeEvalReportArtifact('.evals_output/run.json', {
	run: { id: 'local-run-001' },
	cases: evalCases,
});
~~~

### Step 3: Generate reports

~~~bash
npx @icodenet/eval-dashboards report --input=.evals_output --reporter=html --reporter=text
~~~

### Step 4: Enforce gates

~~~bash
npx @icodenet/eval-dashboards lint --input=.evals_output
npx @icodenet/eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --max-new-failures=0 --zero-critical
~~~

### Step 5: Add to CI

Pipeline pattern:

1. Run evals and emit JSON artifacts
2. Run lint first to catch incomplete taxonomy or governance fields early
3. Run report command to produce outputs
4. Run check command to block regressions
5. Optionally publish static dashboard and upload artifacts

Reference CI example: [GitHub Actions eval quality workflow](../examples/github-actions/eval-quality.yml)

### Step 6: Map the demo to a real repo

The local example is intentionally small, so it can feel abstract if you are looking for your own datasets, prompts, and rubrics. Use this mapping when you adapt it:

| Demo piece | Real repo equivalent | What you replace |
|---|---|---|
| `scenarios` in [run-local-agent-evals.ts](../examples/llm-agent-evals/run-local-agent-evals.ts) | Your dataset or test cases | Load cases from fixtures, files, a DB, a ticket export, or a domain-specific source. |
| `runLocalAgent()` | Your runner or harness | Call your actual agent, model, workflow, or service under test. |
| `knowledge-base` tool | Your real tools or dependencies | Swap in search, retrieval, API, database, or workflow steps your runner already uses. |
| `legacyPromptResponse()` and `improvedPromptResponse()` | Prompt or policy versions | Point these at the prompt templates, instruction files, or commit SHAs you actually version. |
| `judgeAnswer()` | Your scoring logic or judge | Replace the demo heuristic with your real rubric, model judge, or human review step. |
| `local-chat-quality` suite | A production eval suite | Rename it to the real business area: support, groundedness, compliance, tool use, etc. |
| `judge-calibration` suite | Judge calibration / label-quality suite | Keep labelled examples separate from ordinary runs so you can measure judge agreement explicitly. |
| `.evals_output/*.json` | Build artifact folder | Write to whatever stable output directory your CI or runner already produces. |

The easiest way to make the example feel real is to trace one row all the way through the pipeline:

1. Pick one representative case from your real dataset.
2. Run it through your actual runner and store the raw inputs and outputs.
3. Add the rubric or judge fields that explain why it passed or failed.
4. Write the row into `eval-report/v1` JSON.
5. Render the report and confirm the row looks like a case your team would actually review.

## 4) Starter script block for a user repo

Users can add scripts like:

~~~json
{
	"scripts": {
		"eval": "node ./scripts/run-evals.js",
		"eval:lint": "eval-dashboards lint --input=.evals_output",
		"eval:report": "eval-dashboards report --input=.evals_output --reporter=html --reporter=text",
		"eval:check": "eval-dashboards check --input=.evals_output --min-pass-rate=0.9 --max-new-failures=0 --zero-critical"
	}
}
~~~

What each script does:

- eval: runs your local eval harness and writes eval-report/v1 artifacts into .evals_output.
- eval:lint: catches taxonomy and governance issues before running stricter gate checks.
- eval:report: reads artifacts and renders reports (HTML for humans, text for terminal and CI logs).
- eval:check: enforces quality thresholds and returns non-zero exit code when gates fail.

## 5) Full local example (agent + tools + evals + report)

Yes, this repo already includes a complete local example that simulates:

- a local agent
- a local tool call path (knowledge base tool)
- deterministic plus judge-style eval rows
- report and gate commands over generated artifacts

Use this script as the concrete reference implementation:

- [Local runner script](../examples/llm-agent-evals/run-local-agent-evals.ts)
- [Example walkthrough](../examples/llm-agent-evals/README.md)

Run locally from repo root:

~~~bash
pnpm example:llm-agent-evals
pnpm dev report --input=examples/llm-agent-evals/.evals_output --reporter=html --reporter=text --report-dir=eval-report
pnpm dev check --input=examples/llm-agent-evals/.evals_output --min-pass-rate=0.75 --max-new-failures=1 --zero-critical
~~~

If you want the runbook starter script to be directly runnable, implement ./scripts/run-evals.js in your repo by mirroring what run-local-agent-evals.ts does: evaluate scenarios, generate rows, and write eval-report/v1 JSON artifacts.

If your runner emits judge-calibration rows, include `groundTruthVerdict` and `groundTruthAxisScores`.

That means each labelled calibration row should carry the expected pass/fail label and the labelled axis scores that the judge is supposed to match. The calibration gate uses those values to measure judge agreement and axis-score drift, and the report section shows the comparison so you can see where the judge matches or diverges from the labelled example.

The local agent example now generates a separate `judge-calibration` suite with those fields so you can see the pattern end to end:

- [Local runner script](../examples/llm-agent-evals/run-local-agent-evals.ts)
- [Example walkthrough](../examples/llm-agent-evals/README.md)

## 6) Newcomer checklist

1. Install dependency in your repo.
2. Confirm your runner emits eval-report/v1 JSON.
3. Save artifacts under .evals_output.
4. Run lint locally and fix missing governance fields if needed.
5. Run report locally and inspect output.
6. Run check locally and tune thresholds.
7. Wire lint, report, and check into CI.

## 7) Where to go next

- Full contract details: [Artifact format](artifact-format.md)
- Config options: [Configuration](configuration.md)
- Taxonomy depth: [Taxonomy guide](taxonomy.md)
- Preset scaffolding and CLI usage: [README](../README.md)
