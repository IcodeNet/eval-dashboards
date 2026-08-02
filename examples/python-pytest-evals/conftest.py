# conftest.py
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest


def pytest_configure(config):
    config._eval_rows = []
    config._eval_start = time.time()


@pytest.fixture
def eval_rows(request):
    """Per-test fixture: append eval rows, flushed to artifact at session end."""
    rows = []
    yield rows
    request.config._eval_rows.extend(rows)


def pytest_sessionfinish(session, exitstatus):
    rows = getattr(session.config, "_eval_rows", [])
    if not rows:
        return

    output_dir = Path(".evals_output")
    output_dir.mkdir(exist_ok=True)

    run_id = f"pytest-{uuid.uuid4().hex[:8]}"
    generated_at = datetime.now(timezone.utc).isoformat()

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

    print(
        f"\n✓ eval-report/v1 written: {output_path} ({len(rows)} rows, {len(suites)} suites)"
    )
