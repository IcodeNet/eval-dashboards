import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-org-rollup-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const historyEntry = (project: string, generatedAt: string, passed: boolean) => [
  {
    run: { id: `${project}-run`, generatedAt, project },
    total: 2,
    passed: passed ? 2 : 1,
    failed: passed ? 0 : 1,
    passRate: passed ? 1 : 0.5,
    matchedExpectation: passed ? 2 : 1,
    expectationMismatches: passed ? 0 : 1,
    matchedExpectationRate: passed ? 1 : 0.5,
    severityCounts: { none: 2, low: 0, medium: 0, high: 0, critical: 0 },
    suites: [],
    bySuite: {},
    byKind: {},
    byRiskArea: {},
    regression: { newlyFailing: passed ? 0 : 1, newlyPassing: 0, persistentFailures: 0, disappeared: 0 },
    rowStability: { stable: 2, flaky: 0, persistentFailure: 0 },
  },
];

describe('org-rollup CLI command', () => {
  it('renders a static HTML overview from published history.json files', async () => {
    const rootDir = await createTempDir();
    const repoADir = path.join(rootDir, 'agent-alpha');
    const repoBDir = path.join(rootDir, 'agent-beta');
    await mkdir(repoADir, { recursive: true });
    await mkdir(repoBDir, { recursive: true });
    await writeFile(
      path.join(repoADir, 'history.json'),
      JSON.stringify(historyEntry('agent-alpha', '2026-01-01T00:00:00.000Z', true)),
      'utf8',
    );
    await writeFile(
      path.join(repoBDir, 'history.json'),
      JSON.stringify(historyEntry('agent-beta', '2026-01-01T00:00:00.000Z', false)),
      'utf8',
    );

    const outPath = path.join(rootDir, 'rollup.html');
    const { stdout } = await execFileAsync(
      'pnpm',
      ['cli:dev', 'org-rollup', `--input=${rootDir}`, `--out=${outPath}`],
      { cwd: process.cwd() },
    );

    expect(stdout).toMatch(/2 repo\(s\)/);
    const html = await readFile(outPath, 'utf8');
    expect(html).toContain('Org eval rollup');
    expect(html).toContain('agent-alpha');
    expect(html).toContain('agent-beta');
    // Offline/static guarantees: no external script/fetch/API calls embedded.
    expect(html).not.toMatch(/<script[^>]*src=/i);
    expect(html).not.toMatch(/fetch\(/);
  });

  it('exits 3 with guidance when no history.json files are found', async () => {
    const rootDir = await createTempDir();

    await expect(
      execFileAsync('pnpm', ['cli:dev', 'org-rollup', `--input=${rootDir}`], { cwd: process.cwd() }),
    ).rejects.toMatchObject({
      code: 3,
      stderr: expect.stringContaining('No history.json files found'),
    });
  });

  it('skips malformed history files but still renders the valid ones', async () => {
    const rootDir = await createTempDir();
    const goodDir = path.join(rootDir, 'agent-good');
    const badDir = path.join(rootDir, 'agent-bad');
    await mkdir(goodDir, { recursive: true });
    await mkdir(badDir, { recursive: true });
    await writeFile(
      path.join(goodDir, 'history.json'),
      JSON.stringify(historyEntry('agent-good', '2026-01-01T00:00:00.000Z', true)),
      'utf8',
    );
    await writeFile(path.join(badDir, 'history.json'), '{not json', 'utf8');

    const outPath = path.join(rootDir, 'rollup.html');
    const { stdout, stderr } = await execFileAsync(
      'pnpm',
      ['cli:dev', 'org-rollup', `--input=${rootDir}`, `--out=${outPath}`],
      { cwd: process.cwd() },
    );

    expect(stderr).toMatch(/Skipping invalid history file/);
    expect(stdout).toMatch(/1 repo\(s\)/);
  });

  it('rejects unknown flags', async () => {
    await expect(
      execFileAsync('pnpm', ['cli:dev', 'org-rollup', '--bogus=1'], { cwd: process.cwd() }),
    ).rejects.toMatchObject({ code: 2 });
  });

  it('prints usage on --help', async () => {
    const { stdout } = await execFileAsync('pnpm', ['cli:dev', 'org-rollup', '--help'], { cwd: process.cwd() });
    expect(stdout).toMatch(/org-rollup \[options\]/);
    expect(stdout).toMatch(/no ingestion API/);
  });
});
