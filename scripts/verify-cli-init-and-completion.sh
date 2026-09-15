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

exact_match_check() {
  local name="$1"
  local actual="$2"
  local expected="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$name"
  else
    fail "$name"
  fi
}

printf '== Build + tests ==\n'
run_check "pnpm test" pnpm test
run_check "pnpm typecheck" pnpm typecheck
run_check "pnpm build" pnpm build

printf '\n== init help flags ==\n'
INIT_HELP="$(run_cli init --help || true)"
contains_check "init --help usage header" "$INIT_HELP" "eval-dashboards init [options]"
contains_check "init --help includes --setup" "$INIT_HELP" "--setup=<csv>"
contains_check "init --help includes --runner" "$INIT_HELP" "--runner=<name>"
contains_check "init --help includes --ci" "$INIT_HELP" "--ci=<target>"
contains_check "init --help includes --playbook" "$INIT_HELP" "--playbook"

printf '\n== command help truth-sync ==\n'
REPORT_HELP="$(run_cli report --help || true)"
contains_check "report --help usage header" "$REPORT_HELP" "eval-dashboards report [options]"
contains_check "report --help includes --profile" "$REPORT_HELP" "--profile=<name>"
exact_match_check "report help snapshot matches docs/cli-help/report.txt" "$REPORT_HELP" "$(cat docs/cli-help/report.txt)"

CHECK_HELP="$(run_cli check --help || true)"
contains_check "check --help usage header" "$CHECK_HELP" "eval-dashboards check [options]"
contains_check "check --help includes statistical mode" "$CHECK_HELP" "--statistical-mode=<mode>"
exact_match_check "check help snapshot matches docs/cli-help/check.txt" "$CHECK_HELP" "$(cat docs/cli-help/check.txt)"

PUBLISH_HELP="$(run_cli publish --help || true)"
contains_check "publish --help usage header" "$PUBLISH_HELP" "eval-dashboards publish [options]"
contains_check "publish --help includes target matrix" "$PUBLISH_HELP" "dir|github-pages|azure-static-webapp|azure-storage"
contains_check "publish --help includes token override" "$PUBLISH_HELP" "--token=<token>"
exact_match_check "publish help snapshot matches docs/cli-help/publish.txt" "$PUBLISH_HELP" "$(cat docs/cli-help/publish.txt)"

printf '\n== stale embedded help-text sweep ==\n'
SWEEP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/evd-help-sweep-XXXXXX")"
DOC_FILES="$(find docs README.md -type f -name '*.md' 2>/dev/null | sort)"

sweep_block_count=0
while IFS= read -r doc_file; do
  [ -z "$doc_file" ] && continue

  block_index=0
  in_block=0
  block_file=""
  while IFS= read -r line; do
    if [ "$in_block" -eq 0 ]; then
      if [ "$line" = '```sh' ]; then
        in_block=1
        block_index=$((block_index + 1))
        block_file="$SWEEP_DIR/block-$(printf '%s' "$doc_file" | tr '/.' '__')-$block_index.txt"
        : > "$block_file"
      fi
      continue
    fi
    if [ "$line" = '```' ]; then
      in_block=0
      continue
    fi
    printf '%s\n' "$line" >> "$block_file"
  done < "$doc_file"
done <<EOF
$DOC_FILES
EOF

for block_file in "$SWEEP_DIR"/block-*.txt; do
  [ -e "$block_file" ] || continue
  first_line="$(head -n 1 "$block_file")"
  case "$first_line" in
    "eval-dashboards "*" [options]")
      command_name="$(printf '%s' "$first_line" | sed -E 's/^eval-dashboards ([A-Za-z0-9_-]+) \[options\]$/\1/')"
      [ -n "$command_name" ] || continue
      sweep_block_count=$((sweep_block_count + 1))
      block_content="$(cat "$block_file")"
      # Trailing blank lines inside a fenced block are not semantically
      # meaningful; trim them before comparing so incidental formatting
      # differences don't produce false failures.
      block_content_trimmed="$(printf '%s' "$block_content" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')"
      live_help="$(run_cli "$command_name" --help || true)"
      if [ "$block_content_trimmed" = "$live_help" ]; then
        pass "embedded help in $block_file matches '$command_name --help'"
      else
        fail "embedded help in $block_file matches '$command_name --help'"
      fi
      ;;
  esac
done

if [ "$sweep_block_count" -eq 0 ]; then
  fail "stale-help sweep found at least one embedded help block"
else
  pass "stale-help sweep found at least one embedded help block ($sweep_block_count checked)"
fi

rm -rf "$SWEEP_DIR"

IMPORT_HELP="$(run_cli import --help || true)"
contains_check "import --help usage header" "$IMPORT_HELP" "eval-dashboards import --from=<source> --input=<path> [options]"
contains_check "import --help includes openevals alias" "$IMPORT_HELP" "openevals is accepted as an alias for agentevals."
exact_match_check "import help snapshot matches docs/cli-help/import.txt" "$IMPORT_HELP" "$(cat docs/cli-help/import.txt)"

