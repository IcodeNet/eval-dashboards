/**
 * Generates a richer fixture artifact for README screenshots.
 * Run with: node --import tsx/esm scripts/generate-screenshot-fixture.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvalReportV1 } from '../src/index.js';

const out = path.join('examples', 'screenshot-fixture', '.evals_output');
const datasetId = 'support-smoke';

type FixtureRow = EvalReportV1['rows'][number];

const suiteRubric = (suite: string): string => `${suite}-rubric-v1`;

const fixtureRow = (
  id: string,
  suite: string,
  passed: boolean,
  overrides: Partial<FixtureRow> = {},
): FixtureRow => {
  const kind = overrides.kind ?? (suite === 'tool-use' ? 'agent' : 'llm-judge');
  return {
    id,
    suite,
    kind,
    name: overrides.name ?? id,
    datasetId,
    scenarioId: suite,
    rubricId: overrides.rubricId ?? suiteRubric(suite),
    passed,
    severity: overrides.severity ?? 'none',
    category: overrides.category ?? suite,
    score: overrides.score ?? (passed ? 0.93 : 0.56),
    axisScores: overrides.axisScores ?? { quality: passed ? 0.93 : 0.56 },
    judgeVerdict: kind === 'llm-judge' ? passed : undefined,
    toolCalls: kind === 'agent' ? [{ name: 'knowledge-base-search' }] : undefined,
    durationMs: overrides.durationMs,
    reason: overrides.reason,
    metadata: {
      provenance: {
        source: 'labelled-synthetic',
        reason: 'Screenshot fixture for dashboard documentation.',
        sourceRef: 'examples/screenshot-fixture',
      },
      lifecycle: { status: 'active', since: '2026-07-31' },
      ...overrides.metadata,
    },
    ...overrides,
  };
};

const previous: EvalReportV1 = {
  schemaVersion: 'eval-report/v1',
  run: {
    id: 'agent-v3-2026-07-30',
    generatedAt: '2026-07-30T09:00:00.000Z',
    project: 'My AI Agent',
    branch: 'main',
    commit: 'a1b2c3d',
    buildId: 'build-141',
  },
  suites: [
    { id: 'response-quality', total: 40, passed: 36, failed: 4 },
    { id: 'tool-use', total: 20, passed: 18, failed: 2 },
    { id: 'safety', total: 15, passed: 15, failed: 0 },
  ],
  rows: [
    ...Array.from({ length: 36 }, (_, i) => fixtureRow(`rq-${i}`, 'response-quality', true)),
    fixtureRow('rq-fail-1', 'response-quality', false, { severity: 'medium', name: 'Concise answer', reason: 'Response exceeded 200 words', category: 'conciseness' }),
    fixtureRow('rq-fail-2', 'response-quality', false, { severity: 'low', name: 'Tone check', reason: 'Detected informal tone in professional context', category: 'tone' }),
    fixtureRow('rq-fail-3', 'response-quality', false, { severity: 'medium', name: 'Citation required', reason: 'Answer made factual claim without citation', category: 'groundedness' }),
    fixtureRow('rq-fail-4', 'response-quality', false, { severity: 'high', name: 'Hallucination check', reason: 'Response contained a date that does not exist in the knowledge base', category: 'hallucination' }),
    ...Array.from({ length: 18 }, (_, i) => fixtureRow(`tu-${i}`, 'tool-use', true)),
    fixtureRow('tu-fail-1', 'tool-use', false, { severity: 'medium', name: 'Correct tool selected', reason: 'Agent called search-web instead of knowledge-base', category: 'tool-selection' }),
    fixtureRow('tu-fail-2', 'tool-use', false, { severity: 'low', name: 'Argument validation', reason: 'Missing required argument: query', category: 'tool-args' }),
    ...Array.from({ length: 15 }, (_, i) => fixtureRow(`sf-${i}`, 'safety', true)),
  ],
};

const current: EvalReportV1 = {
  schemaVersion: 'eval-report/v1',
  run: {
    id: 'agent-v4-2026-07-31',
    generatedAt: '2026-07-31T10:15:00.000Z',
    project: 'My AI Agent',
    branch: 'feat/improve-citations',
    commit: 'e4f5a6b',
    buildId: 'build-142',
  },
  suites: [
    { id: 'response-quality', total: 40, passed: 38, failed: 2 },
    { id: 'tool-use', total: 20, passed: 20, failed: 0 },
    { id: 'safety', total: 15, passed: 15, failed: 0 },
  ],
  suiteManifests: [
    {
      name: 'response-quality',
      target: 'agent',
      datasetSource: 'labelled-synthetic',
      datasetPath: 'examples/screenshot-fixture/.evals_output',
      datasetVersion: '2.1.0',
      rubricVersion: suiteRubric('response-quality'),
      riskArea: 'response-quality',
      graders: ['llm-judge', 'deterministic-assertions'],
      gate: { mode: 'blocking', thresholds: { passRate: 0.9 } },
    },
    {
      name: 'tool-use',
      target: 'agent',
      datasetSource: 'synthetic',
      datasetPath: 'examples/screenshot-fixture/.evals_output',
      datasetVersion: '1.0.0',
      rubricVersion: suiteRubric('tool-use'),
      riskArea: 'tool-use',
      graders: ['deterministic-assertions'],
      gate: { mode: 'blocking', thresholds: { passRate: 0.85 } },
    },
    {
      name: 'safety',
      target: 'agent',
      datasetSource: 'manual',
      datasetPath: 'examples/screenshot-fixture/.evals_output',
      datasetVersion: '1.0.0',
      rubricVersion: suiteRubric('safety'),
      riskArea: 'prompt-safety',
      graders: ['llm-judge'],
      gate: { mode: 'blocking', thresholds: { passRate: 1.0 } },
    },
  ],
  rubricContracts: [
    {
      suiteName: 'response-quality',
      rubricVersion: suiteRubric('response-quality'),
      rubrics: [{ axis: 'answer-quality', version: suiteRubric('response-quality'), sourcePath: 'examples/screenshot-fixture' }],
    },
    {
      suiteName: 'tool-use',
      rubricVersion: suiteRubric('tool-use'),
      rubrics: [{ axis: 'tool-selection', version: suiteRubric('tool-use'), sourcePath: 'examples/screenshot-fixture' }],
    },
    {
      suiteName: 'safety',
      rubricVersion: suiteRubric('safety'),
      rubrics: [{ axis: 'safety', version: suiteRubric('safety'), sourcePath: 'examples/screenshot-fixture' }],
    },
  ],
  rows: [
    ...Array.from({ length: 38 }, (_, i) => fixtureRow(`rq-${i}`, 'response-quality', true, { durationMs: 300 + i * 10 })),
    fixtureRow('rq-fail-1', 'response-quality', false, { severity: 'medium', name: 'Concise answer', reason: 'Response exceeded 200 words', category: 'conciseness', durationMs: 420 }),
    fixtureRow('rq-fail-3', 'response-quality', false, { severity: 'low', name: 'Citation required', reason: 'Minor citation gap - partially addressed in this build', category: 'groundedness', durationMs: 380 }),
    ...Array.from({ length: 20 }, (_, i) => fixtureRow(`tu-${i}`, 'tool-use', true, { durationMs: 200 + i * 5 })),
    ...Array.from({ length: 15 }, (_, i) => fixtureRow(`sf-${i}`, 'safety', true, { durationMs: 150 + i * 8 })),
  ],
};

await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'run-previous.json'), JSON.stringify(previous, null, 2) + '\n');
await writeFile(path.join(out, 'run-current.json'), JSON.stringify(current, null, 2) + '\n');
console.log(`wrote fixture to ${out}`);
