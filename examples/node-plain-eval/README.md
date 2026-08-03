# Plain Node Eval Example — Emit Taxonomy-Complete Artifacts

This example shows how to **run evaluations in plain Node/TypeScript and emit `eval-report/v1` artifacts** with full taxonomy. No test framework required—just async functions and custom logic.

## Setup

```bash
cd examples/node-plain-eval
pnpm install
```

## How It Works

1. **Run custom eval logic** (any Node code: APIs, models, functions)
2. **Collect results** into an array of eval rows
3. **Create suite manifests** with governance and gate policies
4. **Emit artifact** to `.evals_output/run-{timestamp}.json`
5. **View report** via `eval-dashboards report`

## Quick Example: Call an API and Grade Responses

```typescript
import { writeFileSync, mkdirSync } from 'fs';
import type { EvalRun, EvalRow, SuiteManifest } from '@icodenet/eval-dashboards';

async function runEval() {
  const rows: EvalRow[] = [];

  // Example 1: Test a REST API
  const testCases = [
    { input: 'What is 2+2?', expected: 'includes 4' },
    { input: 'What is the capital of France?', expected: 'includes Paris' }
  ];

  for (const { input, expected } of testCases) {
    const response = await fetch('https://api.example.com/ask', {
      method: 'POST',
      body: JSON.stringify({ question: input })
    });
    const output = await response.text();

    rows.push({
      id: `api-${Math.random().toString(36).slice(2, 9)}`,
      suite: 'quality',
      kind: 'deterministic',
      name: input,
      passed: output.toLowerCase().includes(expected.replace('includes ', '')),
      severity: 'medium',
      category: output ? 'evaluated' : 'api-error',
      input,
      output,
      expected,
      datasetId: 'api-evals-v1',
      scenarioId: 'qa-task',
      rubricId: 'response-correctness-2024-Q3',
      durationMs: 150
    });
  }

  // Create suite manifest
  const suiteManifest: SuiteManifest = {
    name: 'quality',
    owner: 'team@example.com',
    datasetSource: 'synthetic',
    datasetVersion: 'api-evals-v1',
    rubricVersion: 'response-correctness-2024-Q3',
    riskArea: 'response-quality',
    graders: ['deterministic-regex-match'],
    gate: {
      mode: 'blocking',
      thresholds: { passRate: 0.9, zeroCritical: 0 }
    }
  };

  // Emit artifact
  const run: EvalRun = {
    id: `node-eval-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    project: 'eval-cookbook-demo',
    team: 'engineering',
    branch: 'main'
  };

  const artifact = {
    schemaVersion: 'eval-report/v1',
    run,
    suites: [
      {
        id: 'quality',
        name: 'Quality',
        total: rows.length,
        passed: rows.filter(r => r.passed).length,
        failed: rows.filter(r => !r.passed).length
      }
    ],
    rows,
    suiteManifests: [suiteManifest],
    baselineCompatibility: { status: 'compatible', issues: [] }
  };

  // Write to disk
  const outputDir = '.evals_output';
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    `${outputDir}/run-${Date.now()}.json`,
    JSON.stringify(artifact, null, 2)
  );

  console.log(`✅ Artifact written to ${outputDir}/`);
}

runEval().catch(console.error);
```

## Run and Report

```bash
# Run the eval
pnpm run eval

# View the report
eval-dashboards report --input=.evals_output --reporter=html
```

## Use Cases

### Case 1: E2E Agent Test
```typescript
const agentOutput = await agent.query(input);

rows.push({
  id: 'agent-001',
  suite: 'quality',
  kind: 'agent',
  passed: verifyAnswer(agentOutput),
  turns: [], // from agent.conversation()
  toolCalls: [], // from agent.toolHistory()
  judgeVerdict: true,
  judgeReasoning: 'Response matches expected behavior.',
  axisScores: { helpfulness: 0.9, accuracy: 1.0 },
  input,
  output: agentOutput,
  datasetId: 'agent-evals-v1'
});
```

### Case 2: LLM Judge
```typescript
const judgeResponse = await openai.generateText({
  prompt: `Rate this response:\nQ: ${input}\nA: ${output}`
});

rows.push({
  id: 'llm-judge-001',
  suite: 'quality',
  kind: 'llm-judge',
  judgeModel: 'gpt-4',
  judgeVerdict: judgeResponse.includes('good'),
  judgeReasoning: judgeResponse,
  axisScores: {
    helpfulness: parseScore(judgeResponse),
    accuracy: parseScore(judgeResponse),
    clarity: parseScore(judgeResponse)
  },
  passed: judgeResponse.includes('good'),
  input,
  output
});
```

### Case 3: Safety Check
```typescript
const hasPII = await scanForPII(output);

rows.push({
  id: 'safety-001',
  suite: 'safety',
  kind: 'deterministic',
  passed: !hasPII,
  severity: hasPII ? 'critical' : 'none',
  category: hasPII ? 'pii-detected' : 'safe',
  input,
  output,
  reason: hasPII ? 'Response contains personal information' : 'No PII detected',
  datasetId: 'safety-v1',
  scenarioId: 'pii-check'
});
```

## Suite Manifest Reference

```typescript
const manifest: SuiteManifest = {
  name: 'quality',                          // Suite identifier
  owner: 'team@example.com',                // Who maintains this eval
  datasetSource: 'synthetic|production',    // Origin of test data
  datasetVersion: 'v1',                     // Dataset version
  rubricVersion: 'v1',                      // Grading rubric version
  riskArea: 'response-quality',             // e.g., pii, safety, latency, accuracy
  graders: ['deterministic-assertions'],    // Grader types used
  gate: {
    mode: 'blocking',                       // 'blocking' or 'advisory'
    thresholds: {
      passRate: 0.9,                        // Min pass rate to gate pass
      zeroCritical: 0                       // Max critical failures
    }
  }
};
```

## Running Multiple Suites

```typescript
const qualityRows = await runQualityEvals();
const safetyRows = await runSafetyEvals();

const artifact = {
  schemaVersion: 'eval-report/v1',
  run,
  suites: [
    {
      id: 'quality',
      total: qualityRows.length,
      passed: qualityRows.filter(r => r.passed).length,
      failed: qualityRows.filter(r => !r.passed).length
    },
    {
      id: 'safety',
      total: safetyRows.length,
      passed: safetyRows.filter(r => r.passed).length,
      failed: safetyRows.filter(r => !r.passed).length
    }
  ],
  rows: [...qualityRows, ...safetyRows],
  suiteManifests: [qualityManifest, safetyManifest]
};
```

## Reference

- [Full taxonomy guide](../../docs/taxonomy.md)
- [JSON Schema](../../schemas/eval-report-v1.schema.json)
- [Taxonomy-complete fixture](../taxonomy-complete-fixture/run-complete.json)
