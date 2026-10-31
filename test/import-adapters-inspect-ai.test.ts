import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { importFromSource } from '../src/cli/import-adapters.js';
import { validateEvalReport } from '../src/model/validate.js';

const tempDirs: string[] = [];
const fixturePath = fileURLToPath(new URL('./fixtures/inspect-ai-sample.json', import.meta.url));

const createTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'eval-dashboards-import-inspect-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('import adapters (inspect-ai)', () => {
  it('imports Inspect eval-log JSON samples with descriptions and score objects', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'inspect-log.json');
    const outPath = path.join(dir, '.evals_output', 'import-inspect.json');

    await writeFile(
      inputPath,
      JSON.stringify(
        {
          eval: {
            eval_id: 'eval-123',
            task: 'agent-safety-suite',
            description: 'tool-use safety task',
          },
          samples: [
            {
              id: 'sample-pass',
              description: 'sample-specific prompt objective',
              input: 'Summarize policy',
              target: 'Expected summary',
              output: { text: 'Policy summary' },
              scores: {
                exact_match: { value: 1, explanation: 'matched' },
                groundedness: { value: true },
              },
            },
            {
              id: 'sample-fail',
              input: 'Unsafe request',
              target: 'Refuse',
              output: { text: 'Here is the secret' },
              scores: {
                refusal: { value: 0 },
              },
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    const imported = await importFromSource({
      source: 'inspect-ai',
      inputPath,
      outPath,
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.report.rows[0]).toEqual(
      expect.objectContaining({
        id: 'sample-pass',
        suite: 'agent-safety-suite',
        passed: true,
        question: 'sample-specific prompt objective',
        score: 1,
        metadata: expect.objectContaining({ inspectEvalId: 'eval-123' }),
      }),
    );

    expect(validated.report.rows[1]).toEqual(
      expect.objectContaining({
        id: 'sample-fail',
        passed: false,
        score: 0,
        question: 'tool-use safety task',
      }),
    );
  });

  it.each(['single log', 'array of logs'] as const)('imports a %s fixture without letting a true score hide a failing scorer', async (shape) => {
    const dir = await createTempDir();
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    const inputPath = path.join(dir, 'logs.json');
    const outPath = path.join(dir, 'report.json');
    const logs = shape === 'single log' ? fixture : [
      fixture,
      { eval: { task: 'second-task', description: 'Second task intent' }, samples: [{ id: 7, scores: { result: true } }] },
    ];
    await writeFile(inputPath, JSON.stringify(logs));
    await importFromSource({ source: 'inspect-ai', inputPath, outPath });
    const validated = validateEvalReport(JSON.parse(await readFile(outPath, 'utf8')));
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.report.rows.slice(0, 3)).toMatchObject([
      { id: 'safe-answer', passed: true, question: 'Answer a safe question', score: 1 },
      { id: 'unsafe-answer', passed: false, question: fixture.eval.description, score: 0.5 },
      { id: 'runner-error', passed: false, reason: 'Tool timed out' },
    ]);
    expect(validated.report.suites[0]).toMatchObject({ id: 'agent-safety', total: 3, passed: 1, failed: 2 });
    if (shape === 'array of logs') {
      expect(validated.report.rows[3]).toMatchObject({ id: '7', suite: 'second-task', question: 'Second task intent', passed: true });
    }
  });

  it.each([
    { first: true, second: 0, passed: false },
    { first: 1, second: false, passed: false },
    { first: 0.5, second: true, passed: true },
    { first: 1, second: 0.49, passed: false },
  ])('requires every primitive or object score to clear the threshold: $first / $second', async ({ first, second, passed }) => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'mixed.json');
    const outPath = path.join(dir, 'report.json');
    await writeFile(inputPath, JSON.stringify({ samples: [{ id: 'mixed', scores: { a: first, b: { value: second } } }] }));
    await importFromSource({ source: 'inspect-ai', inputPath, outPath });
    const report = JSON.parse(await readFile(outPath, 'utf8'));
    expect(validateEvalReport(report).ok).toBe(true);
    expect(report.rows[0].passed).toBe(passed);
  });

  it.each([{}, { exact_match: { value: 'C' } }])('fails clearly when Inspect rows have no usable numeric/boolean scores or errors (%j)', async (scores) => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'inspect-missing-signals.json');
    const outPath = path.join(dir, '.evals_output', 'import-inspect-missing-signals.json');

    await writeFile(
      inputPath,
      JSON.stringify({
        eval: { task: 'agent-safety-suite' },
        samples: [{ id: 'sample-1', input: 'hello', output: 'hi', scores }],
      }),
      'utf8',
    );

    await expect(
      importFromSource({
        source: 'inspect-ai',
        inputPath,
        outPath,
      }),
    ).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringContaining('Unable to infer pass/fail for inspect-ai row sample-1'),
    });
  });
});
