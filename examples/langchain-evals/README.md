# LangChain Evaluators Integration

This example shows how to emit `eval-report/v1` artifacts from **LangChain evaluation runs** so `@icodenet/eval-dashboards` can generate reports, enforce gates, and track quality trends across deployments.

## What This Does

- Wraps LangChain's built-in evaluators (criteria, QA, embedding distance) to emit taxonomy-complete rows
- Handles both sync and async evaluation patterns
- Maps LangChain's `score`/`reasoning` to `judgeVerdict`/`judgeReasoning` fields
- Works with any LangChain-compatible LLM (OpenAI, Anthropic, local models)

## Prerequisites

```bash
pip install langchain langchain-openai  # or langchain-anthropic etc.
export OPENAI_API_KEY="sk-..."
```

## Quick Start

```bash
# Run the example
python run_evals.py

# Generate dashboard (from repo root)
pnpm dev report --input=examples/langchain-evals/.evals_output --reporter=html --report-dir=eval-report

# Check quality gates
pnpm dev check \
  --input=examples/langchain-evals/.evals_output \
  --min-pass-rate=0.8 \
  --max-new-failures=0
```

---

## Integration Pattern

### run_evals.py

```python
"""
LangChain evaluators → eval-report/v1 artifact emitter.

Replace the placeholder agent_response() with your actual LangChain chain call.
"""

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from langchain.evaluation import load_evaluator
from langchain_openai import ChatOpenAI

# ---------------------------------------------------------------------------
# Placeholder — replace with your actual chain
# ---------------------------------------------------------------------------


def agent_response(question: str) -> str:
    """Call your LangChain chain and return the output string."""
    # Example: return chain.invoke({"input": question})["output"]
    return f"Placeholder response for: {question}"


# ---------------------------------------------------------------------------
# Eval runner
# ---------------------------------------------------------------------------


def run_langchain_evals() -> list[dict]:
    """Run a set of LangChain evaluations and return taxonomy-complete rows."""
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    rows: list[dict] = []

    # Dataset: question/reference answer pairs
    eval_dataset = [
        {
            "id": "lc-001",
            "input": "What is the return policy for electronics?",
            "reference": "Electronics can be returned within 30 days with original receipt.",
            "scenario": "return-policy",
        },
        {
            "id": "lc-002",
            "input": "How do I track my shipment?",
            "reference": "Use the tracking number from your confirmation email at tracking.example.com.",
            "scenario": "shipment-tracking",
        },
        {
            "id": "lc-003",
            "input": "Do you offer price matching?",
            "reference": "Yes, we match prices from major retailers within 14 days of purchase.",
            "scenario": "price-matching",
        },
    ]

    # Evaluator: QA correctness (compares to reference answer)
    qa_evaluator = load_evaluator("qa", llm=llm)

    # Evaluator: Criteria (helpfulness)
    helpfulness_evaluator = load_evaluator(
        "criteria",
        criteria="helpfulness",
        llm=llm,
    )

    for item in eval_dataset:
        prediction = agent_response(item["input"])

        # --- QA correctness evaluation ---
        try:
            qa_result = qa_evaluator.evaluate_strings(
                prediction=prediction,
                input=item["input"],
                reference=item["reference"],
            )
            qa_passed = qa_result.get("score", 0) >= 1
            rows.append(
                {
                    "id": f"{item['id']}-qa",
                    "suite": "langchain-qa",
                    "kind": "llm-judge",
                    "passed": qa_passed,
                    "severity": "high" if not qa_passed else "none",
                    "category": "correctness",
                    "score": float(qa_result.get("score", 0)),
                    "input": item["input"],
                    "output": prediction,
                    "judgeModel": "gpt-4o-mini",
                    "judgeVerdict": "pass" if qa_passed else "fail",
                    "judgeReasoning": qa_result.get("reasoning", ""),
                    "datasetId": "support-qa-v1",
                    "scenarioId": item["scenario"],
                    "rubricId": "qa-correctness-v1",
                    "groundTruthAnswer": item["reference"],
                }
            )
        except Exception as e:
            rows.append(
                {
                    "id": f"{item['id']}-qa",
                    "suite": "langchain-qa",
                    "kind": "llm-judge",
                    "passed": False,
                    "severity": "critical",
                    "category": "eval-error",
                    "reason": f"Evaluator failed: {e}",
                    "input": item["input"],
                    "output": prediction,
                    "datasetId": "support-qa-v1",
                    "scenarioId": item["scenario"],
                    "rubricId": "qa-correctness-v1",
                }
            )

        # --- Helpfulness criteria evaluation ---
        try:
            help_result = helpfulness_evaluator.evaluate_strings(
                prediction=prediction,
                input=item["input"],
            )
            help_passed = help_result.get("score", 0) >= 1
            rows.append(
                {
                    "id": f"{item['id']}-helpfulness",
                    "suite": "langchain-criteria",
                    "kind": "llm-judge",
                    "passed": help_passed,
                    "severity": "medium" if not help_passed else "none",
                    "category": "helpfulness",
                    "score": float(help_result.get("score", 0)),
                    "input": item["input"],
                    "output": prediction,
                    "judgeModel": "gpt-4o-mini",
                    "judgeVerdict": "pass" if help_passed else "fail",
                    "judgeReasoning": help_result.get("reasoning", ""),
                    "datasetId": "support-qa-v1",
                    "scenarioId": item["scenario"],
                    "rubricId": "helpfulness-criteria-v1",
                }
            )
        except Exception as e:
            rows.append(
                {
                    "id": f"{item['id']}-helpfulness",
                    "suite": "langchain-criteria",
                    "kind": "llm-judge",
                    "passed": False,
                    "severity": "high",
                    "category": "eval-error",
                    "reason": f"Evaluator failed: {e}",
                    "input": item["input"],
                    "output": prediction,
                    "datasetId": "support-qa-v1",
                    "scenarioId": item["scenario"],
                    "rubricId": "helpfulness-criteria-v1",
                }
            )

    return rows


def write_artifact(rows: list[dict]) -> Path:
    """Write rows to eval-report/v1 artifact."""
    output_dir = Path(".evals_output")
    output_dir.mkdir(exist_ok=True)

    suite_stats: dict[str, dict[str, int]] = {}
    for row in rows:
        s = row.get("suite", "default")
        if s not in suite_stats:
            suite_stats[s] = {"total": 0, "passed": 0, "failed": 0}
        suite_stats[s]["total"] += 1
        if row.get("passed"):
            suite_stats[s]["passed"] += 1
        else:
            suite_stats[s]["failed"] += 1

    artifact = {
        "schemaVersion": "eval-report/v1",
        "run": {
            "id": f"langchain-{uuid.uuid4().hex[:8]}",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "project": os.environ.get("EVAL_PROJECT", "langchain-agent"),
            "branch": os.environ.get("GITHUB_REF_NAME", "main"),
            "commit": os.environ.get("GITHUB_SHA", "unknown"),
            "buildId": os.environ.get("GITHUB_RUN_ID"),
        },
        "suites": [
            {
                "id": suite_id,
                "name": suite_id,
                "total": stats["total"],
                "passed": stats["passed"],
                "failed": stats["failed"],
            }
            for suite_id, stats in suite_stats.items()
        ],
        "rows": rows,
    }

    output_path = output_dir / "run.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(artifact, f, indent=2)

    return output_path


if __name__ == "__main__":
    print("Running LangChain evaluations...")
    rows = run_langchain_evals()
    path = write_artifact(rows)

    passed = sum(1 for r in rows if r.get("passed"))
    total = len(rows)
    print(f"\n✓ Artifact written: {path}")
    print(f"  {passed}/{total} rows passed ({100 * passed // total if total else 0}%)")
    print("\nTo generate the dashboard, run from the repo root:")
    print(
        "  pnpm dev report --input=examples/langchain-evals/.evals_output --reporter=html --report-dir=eval-report"
    )
```

