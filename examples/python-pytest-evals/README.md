# Python / Pytest Evals — emit eval-report/v1 artifacts

This example shows how to emit `eval-report/v1` artifacts from **Python-based evaluation suites** so `@icodenet/eval-dashboards` can generate reports, enforce gates, and track trends.

Python is the most common language for LLM and agent evaluation work. This example uses only Python's standard library and `pytest`, with no LLM API calls required.

## What You Get

- A `conftest.py` that collects eval rows and writes a taxonomy-complete JSON artifact at test session end
- A sample test module showing deterministic, LLM-judge, and agent eval row patterns
- A Node script you can call from your CI pipeline to generate dashboards from the Python-emitted artifact
- A ready-to-use GitHub Actions workflow

## Quick Start

```bash
cd examples/python-pytest-evals

# Run the evals
python -m pytest eval_quality.py -v

# The artifact is written to .evals_output/run.json
# Generate a dashboard from the repo root:
pnpm dev report --input=examples/python-pytest-evals/.evals_output --reporter=html --report-dir=eval-report
```

---

## Step 1: Install Dependencies

No third-party Python dependencies are required. This example uses only the standard library (`json`, `time`, `uuid`, `datetime`).

For your production usage, integrate with whichever evaluation library you already use (LangChain Evaluators, DeepEval, RAGAS, OpenAI Evals, etc.) — this example shows the artifact shape to emit.

---

## Step 2: conftest.py — Artifact Writer

Create `conftest.py` in your eval directory:

```python
# conftest.py
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest


def pytest_configure(config):
    """Set up the eval rows accumulator."""
    config._eval_rows = []
    config._eval_start = time.time()


def emit_eval_row(config, row: dict):
    """Helper to add an eval row from a test. Call from your test via request.config."""
    config._eval_rows.append(row)


@pytest.fixture
def eval_rows(request):
    """Per-test fixture: returns a mutable list for collecting eval rows.
    
    Usage:
        def test_something(eval_rows):
            eval_rows.append({ "id": "...", "suite": "...", "passed": True, ... })
    """
    rows = []
    yield rows
    request.config._eval_rows.extend(rows)


def pytest_sessionfinish(session, exitstatus):
    """Write the eval-report/v1 artifact after the session completes."""
    rows = getattr(session.config, "_eval_rows", [])
    if not rows:
        return

    output_dir = Path(".evals_output")
    output_dir.mkdir(exist_ok=True)

    run_id = f"pytest-{uuid.uuid4().hex[:8]}"
    generated_at = datetime.now(timezone.utc).isoformat()

    # Group rows by suite
    suite_stats: dict[str, dict] = {}
    for row in rows:
        s = row.get("suite", "default")
        if s not in suite_stats:
            suite_stats[s] = {"total": 0, "passed": 0, "failed": 0}
        suite_stats[s]["total"] += 1
        if row.get("passed"):
            suite_stats[s]["passed"] += 1
        else:
            suite_stats[s]["failed"] += 1

    suites = [
        {
            "id": suite_id,
            "name": suite_id,
            "total": stats["total"],
            "passed": stats["passed"],
            "failed": stats["failed"],
        }
        for suite_id, stats in suite_stats.items()
    ]

    artifact = {
        "schemaVersion": "eval-report/v1",
        "run": {
            "id": run_id,
            "generatedAt": generated_at,
            "project": os.environ.get("EVAL_PROJECT", "my-agent"),
            "branch": os.environ.get("GITHUB_REF_NAME", "main"),
            "commit": os.environ.get("GITHUB_SHA", "unknown"),
            "buildId": os.environ.get("GITHUB_RUN_ID"),
        },
        "suites": suites,
        "rows": rows,
    }

    output_path = output_dir / "run.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(artifact, f, indent=2)

    print(f"\n✓ eval-report/v1 artifact written: {output_path}")
    print(f"  {len(rows)} rows across {len(suites)} suites")
```

---

## Step 3: eval_quality.py — Your Eval Tests

