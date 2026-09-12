#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

cd "$REPO_ROOT"
CLI_PATH="$REPO_ROOT/dist/cli/index.js"

run_cli() {
  node "$CLI_PATH" "$@"
}

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  printf 'PASS  %s\n' "$1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf 'FAIL  %s\n' "$1"
}

run_check() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    pass "$name"
  else
    fail "$name"
  fi
}

contains_check() {
  local name="$1"
  local haystack="$2"
  local needle="$3"
  if printf '%s' "$haystack" | grep -Fq -- "$needle"; then
    pass "$name"
  else
    fail "$name"
  fi
}

not_contains_check() {
  local name="$1"
  local haystack="$2"
  local needle="$3"
  if printf '%s' "$haystack" | grep -Fq -- "$needle"; then
    fail "$name"
  else
    pass "$name"
  fi
}

printf '== Build + tests ==\n'
run_check "pnpm test" pnpm test
run_check "pnpm typecheck" pnpm typecheck
run_check "pnpm build" pnpm build

printf '\n== init help flags ==\n'
INIT_HELP="$(run_cli init --help || true)"
contains_check "init --help includes --setup" "$INIT_HELP" "--setup=<csv>"
contains_check "init --help includes --runner" "$INIT_HELP" "--runner=<name>"
contains_check "init --help includes --ci" "$INIT_HELP" "--ci=<target>"
contains_check "init --help includes --playbook" "$INIT_HELP" "--playbook"

printf '\n== default init dry-run ==\n'
DEFAULT_DRY_RUN="$(run_cli init --preset=agent-quality --write --dry-run || true)"
contains_check "default dry-run shows 5 files" "$DEFAULT_DRY_RUN" "Would write 5 file(s):"
contains_check "default dry-run includes github workflow snippet" "$DEFAULT_DRY_RUN" ".github/workflows/eval-quality.yml.snippet"

printf '\n== profile init dry-run ==\n'
PROFILE_DRY_RUN="$(run_cli init --preset=agent-quality --setup=guardrails,multiturn --runner=vitest --ci=azure --write --dry-run || true)"
contains_check "profile dry-run includes azure snippet" "$PROFILE_DRY_RUN" "azure-pipelines/eval-quality.yml.snippet"
not_contains_check "profile dry-run excludes github snippet" "$PROFILE_DRY_RUN" ".github/workflows/eval-quality.yml.snippet"

printf '\n== ci=none dry-run ==\n'
NO_CI_DRY_RUN="$(run_cli init --preset=agent-quality --setup=guardrails --runner=python --ci=none --write --dry-run || true)"
contains_check "ci=none shows 4 files" "$NO_CI_DRY_RUN" "Would write 4 file(s):"
not_contains_check "ci=none excludes azure snippet" "$NO_CI_DRY_RUN" "azure-pipelines/eval-quality.yml.snippet"
not_contains_check "ci=none excludes github snippet" "$NO_CI_DRY_RUN" ".github/workflows/eval-quality.yml.snippet"

printf '\n== invalid init runner ==\n'
set +e
INVALID_RUNNER_OUTPUT="$(run_cli init --preset=agent-quality --runner=bad 2>&1)"
INVALID_RUNNER_EXIT=$?
set -e
if [ "$INVALID_RUNNER_EXIT" -eq 2 ]; then
  pass "invalid runner exits 2"
else
  fail "invalid runner exits 2 (got $INVALID_RUNNER_EXIT)"
fi
contains_check "invalid runner error text" "$INVALID_RUNNER_OUTPUT" "Unknown runner bad"

printf '\n== missing eval artifacts guidance ==\n'
set +e
MISSING_INPUT_OUTPUT="$(run_cli report --input=.path-that-does-not-exist-eval-dashboards 2>&1)"
MISSING_INPUT_EXIT=$?
set -e
if [ "$MISSING_INPUT_EXIT" -eq 3 ]; then
  pass "missing input exits 3"
else
  fail "missing input exits 3 (got $MISSING_INPUT_EXIT)"
fi
contains_check "missing input guidance includes init" "$MISSING_INPUT_OUTPUT" "evd init --write"

printf '\n== profiled scaffold lint validity ==\n'
TMP_INIT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/evd-init-XXXXXX")"
run_cli init --preset=agent-quality --setup=guardrails,multiturn --ci=none --write --out-dir "$TMP_INIT_DIR" >/dev/null 2>&1
set +e
PROFILE_LINT_OUTPUT="$(run_cli lint --input="$TMP_INIT_DIR/.evals_output" 2>&1)"
PROFILE_LINT_EXIT=$?
set -e
rm -rf "$TMP_INIT_DIR"
if [ "$PROFILE_LINT_EXIT" -eq 0 ]; then
  pass "profiled scaffold lint exits 0"
