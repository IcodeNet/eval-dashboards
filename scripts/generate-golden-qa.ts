/**
 * Builds a deterministic, answer-known dataset for the question/answer audit.
 * Run with: node --import tsx/esm scripts/generate-golden-qa.ts <outDir>
 * Every fact in the printed ground-truth list can be checked with the CLI.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvalReportV1 } from '../src/index.js';

const out = process.argv[2];
if (!out) throw new Error('Usage: generate-golden-qa.ts <outDir>');

const WEEKS = 12;
const START = Date.parse('2026-07-06T09:00:00.000Z');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** passes out of total per suite and week; week 7 is a planned regression in safety. */
const plan: Record<string, { total: number; passes: number[] }> = {
  'answer-quality': { total: 10, passes: [7, 7, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10] },
  'tool-use': { total: 5, passes: [3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5] },
  safety: { total: 4, passes: [4, 4, 4, 4, 4, 4, 4, 2, 3, 4, 4, 4] },
};

const makeRun = (week: number): EvalReportV1 => {
  const rows: EvalReportV1['rows'] = [];
  const suites: EvalReportV1['suites'] = [];
  for (const [suite, { total, passes }] of Object.entries(plan)) {
    const passed = passes[week] as number;
    for (let index = 0; index < total; index += 1) {
      const ok = index < passed;
      rows.push({
        id: `${suite}-${index + 1}`,
        suite,
        kind: suite === 'tool-use' ? 'agent' : 'llm-judge',
        passed: ok,
        severity: ok ? 'none' : suite === 'safety' ? 'critical' : 'medium',
        category: suite,
        metadata: {
          provenance: { source: 'labelled-synthetic', reason: 'Golden audit dataset' },
          lifecycle: { status: 'active' },
        },
      });
    }
    suites.push({ id: suite, total, passed, failed: total - passed });
  }
  return {
    schemaVersion: 'eval-report/v1',
    run: {
      id: `golden-${String(week + 1).padStart(2, '0')}`,
      generatedAt: new Date(START + week * WEEK_MS).toISOString(),
      project: 'Support Assistant',
      branch: week === 5 ? 'feat/new-prompt' : 'main',
      commit: `c${String(week + 1).padStart(6, '0')}`,
    },
    suites,
    rows,
    suiteManifests: Object.keys(plan).map((name) => ({
      name,
      target: 'agent' as const,
      datasetSource: 'synthetic',
      datasetVersion: '1.0.0',
      rubricVersion: '1.0.0',
      riskArea: name === 'safety' ? 'prompt-safety' : 'response-quality',
      graders: ['deterministic-assertions'],
      gate: { mode: 'blocking' as const, thresholds: { passRate: name === 'safety' ? 1 : 0.7 } },
    })),
  };
};

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'runs'), { recursive: true });
for (let week = 0; week < WEEKS; week += 1) {
  const report = makeRun(week);
  await writeFile(path.join(out, 'runs', `${report.run.id}.json`), `${JSON.stringify(report, null, 2)}\n`);
}

const rate = (week: number): number => {
  const passed = Object.values(plan).reduce((sum, { passes }) => sum + (passes[week] as number), 0);
  const total = Object.values(plan).reduce((sum, { total: t }) => sum + t, 0);
  return passed / total;
};
const truth = {
  runs: WEEKS,
  totalRowsPerRun: 19,
  firstRunPassRate: rate(0),
  lastRunPassRate: rate(WEEKS - 1),
  lowestPassRateRun: 'golden-01',
  lowestPassRate: rate(0),
  biggestDropRun: 'golden-08',
  biggestDropFrom: rate(6),
  biggestDropTo: rate(7),
  biggestDropCause: 'safety suite fell from 4/4 to 2/4 (2 critical failures)',
  branchesSeen: ['main', 'feat/new-prompt'],
  featureBranchRun: 'golden-06',
  safetyBlockingThreshold: 1,
  safetyBelowThresholdRuns: ['golden-08', 'golden-09'],
  runsAboveNinetyPercent: Array.from({ length: WEEKS }, (_, w) => w).filter((w) => rate(w) >= 0.9).map((w) => `golden-${String(w + 1).padStart(2, '0')}`),
};
await writeFile(path.join(out, 'ground-truth.json'), `${JSON.stringify(truth, null, 2)}\n`);
console.log(JSON.stringify(truth, null, 2));
