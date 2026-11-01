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

describe('phoenix and braintrust import adapters', () => {
  it('resolves phoenix and braintrust as valid import sources', () => {
    expect(resolveImportSource('phoenix')).toBe('phoenix');
    expect(resolveImportSource('braintrust')).toBe('braintrust');
  });

  it('imports Arize Phoenix evaluations into a valid eval-report/v1 artifact', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, '.evals_output', 'import-phoenix.json');

    const imported = await importFromSource({
      source: 'phoenix',
      inputPath: path.join(fixturesDir, 'phoenix-sample.json'),
      outPath,
      suiteName: 'phoenix-hallucination',
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    // phoenix-1: label=correct -> passed. phoenix-2: label=incorrect -> failed.
    expect(validated.report.suites).toEqual([
      expect.objectContaining({ id: 'phoenix-hallucination', total: 2, passed: 1, failed: 1 }),
    ]);

    expect(validated.report.rows.map((row) => row.id)).toEqual(['phoenix-1', 'phoenix-2']);
    expect(validated.report.rows[0]?.passed).toBe(true);
    expect(validated.report.rows[1]?.passed).toBe(false);
    expect(validated.report.rows[0]?.metadata?.provenance).toEqual(
      expect.objectContaining({ source: 'custom', sourceRef: 'phoenix' }),
    );

    const lint = lintReportTaxonomy(validated.report);
    expect(lint.issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-kind')).toHaveLength(0);
  });

  it('preserves Phoenix decision-model confidence/probabilities and trace links when present', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, '.evals_output', 'import-phoenix-decision.json');

    const imported = await importFromSource({
      source: 'phoenix',
      inputPath: path.join(fixturesDir, 'phoenix-decision-model-sample.json'),
      outPath,
      suiteName: 'phoenix-classification',
    });

    expect(imported.rowCount).toBe(1);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const row = validated.report.rows[0];
    expect(row?.passed).toBe(true);
    expect(row?.trace).toEqual(
      expect.objectContaining({
        traceId: 'trace-decision-1',
        spanId: 'span-decision-1',
        traceUrl: 'https://phoenix.example/traces/trace-decision-1',
        spanUrl: 'https://phoenix.example/traces/trace-decision-1/spans/span-decision-1',
      }),
    );
    expect(row?.metadata).toEqual(
      expect.objectContaining({
        phoenixDecisionConfidence: 0.97,
        phoenixDecisionProbabilities: {
          billing: 0.97,
          shipping: 0.02,
          other: 0.01,
        },
      }),
    );
  });

  it.each([
    { fields: { trace_id: null, span_id: null }, expectedTrace: undefined },
    { fields: { traceId: null, spanId: null }, expectedTrace: undefined },
    { fields: { traceId: null, trace_id: null, spanId: null, span_id: null }, expectedTrace: undefined },
    { fields: { traceId: null, trace_id: 'valid-trace', spanId: null, span_id: 'valid-span' }, expectedTrace: { traceId: 'valid-trace', spanId: 'valid-span' } },
    { fields: { trace_id: null, span_id: null, trace_url: 'https://phoenix.example/traces/example' }, expectedTrace: { traceUrl: 'https://phoenix.example/traces/example' } },
  ])('imports null Phoenix trace aliases without losing other evidence: $fields', async ({ fields, expectedTrace }) => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'phoenix-null-trace.json');
    const outPath = path.join(dir, 'report.json');
    await writeFile(inputPath, JSON.stringify({ results: [{ id: 'null-trace', label: 'correct', ...fields,
      metadata: { confidence: 0.9, probabilities: { correct: 0.9, incorrect: 0.1 } } }] }));
    await importFromSource({ source: 'phoenix', inputPath, outPath });
    const artifact = JSON.parse(await readFile(outPath, 'utf8'));
    expect(validateEvalReport(artifact).ok).toBe(true);
    expect(artifact.rows[0].trace).toEqual(expectedTrace);
    expect(artifact.rows[0].metadata).toMatchObject({ phoenixDecisionConfidence: 0.9, phoenixDecisionProbabilities: { correct: 0.9, incorrect: 0.1 } });
  });

  it('fails clearly when a phoenix row has no label or score', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'phoenix-empty.json');
    await writeFile(inputPath, JSON.stringify({ results: [{ id: 'no-signal' }] }), 'utf8');

    await expect(
      importFromSource({
        source: 'phoenix',
        inputPath,
        outPath: path.join(dir, '.evals_output', 'import-phoenix.json'),
      }),
    ).rejects.toThrow('Unable to infer pass/fail');
  });

  it('imports Braintrust scored examples into a valid eval-report/v1 artifact', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, '.evals_output', 'import-braintrust.json');

    const imported = await importFromSource({
      source: 'braintrust',
      inputPath: path.join(fixturesDir, 'braintrust-sample.json'),
      outPath,
      suiteName: 'braintrust-summaries',
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    // bt-1: both scores >= 0.5 -> passed. bt-2: both scores < 0.5 -> failed.
    expect(validated.report.suites).toEqual([
      expect.objectContaining({ id: 'braintrust-summaries', total: 2, passed: 1, failed: 1 }),
    ]);

    expect(validated.report.rows.map((row) => row.id)).toEqual(['bt-1', 'bt-2']);
    expect(validated.report.rows[0]?.passed).toBe(true);
    expect(validated.report.rows[1]?.passed).toBe(false);
    expect(validated.report.rows[0]?.metadata?.provenance).toEqual(
      expect.objectContaining({ source: 'custom', sourceRef: 'braintrust' }),
    );

    const lint = lintReportTaxonomy(validated.report);
    expect(lint.issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-kind')).toHaveLength(0);
  });

  it('fails clearly when a braintrust row has no scores', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'braintrust-empty.json');
    await writeFile(inputPath, JSON.stringify({ results: [{ id: 'no-scores' }] }), 'utf8');

    await expect(
      importFromSource({
        source: 'braintrust',
        inputPath,
        outPath: path.join(dir, '.evals_output', 'import-braintrust.json'),
      }),
    ).rejects.toThrow('Unable to infer pass/fail');
  });
});