else
  fail "profiled scaffold lint exits 0 (got $PROFILE_LINT_EXIT)"
fi
not_contains_check "profiled scaffold has no unknown-suite errors" "$PROFILE_LINT_OUTPUT" "unknown-suite"

printf '\n== playbook scaffold ==\n'
PLAYBOOK_DRY_RUN="$(run_cli init --preset=agent-quality --write --playbook --dry-run || true)"
contains_check "playbook dry-run shows 6 files" "$PLAYBOOK_DRY_RUN" "Would write 6 file(s):"
contains_check "playbook dry-run includes docs playbook path" "$PLAYBOOK_DRY_RUN" "docs/evals-setup-playbook.md"

printf '\n== completion command ==\n'
COMP_BASH="$(run_cli completion --shell=bash || true)"
contains_check "completion bash header" "$COMP_BASH" "# eval-dashboards shell completion (bash)"
contains_check "completion bash includes init" "$COMP_BASH" " init completion"
contains_check "completion bash suggests --setup" "$COMP_BASH" "--setup"
contains_check "completion bash suggests --runner" "$COMP_BASH" "--runner"
contains_check "completion bash suggests --ci" "$COMP_BASH" "--ci"
contains_check "completion bash suggests --playbook" "$COMP_BASH" "--playbook"
contains_check "completion bash suggests --profile" "$COMP_BASH" "--profile"
contains_check "completion bash suggests --statistical-mode" "$COMP_BASH" "--statistical-mode"
contains_check "completion bash suggests --from" "$COMP_BASH" "--from"
contains_check "completion bash binds evd alias" "$COMP_BASH" "complete -F _eval_dashboards_completions evd"

COMP_ZSH="$(run_cli completion --shell=zsh || true)"
contains_check "completion zsh header" "$COMP_ZSH" "# eval-dashboards shell completion (zsh)"
contains_check "completion zsh binds evd alias" "$COMP_ZSH" "compdef _eval_dashboards_completions evd"

COMP_FISH="$(run_cli completion --shell=fish || true)"
contains_check "completion fish header" "$COMP_FISH" "# eval-dashboards shell completion (fish)"
contains_check "completion fish includes completion subcommand" "$COMP_FISH" "__fish_use_subcommand\" -a \"completion\""
contains_check "completion fish suggests statistical modes" "$COMP_FISH" "--statistical-mode\" -a \"off bootstrap\""

set +e
INVALID_SHELL_OUTPUT="$(run_cli completion --shell=bad 2>&1)"
INVALID_SHELL_EXIT=$?
set -e
if [ "$INVALID_SHELL_EXIT" -eq 2 ]; then
  pass "invalid completion shell exits 2"
else
  fail "invalid completion shell exits 2 (got $INVALID_SHELL_EXIT)"
fi
contains_check "invalid completion shell error text" "$INVALID_SHELL_OUTPUT" "Unknown completion shell bad"

printf '\n== report guardrail profile ==\n'
TMP_GUARDRAIL_DIR="$(mktemp -d "${TMPDIR:-/tmp}/evd-guardrail-XXXXXX")"
cat > "$TMP_GUARDRAIL_DIR/guardrail.json" <<'JSON'
{
  "schemaVersion": "eval-report/v1",
  "run": { "id": "guardrail-run", "generatedAt": "2026-09-12T00:00:00.000Z" },
  "suites": [{ "id": "refusal-safety", "total": 1, "passed": 0, "failed": 1 }],
  "suiteManifests": [{
    "name": "refusal-safety",
    "target": "agent",
    "datasetSource": "manual",
    "datasetVersion": "v1",
    "rubricVersion": "r1",
    "riskArea": "content-safety",
    "graders": ["llm-judge"],
    "gate": { "mode": "blocking", "thresholds": { "passRate": 1 } }
  }],
  "rows": [{
    "id": "gr-1",
    "suite": "refusal-safety",
    "passed": false,
    "severity": "high",
    "category": "prompt-injection",
    "reason": "Accepted jailbreak payload"
  }]
}
JSON
run_check "guardrail profile report renders html" run_cli report --input="$TMP_GUARDRAIL_DIR" --reporter=html --profile=guardrail --report-dir="$TMP_GUARDRAIL_DIR/eval-report"
run_check "guardrail profile includes triage section" grep -Fq "Guardrail triage" "$TMP_GUARDRAIL_DIR/eval-report/index.html"
set +e
INVALID_PROFILE_OUTPUT="$(run_cli report --input="$TMP_GUARDRAIL_DIR" --reporter=html --profile=bad --report-dir="$TMP_GUARDRAIL_DIR/eval-report-bad" 2>&1)"
INVALID_PROFILE_EXIT=$?
set -e
if [ "$INVALID_PROFILE_EXIT" -eq 2 ]; then
  pass "invalid report profile exits 2"
