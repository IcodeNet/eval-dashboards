import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { validateEvalReport } from '../src/model/validate.js';
import { lintReportTaxonomy } from '../src/gates/lint-taxonomy.js';
import { importFromSource } from '../src/cli/import-adapters.js';

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

describe('ragas and langfuse import adapters', () => {
  it('imports ragas scores into a valid eval-report/v1 artifact', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, '.evals_output', 'import-ragas.json');

    const imported = await importFromSource({
      source: 'ragas',
      inputPath: path.join(fixturesDir, 'ragas-sample.json'),
      outPath,
      suiteName: 'rag-quality',
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const parsedReport = JSON.parse(reportRaw) as unknown;
    const validated = validateEvalReport(parsedReport);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    // ragas-1: all metrics >= 0.5 threshold -> passed. ragas-2: all metrics < 0.5 -> failed.
    expect(validated.report.suites).toEqual([
      expect.objectContaining({ id: 'rag-quality', total: 2, passed: 1, failed: 1 }),
    ]);

    expect(validated.report.rows.map((row) => row.id)).toEqual(['ragas-1', 'ragas-2']);
    expect(validated.report.rows[0]?.passed).toBe(true);
    expect(validated.report.rows[1]?.passed).toBe(false);
    expect(validated.report.rows[0]?.metadata?.provenance).toEqual(
      expect.objectContaining({ source: 'custom', sourceRef: 'ragas' }),
    );

    const lint = lintReportTaxonomy(validated.report);
    expect(lint.issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-kind')).toHaveLength(0);
  });

  it('fails clearly when a ragas row has no known metric columns', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'ragas-empty.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(inputPath, JSON.stringify({ scores: [{ id: 'no-metrics' }] }), 'utf8');

    await expect(
      importFromSource({
        source: 'ragas',
        inputPath,
        outPath: path.join(dir, '.evals_output', 'import-ragas.json'),
      }),
    ).rejects.toThrow('Unable to infer pass/fail');
  });

  it('imports langfuse scores into a valid eval-report/v1 artifact', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, '.evals_output', 'import-langfuse.json');

    const imported = await importFromSource({
      source: 'langfuse',
      inputPath: path.join(fixturesDir, 'langfuse-sample.json'),
      outPath,
      suiteName: 'trace-scores',
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    // score-1: explicit boolean value=true -> passed. score-2: numeric value=0.1 < 0.5 -> failed.
    expect(validated.report.suites).toEqual([
      expect.objectContaining({ id: 'trace-scores', total: 2, passed: 1, failed: 1 }),
    ]);

    expect(validated.report.rows.map((row) => row.id)).toEqual(['score-1', 'score-2']);
    expect(validated.report.rows[0]?.passed).toBe(true);
    expect(validated.report.rows[1]?.passed).toBe(false);
    expect(validated.report.rows[0]?.metadata?.provenance).toEqual(
      expect.objectContaining({ source: 'custom', sourceRef: 'langfuse' }),
    );

    const lint = lintReportTaxonomy(validated.report);
    expect(lint.issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-kind')).toHaveLength(0);
  });


  it('preserves langfuse score metadata and provenance fields when present', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, '.evals_output', 'import-langfuse-provenance.json');

    const imported = await importFromSource({
      source: 'langfuse',
      inputPath: path.join(fixturesDir, 'langfuse-provenance-sample.json'),
      outPath,
      suiteName: 'trace-scores',
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.report.rows[0]?.metadata).toEqual(
      expect.objectContaining({
        langfuseScoreMetadata: { dimension: 'factuality', reviewer: 'auto' },
        langfuseScoreProvenance: {
          author_user_id: 'user-123',
          config_id: 'cfg-1',
          execution_trace_id: 'exec-trace-a',
        },
      }),
    );

    expect(validated.report.rows[1]?.metadata).toEqual(
      expect.objectContaining({
        langfuseScoreProvenance: {
          author_user_id: 'user-456',
          config_id: 'cfg-2',
          queue_id: 'queue-9',
          evaluator_id: 'eval-17',
          evaluation_rule_id: 'rule-5',
          execution_trace_id: 'exec-trace-b',
        },
      }),
    );
  });

  it.each([
    {
      label: 'camelCase grouped fields',
      fields: { scoreMetadata: { dimension: 'safety' }, scoreProvenance: { evaluator_id: 'judge-1' } },
      metadata: { dimension: 'safety' },
      provenance: { evaluator_id: 'judge-1' },
    },
    {
      label: 'scheduled export metadata column',
      fields: { metadata: { dimension: 'safety', revision: 2 }, execution_trace_id: 'judge-trace' },
      metadata: { dimension: 'safety', revision: 2 },
      provenance: { execution_trace_id: 'judge-trace' },
    },
    {
      label: 'flattened fields overriding nested provenance',
      fields: {
        score_metadata: { dimension: 'safety' },
        scoreMetadata: { dimension: 'ignored' },
        score_provenance: { evaluator_id: 'old', config_id: 'retained', extra: { revision: 3 } },
        evaluator_id: 'current',
      },
      metadata: { dimension: 'safety' },
      provenance: { evaluator_id: 'current', config_id: 'retained', extra: { revision: 3 } },
    },
    {
      label: 'absent optional evidence',
      fields: {},
      metadata: undefined,
      provenance: undefined,
    },
    {
      label: 'malformed optional groups',
      fields: { score_metadata: ['invalid'], score_provenance: 'invalid' },
      metadata: undefined,
      provenance: undefined,
    },
  ])('preserves Langfuse evidence for $label', async ({ fields, metadata, provenance }) => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'scores.json');
    const outPath = path.join(dir, 'report.json');
    await writeFile(inputPath, JSON.stringify([{ id: 'score-1', value: true, ...fields }]));

    await importFromSource({ source: 'langfuse', inputPath, outPath });
    const validated = validateEvalReport(JSON.parse(await readFile(outPath, 'utf8')));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const row = validated.report.rows[0]!;
    expect(row.passed).toBe(true);
    expect(row.metadata?.langfuseScoreMetadata).toEqual(metadata);
    expect(row.metadata?.langfuseScoreProvenance).toEqual(provenance);
    expect(row.metadata?.provenance).toMatchObject({ sourceRef: 'langfuse' });
  });

  it('fails clearly when a langfuse score cannot be resolved to pass/fail', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'langfuse-ambiguous.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      inputPath,
      JSON.stringify({ data: [{ id: 'ambiguous', name: 'notes', dataType: 'TEXT' }] }),
      'utf8',
    );

    await expect(
      importFromSource({
        source: 'langfuse',
        inputPath,
        outPath: path.join(dir, '.evals_output', 'import-langfuse.json'),
      }),
    ).rejects.toThrow('Unable to infer pass/fail');
  });
});
