import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { validateEvalReport } from '../src/model/validate.js';
import { lintReportTaxonomy } from '../src/gates/lint-taxonomy.js';
import { importFromSource, resolveImportSource } from '../src/cli/import-adapters.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'eval-dashboards-import-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('langsmith import adapter', () => {
  it('resolves langsmith as a valid import source', () => {
    expect(resolveImportSource('langsmith')).toBe('langsmith');
  });

  it('imports LangSmith runs into a valid eval-report/v1 artifact', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, '.evals_output', 'import-langsmith.json');

    const imported = await importFromSource({
      source: 'langsmith',
      inputPath: path.join(fixturesDir, 'langsmith-sample.json'),
      outPath,
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.report.suites).toEqual([
      expect.objectContaining({ id: 'langsmith-agent-evals', total: 2, passed: 1, failed: 1 }),
    ]);

    expect(validated.report.rows.map((row) => row.id)).toEqual(['ls-run-1', 'ls-run-2']);
    expect(validated.report.rows[0]).toEqual(
      expect.objectContaining({
        passed: true,
        category: 'correctness',
        durationMs: 412,
      }),
    );
    expect(validated.report.rows[1]).toEqual(
      expect.objectContaining({
        passed: false,
        score: 0.18,
      }),
    );
    expect(validated.report.rows[1]?.reason).toContain('tool timeout');
    expect(validated.report.rows[0]?.metadata?.provenance).toEqual(
      expect.objectContaining({ source: 'custom', sourceRef: 'langsmith' }),
    );

    const lint = lintReportTaxonomy(validated.report);
    expect(lint.issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-kind')).toHaveLength(0);
  });

  it('fails clearly when pass/fail cannot be inferred', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'langsmith-ambiguous.json');
    await writeFile(inputPath, JSON.stringify({ runs: [{ id: 'ls-ambiguous' }] }), 'utf8');

    await expect(
      importFromSource({
        source: 'langsmith',
        inputPath,
        outPath: path.join(dir, '.evals_output', 'import-langsmith.json'),
      }),
    ).rejects.toThrow('Unable to infer pass/fail');
  });
});

it.each([
  [{ status: 'completed', score: 0.18 }, false],
  [{ status: 'completed', feedback: [{ key: 'correctness', value: false }] }, false],
  [{ status: 'completed', feedback: [{ key: 'correctness', score: 0.18 }] }, false],
  [{ status: 'completed', feedback_stats: { correctness: { avg: 0.18 } } }, false],
  [{ status: 'completed', score: 0.9 }, true],
  [{ status: 'completed' }, true],
  [{ status: 'failed', score: 0.9 }, false],
])('uses evaluation evidence before successful execution status: %j', async (row, passed) => {
  const dir = await createTempDir();
  const inputPath = path.join(dir, 'input.json');
  const outPath = path.join(dir, 'report.json');
  await writeFile(inputPath, JSON.stringify({ runs: [{ id: 'run', ...row }] }));
  await importFromSource({ source: 'langsmith', inputPath, outPath });
  const result = validateEvalReport(JSON.parse(await readFile(outPath, 'utf8')) as unknown);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.report.rows[0]?.passed).toBe(passed);
});