else
  fail "invalid report profile exits 2 (got $INVALID_PROFILE_EXIT)"
fi
contains_check "invalid report profile error text" "$INVALID_PROFILE_OUTPUT" "Unknown report profile bad"
rm -rf "$TMP_GUARDRAIL_DIR"

printf '\n== statistical gate profile ==\n'
TMP_STAT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/evd-stat-XXXXXX")"
cat > "$TMP_STAT_DIR/baseline.json" <<'JSON'
{
  "schemaVersion": "eval-report/v1",
  "run": { "id": "baseline-stat", "generatedAt": "2026-09-12T00:00:00.000Z" },
  "suites": [{ "id": "quality", "total": 4, "passed": 4, "failed": 0 }],
  "rows": [
    { "id": "b1", "suite": "quality", "passed": true },
    { "id": "b2", "suite": "quality", "passed": true },
    { "id": "b3", "suite": "quality", "passed": true },
    { "id": "b4", "suite": "quality", "passed": true }
  ]
}
JSON
cat > "$TMP_STAT_DIR/current.json" <<'JSON'
{
  "schemaVersion": "eval-report/v1",
  "run": { "id": "current-stat", "generatedAt": "2026-09-12T00:01:00.000Z" },
  "suites": [{ "id": "quality", "total": 4, "passed": 2, "failed": 2 }],
  "rows": [
    { "id": "c1", "suite": "quality", "passed": true },
    { "id": "c2", "suite": "quality", "passed": true },
    { "id": "c3", "suite": "quality", "passed": false },
    { "id": "c4", "suite": "quality", "passed": false }
  ]
}
JSON
set +e
STAT_FAIL_OUTPUT="$(run_cli check --input="$TMP_STAT_DIR" --run-id=current-stat --baseline-run-id=baseline-stat --statistical-mode=bootstrap --confidence-level=0.95 --bootstrap-samples=400 --min-pass-rate-delta=0.3 2>&1)"
STAT_FAIL_EXIT=$?
set -e
if [ "$STAT_FAIL_EXIT" -eq 1 ]; then
  pass "statistical gate regression exits 1"
else
  fail "statistical gate regression exits 1 (got $STAT_FAIL_EXIT)"
fi
contains_check "statistical gate regression reports failure" "$STAT_FAIL_OUTPUT" "Statistical gate failed"

cat > "$TMP_STAT_DIR/eval-dashboards.config.cjs" <<'JS'
module.exports = {
  input: '.',
  gates: {
    statistical: {
      mode: 'bootstrap',
      confidenceLevel: 0.95,
      bootstrapSamples: 400,
      minPassRateDelta: 0.3,
    },
  },
};
JS
set +e
STAT_CONFIG_OUTPUT="$(cd "$TMP_STAT_DIR" && node "$CLI_PATH" check --input=. --baseline-run-id=baseline-stat 2>&1)"
STAT_CONFIG_EXIT=$?
set -e
if [ "$STAT_CONFIG_EXIT" -eq 1 ]; then
  pass "statistical gate from config exits 1"
else
  fail "statistical gate from config exits 1 (got $STAT_CONFIG_EXIT)"
fi
contains_check "statistical gate from config reports failure" "$STAT_CONFIG_OUTPUT" "Statistical gate failed"

set +e
STAT_CONFIG_PARTIAL_OVERRIDE_OUTPUT="$(cd "$TMP_STAT_DIR" && node "$CLI_PATH" check --input=. --baseline-run-id=baseline-stat --confidence-level=0.9 2>&1)"
STAT_CONFIG_PARTIAL_OVERRIDE_EXIT=$?
set -e
if [ "$STAT_CONFIG_PARTIAL_OVERRIDE_EXIT" -eq 0 ] || [ "$STAT_CONFIG_PARTIAL_OVERRIDE_EXIT" -eq 1 ]; then
  pass "statistical gate with partial CLI override evaluates"
else
  fail "statistical gate with partial CLI override evaluates (got $STAT_CONFIG_PARTIAL_OVERRIDE_EXIT)"
fi
contains_check "statistical gate with partial CLI override keeps bootstrap mode" "$STAT_CONFIG_PARTIAL_OVERRIDE_OUTPUT" "Statistical gate (bootstrap"

