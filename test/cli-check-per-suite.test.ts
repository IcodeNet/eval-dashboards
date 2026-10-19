import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const report = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'r1', generatedAt: '2026-10-01T00:00:00.000Z' },
  suites: [
    { id: 'safety', total: 2, passed: 1, failed: 1 },
    { id: 'quality', total: 2, passed: 2, failed: 0 },
  ],
  rows: [
    { id: 's1', suite: 'safety', passed: true },
    { id: 's2', suite: 'safety', passed: false },
    { id: 'q1', suite: 'quality', passed: true },
    { id: 'q2', suite: 'quality', passed: true },
  ],
};

/** Writes a report and a config file in a temp folder, runs `check` there, and returns exit code and output. */
const runCheck = async (configSource: string): Promise<{ exitCode: number; output: string }> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-per-suite-'));
  tempDirs.push(dir);
  await mkdir(path.join(dir, 'in'), { recursive: true });
  await writeFile(path.join(dir, 'in', 'run.json'), JSON.stringify(report), 'utf8');
  await writeFile(path.join(dir, 'eval-dashboards.config.mjs'), configSource, 'utf8');
  const cliEntry = path.resolve(process.cwd(), 'src/cli/index.ts');
  try {
    const result = await execFileAsync('pnpm', ['exec', 'tsx', cliEntry, 'check', '--input=in'], { cwd: dir });
    return { exitCode: 0, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: failure.code ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
};

describe('check with gates.suites in the config file', () => {
  it('should fail with exit 1 and name the suite when it is below its own pass rate', async () => {
    const result = await runCheck('export default { gates: { suites: { safety: { minPassRate: 1 } } } };');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Suite "safety" pass rate 0.500 is below required 1.000.');
  });

  it('should pass when every suite meets its own pass rate', async () => {
    const result = await runCheck(
      'export default { gates: { suites: { safety: { minPassRate: 0.5 }, quality: { minPassRate: 1 } } } };',
    );

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Eval gates passed.');
  });

  it('should fail with exit 1 when a suite named in the config is missing from the run', async () => {
    const result = await runCheck('export default { gates: { suites: { retrieval: { minPassRate: 0.5 } } } };');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Suite "retrieval" has a threshold in gates.suites but is missing from this run.');
  });

  it('should exit 2 and name the key when a per-suite setting is misspelled', async () => {
    const result = await runCheck('export default { gates: { suites: { safety: { minPassRat: 1 } } } };');

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('suites.safety.minPassRat is not a per-suite setting.');
  });
});

describe('check with gates.allowLoosening in the config file', () => {
  const runWithBaseline = async (configSource: string): Promise<{ exitCode: number; output: string }> => {
    const dir = await mkdtemp(path.join(tmpdir(), 'eval-allow-loosening-'));
    tempDirs.push(dir);
    await mkdir(path.join(dir, 'in'), { recursive: true });
    await writeFile(path.join(dir, 'in', 'run.json'), JSON.stringify(report), 'utf8');
    await writeFile(path.join(dir, 'baseline-gates.json'), JSON.stringify({ minPassRate: 0.9 }), 'utf8');
    await writeFile(path.join(dir, 'eval-dashboards.config.mjs'), configSource, 'utf8');
    const cliEntry = path.resolve(process.cwd(), 'src/cli/index.ts');
    try {
      const result = await execFileAsync(
        'pnpm',
        ['exec', 'tsx', cliEntry, 'check', '--input=in', '--baseline-gate-config=baseline-gates.json'],
        { cwd: dir },
      );
      return { exitCode: 0, output: `${result.stdout}${result.stderr}` };
    } catch (error) {
      const failure = error as { code?: number; stdout?: string; stderr?: string };
      return { exitCode: failure.code ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
    }
  };

  it('should fail the gate when the bar is lowered and the config does not approve it', async () => {
    const result = await runWithBaseline('export default { gates: { minPassRate: 0.1 } };');

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Gate configuration loosened without approval: minPassRate loosened from 0.9 to 0.1.');
  });

  it('should pass the gate when the config approves the lowered bar with allowLoosening', async () => {
    const result = await runWithBaseline('export default { gates: { minPassRate: 0.1, allowLoosening: true } };');

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('explicitly allowed via --allow-gate-loosening');
  });
});
