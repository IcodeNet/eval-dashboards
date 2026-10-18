import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();

const tsxBin = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
const cliEntry = path.join(repoRoot, 'src', 'cli', 'index.ts');

const runCli = (args: string[], cwd: string) => execFileAsync(tsxBin, [cliEntry, ...args], { cwd });

describe('adjudicate import output path', () => {
  it('should write inside the report dir and leave package.json alone when run.id contains path segments', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'adjudicate-path-'));
    const work = path.join(dir, 'work');
    const input = path.join(dir, 'in');
    await mkdir(work, { recursive: true });
    await mkdir(input, { recursive: true });
    await writeFile(path.join(work, 'package.json'), '{"name":"victim"}');
    await writeFile(
      path.join(input, 'r.json'),
      JSON.stringify({
        schemaVersion: 'eval-report/v1',
        run: { id: 'x/../../package', generatedAt: '2026-10-01T00:00:00.000Z' },
        suites: [{ id: 's', total: 2, passed: 1, failed: 1 }],
        rows: [
          { id: 'a', suite: 's', passed: true, kind: 'llm-judge' },
          { id: 'b', suite: 's', passed: false, kind: 'llm-judge', severity: 'high' },
        ],
      }),
    );
    const bundlePath = path.join(dir, 'b.json');
    await runCli(['adjudicate', 'export', `--input=${input}`, `--out=${bundlePath}`], work);
    const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as { rows: Array<{ reviews: unknown[] }> };
    const decided = { verdict: 'pass', decidedAt: '2026-10-02T00:00:00.000Z' };
    bundle.rows[0]!.reviews = [{ reviewer: 'a', ...decided }, { reviewer: 'b', ...decided }];
    await writeFile(bundlePath, JSON.stringify(bundle));

    await runCli(['adjudicate', 'import', `--input=${input}`, `--bundle=${bundlePath}`], work);

    expect(await readFile(path.join(work, 'package.json'), 'utf8')).toBe('{"name":"victim"}');
    expect(await readdir(path.join(work, 'eval-report'))).toEqual(['adjudicated-x_.._.._package.json']);
  }, 90_000);
});
