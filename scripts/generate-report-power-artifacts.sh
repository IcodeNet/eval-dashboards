#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

OUT_DIR="examples/report-power-artifacts"
INPUT_DIR="$OUT_DIR/.evals_output"
REPORT_DIR="$OUT_DIR/report"
GATES_DIR="$OUT_DIR/gates"
SOURCE_DIR="examples/screenshot-fixture/.evals_output"

rm -rf "$INPUT_DIR" "$REPORT_DIR" "$GATES_DIR"
mkdir -p "$INPUT_DIR" "$REPORT_DIR" "$GATES_DIR"

pnpm exec tsx scripts/generate-screenshot-fixture.ts

cp "$SOURCE_DIR"/run-previous.json "$INPUT_DIR"/run-previous.json
cp "$SOURCE_DIR"/run-current.json "$INPUT_DIR"/run-current.json

pnpm cli:dev report \
  --input="$INPUT_DIR" \
  --reporter=html \
  --reporter=json-summary \
  --reporter=markdown-summary \
  --report-dir="$REPORT_DIR"

pnpm cli:dev check \
  --input="$INPUT_DIR" \
  --min-pass-rate=0.95 \
  --max-new-failures=0 \
  --zero-critical \
  --json-out="$GATES_DIR/check-pass.json"

set +e
pnpm cli:dev check \
  --input="$INPUT_DIR" \
  --min-pass-rate=0.99 \
  --max-new-failures=0 \
  --zero-critical \
  --json-out="$GATES_DIR/check-fail.json"
fail_exit=$?
set -e

if [[ "$fail_exit" -eq 0 ]]; then
  echo "Expected strict gate to fail, but it passed." >&2
  exit 1
fi

echo "report-power artifacts regenerated in $OUT_DIR"
