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
  suites: [{ id: 's', total: 1, passed: 0, failed: 1 }],
  rows: [{ id: 'a', suite: 's', passed: false }],
};

const runCli = async (args: string[]): Promise<{ exitCode: number; output: string }> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-bad-values-'));
  tempDirs.push(dir);
  await mkdir(path.join(dir, 'in'), { recursive: true });
  await writeFile(path.join(dir, 'in', 'run.json'), JSON.stringify(report), 'utf8');
  const cliEntry = path.resolve(process.cwd(), 'src/cli/index.ts');
  try {
    const result = await execFileAsync('pnpm', ['exec', 'tsx', cliEntry, ...args], { cwd: dir });
    return { exitCode: 0, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: failure.code ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
};

describe('report --theme', () => {
  it('should exit 2 and suggest the closest theme when the name is misspelled', async () => {
    const result = await runCli(['report', '--input=in', '--report-dir=out', '--reporter=html', '--theme=dak']);

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('Unknown theme "dak". Did you mean "dark"?');
  });

  it('should exit 2 and list the built-in themes when nothing is close', async () => {
    const result = await runCli(['report', '--input=in', '--report-dir=out', '--reporter=html', '--theme=nonsense']);

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('Use one of: default, dark, minimal.');
  });

  it('should accept every built-in theme when the name is exact', async () => {
    for (const theme of ['default', 'dark', 'minimal']) {
      const result = await runCli(['report', '--input=in', '--report-dir=out', '--reporter=html', `--theme=${theme}`]);

      expect(result.exitCode).toBe(0);
    }
  });
});

describe('check --new-failure-key', () => {
  it('should exit 2 and list the allowed keys when the value is not a known key', async () => {
    const result = await runCli(['check', '--input=in', '--max-new-failures=0', '--new-failure-key=category']);

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('Unknown --new-failure-key "category". Use one of: row, scenario, scenario-category, id-category.');
  });

  it('should accept each documented key when the value is exact', async () => {
    for (const key of ['row', 'scenario', 'scenario-category', 'id-category']) {
      const result = await runCli(['check', '--input=in', '--max-new-failures=5', `--new-failure-key=${key}`]);

      expect(result.exitCode).toBe(0);
      expect(result.output).not.toContain('Unknown --new-failure-key');
    }
  });
});
