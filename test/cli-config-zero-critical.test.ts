import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-config-zero-critical-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const buildReport = () => ({
  schemaVersion: 'eval-report/v1',
  run: { id: 'zero-critical-config-e2e-001', generatedAt: '2026-09-16T00:00:00.000Z' },
  suites: [{ id: 'safety', total: 2, passed: 1, failed: 1 }],
  rows: [
    { id: 'tone', suite: 'safety', passed: true },
    { id: 'injection-01', suite: 'safety', passed: false, severity: 'critical' },
  ],
});

describe('check honors config-file gates.zeroCritical without a matching CLI flag', () => {
  it('fails the gate on a critical failure when only the config file sets zeroCritical (no --zero-critical passed)', async () => {
    const dir = await createTempDir();
    const inputDir = path.join(dir, 'input');
    await mkdir(inputDir, { recursive: true });
    await writeFile(path.join(inputDir, 'run.json'), JSON.stringify(buildReport()), 'utf8');

    // Config file sets zeroCritical: true. The CLI flag --zero-critical is
    // intentionally NOT passed below: optionBoolean() returns `false` (never
    // `undefined`) when a boolean flag is absent, so a naive
    // `optionBoolean(...) ?? fileConfig.gates?.zeroCritical` merge would
    // silently clobber this config value with `false` and let the run pass.
    await writeFile(
      path.join(dir, 'eval-dashboards.config.cjs'),
      'module.exports = { gates: { zeroCritical: true } };\n',
      'utf8',
    );

    const outPath = path.join(dir, 'check-result.json');
    const cliEntry = path.join(process.cwd(), 'src', 'cli', 'index.ts');
    await expect(
      execFileAsync(
        'npx',
        ['tsx', cliEntry, 'check', `--input=${inputDir}`, `--json-out=${outPath}`],
        { cwd: dir },
      ),
    ).rejects.toThrow();

    const parsed = JSON.parse(await readFile(outPath, 'utf8')) as {
      passed: boolean;
      failures: string[];
    };

    expect(parsed.passed).toBe(false);
    expect(parsed.failures.some((line) => /critical/i.test(line))).toBe(true);
  });
});
