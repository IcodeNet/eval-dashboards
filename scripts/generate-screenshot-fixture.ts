/**
 * Generates a richer fixture artifact for README screenshots.
 * Run with: node --import tsx/esm scripts/generate-screenshot-fixture.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvalReportV1 } from '../src/index.js';

const out = path.join('examples', 'screenshot-fixture', '.evals_output');

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
    { id: 'tool-use',         total: 20, passed: 18, failed: 2 },
    { id: 'safety',           total: 15, passed: 15, failed: 0 },
  ],
  rows: [
    ...Array.from({ length: 36 }, (_, i) => ({ id: `rq-${i}`, suite: 'response-quality', passed: true })),
    { id: 'rq-fail-1', suite: 'response-quality', passed: false, severity: 'medium' as const, name: 'Concise answer', reason: 'Response exceeded 200 words', category: 'conciseness' },
    { id: 'rq-fail-2', suite: 'response-quality', passed: false, severity: 'low' as const, name: 'Tone check', reason: 'Detected informal tone in professional context', category: 'tone' },
    { id: 'rq-fail-3', suite: 'response-quality', passed: false, severity: 'medium' as const, name: 'Citation required', reason: 'Answer made factual claim without citation', category: 'groundedness' },
    { id: 'rq-fail-4', suite: 'response-quality', passed: false, severity: 'high' as const, name: 'Hallucination check', reason: 'Response contained a date that does not exist in the knowledge base', category: 'hallucination' },
    ...Array.from({ length: 18 }, (_, i) => ({ id: `tu-${i}`, suite: 'tool-use', passed: true })),
    { id: 'tu-fail-1', suite: 'tool-use', passed: false, severity: 'medium' as const, name: 'Correct tool selected', reason: 'Agent called search-web instead of knowledge-base', category: 'tool-selection' },
    { id: 'tu-fail-2', suite: 'tool-use', passed: false, severity: 'low' as const, name: 'Argument validation', reason: 'Missing required argument: query', category: 'tool-args' },
    ...Array.from({ length: 15 }, (_, i) => ({ id: `sf-${i}`, suite: 'safety', passed: true })),
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
    { id: 'tool-use',         total: 20, passed: 20, failed: 0 },
    { id: 'safety',           total: 15, passed: 15, failed: 0 },
  ],
  suiteManifests: [
    {
      name: 'response-quality',
      target: 'agent',
      datasetSource: 'labelled-synthetic',
      datasetVersion: '2.1.0',
      rubricVersion: '1.3.0',
      riskArea: 'response-quality',
      graders: ['llm-judge', 'deterministic-assertions'],
      gate: { mode: 'blocking', thresholds: { passRate: 0.9 } },
    },
    {
      name: 'tool-use',
      target: 'agent',
      datasetSource: 'synthetic',
      datasetVersion: '1.0.0',
      rubricVersion: '1.0.0',
      riskArea: 'tool-use',
      graders: ['deterministic-assertions'],
      gate: { mode: 'blocking', thresholds: { passRate: 0.85 } },
    },
    {
      name: 'safety',
      target: 'agent',
      datasetSource: 'manual',
      datasetVersion: '1.0.0',
      rubricVersion: '1.0.0',
      riskArea: 'prompt-safety',
      graders: ['llm-judge'],
      gate: { mode: 'blocking', thresholds: { passRate: 1.0 } },
    },
  ],
  rows: [
    ...Array.from({ length: 38 }, (_, i) => ({ id: `rq-${i}`, suite: 'response-quality', passed: true, durationMs: 300 + i * 10 })),
    { id: 'rq-fail-1', suite: 'response-quality', passed: false, severity: 'medium' as const, name: 'Concise answer', reason: 'Response exceeded 200 words', category: 'conciseness', durationMs: 420 },
    { id: 'rq-fail-3', suite: 'response-quality', passed: false, severity: 'low' as const, name: 'Citation required', reason: 'Minor citation gap — partially addressed in this build', category: 'groundedness', durationMs: 380 },
    ...Array.from({ length: 20 }, (_, i) => ({ id: `tu-${i}`, suite: 'tool-use', passed: true, durationMs: 200 + i * 5 })),
    ...Array.from({ length: 15 }, (_, i) => ({ id: `sf-${i}`, suite: 'safety', passed: true, durationMs: 150 + i * 8 })),
  ],
};

await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'run-previous.json'), JSON.stringify(previous, null, 2) + '\n');
await writeFile(path.join(out, 'run-current.json'), JSON.stringify(current, null, 2) + '\n');
console.log(`wrote fixture to ${out}`);
