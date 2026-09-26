# Adoption Map (existing-runner path)

Purpose

Show concrete ways teams can adopt `@icodenet/eval-dashboards` without replacing their current eval runner.

These are candidate adoption targets and examples only, not endorsements or accepted plans by the named projects.

Adoption pattern (common to all repos)

1. Keep existing eval runner command and CI job.
2. Convert existing runner outputs into `eval-report/v1`.
3. Run `eval-dashboards lint`, `check`, and `report` as a post-run layer.
4. Publish static `eval-report/` artifacts for row-level triage.

Teams already instrumented with OpenTelemetry GenAI semantic conventions
(emitting `gen_ai.evaluation.result` events) have a dedicated, tested
mapping path instead of ad hoc field guessing — see
[OpenTelemetry GenAI evaluation events](./integrations/otel-genai.md) and
the trace-first evidence example in
[Trace/observability stacks](./integrations/trace-stacks.md).

## Candidate 1: OpenAI — openai/evals

Repo

- https://github.com/openai/evals

Why fit

- Existing runner CLIs (`oaieval`, `oaievalset`) and JSONL logs.
- Existing CI test/eval flow can add a post-run adapter + gate layer.

Evidence anchors

Verified against upstream `main` on 2026-09-13.

- `docs/run-evals.md`
- `pyproject.toml` script entries for `oaieval` / `oaievalset`
- `.github/workflows/test_eval.yaml`
- `evals/cli/oaieval.py` (`record_path` / JSONL output)
- `evals/record.py` (`match`, `sampling`, `final_report` event structure)

PR-style change set (non-disruptive)

- Add adapter script: `scripts/export_eval_report.py`
- Add post-run steps in `.github/workflows/test_eval.yaml`:
  - `npx @icodenet/eval-dashboards lint ...`
  - convert JSONL -> `.evals_output/*.json`
  - `npx @icodenet/eval-dashboards check ...`
  - `npx @icodenet/eval-dashboards report ...`
  - upload `eval-report/**`
- Add optional docs section in `docs/run-evals.md`

## Candidate 2: Microsoft — microsoft/autogen (agbench)

Repo

- https://github.com/microsoft/autogen

Why fit

- `agbench` already runs benchmark scenarios and tabulates results.
- Existing run logs/results layout is parseable and can be adapted into `eval-report/v1`.

Evidence anchors

Verified against upstream `main` on 2026-09-13.

- `python/packages/agbench/README.md` (`agbench run`, `agbench tabulate`)
- `python/packages/agbench/src/agbench/tabulate_cmd.py`
- benchmark output layout under `Results/...`

PR-style change set (non-disruptive)

- Add exporter script under `python/packages/agbench/scripts/export_eval_report.py`
- Add optional docs section in `python/packages/agbench/README.md`
- Optional manual CI workflow to produce/upload `eval-report/`

Note

- Repo is in maintenance mode; keep changes additive (script + docs) to maximize merge chance.

## Candidate 3: Hugging Face — huggingface/lighteval

Repo

- https://github.com/huggingface/lighteval

Why fit

- Existing eval runner CLI and CI.
- Existing persisted result JSON (and optional details parquet) can be converted into `eval-report/v1`.

Evidence anchors

Verified against upstream `main` on 2026-09-13.

- `README.md` runner commands
- `.github/workflows/tests.yaml`
- `docs/source/saving-and-reading-results.mdx` (result paths and shape)
- `tests/unit/logging/test_evaluation_tracker.py` (assertions for results JSON keys)

PR-style change set (non-disruptive)

- Add adapter script: `scripts/export_eval_report_v1.py`
- Add optional workflow: `.github/workflows/eval-dashboard.yml`
- Add docs page/snippet for dashboard + gate generation from Lighteval artifacts

## Repro command template (all candidates)

```sh
# Existing runner command (repo-specific)
<existing-eval-runner-command>

# Adapter (repo-specific) -> eval-report/v1
<adapter-command> --out .evals_output/<run>.json

# eval-dashboards layer
npx @icodenet/eval-dashboards lint --input=.evals_output
npx @icodenet/eval-dashboards check --input=.evals_output --max-new-failures=0 --zero-critical --json-out=eval-report/check-result.json
npx @icodenet/eval-dashboards report --input=.evals_output --reporter=html --report-dir=eval-report
```

## Risks and mitigations

- Row granularity mismatch
  - Risk: source runner provides aggregate-only metrics.
  - Mitigation: read per-sample/per-trial logs when available; otherwise emit conservative row mapping with explicit metadata.
- CI runtime/cost
  - Risk: full eval suites are expensive.
  - Mitigation: smoke subset on PR, fuller benchmark on nightly/manual workflows.
- Baseline bootstrapping
  - Risk: no historical baseline for `max-new-failures` on first runs.
  - Mitigation: start with pass-rate + critical gates, then enable regression gates after baseline artifacts exist.
