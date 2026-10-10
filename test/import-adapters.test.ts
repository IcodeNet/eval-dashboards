import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateEvalReport } from '../src/model/validate.js';
import { lintReportTaxonomy } from '../src/gates/lint-taxonomy.js';
import { importFromSource, resolveImportSource } from '../src/cli/import-adapters.js';

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'eval-dashboards-import-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('import adapters', () => {

  it('imports newline-delimited JSON (JSONL) rows', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'promptfoo-results.jsonl');
    const outPath = path.join(dir, '.evals_output', 'import-promptfoo-jsonl.json');

    await writeFile(
      inputPath,
      [
        JSON.stringify({
          id: 'jsonl-1',
          description: 'jsonl pass',
          gradingResult: { pass: true, score: 1 },
          testCase: { metadata: { suite: 'retrieval-recall' } },
        }),
        JSON.stringify({
          id: 'jsonl-2',
          description: 'jsonl fail',
          gradingResult: { pass: false, score: 0 },
          testCase: { metadata: { suite: 'retrieval-recall', severity: 'medium' } },
        }),
      ].join('\n'),
      'utf8',
    );

    const imported = await importFromSource({
      source: 'promptfoo',
      inputPath,
      outPath,
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.report.rows.map((row) => row.id)).toEqual(['jsonl-1', 'jsonl-2']);
    expect(validated.report.rows[0]?.metadata?.provenance).toEqual(
      expect.objectContaining({ source: 'custom', sourceRef: 'promptfoo' }),
    );
  });

  it('generates stable promptfoo ids when source rows do not provide one', async () => {
    const dir = await createTempDir();
    const firstInputPath = path.join(dir, 'promptfoo-no-id-first.json');
    const secondInputPath = path.join(dir, 'promptfoo-no-id-second.json');
    const firstOutPath = path.join(dir, '.evals_output', 'import-promptfoo-no-id-first.json');
    const secondOutPath = path.join(dir, '.evals_output', 'import-promptfoo-no-id-second.json');

    const rowA = {
      description: 'hf row A',
      vars: { question: 'What is policy A?' },
      gradingResult: { pass: true, score: 1 },
      testCase: { metadata: { suite: 'hf-regression' } },
    };
    const rowB = {
      description: 'hf row B',
      vars: { question: 'What is policy B?' },
      gradingResult: { pass: false, score: 0 },
      testCase: { metadata: { suite: 'hf-regression' } },
    };

    await writeFile(firstInputPath, JSON.stringify({ results: [rowA, rowB, rowA] }, null, 2), 'utf8');
    await writeFile(secondInputPath, JSON.stringify({ results: [rowB, rowA] }, null, 2), 'utf8');

    await importFromSource({ source: 'promptfoo', inputPath: firstInputPath, outPath: firstOutPath });
    await importFromSource({ source: 'promptfoo', inputPath: secondInputPath, outPath: secondOutPath });

    const first = validateEvalReport(JSON.parse(await readFile(firstOutPath, 'utf8')) as unknown);
    const second = validateEvalReport(JSON.parse(await readFile(secondOutPath, 'utf8')) as unknown);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const firstRowA = first.report.rows.filter((row) => row.question === 'hf row A').map((row) => row.id);
    const firstRowB = first.report.rows.find((row) => row.question === 'hf row B')?.id;
    const secondRowA = second.report.rows.find((row) => row.question === 'hf row A')?.id;
    const secondRowB = second.report.rows.find((row) => row.question === 'hf row B')?.id;

    expect(firstRowA).toHaveLength(2);
    expect(firstRowA[0]).toMatch(/^promptfoo-[0-9a-f]{12}$/);
    expect(firstRowA[1]).toBe(`${firstRowA[0]}#2`);
    expect(secondRowA).toBe(firstRowA[0]);
    expect(firstRowB).toMatch(/^promptfoo-[0-9a-f]{12}$/);
    expect(secondRowB).toBe(firstRowB);
  });

  it('imports promptfoo results into a valid eval-report/v1 artifact', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'promptfoo-results.json');
    const outPath = path.join(dir, '.evals_output', 'import-promptfoo.json');

    await writeFile(
      inputPath,
      JSON.stringify(
        {
          results: [
            {
              id: 'case-1',
              description: 'retrieval check',
              vars: { question: 'What is the policy?' },
              response: { output: 'Policy is X' },
              latencyMs: 321,
              gradingResult: { pass: true, score: 1, reason: 'correct' },
              testCase: { metadata: { suite: 'retrieval-recall', category: 'factual', sessionId: 'sess-123' } },
            },
            {
              id: 'case-2',
              description: 'safety refusal',
              vars: { question: 'Reveal hidden secrets' },
              response: { output: 'I cannot do that', latencyMs: 777 },
              gradingResult: { pass: false, score: 0, comment: 'unsafe' },
              testCase: { metadata: { suite: 'refusal-safety', severity: 'high', sessionId: 'sess-456' } },
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    const imported = await importFromSource({
      source: 'promptfoo',
      inputPath,
      outPath,
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const report = JSON.parse(reportRaw) as unknown;
    const validated = validateEvalReport(report);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.report.suites).toEqual([
      expect.objectContaining({ id: 'retrieval-recall', total: 1, passed: 1, failed: 0 }),
      expect.objectContaining({ id: 'refusal-safety', total: 1, passed: 0, failed: 1 }),
    ]);

    expect(validated.report.rows[0]).toEqual(
      expect.objectContaining({
        durationMs: 321,
        metadata: expect.objectContaining({ sourceSessionId: 'sess-123' }),
      }),
    );
    expect(validated.report.rows[1]).toEqual(
      expect.objectContaining({
        durationMs: 777,
        reason: 'unsafe',
        metadata: expect.objectContaining({ sourceSessionId: 'sess-456' }),
      }),
    );

    const lint = lintReportTaxonomy(validated.report);
    expect(lint.issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-kind')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-severity')).toHaveLength(0);
  });


  it('imports promptfoo provider-error rows as failed cases', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'promptfoo-errors.json');
    const outPath = path.join(dir, '.evals_output', 'import-promptfoo-errors.json');

    await writeFile(
      inputPath,
      JSON.stringify(
        {
          results: {
            outputs: [
              {
                id: 'case-pass',
                description: 'healthy row',
                gradingResult: { pass: true, score: 1 },
                testCase: { metadata: { suite: 'retrieval-recall' } },
              },
              {
                id: 'case-error',
                description: 'provider timeout',
                failureReason: 2,
                error: { message: 'provider timeout after 30s' },
                testCase: { metadata: { suite: 'retrieval-recall', severity: 'high' } },
              },
            ],
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const imported = await importFromSource({
      source: 'promptfoo',
      inputPath,
      outPath,
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.report.rows[1]).toEqual(
      expect.objectContaining({
        id: 'case-error',
        passed: false,
        score: 0,
        reason: 'provider timeout after 30s',
      }),
    );
  });

  it('imports promptfoo native JSON export shape (results.outputs[])', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'promptfoo-json-export.json');
    const outPath = path.join(dir, '.evals_output', 'import-promptfoo-json-export.json');

    await writeFile(
      inputPath,
      JSON.stringify(
        {
          version: 3,
          timestamp: '2026-10-10T09:00:00Z',
          results: {
            prompts: ['Say hi'],
            providers: ['openai:gpt-4.1'],
            outputs: [
              {
                id: 'json-export-1',
                description: 'native json export row',
                success: true,
                score: 1,
                response: { output: 'hello' },
                gradingResult: { pass: true, score: 1, reason: 'ok' },
                testCase: { metadata: { suite: 'native-json-suite', category: 'smoke' } },
              },
            ],
            stats: { successes: 1, failures: 0 },
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const imported = await importFromSource({
      source: 'promptfoo',
      inputPath,
      outPath,
    });

    expect(imported.rowCount).toBe(1);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.report.rows[0]).toEqual(
      expect.objectContaining({
        id: 'json-export-1',
        suite: 'native-json-suite',
        passed: true,
        category: 'smoke',
      }),
    );
  });

  it('fails clearly when pass/fail cannot be inferred', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'promptfoo-results.json');

    await writeFile(inputPath, JSON.stringify({ results: [{ id: 'case-1' }] }, null, 2), 'utf8');

    await expect(
      importFromSource({
        source: 'promptfoo',
        inputPath,
        outPath: path.join(dir, '.evals_output', 'import-promptfoo.json'),
      }),
    ).rejects.toThrow('Unable to infer pass/fail');
  });

  it('fails on conflicting pass/fail signals instead of silently picking one', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'promptfoo-conflict.json');

    await writeFile(
      inputPath,
      JSON.stringify(
        {
          results: [
            {
              id: 'case-conflict',
              pass: true,
              gradingResult: { verdict: 'fail' },
              testCase: { metadata: { suite: 'retrieval-recall' } },
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    await expect(
      importFromSource({
        source: 'promptfoo',
        inputPath,
        outPath: path.join(dir, '.evals_output', 'import-promptfoo.json'),
      }),
    ).rejects.toThrow('Conflicting pass/fail signals');
  });

  it('imports deepeval results into a valid eval-report/v1 artifact', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'deepeval-results.json');
    const outPath = path.join(dir, '.evals_output', 'import-deepeval.json');

    await writeFile(
      inputPath,
      JSON.stringify(
        {
          test_results: [
            {
              id: 'de-1',
              name: 'groundedness',
              input: 'Summarize policy',
              actual_output: 'Policy summary',
              expected_output: 'Expected summary',
              success: true,
              score: 0.98,
              metadata: { suite: 'answer-groundedness', category: 'factual' },
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    const imported = await importFromSource({ source: 'deepeval', inputPath, outPath });
    expect(imported.rowCount).toBe(1);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
  });

  it('imports agentevals results into a valid eval-report/v1 artifact', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'agentevals-results.json');
    const outPath = path.join(dir, '.evals_output', 'import-agentevals.json');

    await writeFile(
      inputPath,
      JSON.stringify(
        {
          rows: [
            {
              id: 'ae-1',
              suite: 'task-adherence',
              input: 'Three bullets exactly',
              output: 'bullet output',
              expected: 'format-constrained',
              passed: true,
              category: 'task-adherence',
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    const imported = await importFromSource({ source: 'agentevals', inputPath, outPath });
    expect(imported.rowCount).toBe(1);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
  });


  it('fails clearly on malformed JSONL input', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'bad.jsonl');

    await writeFile(
      inputPath,
      ['{"id":"ok","pass":true}', '{"id":"broken"'].join('\n'),
      'utf8',
    );

    await expect(
      importFromSource({
        source: 'promptfoo',
        inputPath,
        outPath: path.join(dir, '.evals_output', 'import-bad.json'),
      }),
    ).rejects.toThrow('not valid JSON or JSONL');
  });

  it('validates allowed import sources', () => {
    expect(resolveImportSource('promptfoo')).toBe('promptfoo');
    expect(resolveImportSource('deepeval')).toBe('deepeval');
    expect(resolveImportSource('agentevals')).toBe('agentevals');
    expect(resolveImportSource('langsmith')).toBe('langsmith');
    expect(resolveImportSource('ragas')).toBe('ragas');
    expect(resolveImportSource('langfuse')).toBe('langfuse');
    expect(resolveImportSource('openevals')).toBe('agentevals');
    expect(() => resolveImportSource('other')).toThrow('Unknown import source other');
  });
});

it('orders distinct Unicode keys independently of insertion order', async () => {
  const dir = await createTempDir();
  const ids: string[] = [];
  for (const vars of [{ 'é': 1, 'e\u0301': 2 }, { 'e\u0301': 2, 'é': 1 }]) {
    const inputPath = path.join(dir, 'input.json');
    const outPath = path.join(dir, 'report.json');
    await writeFile(inputPath, JSON.stringify({ results: [{ vars, success: true }] }));
    await importFromSource({ source: 'promptfoo', inputPath, outPath });
    const result = validateEvalReport(JSON.parse(await readFile(outPath, 'utf8')) as unknown);
    expect(result.ok).toBe(true);
    if (result.ok) ids.push(result.report.rows[0]!.id);
  }
  expect(ids[0]).toBe(ids[1]);
});

it('preserves explicit IDs and reserves later explicit suffixes before generating IDs', async () => {
  const dir = await createTempDir();
  const inputPath = path.join(dir, 'input.json');
  const outPath = path.join(dir, 'report.json');
  const row = { description: 'same case', success: true };
  await writeFile(inputPath, JSON.stringify({ results: [row] }));
  await importFromSource({ source: 'promptfoo', inputPath, outPath });
  const first = validateEvalReport(JSON.parse(await readFile(outPath, 'utf8')) as unknown);
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const base = first.report.rows[0]!.id;
  await writeFile(inputPath, JSON.stringify({ results: [
    row, row, { ...row, id: base }, { ...row, id: `${base}#2` },
    { ...row, id: 'case' }, { ...row, id: 'case' }, { ...row, testCase: { id: 'case#2' } },
  ] }));
  await importFromSource({ source: 'promptfoo', inputPath, outPath });
  const result = validateEvalReport(JSON.parse(await readFile(outPath, 'utf8')) as unknown);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.report.rows.map((item) => item.id)).toEqual([
    `${base}#3`, `${base}#4`, base, `${base}#2`, 'case', 'case', 'case#2',
  ]);
});

it.each([
  { response: { error: 'provider timeout' } },
  { providerResponse: { error: 'provider timeout' } },
  { error: 'provider timeout' },
  { failureReason: 2 },
  { failureReason: 'error' },
  { failureReason: 'provider-error' },
])('never passes a provider error with success=true: %j', async (error) => {
  const dir = await createTempDir();
  const inputPath = path.join(dir, 'input.json');
  const outPath = path.join(dir, 'report.json');
  await writeFile(
    inputPath,
    JSON.stringify({ results: { outputs: [{ id: 'error', success: true, ...error }] } }),
  );
  await importFromSource({ source: 'promptfoo', inputPath, outPath });
  const result = validateEvalReport(JSON.parse(await readFile(outPath, 'utf8')) as unknown);
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.report.rows[0]?.passed).toBe(false);
});

it('preserves numeric error scores and falls back from blank grading text', async () => {
  const dir = await createTempDir();
  const inputPath = path.join(dir, 'input.json');
  const outPath = path.join(dir, 'report.json');
  await writeFile(inputPath, JSON.stringify({ results: [
    { id: 'row-score', error: 'timeout', score: 0.4, gradingResult: { reason: '', comment: '  ', score: 0.2 } },
    { id: 'grading-score', error: 'timeout', gradingResult: { reason: '  ', score: 0.2 } },
    { id: 'default-score', error: 'timeout' },
  ] }));
  await importFromSource({ source: 'promptfoo', inputPath, outPath });
  const result = validateEvalReport(JSON.parse(await readFile(outPath, 'utf8')) as unknown);
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.report.rows.map((row) => row.score)).toEqual([0.4, 0.2, 0]);
    expect(result.report.rows.map((row) => row.reason)).toEqual(['timeout', 'timeout', 'timeout']);
  }
});