TEACH_HELP="$(run_cli teach --help || true)"
contains_check "teach --help mirrors init usage" "$TEACH_HELP" "eval-dashboards init [options]"
exact_match_check "teach help snapshot matches docs/cli-help/teach.txt" "$TEACH_HELP" "$(cat docs/cli-help/teach.txt)"
exact_match_check "init help snapshot matches docs/cli-help/init.txt" "$INIT_HELP" "$(cat docs/cli-help/init.txt)"

LINT_HELP="$(run_cli lint --help || true)"
contains_check "lint --help usage header" "$LINT_HELP" "eval-dashboards lint [options]"
exact_match_check "lint help snapshot matches docs/cli-help/lint.txt" "$LINT_HELP" "$(cat docs/cli-help/lint.txt)"

MERGE_HELP="$(run_cli merge --help || true)"
contains_check "merge --help usage header" "$MERGE_HELP" "eval-dashboards merge [options]"
exact_match_check "merge help snapshot matches docs/cli-help/merge.txt" "$MERGE_HELP" "$(cat docs/cli-help/merge.txt)"

HISTORY_HELP="$(run_cli history --help || true)"
contains_check "history --help usage header" "$HISTORY_HELP" "eval-dashboards history [options]"
exact_match_check "history help snapshot matches docs/cli-help/history.txt" "$HISTORY_HELP" "$(cat docs/cli-help/history.txt)"

REPORT_INDEX_HELP="$(run_cli report-index --help || true)"
contains_check "report-index --help usage header" "$REPORT_INDEX_HELP" "eval-dashboards report-index [options]"
exact_match_check "report-index help snapshot matches docs/cli-help/report-index.txt" "$REPORT_INDEX_HELP" "$(cat docs/cli-help/report-index.txt)"

COMPLETION_HELP="$(run_cli completion --help || true)"
contains_check "completion --help usage header" "$COMPLETION_HELP" "eval-dashboards completion [install] [options]"
exact_match_check "completion help snapshot matches docs/cli-help/completion.txt" "$COMPLETION_HELP" "$(cat docs/cli-help/completion.txt)"

ADJUDICATE_HELP="$(run_cli adjudicate --help || true)"
contains_check "adjudicate --help usage header" "$ADJUDICATE_HELP" "eval-dashboards adjudicate <action> [options]"
exact_match_check "adjudicate help snapshot matches docs/cli-help/adjudicate.txt" "$ADJUDICATE_HELP" "$(cat docs/cli-help/adjudicate.txt)"

ROOT_HELP="$(run_cli --help || true)"
contains_check "root help usage header" "$ROOT_HELP" "eval-dashboards <command>"
exact_match_check "root help snapshot matches docs/cli-help/root.txt" "$ROOT_HELP" "$(cat docs/cli-help/root.txt)"

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
contains_check "completion bash suggests adjudicate command" "$COMP_BASH" "adjudicate"
contains_check "completion bash suggests --bundle" "$COMP_BASH" "--bundle"
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

printf '\n== adjudication bundle flow ==\n'
TMP_ADJ_DIR="$(mktemp -d "${TMPDIR:-/tmp}/evd-adj-XXXXXX")"
TMP_ADJ_INPUT_DIR="$TMP_ADJ_DIR/.evals_output"
TMP_ADJ_OUT_DIR="$TMP_ADJ_DIR/eval-report"
mkdir -p "$TMP_ADJ_INPUT_DIR" "$TMP_ADJ_OUT_DIR"
cat > "$TMP_ADJ_INPUT_DIR/run.json" <<'JSON'
{
  "schemaVersion": "eval-report/v1",
  "run": { "id": "run-adj", "generatedAt": "2026-09-12T10:00:00.000Z" },
  "suites": [{ "id": "quality", "total": 2, "passed": 1, "failed": 1 }],
  "rows": [
    { "id": "ok-1", "suite": "quality", "passed": true },
    { "id": "bad-1", "suite": "quality", "passed": false, "reason": "Unsupported claim" }
  ]
}
JSON
ADJ_BUNDLE_PATH="$TMP_ADJ_OUT_DIR/adjudication-bundle.json"
ADJ_EXPORT_OUTPUT="$(run_cli adjudicate export --input="$TMP_ADJ_INPUT_DIR" --run-id=run-adj --out="$ADJ_BUNDLE_PATH" || true)"
contains_check "adjudicate export reports unresolved rows" "$ADJ_EXPORT_OUTPUT" "Exported 1 unresolved row(s)"
run_check "adjudicate export writes bundle" test -f "$ADJ_BUNDLE_PATH"
contains_check "adjudicate bundle schema version" "$(cat "$ADJ_BUNDLE_PATH")" "eval-adjudication-bundle/v1"

