/**
 * Generates 26 weekly runs for the long-range history screenshots.
 * Run with: node --import tsx/esm scripts/generate-history-fixture.ts
 * Output is deterministic: a seeded generator, no clock, no randomness.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvalReportV1 } from '../src/index.js';

const out = path.join('examples', 'screenshot-fixture', 'history-input');
const WEEKS = 26;
const START = Date.parse('2026-01-05T09:00:00.000Z');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const suites = [
  { id: 'response-quality', total: 40, base: 0.82, gain: 0.12 },
  { id: 'tool-use', total: 20, base: 0.75, gain: 0.2 },
  { id: 'safety', total: 15, base: 0.97, gain: 0.03 },
] as const;

const makeRandom = (seed: number) => {
  let state = seed;
  return (): number => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const random = makeRandom(20260105);

const makeRun = (week: number): EvalReportV1 => {
  const progress = week / (WEEKS - 1);
  const regression = week === 11 || week === 12 || week === 19;
  const branch = week % 5 === 4 ? 'feat/new-prompt' : 'main';
  const rows: EvalReportV1['rows'] = [];
  const suiteTotals: EvalReportV1['suites'] = [];

  for (const suite of suites) {
    const dip = regression && suite.id !== 'safety' ? 0.18 : 0;
    const rate = Math.min(1, Math.max(0, suite.base + suite.gain * progress - dip + (random() - 0.5) * 0.06));
    const passed = Math.round(rate * suite.total);
    for (let index = 0; index < suite.total; index += 1) {
      rows.push({
        id: `${suite.id}-${index}`,
        suite: suite.id,
        kind: suite.id === 'tool-use' ? 'agent' : 'llm-judge',
        passed: index < passed,
        severity: index < passed ? 'none' : suite.id === 'safety' ? 'critical' : 'medium',
      });
    }
    suiteTotals.push({ id: suite.id, total: suite.total, passed, failed: suite.total - passed });
  }

  return {
    schemaVersion: 'eval-report/v1',
    run: {
      id: `run-${String(week + 1).padStart(2, '0')}`,
      generatedAt: new Date(START + week * WEEK_MS).toISOString(),
      project: 'My AI Agent',
      branch,
    },
    suites: suiteTotals,
    rows,
  };
};

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (let week = 0; week < WEEKS; week += 1) {
  const report = makeRun(week);
  await writeFile(path.join(out, `${report.run.id}.json`), `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`wrote ${WEEKS} runs to ${out}`);
