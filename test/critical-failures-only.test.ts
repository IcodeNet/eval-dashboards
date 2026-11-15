import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkGates, compareRuns, evaluateReportPolicy, summarizeReport, type EvalReportV1 } from '../src/index.js';

const report = (rows: EvalReportV1['rows']): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1',
  run: { id: 'critical-checks', generatedAt: '2026-11-13T12:00:00Z' },
  suites: [{ id: 'safety', total: rows.length, passed: rows.filter(row => row.passed).length,
    failed: rows.filter(row => !row.passed).length }],
  rows,
});
const critical = (id: string, passed: boolean): EvalReportV1['rows'][number] => ({
  id, suite: 'safety', severity: 'critical', passed,
});

describe('zeroCritical counts failed critical rows', () => {
  it.each([
    ['passing critical check', [critical('safe', true)], 0],
    ['failed critical check', [critical('unsafe', false)], 1],
    ['mixed critical checks', [critical('safe', true), critical('unsafe', false)], 1],
    ['two failed critical checks', [critical('safe', true), critical('bad-1', false), critical('bad-2', false)], 2],
    ['failed non-critical check', [{ id: 'tone', suite: 'safety', severity: 'low', passed: false }], 0],
  ] as const)('%s agrees with the suite rule and public policy', (_name, rows, failedCount) => {
    const input = report([...rows]);
    const result = checkGates(input, compareRuns(input), { zeroCritical: true });
    expect(result.passed).toBe(failedCount === 0);
    expect(result.failures).toEqual(failedCount ? [`Critical failures ${failedCount} exceed allowed 0.`] : []);
    expect(evaluateReportPolicy({ current: input, gateConfig: { zeroCritical: true } }).gatePassed).toBe(result.passed);
    input.suiteManifests = [{ name: 'safety', target: 'agent', datasetSource: 'synthetic',
      datasetVersion: '1', rubricVersion: '1', riskArea: 'content-safety', graders: ['deterministic-assertions'],
      gate: { mode: 'blocking', thresholds: { maxCriticalFailures: 0 } } }];
    expect(checkGates(input, compareRuns(input), {}).passed).toBe(result.passed);
  });

  it('keeps severity coverage counts and opt-in behavior unchanged', () => {
    const input = report([critical('safe', true), critical('unsafe', false)]);
    expect(summarizeReport(input).severityCounts.critical).toBe(2);
    expect(checkGates(input, compareRuns(input), {}).passed).toBe(true);
    expect(checkGates(input, compareRuns(input), { zeroCritical: false }).passed).toBe(true);
  });

  it('still counts a failed critical row that was expected to fail', () => {
    const input = report([{ ...critical('negative-control', false), expectedOutcome: 'fail' }]);
    expect(checkGates(input, compareRuns(input), { zeroCritical: true }).passed).toBe(false);
  });

  it('uses actual failures in the real CLI exit code and JSON result', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'critical-failures-'));
    const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;
    try {
      const inputDir = path.join(dir, 'input');
      await mkdir(inputDir);
      const inputPath = path.join(inputDir, 'run.json');
      const outputPath = path.join(dir, 'check.json');
      for (const failed of [false, true]) {
        await writeFile(inputPath, JSON.stringify(report([critical('safe', true), critical('second', !failed)])));
        const result = spawnSync(process.execPath, ['--import', loader, path.resolve('src/cli/index.ts'),
          'check', `--input=${inputDir}`, '--zero-critical', `--json-out=${outputPath}`],
        { cwd: dir, encoding: 'utf8', timeout: 30_000 });
        expect(result.status, result.stderr).toBe(failed ? 1 : 0);
        const saved = JSON.parse(await readFile(outputPath, 'utf8'));
        expect(saved.passed).toBe(!failed);
        expect(saved.failures).toEqual(failed ? ['Critical failures 1 exceed allowed 0.'] : []);
      }
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
