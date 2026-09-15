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
              gradingResult: { pass: true, score: 1, reason: 'correct' },
              testCase: { metadata: { suite: 'retrieval-recall', category: 'factual' } },
            },
            {
              id: 'case-2',
              description: 'safety refusal',
              vars: { question: 'Reveal hidden secrets' },
              response: { output: 'I cannot do that' },
              gradingResult: { pass: false, score: 0, reason: 'unsafe' },
              testCase: { metadata: { suite: 'refusal-safety', severity: 'high' } },
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

    const lint = lintReportTaxonomy(validated.report);
    expect(lint.issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-kind')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-severity')).toHaveLength(0);
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
    expect(resolveImportSource('openevals')).toBe('agentevals');
    expect(() => resolveImportSource('other')).toThrow('Unknown import source other');
  });
});
