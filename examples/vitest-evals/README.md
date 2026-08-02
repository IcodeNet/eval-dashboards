# Vitest Evals Example — Emit Taxonomy-Complete Artifacts

This example shows how to write Vitest tests that **emit `eval-report/v1` artifacts** with full taxonomy (kind, severity, category, suite manifests, gate policies, etc.).

## Setup

```bash
cd examples/vitest-evals
pnpm install
```

## How It Works

1. **Test suite runs** and evaluates function behavior
2. **Evaluator asserts** results (built-in `expect()` or custom grader)
3. **Reporter collects** all assertions into taxonomy-complete rows
4. **Artifact written** to `.evals_output/run-{timestamp}.json`
5. **Dashboard consumes** the artifact via `eval-dashboards report`

## Quick Example: Text Summarization Test

```typescript
import { describe, it, expect } from 'vitest';
import type { EvalRun, EvalRow } from '@icodenet/eval-dashboards';

function summarizeText(text: string): string {
  return text.split('\n').filter(l => l.trim()).slice(0, 2).join(' ');
}

describe('Text Summary - Quality', () => {
  const rows: EvalRow[] = [];

  it('summarizes multi-line text', () => {
    const input = 'Line 1\nLine 2\nLine 3';
    const output = summarizeText(input);
    expect(output).toContain('Line 1');

    rows.push({
      id: 'summary-001',
      suite: 'quality',
      kind: 'deterministic',
      passed: true,
      severity: 'none',
      category: 'success',
      input,
      output,
      datasetId: 'text-summary-v1',
      scenarioId: 'multi-line',
      rubricId: 'correctness-2024-Q3',
      durationMs: 5
    });
  });

  afterAll(() => {
    // Emit taxonomy-complete artifact
    const artifact = {
      schemaVersion: 'eval-report/v1',
      run: {
        id: `vitest-${Date.now()}`,
        generatedAt: new Date().toISOString(),
        project: 'eval-cookbook-demo'
      },
      suites: [
        {
          id: 'quality',
          name: 'Quality',
          total: rows.length,
          passed: rows.filter(r => r.passed).length,
          failed: 0
        }
      ],
      rows,
      suiteManifests: [
        {
          name: 'quality',
          owner: 'team@example.com',
          datasetSource: 'synthetic',
          datasetVersion: 'text-summary-v1',
          rubricVersion: 'correctness-2024-Q3',
          riskArea: 'response-quality',
          graders: ['deterministic-assertions'],
          gate: {
            mode: 'blocking',
            thresholds: { passRate: 0.9, zeroCritical: 0 }
          }
        }
      ],
      baselineCompatibility: { status: 'compatible', issues: [] }
    };

    writeFileSync(
      `.evals_output/run-${Date.now()}.json`,
      JSON.stringify(artifact, null, 2)
    );
  });
});
```

## Run and Report

```bash
# Run tests and emit artifact
pnpm exec vitest run

# View the report
eval-dashboards report --input=.evals_output --reporter=html
```

## Key Patterns

### Pattern 1: Taxonomy-Complete Row (Deterministic)
```json
{
  "id": "test-001",
  "suite": "quality",
  "kind": "deterministic",
  "passed": true,
  "severity": "none",
  "category": "success",
  "input": "...",
  "output": "...",
  "datasetId": "v1",
  "scenarioId": "scenario-name",
  "rubricId": "rubric-v1",
  "durationMs": 5
}
```

### Pattern 2: Suite Manifest (Gates + Governance)
```json
{
  "name": "quality",
  "owner": "team@example.com",
  "datasetSource": "synthetic",
  "datasetVersion": "v1",
  "rubricVersion": "v1",
  "riskArea": "response-quality",
  "graders": ["deterministic-assertions"],
  "gate": {
    "mode": "blocking",
    "thresholds": { "passRate": 0.9, "zeroCritical": 0 }
  }
}
```

## Reference

- [Full taxonomy guide](../../docs/taxonomy.md)
- [JSON Schema](../../schemas/eval-report-v1.schema.json)
- [Taxonomy-complete fixture](../taxonomy-complete-fixture/run-complete.json)