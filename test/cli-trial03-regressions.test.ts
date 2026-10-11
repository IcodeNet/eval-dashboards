import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';

const execFileAsync = promisify(execFile);
const cli = path.resolve('src/cli/index.ts');
const tsx = path.resolve('node_modules/tsx/dist/loader.mjs');
const dirs: string[] = [];
const run = (dir: string, command: string, ...flags: string[]) =>
  execFileAsync(process.execPath, ['--import', tsx, cli, command, '--input=input', ...flags], { cwd: dir });
const report = (id: string, passed: boolean, day: number): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1',
  run: { id, generatedAt: `2026-10-${day}T12:00:00Z` },
  suites: [{ id: 'fast', total: 1, passed: Number(passed), failed: Number(!passed) }],
  rows: [{ id: 'case-a', suite: 'fast', passed, kind: 'deterministic', severity: 'low', category: 'response-quality' }],
});
async function setup(reports: EvalReportV1[]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-trial03-'));
  dirs.push(dir);
  await mkdir(path.join(dir, 'input'));
  await Promise.all(reports.map((value, index) => writeFile(path.join(dir, 'input', `${index}.json`), JSON.stringify(value))));
  return dir;
}
async function contents(dir: string): Promise<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? contents(path.join(dir, entry.name)) : readFile(path.join(dir, entry.name), 'utf8')))).join('\n');
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe('Trial 03 CLI regressions', () => {
  it('redacts every emitted comparison bucket and both tool argument representations on local publish', async () => {
    const baseline = report('baseline', true, 10);
    const current = report('current', false, 11);
    for (const value of [baseline, current]) {
      value.rows = ['new-fail', 'new-pass', 'persistent', 'disappeared'].map((id) => ({
        id, suite: 'fast', passed: id === 'new-fail' ? value === baseline : id === 'new-pass' && value === current,
        question: `private-marker-question-${id}`, output: `private-marker-output-${id}`,
        toolCalls: [{ name: 'search', args: { q: 'private-marker-tool-args' }, result: 'private-marker-tool-result' }],
        turns: [{ role: 'assistant', content: 'private-marker-turn-content', toolCall: { name: 'search', args: { q: 'private-marker-turn-args' } }, toolResult: 'private-marker-turn-result' }],
      }));
      if (value === current) value.rows = value.rows.filter((row) => row.id !== 'disappeared');
      const passed = value.rows.filter((row) => row.passed).length;
      value.suites = [{ id: 'fast', total: value.rows.length, passed, failed: value.rows.length - passed }];
    }
    const dir = await setup([baseline, current]);
    await expect(run(dir, 'publish', '--target=dir', '--report-dir=report', '--out-dir=published')).rejects.toMatchObject({ code: 2 });
    await run(dir, 'publish', '--target=dir', '--report-dir=report', '--out-dir=published', '--redact');
    expect(await contents(path.join(dir, 'published'))).not.toContain('private-marker-');
    const summary = JSON.parse(await readFile(path.join(dir, 'published/summary.json'), 'utf8'));
    for (const bucket of ['newlyFailing', 'newlyPassing', 'persistentFailures', 'disappeared']) {
      expect(summary.comparison[bucket]).toHaveLength(1);
      expect(summary.comparison[bucket][0].suite).toBe('fast');
    }
    expect(JSON.parse(await readFile(path.join(dir, 'published/history.json'), 'utf8'))).toHaveLength(2);
  });

  it('blocks sensitive evidence carried only by a disappeared baseline row', async () => {
    const baseline = report('baseline', true, 10);
    baseline.rows[0]!.id = 'gone';
    baseline.rows[0]!.output = 'private-marker-baseline-only';
    const dir = await setup([baseline, report('current', true, 11)]);
    await expect(run(dir, 'publish', '--target=dir', '--dry-run')).rejects.toMatchObject({ code: 2, stderr: expect.stringContaining('output') });
  });

  it('fails closed on a missing config dependency but enforces a valid config', async () => {
    const invalidDir = await setup([report('current', false, 11)]);
    await writeFile(path.join(invalidDir, 'eval-dashboards.config.mjs'), "import './missing-policy.mjs';\nexport default { gates: { minPassRate: 1 } };\n");
    await expect(run(invalidDir, 'check')).rejects.toMatchObject({ code: 2, stderr: expect.stringContaining('missing-policy.mjs') });
    const validDir = await setup([report('current', false, 11)]);
    await writeFile(path.join(validDir, 'eval-dashboards.config.mjs'), 'export default { gates: { minPassRate: 1 } };\n');
    await expect(run(validDir, 'check')).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Pass rate') });
  });

  it.each([{ flags: [] }, { flags: ['--run-id=same-id'] }, { flags: ['--baseline-run-id=same-id'] }])('rejects duplicate run IDs before selection ($flags)', async ({ flags }) => {
    const dir = await setup([report('same-id', true, 10), report('same-id', false, 11)]);
    await expect(run(dir, 'check', '--min-pass-rate=1', ...flags)).rejects.toMatchObject({ code: 2, stderr: expect.stringMatching(/Duplicate run ID.*same-id.*0\.json.*1\.json/) });
  });

  it('filters comparison, compatibility and statistical evidence to the requested tier', async () => {
    const baseline = report('baseline', true, 10);
    const current = report('current', true, 11);
    for (const value of [baseline, current]) {
      value.rows.push({ id: 'case-b', suite: 'slow', passed: value === baseline });
      value.suites.push({ id: 'slow', total: 1, passed: Number(value === baseline), failed: Number(value === current) });
      value.suiteManifests = (['fast', 'slow'] as const).map((name) => ({
        name, target: 'custom', datasetSource: 'custom', datasetVersion: name === 'slow' && value === current ? 'changed' : '1', rubricVersion: '1',
        riskArea: 'response-quality', graders: ['deterministic-assertions'], gate: { mode: 'blocking', thresholds: {} }, tier: name === 'fast' ? 'pr' : 'full',
      }));
    }
    const dir = await setup([baseline, current]);
    const flags = ['--min-pass-rate=1', '--max-new-failures=0', '--statistical-mode=bootstrap', '--min-pass-rate-delta=0', '--json-out=check.json'];
    await run(dir, 'check', '--tier=pr', ...flags);
    const check = JSON.parse(await readFile(path.join(dir, 'check.json'), 'utf8'));
    expect(check.passed).toBe(true);
    expect(check.baselineRunId).toBe('baseline');
    expect(check.baselineCompatibility.status).toBe('compatible');
    expect(check.newlyFailingRows).toEqual([]);
    expect(check.prTier.rowCount).toBe(1);
    await expect(run(dir, 'check', '--tier=full', ...flags)).rejects.toMatchObject({ code: 1 });
    const full = JSON.parse(await readFile(path.join(dir, 'check.json'), 'utf8'));
    expect(full.newlyFailingRows[0].suite).toBe('slow');
    expect(full.baselineCompatibility.status).toBe('blocked');
  });
});