```python
# eval_quality.py
"""
Example eval tests emitting taxonomy-complete eval-report/v1 rows.

Patterns shown:
  - deterministic: rule-based checks (no LLM)
  - llm-judge: LLM scoring (simulated here; replace with real judge)
  - agent: agent behavior checks (tool calls, turns, output)
"""

import time
import pytest


# ---------------------------------------------------------------------------
# Helpers — replace with your actual agent/judge calls
# ---------------------------------------------------------------------------


def call_agent(input_text: str) -> dict:
    """Placeholder — replace with your actual agent call."""
    return {
        "output": f"Agent response to: {input_text}",
        "toolCalls": ["search_kb"],
        "turns": 2,
        "durationMs": 120,
    }


def call_llm_judge(input_text: str, output: str, rubric_id: str) -> dict:
    """Placeholder — replace with your actual LLM judge call."""
    # Simulate grading
    score = 0.85 if len(output) > 20 else 0.3
    return {
        "score": score,
        "verdict": "pass" if score >= 0.7 else "fail",
        "reasoning": f"Output has adequate detail. Score: {score:.2f}",
        "judgeModel": "gpt-4o-mini",
    }


# ---------------------------------------------------------------------------
# Deterministic evals (kind: deterministic)
# ---------------------------------------------------------------------------


class TestDeterministicQuality:
    """Rule-based checks: no LLM calls, fast, fully reproducible."""

    def test_response_is_not_empty(self, eval_rows):
        input_text = "What is the refund policy?"
        result = call_agent(input_text)
        output = result["output"]

        passed = len(output.strip()) > 0
        eval_rows.append(
            {
                "id": "det-001-not-empty",
                "suite": "deterministic-quality",
                "kind": "deterministic",
                "passed": passed,
                "severity": "high" if not passed else "none",
                "category": "output-validity",
                "input": input_text,
                "output": output,
                "datasetId": "support-qa-v1",
                "scenarioId": "empty-response-check",
                "rubricId": "response-validity-2026",
                "durationMs": result["durationMs"],
            }
        )
        assert passed, f"Agent returned empty response for: {input_text!r}"

    def test_response_does_not_hallucinate_prohibited_words(self, eval_rows):
        input_text = "What are our return windows?"
        prohibited = ["I don't know", "I cannot", "I'm not sure"]
        result = call_agent(input_text)
        output = result["output"]

        violations = [p for p in prohibited if p.lower() in output.lower()]
        passed = len(violations) == 0
        eval_rows.append(
            {
                "id": "det-002-no-refusals",
                "suite": "deterministic-quality",
                "kind": "deterministic",
                "passed": passed,
                "severity": "medium" if not passed else "none",
                "category": "hallucination-proxy",
                "reason": f"Prohibited phrases found: {violations}"
                if violations
                else None,
                "input": input_text,
                "output": output,
                "datasetId": "support-qa-v1",
                "scenarioId": "refusal-check",
                "rubricId": "response-validity-2026",
                "durationMs": result["durationMs"],
            }
        )
        assert passed, f"Agent output contained prohibited phrases: {violations}"


# ---------------------------------------------------------------------------
# LLM judge evals (kind: llm-judge)
# ---------------------------------------------------------------------------


class TestLLMJudgeQuality:
    """LLM-graded checks: replace judge call with your actual grader."""

    def test_answer_relevance(self, eval_rows):
        input_text = "How do I track my order?"
        result = call_agent(input_text)
        output = result["output"]
        judgment = call_llm_judge(input_text, output, "answer-relevance-v2")

        passed = judgment["verdict"] == "pass"
        eval_rows.append(
            {
                "id": "judge-001-relevance",
                "suite": "llm-judge-quality",
                "kind": "llm-judge",
                "passed": passed,
                "severity": "medium" if not passed else "none",
                "category": "relevance",
                "score": judgment["score"],
                "input": input_text,
                "output": output,
                "judgeModel": judgment["judgeModel"],
                "judgeVerdict": judgment["verdict"],
                "judgeReasoning": judgment["reasoning"],
                "datasetId": "support-qa-v1",
                "scenarioId": "order-tracking",
                "rubricId": "answer-relevance-v2",
            }
        )
        assert passed, (
            f"Relevance check failed (score={judgment['score']:.2f}): {judgment['reasoning']}"
        )

    def test_answer_groundedness(self, eval_rows):
        input_text = "What is the warranty period?"
        result = call_agent(input_text)
        output = result["output"]
        judgment = call_llm_judge(input_text, output, "groundedness-v1")

        passed = judgment["verdict"] == "pass"
        eval_rows.append(
            {
                "id": "judge-002-groundedness",
                "suite": "llm-judge-quality",
                "kind": "llm-judge",
                "passed": passed,
                "severity": "high" if not passed else "none",
                "category": "groundedness",
                "score": judgment["score"],
                "input": input_text,
                "output": output,
                "judgeModel": judgment["judgeModel"],
                "judgeVerdict": judgment["verdict"],
                "judgeReasoning": judgment["reasoning"],
                "datasetId": "support-qa-v1",
                "scenarioId": "warranty-query",
                "rubricId": "groundedness-v1",
                "axisScores": {
                    "factual-accuracy": judgment["score"],
                    "source-citation": 0.9,
                },
            }
        )
        assert passed, f"Groundedness check failed: {judgment['reasoning']}"


# ---------------------------------------------------------------------------
# Agent behavior evals (kind: agent)
# ---------------------------------------------------------------------------


class TestAgentBehavior:
    """Agent-level checks: tool use, turn count, latency."""

    def test_agent_uses_knowledge_base_tool(self, eval_rows):
        input_text = "Do you offer student discounts?"
        result = call_agent(input_text)

        expected_tool = "search_kb"
        tool_used = expected_tool in result.get("toolCalls", [])
        passed = tool_used
        eval_rows.append(
            {
                "id": "agent-001-tool-use",
                "suite": "agent-behavior",
                "kind": "agent",
                "passed": passed,
                "severity": "high" if not passed else "none",
                "category": "tool-routing",
                "reason": f"Expected tool '{expected_tool}' not called"
                if not passed
                else None,
                "input": input_text,
                "output": result["output"],
                "toolCalls": result.get("toolCalls", []),
                "turns": result.get("turns", 1),
                "durationMs": result.get("durationMs"),
                "datasetId": "agent-behavior-v1",
                "scenarioId": "kb-tool-routing",
                "rubricId": "tool-use-correctness-v1",
                "agentVersion": "v2.1.0",
                "promptVersion": "support-agent-v3",
            }
        )
        assert passed, f"Agent did not use expected tool '{expected_tool}'"

    def test_agent_completes_within_turn_budget(self, eval_rows):
        input_text = "Can I exchange a product I bought last month?"
        max_turns = 3
        result = call_agent(input_text)
        turns = result.get("turns", 1)

        passed = turns <= max_turns
        eval_rows.append(
            {
                "id": "agent-002-turn-budget",
                "suite": "agent-behavior",
                "kind": "agent",
                "passed": passed,
                "severity": "medium" if not passed else "none",
                "category": "efficiency",
                "reason": f"Used {turns} turns (max {max_turns})"
                if not passed
                else None,
                "input": input_text,
                "output": result["output"],
                "toolCalls": result.get("toolCalls", []),
                "turns": turns,
                "durationMs": result.get("durationMs"),
                "datasetId": "agent-behavior-v1",
                "scenarioId": "turn-budget-check",
                "rubricId": "efficiency-v1",
                "agentVersion": "v2.1.0",
                "promptVersion": "support-agent-v3",
            }
        )
        assert passed, f"Agent used {turns} turns (budget: {max_turns})"
```