set +e
INVALID_STAT_MODE_OUTPUT="$(run_cli check --input="$TMP_STAT_DIR" --statistical-mode=bad 2>&1)"
INVALID_STAT_MODE_EXIT=$?
set -e
if [ "$INVALID_STAT_MODE_EXIT" -eq 2 ]; then
  pass "invalid statistical mode exits 2"
else
  fail "invalid statistical mode exits 2 (got $INVALID_STAT_MODE_EXIT)"
fi
contains_check "invalid statistical mode error text" "$INVALID_STAT_MODE_OUTPUT" "Unknown statistical mode bad"
rm -rf "$TMP_STAT_DIR"

printf '\n== import command (promptfoo) ==\n'
TMP_IMPORT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/evd-import-XXXXXX")"
cat > "$TMP_IMPORT_DIR/promptfoo.json" <<'JSON'
{
  "results": [
    {
      "id": "pf-1",
      "description": "import smoke",
      "vars": {"question": "What are supported capabilities?"},
      "response": {"output": "Capability list"},
      "gradingResult": {"pass": true, "score": 1, "reason": "ok"},
      "testCase": {"metadata": {"suite": "retrieval-recall", "category": "factual"}}
    }
  ]
}
JSON
IMPORT_OUTPUT="$(run_cli import --from=promptfoo --input="$TMP_IMPORT_DIR/promptfoo.json" --out="$TMP_IMPORT_DIR/.evals_output/import.json" || true)"
contains_check "import command reports row count" "$IMPORT_OUTPUT" "Imported 1 row(s) from promptfoo"
run_check "imported artifact lints" run_cli lint --input="$TMP_IMPORT_DIR/.evals_output"

printf '\n== import command (deepeval + agentevals) ==\n'
cat > "$TMP_IMPORT_DIR/deepeval.json" <<'JSON'
{
  "test_results": [
    {
      "id": "de-1",
      "name": "deepeval smoke",
      "input": "Summarize policy",
      "actual_output": "Policy summary",
      "expected_output": "Expected summary",
      "success": true,
      "metadata": {"suite": "answer-groundedness"}
    }
  ]
}
JSON
DEEPEVAL_OUTPUT="$(run_cli import --from=deepeval --input="$TMP_IMPORT_DIR/deepeval.json" --out="$TMP_IMPORT_DIR/.evals_output/deepeval.json" || true)"
contains_check "deepeval import reports row count" "$DEEPEVAL_OUTPUT" "Imported 1 row(s) from deepeval"

cat > "$TMP_IMPORT_DIR/agentevals.json" <<'JSON'
{
  "rows": [
    {
      "id": "ae-1",
      "suite": "task-adherence",
      "input": "Three bullets",
      "output": "bullet output",
      "expected": "format-constrained",
      "passed": true
    }
  ]
}
JSON
AGENTEVALS_OUTPUT="$(run_cli import --from=agentevals --input="$TMP_IMPORT_DIR/agentevals.json" --out="$TMP_IMPORT_DIR/.evals_output/agentevals.json" || true)"
contains_check "agentevals import reports row count" "$AGENTEVALS_OUTPUT" "Imported 1 row(s) from agentevals"
OPENEVALS_OUTPUT="$(run_cli import --from=openevals --input="$TMP_IMPORT_DIR/agentevals.json" --out="$TMP_IMPORT_DIR/.evals_output/openevals.json" || true)"
contains_check "openevals alias import reports agentevals row count" "$OPENEVALS_OUTPUT" "Imported 1 row(s) from agentevals"
run_check "multi-source imported artifacts lint" run_cli lint --input="$TMP_IMPORT_DIR/.evals_output"

printf '\n== import conflict handling ==\n'
cat > "$TMP_IMPORT_DIR/conflict.json" <<'JSON'
{"results":[{"id":"row-1","pass":true,"gradingResult":{"verdict":"fail"},"testCase":{"metadata":{"suite":"retrieval-recall"}}}]}
JSON
set +e
CONFLICT_OUTPUT="$(run_cli import --from=promptfoo --input="$TMP_IMPORT_DIR/conflict.json" --out="$TMP_IMPORT_DIR/.evals_output/conflict.json" 2>&1)"
CONFLICT_EXIT=$?
set -e
if [ "$CONFLICT_EXIT" -eq 2 ]; then
  pass "conflicting import exits 2"
else
  fail "conflicting import exits 2 (got $CONFLICT_EXIT)"
fi
contains_check "conflicting import reports conflict" "$CONFLICT_OUTPUT" "Conflicting pass/fail signals"

rm -rf "$TMP_IMPORT_DIR"

printf '\n== Summary ==\n'
printf 'Passed: %d\n' "$PASS_COUNT"
printf 'Failed: %d\n' "$FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
