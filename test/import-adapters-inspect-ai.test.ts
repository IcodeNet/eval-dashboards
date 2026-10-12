import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { importFromSource } from '../src/cli/import-adapters.js';
import { validateEvalReport } from '../src/model/validate.js';

const tempDirs: string[] = [];

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
      }),
    );
  });

  it('fails clearly when Inspect rows have neither scores nor errors', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'inspect-missing-signals.json');
    const outPath = path.join(dir, '.evals_output', 'import-inspect-missing-signals.json');

    await writeFile(
      inputPath,
      JSON.stringify({
        eval: { task: 'agent-safety-suite' },
        samples: [{ id: 'sample-1', input: 'hello', output: 'hi' }],
      }),
      'utf8',
    );

    await expect(
      importFromSource({
        source: 'inspect-ai',
        inputPath,
        outPath,
      }),
    ).rejects.toThrow('Unable to infer pass/fail for inspect-ai row sample-1');
  });
});