---

## Step 4: Generate the Dashboard (from repo root)

```bash
# Generate HTML report
pnpm dev report --input=examples/python-pytest-evals/.evals_output --reporter=html --report-dir=eval-report

# Enforce gates
pnpm dev check \
  --input=examples/python-pytest-evals/.evals_output \
  --min-pass-rate=0.8 \
  --max-new-failures=0 \
  --zero-critical
```

---

## Step 5: GitHub Actions CI Integration

```yaml
# .github/workflows/eval-quality.yml
name: Eval Quality

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  eval:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Node dependencies
        run: npm install -g pnpm && pnpm install

      - name: Run Python evals
        run: |
          cd examples/python-pytest-evals
          python -m pytest eval_quality.py -v

      - name: Check quality gates
        run: |
          pnpm dev check \
            --input=examples/python-pytest-evals/.evals_output \
            --min-pass-rate=0.8 \
            --max-new-failures=0

      - name: Generate HTML report
        if: always()
        run: |
          pnpm dev report \
            --input=examples/python-pytest-evals/.evals_output \
            --reporter=html \
            --report-dir=eval-report

      - name: Upload eval report artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-report
          path: eval-report/
```

---

## Adapting for Popular Python Eval Frameworks

### RAGAS

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy

result = evaluate(dataset=my_dataset, metrics=[faithfulness, answer_relevancy])

# Emit rows per sample
for i, (score, row) in enumerate(zip(result.scores, my_dataset)):
    eval_rows.append(
        {
            "id": f"ragas-{i:04d}",
            "suite": "ragas-quality",
            "kind": "llm-judge",
            "passed": score["faithfulness"] >= 0.8 and score["answer_relevancy"] >= 0.7,
            "severity": "medium",
            "axisScores": {
                "faithfulness": score["faithfulness"],
                "answer_relevancy": score["answer_relevancy"],
            },
            "judgeModel": "gpt-4o",
            "input": row["question"],
            "output": row["answer"],
            "datasetId": "ragas-fiqa-v1",
            "rubricId": "ragas-combined-v2",
        }
    )
```

### DeepEval

```python
from deepeval import evaluate as deepeval_evaluate
from deepeval.metrics import AnswerRelevancyMetric

metric = AnswerRelevancyMetric(threshold=0.7)
# Run deepeval...
# Then convert test_result to eval-report/v1 rows and emit via conftest.py
```

### LangChain Evaluators

```python
from langchain.evaluation import load_evaluator

evaluator = load_evaluator("criteria", criteria="relevance")
result = evaluator.evaluate_strings(prediction=output, input=input_text)

eval_rows.append({
    "id": "lc-eval-001",
    "suite": "langchain-quality",
    "kind": "llm-judge",
    "passed": result["score"] >= 1,
    "score": result["score"],
    "judgeReasoning": result["reasoning"],
    ...
})
```

---

## Key Points for Python Integration

1. **One artifact per run** — write to `.evals_output/run-{timestamp}.json` or `run.json`
2. **Use `suite` to group rows** — by model, scenario type, or risk area
3. **Fill taxonomy fields** — `kind`, `severity`, `category`, `datasetId`, `rubricId` make gates meaningful
4. **Evidence fields** — always include `input`, `output`, and `judgeReasoning` for debuggability
5. **Environment variables** — populate `branch`, `commit`, `buildId` in CI for trend tracking

See [docs/taxonomy.md](../../docs/taxonomy.md) for the complete field reference.