cat > "$TMP_ADJ_OUT_DIR/adjudication-reviewed.json" <<'JSON'
{
  "schemaVersion": "eval-adjudication-bundle/v1",
  "bundleId": "bundle-review-1",
  "generatedAt": "2026-09-12T10:10:00.000Z",
  "source": { "runId": "run-adj", "generatedAt": "2026-09-12T10:00:00.000Z" },
  "rows": [
    {
      "id": "bad-1",
      "suite": "quality",
      "unresolvedReason": "expectation-mismatch",
      "currentPassed": false,
      "review": {
        "verdict": "pass",
        "reviewer": "qa-reviewer",
        "note": "Manual replay verified this should pass"
      }
    }
  ]
}
JSON
ADJ_IMPORT_OUTPUT="$(run_cli adjudicate import --input="$TMP_ADJ_INPUT_DIR" --bundle="$TMP_ADJ_OUT_DIR/adjudication-reviewed.json" --out="$TMP_ADJ_OUT_DIR/adjudicated.json" --allow-single-reviewer || true)"
contains_check "adjudicate import reports applied row" "$ADJ_IMPORT_OUTPUT" "applied=1"
run_check "adjudicate import writes merged artifact" test -f "$TMP_ADJ_OUT_DIR/adjudicated.json"
contains_check "adjudicated row includes ground truth verdict" "$(cat "$TMP_ADJ_OUT_DIR/adjudicated.json")" "\"groundTruthVerdict\": true"
contains_check "adjudicated artifact includes adjudication metadata trail" "$(cat "$TMP_ADJ_OUT_DIR/adjudicated.json")" "\"adjudication\""

cat > "$TMP_ADJ_OUT_DIR/adjudication-two-reviewer.json" <<'JSON'
{
  "schemaVersion": "eval-adjudication-bundle/v1",
  "bundleId": "bundle-review-2",
  "generatedAt": "2026-09-15T10:10:00.000Z",
  "source": { "runId": "run-adj", "generatedAt": "2026-09-12T10:00:00.000Z" },
  "rows": [
    {
      "id": "bad-1",
      "suite": "quality",
      "unresolvedReason": "expectation-mismatch",
      "currentPassed": false,
      "reviews": [
        { "verdict": "pass", "reviewer": "qa-reviewer-1", "note": "Manual replay verified this should pass" },
        { "verdict": "pass", "reviewer": "qa-reviewer-2", "note": "Confirmed independently" }
      ]
    }
  ]
}
JSON
ADJ_IMPORT_TWO_OUTPUT="$(run_cli adjudicate import --input="$TMP_ADJ_INPUT_DIR" --bundle="$TMP_ADJ_OUT_DIR/adjudication-two-reviewer.json" --out="$TMP_ADJ_OUT_DIR/adjudicated-two.json" || true)"
contains_check "adjudicate import default path applies 2-reviewer agreement" "$ADJ_IMPORT_TWO_OUTPUT" "applied=1"
contains_check "adjudicated (2-reviewer) row includes ground truth verdict" "$(cat "$TMP_ADJ_OUT_DIR/adjudicated-two.json")" "\"groundTruthVerdict\": true"

set +e
ADJ_MISSING_BUNDLE_OUTPUT="$(run_cli adjudicate import --input="$TMP_ADJ_INPUT_DIR" --bundle="$TMP_ADJ_OUT_DIR/does-not-exist.json" 2>&1)"
ADJ_MISSING_BUNDLE_EXIT=$?
set -e
if [ "$ADJ_MISSING_BUNDLE_EXIT" -eq 2 ]; then
  pass "adjudicate import missing bundle exits 2"
else
  fail "adjudicate import missing bundle exits 2 (got $ADJ_MISSING_BUNDLE_EXIT)"
fi
contains_check "adjudicate import missing bundle guidance" "$ADJ_MISSING_BUNDLE_OUTPUT" "Could not read adjudication bundle"

cat > "$TMP_ADJ_OUT_DIR/adjudication-malformed.json" <<'JSON'
{not-json
JSON
set +e
ADJ_MALFORMED_BUNDLE_OUTPUT="$(run_cli adjudicate import --input="$TMP_ADJ_INPUT_DIR" --bundle="$TMP_ADJ_OUT_DIR/adjudication-malformed.json" 2>&1)"
ADJ_MALFORMED_BUNDLE_EXIT=$?
set -e
if [ "$ADJ_MALFORMED_BUNDLE_EXIT" -eq 2 ]; then
  pass "adjudicate import malformed bundle exits 2"
else
  fail "adjudicate import malformed bundle exits 2 (got $ADJ_MALFORMED_BUNDLE_EXIT)"
fi
contains_check "adjudicate import malformed bundle guidance" "$ADJ_MALFORMED_BUNDLE_OUTPUT" "Invalid JSON in adjudication bundle"

rm -rf "$TMP_ADJ_DIR"

printf '\n== Summary ==\n'
printf 'Passed: %d\n' "$PASS_COUNT"
printf 'Failed: %d\n' "$FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
