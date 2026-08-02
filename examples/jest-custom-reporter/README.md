# Jest Custom Reporter Example — Emit Taxonomy-Complete Artifacts

This example shows how to write a **Jest reporter that emits `eval-report/v1` artifacts** with full taxonomy (kind, severity, category, suite manifests, gate policies, etc.).

## Setup

```bash
cd examples/jest-custom-reporter
pnpm install
```

## How It Works

1. **Jest test suite runs** and generates test results
2. **Custom reporter collects** all test outcomes
3. **Reporter emits** taxonomy-complete rows and suite manifests
4. **Artifact written** to `.evals_output/run-{timestamp}.json`
5. **Dashboard consumes** via `eval-dashboards report`

## Quick Example: Custom Reporter

```typescript
import type { AggregatedResult, TestResult } from '@jest/test-result';
import type { EvalRun, EvalRow, SuiteManifest } from '@icodenet/eval-dashboards';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

class EvalReportReporter {
  private rows: EvalRow[] = [];

  onTestResult(
    _test: any,
    testResult: TestResult,
    _aggregatedResult: AggregatedResult
  ): void {
    const suiteName = testResult.testFilePath.includes('safety') ? 'safety' : 'quality';

    // Map each Jest test result to taxonomy-complete row
    testResult.testResults.forEach((test) => {
      const passed = test.status === 'passed';

      this.rows.push({
        id: `jest-${test.title.replace(/\s+/g, '-')}`,
        suite: suiteName,
        kind: 'deterministic',
        name: test.title,
        passed,
        severity: passed ? 'none' : 'medium',
        category: passed ? 'success' : 'test-failure',
        datasetId: 'jest-suite-v1',
        scenarioId: test.title,
        rubricId: 'test-correctness-2024-Q3',
        durationMs: test.duration || 0,
        reason: test.failureMessage || undefined
      });
    });
  }

  onRunComplete(): void {
    const run: EvalRun = {
      id: `jest-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      project: 'eval-cookbook-demo',
      team: 'engineering'
    };

    const suiteManifest: SuiteManifest = {
      name: this.rows[0]?.suite || 'quality',
      owner: 'team@example.com',
      datasetSource: 'unit-tests',
      datasetVersion: 'jest-suite-v1',
      rubricVersion: 'test-correctness-2024-Q3',
      riskArea: 'response-quality',
      graders: ['deterministic-assertions'],
      gate: {
        mode: 'blocking',
        thresholds: { passRate: 0.95, zeroCritical: 0 }
      }
    };

    const artifact = {
      schemaVersion: 'eval-report/v1',
      run,
      suites: [
        {
          id: 'quality',
          name: 'Quality',
          total: this.rows.length,
          passed: this.rows.filter(r => r.passed).length,
          failed: this.rows.filter(r => !r.passed).length
        }
      ],
      rows: this.rows,
      suiteManifests: [suiteManifest],
      baselineCompatibility: { status: 'compatible', issues: [] }
    };

    // Write to .evals_output/
    const outputDir = join(process.cwd(), '.evals_output');
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      join(outputDir, `run-${Date.now()}.json`),
      JSON.stringify(artifact, null, 2)
    );

    console.log(`✅ Eval artifact written: ${outputDir}`);
  }
}

export default EvalReportReporter;
```

## Configure Jest to Use the Reporter

```typescript
// jest.config.ts
export default {
  testEnvironment: 'node',
  reporters: [
    'default',
    '<rootDir>/jest-eval-reporter.ts'
  ]
};
```

## Run and Report

```bash
# Run tests and emit artifact
pnpm test

# View the report
eval-dashboards report --input=.evals_output --reporter=html
```

## Key Patterns

### Pattern 1: Taxonomy-Complete Row (Test Result)
```json
{
  "id": "jest-my-test",
  "suite": "quality",
  "kind": "deterministic",
  "passed": true,
  "severity": "none",
  "category": "success",
  "name": "my test description",
  "datasetId": "jest-suite-v1",
  "scenarioId": "my-test-scenario",
  "rubricId": "test-correctness-2024-Q3",
  "durationMs": 45
}
```

### Pattern 2: Suite Manifest (Test Suite Governance)
```json
{
  "name": "quality",
  "owner": "team@example.com",
  "datasetSource": "unit-tests",
  "datasetVersion": "jest-suite-v1",
  "rubricVersion": "test-correctness-2024-Q3",
  "riskArea": "response-quality",
  "graders": ["deterministic-assertions"],
  "gate": {
    "mode": "blocking",
    "thresholds": { "passRate": 0.95, "zeroCritical": 0 }
  }
}
```

## Extending This Example

### Add Safety Tests

```typescript
const suiteName = testResult.testFilePath.includes('safety.test.ts')
  ? 'safety'
  : 'quality';

this.rows.push({
  suite: suiteName,
  riskArea: suiteName === 'safety' ? 'pii' : 'response-quality',
  // ... rest of row
});
```

### Emit Multiple Suites

```typescript
const suitesByName = new Map<string, EvalRow[]>();

// Group rows by suite
this.rows.forEach(row => {
  if (!suitesByName.has(row.suite)) {
    suitesByName.set(row.suite, []);
  }
  suitesByName.get(row.suite)!.push(row);
});

// Create one manifest per suite
const manifests = Array.from(suitesByName.keys()).map(suite => ({
  name: suite,
  // ... per-suite config
}));
```

## Reference

- [Full taxonomy guide](../../docs/taxonomy.md)
- [JSON Schema](../../schemas/eval-report-v1.schema.json)
- [Taxonomy-complete fixture](../taxonomy-complete-fixture/run-complete.json)