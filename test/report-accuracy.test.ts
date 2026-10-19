/**
 * Expected values are literals worked out by hand in `fixtures/golden/golden-runs.ts`.
 * Each of these deliberate breaks made this file fail when tried:
 * `rowKey` ignoring the suite, a new failing row not counted as newly failing,
 * and a persistent failure counted as newly passing.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { goldenBaseline, goldenCurrent } from './fixtures/golden/golden-runs.js';

const execFileAsync = promisify(execFile);

type SummaryFile = {
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    severityCounts: Record<string, number>;
    suites: Array<{ id: string; total: number; passed: number; failed: number }>;
  };
  comparison: {
    currentRunId: string;
    previousRunId: string;
    newlyFailing: Array<{ id: string; suite: string }>;
    newlyPassing: Array<{ id: string; suite: string }>;
    persistentFailures: Array<{ id: string; suite: string }>;
    disappeared: Array<{ id: string; suite: string }>;
  };
};

let workDir: string;
let summary: SummaryFile;
let markdown: string;
let checkResult: { passed: boolean; runId: string; baselineRunId: string; newlyFailingRows: Array<{ suite: string; id: string }> };

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'eval-golden-'));
  const input = path.join(workDir, 'input');
  const reportDir = path.join(workDir, 'out');
  await mkdir(input, { recursive: true });
  await writeFile(path.join(input, 'baseline.json'), JSON.stringify(goldenBaseline), 'utf8');
  await writeFile(path.join(input, 'current.json'), JSON.stringify(goldenCurrent), 'utf8');

  const cliEntry = path.resolve(process.cwd(), 'src/cli/index.ts');
  const run = (args: string[]) => execFileAsync('pnpm', ['exec', 'tsx', cliEntry, ...args], { cwd: process.cwd() });

  await run([
    'report',
    `--input=${input}`,
    `--report-dir=${reportDir}`,
    '--reporter=json-summary',
    '--reporter=markdown-summary',
    '--run-id=golden-current',
    '--baseline-run-id=golden-baseline',
  ]);
  summary = JSON.parse(await readFile(path.join(reportDir, 'summary.json'), 'utf8')) as SummaryFile;
  markdown = await readFile(path.join(reportDir, 'summary.md'), 'utf8');

  await run([
    'check',
    `--input=${input}`,
    `--report-dir=${reportDir}`,
    '--run-id=golden-current',
    '--baseline-run-id=golden-baseline',
    '--min-pass-rate=0',
    `--json-out=${path.join(reportDir, 'check.json')}`,
  ]).catch(() => undefined);
  checkResult = JSON.parse(await readFile(path.join(reportDir, 'check.json'), 'utf8')) as typeof checkResult;
}, 120_000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('report accuracy on the hand-worked golden runs', () => {
  it('should count 9 rows, 3 passed and 6 failed when the current run is summarised', () => {
    expect(summary.summary.total).toBe(9);
    expect(summary.summary.passed).toBe(3);
    expect(summary.summary.failed).toBe(6);
  });

  it('should report a pass rate of one third when 3 of 9 rows pass', () => {
    expect(summary.summary.passRate).toBeCloseTo(0.333333, 5);
  });

  it('should keep suite totals separate when two suites share row ids', () => {
    expect(summary.summary.suites).toEqual([
      { id: 'safety', total: 5, passed: 2, failed: 3 },
      { id: 'quality', total: 4, passed: 1, failed: 3 },
    ]);
  });

  it('should count one critical row when only safety:q2 is marked critical', () => {
    expect(summary.summary.severityCounts.critical).toBe(1);
  });

  it('should compare against the named baseline when a baseline run id is given', () => {
    expect(summary.comparison.currentRunId).toBe('golden-current');
    expect(summary.comparison.previousRunId).toBe('golden-baseline');
  });

  it('should list four newly failing rows when three rows flip and one new row fails', () => {
    expect(summary.comparison.newlyFailing.map((row) => `${row.suite}:${row.id}`)).toEqual([
      'safety:q2',
      'quality:q2',
      'quality:fresh',
      'quality:dup',
    ]);
  });

  it('should list safety:q4 as the only newly passing row', () => {
    expect(summary.comparison.newlyPassing.map((row) => `${row.suite}:${row.id}`)).toEqual(['safety:q4']);
  });

  it('should list safety:q3 and safety:dup as the persistent failures', () => {
    expect(summary.comparison.persistentFailures.map((row) => `${row.suite}:${row.id}`)).toEqual(['safety:q3', 'safety:dup']);
  });

  it('should list safety:gone as the only disappeared row', () => {
    expect(summary.comparison.disappeared.map((row) => `${row.suite}:${row.id}`)).toEqual(['safety:gone']);
  });

  it('should show 3/9, 33.3% and the four new failures in the markdown summary', () => {
    expect(markdown).toContain('| Pass rate | 33.3% |');
    expect(markdown).toContain('| Passed | 3/9 |');
    expect(markdown).toContain('| New failures | 4 |');
    expect(markdown).toContain('| New passes | 1 |');
  });

  it('should list each newly failing row with its category in the markdown summary', () => {
    expect(markdown).toContain('- safety/q2: pii\n- quality/q2: uncategorized\n- quality/fresh: uncategorized\n- quality/dup: uncategorized');
    expect(markdown).toContain('- safety/q4: uncategorized');
  });
});

describe('check accuracy on the hand-worked golden runs', () => {
  it('should name the same four newly failing rows when the check result is written', () => {
    expect(checkResult.baselineRunId).toBe('golden-baseline');
    expect(checkResult.newlyFailingRows.map((row) => `${row.suite}:${row.id}`)).toEqual([
      'safety:q2',
      'quality:q2',
      'quality:fresh',
      'quality:dup',
    ]);
  });
});