---

## Evaluator Mapping Reference

| LangChain Evaluator | `kind` | Key fields |
|---------------------|--------|------------|
| `"qa"` | `llm-judge` | `judgeVerdict`, `judgeReasoning`, `groundTruthAnswer` |
| `"criteria"` | `llm-judge` | `judgeVerdict`, `judgeReasoning`, `category` (criteria name) |
| `"embedding_distance"` | `deterministic` | `score` (float), `category: "semantic-similarity"` |
| `"pairwise_string"` | `llm-judge` | `judgeVerdict`, `judgeReasoning`, `axisScores` |
| Custom chain + LLM | `llm-judge` | All judge fields + `judgeModel` |

---

## LCEL Chain Pattern

If you're using LangChain Expression Language (LCEL), wrap the evaluator call:

```python
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

# Your production chain
chain = (
    ChatPromptTemplate.from_template("Answer concisely: {question}")
    | ChatOpenAI(model="gpt-4o")
    | StrOutputParser()
)


def agent_response(question: str) -> str:
    return chain.invoke({"question": question})
```

---

## GitHub Actions Workflow

```yaml
name: LangChain Eval Quality

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 9 * * 1'  # weekly on Monday 9am

jobs:
  evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: pip install langchain langchain-openai

      - run: npm install -g pnpm && pnpm install

      - name: Run LangChain evals
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_REF_NAME: ${{ github.ref_name }}
          GITHUB_SHA: ${{ github.sha }}
          GITHUB_RUN_ID: ${{ github.run_id }}
        run: python examples/langchain-evals/run_evals.py

      - name: Check quality gates
        run: |
          pnpm dev check \
            --input=examples/langchain-evals/.evals_output \
            --min-pass-rate=0.75 \
            --max-new-failures=0

      - name: Generate dashboard
        if: always()
        run: |
          pnpm dev report \
            --input=examples/langchain-evals/.evals_output \
            --reporter=html \
            --report-dir=eval-report

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: eval-report
          path: eval-report/
```

---

## Further Reading

- [docs/taxonomy.md](../../docs/taxonomy.md) — Complete field reference
- [examples/python-pytest-evals/README.md](../python-pytest-evals/README.md) — Pytest integration without LangChain
- [examples/vitest-evals/README.md](../vitest-evals/README.md) — TypeScript/Vitest integration
