import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const fixture = path.join(process.cwd(), 'test', 'fixtures', 'otel-genai-sample.json');

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const runImport = async (extraArgs: string[]): Promise<{ code: number; stderr: string }> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'eval-dashboards-cli-import-'));
  tempDirs.push(dir);
  try {
    await execFileAsync(
      'pnpm',
      ['cli:dev', 'import', `--input=${fixture}`, `--out=${path.join(dir, 'out.json')}`, ...extraArgs],
      { cwd: process.cwd() },
    );
    return { code: 0, stderr: '' };
  } catch (error) {
    const failure = error as { code?: number; stderr?: string };
    return { code: failure.code ?? -1, stderr: failure.stderr ?? '' };
  }
};

describe('import --case-id-attribute CLI validation', () => {
  it('exits 2 when the flag is given without a value instead of silently ignoring it', async () => {
    const result = await runImport(['--from=otel-genai', '--case-id-attribute']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--case-id-attribute needs exactly one non-empty attribute key.');
  });

  it('exits 2 when the value is blank', async () => {
    const result = await runImport(['--from=otel-genai', '--case-id-attribute=   ']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--case-id-attribute needs exactly one non-empty attribute key.');
  });

  it('exits 2 when used with a source other than otel-genai', async () => {
    const result = await runImport(['--from=promptfoo', '--case-id-attribute=eval.case.id']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--case-id-attribute is only supported with --from=otel-genai.');
  });
});
