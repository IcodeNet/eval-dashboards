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

describe('eval-ai-library import adapter', () => {
  it('resolves eval-ai-library as a valid import source', () => {
    expect(resolveImportSource('eval-ai-library')).toBe('eval-ai-library');
  });

  it('imports eval-ai-library test case results into a valid eval-report/v1 artifact', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, '.evals_output', 'import-eval-ai-library.json');

    const imported = await importFromSource({
      source: 'eval-ai-library',
      inputPath: path.join(fixturesDir, 'eval-ai-library-sample.json'),
      outPath,
      suiteName: 'eval-ai-library-checks',
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    // eval-ai-1: success=true -> passed. eval-ai-2: success=false -> failed.
    expect(validated.report.suites).toEqual([
      expect.objectContaining({ id: 'eval-ai-library-checks', total: 2, passed: 1, failed: 1 }),
    ]);

    expect(validated.report.rows.map((row) => row.id)).toEqual(['eval-ai-1', 'eval-ai-2']);
    expect(validated.report.rows[0]?.passed).toBe(true);
    expect(validated.report.rows[1]?.passed).toBe(false);
    expect(validated.report.rows[0]?.category).toBe('relevance');
    expect(validated.report.rows[1]?.category).toBe('jailbreak');
    expect(validated.report.rows[0]?.metadata?.provenance).toEqual(
      expect.objectContaining({ source: 'custom', sourceRef: 'eval-ai-library' }),
    );

    const lint = lintReportTaxonomy(validated.report);
    expect(lint.issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-kind')).toHaveLength(0);
  });

  it('fails clearly when an eval-ai-library row has no success flag or metrics', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'eval-ai-library-empty.json');
    await writeFile(inputPath, JSON.stringify({ results: [{ id: 'no-signal' }] }), 'utf8');

    await expect(
      importFromSource({
        source: 'eval-ai-library',
        inputPath,
        outPath: path.join(dir, '.evals_output', 'import-eval-ai-library.json'),
      }),
    ).rejects.toThrow('Unable to infer pass/fail');
  });
});
