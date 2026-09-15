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

describe('openai-evals import adapter', () => {
  it('resolves openai-evals as a valid import source', () => {
    expect(resolveImportSource('openai-evals')).toBe('openai-evals');
  });

  it('imports an oaieval JSONL events log into a valid eval-report/v1 artifact', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, '.evals_output', 'import-openai-evals.json');

    const imported = await importFromSource({
      source: 'openai-evals',
      inputPath: path.join(fixturesDir, 'openai-evals-sample.jsonl'),
      outPath,
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    // The spec event's eval_name becomes the suite; sample 1 is correct=true,
    // sample 2 is correct=false.
    expect(validated.report.suites).toEqual([
      expect.objectContaining({ id: 'match_return_policy.test.v1', total: 2, passed: 1, failed: 1 }),
    ]);

    expect(validated.report.rows.map((row) => row.id)).toEqual([
      'match_return_policy.test.1',
      'match_return_policy.test.2',
    ]);
    expect(validated.report.rows[0]?.passed).toBe(true);
    expect(validated.report.rows[1]?.passed).toBe(false);
    expect(validated.report.rows[0]?.output).toBe('Returns are accepted within 30 days.');
    expect(validated.report.rows[0]?.metadata?.provenance).toEqual(
      expect.objectContaining({ source: 'custom', sourceRef: 'openai-evals' }),
    );

    const lint = lintReportTaxonomy(validated.report);
    expect(lint.issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-kind')).toHaveLength(0);
  });

  it('falls back to a score threshold when no correct boolean is present', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'openai-evals-score.jsonl');
    await writeFile(
      inputPath,
      [
        JSON.stringify({ spec: { eval_name: 'score-based-eval' } }),
        JSON.stringify({ sample_id: 'score.1', type: 'metrics', data: { score: 0.8 } }),
        JSON.stringify({ sample_id: 'score.2', type: 'metrics', data: { score: 0.2 } }),
      ].join('\n'),
      'utf8',
    );

    const outPath = path.join(dir, '.evals_output', 'import-openai-evals-score.json');
    const imported = await importFromSource({ source: 'openai-evals', inputPath, outPath });
    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.report.rows[0]?.passed).toBe(true);
    expect(validated.report.rows[1]?.passed).toBe(false);
  });

  it('fails clearly when no oaieval sample result events are found', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'openai-evals-empty.json');
    await writeFile(
      inputPath,
      JSON.stringify({ events: [{ spec: { eval_name: 'empty' } }, { final_report: { accuracy: 0 } }] }),
      'utf8',
    );

    await expect(
      importFromSource({
        source: 'openai-evals',
        inputPath,
        outPath: path.join(dir, '.evals_output', 'import-openai-evals.json'),
      }),
    ).rejects.toThrow('No OpenAI evals sample result events found');
  });
});
