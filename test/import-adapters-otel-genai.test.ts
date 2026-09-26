import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { validateEvalReport } from '../src/model/validate.js';
import { lintReportTaxonomy } from '../src/gates/lint-taxonomy.js';
import { importFromSource, resolveImportSource } from '../src/cli/import-adapters.js';
import { compareRuns } from '../src/history/history.js';

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

describe('otel-genai import adapter', () => {
  it('resolves otel-genai as a valid import source', () => {
    expect(resolveImportSource('otel-genai')).toBe('otel-genai');
  });

  it('maps gen_ai.evaluation.result span events into a valid eval-report/v1 artifact', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, '.evals_output', 'import-otel-genai.json');

    const imported = await importFromSource({
      source: 'otel-genai',
      inputPath: path.join(fixturesDir, 'otel-genai-sample.json'),
      outPath,
      suiteName: 'otel-genai-import',
    });

    expect(imported.rowCount).toBe(2);

    const reportRaw = await readFile(outPath, 'utf8');
    const validated = validateEvalReport(JSON.parse(reportRaw) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    expect(validated.report.suites).toEqual([
      expect.objectContaining({ id: 'otel-genai-import', total: 2, passed: 1, failed: 1 }),
    ]);

    const [passRow, failRow] = validated.report.rows;

    // span 00f067aa0ba902b7: score.label=pass -> passed, score.value=0.92.
    expect(passRow?.id).toBe('00f067aa0ba902b7:hallucination');
    expect(passRow?.judgeVerdict).toBe(true);
    expect(passRow?.passed).toBe(true);
    expect(passRow?.kind).toBe('llm-judge');
    expect(passRow?.score).toBe(0.92);
    expect(passRow?.judgeCategory).toBe('hallucination');
    expect(passRow?.judgeReasoning).toBe('Response is grounded in the retrieved context.');
    expect(passRow?.trace?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(passRow?.trace?.spanId).toBe('00f067aa0ba902b7');
    expect(passRow?.metadata?.provenance).toEqual(
      expect.objectContaining({ source: 'custom', sourceRef: 'otel-genai' }),
    );

    // span 11f067aa0ba902b8: score.label=fail -> failed, score.value=0.1.
    expect(failRow?.id).toBe('11f067aa0ba902b8:hallucination');
    expect(failRow?.judgeVerdict).toBe(false);
    expect(failRow?.passed).toBe(false);
    expect(failRow?.score).toBe(0.1);
    expect(failRow?.judgeCategory).toBe('hallucination');
    expect(failRow?.trace?.traceId).toBe('5cf92f3577b34da6a3ce929d0e0e4737');
    expect(failRow?.trace?.spanId).toBe('11f067aa0ba902b8');

    const lint = lintReportTaxonomy(validated.report);
    expect(lint.issues.filter((issue) => issue.level === 'error')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-kind')).toHaveLength(0);
    expect(lint.issues.filter((issue) => issue.code === 'missing-category')).toHaveLength(0);
    // category/reason stay populated so reporters and failure clustering work.
    expect(passRow?.category).toBe('hallucination');
    expect(passRow?.reason).toBe('Response is grounded in the retrieved context. (score.label=pass)');
  });

  it('keeps row ids unique when one span carries several evaluation events', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'otel-genai-multi.json');
    const { writeFile } = await import('node:fs/promises');
    const evaluation = (name: string, score: Record<string, unknown>) => ({
      name: 'gen_ai.evaluation.result',
      attributes: [
        { key: 'gen_ai.evaluation.name', value: { stringValue: name } },
        { key: 'gen_ai.evaluation.score.value', value: score },
      ],
    });
    await writeFile(
      inputPath,
      JSON.stringify({
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 't1',
                    spanId: 's1',
                    events: [
                      evaluation('relevance', { doubleValue: 0.8 }),
                      // OTLP/JSON encodes int64 values as strings. Higher is
                      // better for this metric, so 0 is a failure.
                      evaluation('faithfulness', { intValue: '0' }),
                      evaluation('faithfulness', { intValue: 1 }),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
      'utf8',
    );
    const outPath = path.join(dir, '.evals_output', 'import-otel-genai.json');

    await importFromSource({ source: 'otel-genai', inputPath, outPath });

    const validated = validateEvalReport(JSON.parse(await readFile(outPath, 'utf8')) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.report.rows.map((row) => row.id)).toEqual([
      's1:relevance',
      's1:faithfulness',
      's1:faithfulness#2',
    ]);
    expect(validated.report.rows[1]?.score).toBe(0);
    expect(validated.report.rows[1]?.passed).toBe(false);
    expect(validated.report.rows[1]?.reason).toContain('score.value=0 < 0.5 threshold');
    expect(validated.report.rows[2]?.score).toBe(1);
    expect(validated.report.rows[2]?.passed).toBe(true);
    const lint = lintReportTaxonomy(validated.report);
    expect(lint.issues.filter((issue) => issue.code === 'duplicate-row-key')).toHaveLength(0);
  });

  const writeJson = async (name: string, value: unknown): Promise<string> => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, name);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(inputPath, typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
    return inputPath;
  };

  const importRows = async (inputPath: string) => {
    const outPath = path.join(path.dirname(inputPath), '.evals_output', 'import-otel-genai.json');
    await importFromSource({ source: 'otel-genai', inputPath, outPath });
    const validated = validateEvalReport(JSON.parse(await readFile(outPath, 'utf8')) as unknown);
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error('invalid report');
    return validated.report.rows;
  };

  const spanExport = (spanId: string, attributes: unknown[]) => ({
    resourceSpans: [
      {
        scopeSpans: [
          { spans: [{ traceId: `trace-${spanId}`, spanId, events: [{ name: 'gen_ai.evaluation.result', attributes }] }] },
        ],
      },
    ],
  });

  const nameAttr = (name: string) => ({ key: 'gen_ai.evaluation.name', value: { stringValue: name } });
  const labelAttr = (label: string) => ({ key: 'gen_ai.evaluation.score.label', value: { stringValue: label } });

  it('reads JSONL with one export per line (OTel Collector file exporter)', async () => {
    const lines = [
      JSON.stringify(spanExport('a1', [nameAttr('relevance'), labelAttr('relevant')])),
      JSON.stringify(spanExport('b2', [nameAttr('relevance'), labelAttr('not_relevant')])),
    ].join('\n');
    const rows = await importRows(await writeJson('collector.jsonl', lines));

    expect(rows.map((row) => [row.id, row.passed])).toEqual([
      ['a1:relevance', true],
      ['b2:relevance', false],
    ]);
  });

  it('reads log-record encoded events from resourceLogs', async () => {
    const rows = await importRows(
      await writeJson('logs.json', {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    eventName: 'gen_ai.evaluation.result',
                    traceId: 'log-trace',
                    spanId: 'log-span',
                    attributes: [nameAttr('groundedness'), labelAttr('pass')],
                  },
                  {
                    // Older encoding: event name carried as an attribute.
                    attributes: [
                      { key: 'event.name', value: { stringValue: 'gen_ai.evaluation.result' } },
                      nameAttr('coherence'),
                      { key: 'gen_ai.evaluation.score.value', value: { doubleValue: 0.9 } },
                      { key: 'gen_ai.evaluation.score.label', value: { stringValue: 'coherent' } },
                    ],
                  },
                  { eventName: 'gen_ai.client.inference.operation.details', attributes: [] },
                ],
              },
            ],
          },
        ],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: 'log-span:groundedness',
        passed: true,
        trace: { traceId: 'log-trace', spanId: 'log-span' },
      }),
    );
    // Unrecognised label ("coherent") falls back to the numeric score; with no
    // spanId the id is positional.
    expect(rows[1]?.id).toBe('otel-genai-import-2:coherence');
    expect(rows[1]?.passed).toBe(true);
    expect(rows[1]?.trace).toBeUndefined();
    expect(rows[1]?.reason).toContain('score.value=0.9 >= 0.5 threshold');
  });

  it('records an evaluator error.type as a failed row instead of aborting the import', async () => {
    const rows = await importRows(
      await writeJson(
        'error.json',
        spanExport('e1', [nameAttr('relevance'), { key: 'error.type', value: { stringValue: 'timeout' } }]),
      ),
    );

    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: 'e1:relevance',
        passed: false,
        reason: 'evaluator error: timeout',
      }),
    );
    // The judge never produced a verdict, so judgeVerdict stays unset.
    expect(rows[0]?.judgeVerdict).toBeUndefined();
  });

  it('reads boolValue attributes without breaking verdict inference', async () => {
    const rows = await importRows(
      await writeJson(
        'bool.json',
        spanExport('c3', [nameAttr('refusal'), labelAttr('fail'), { key: 'custom.flag', value: { boolValue: true } }]),
      ),
    );
    expect(rows[0]?.passed).toBe(false);
  });

  describe('--case-id-attribute (stable ids across runs)', () => {
    const caseAttr = (id: string) => ({ key: 'eval.case.id', value: { stringValue: id } });

    // One run = two cases, each on its own span with random-looking ids.
    // The case id sits on the span; the resource carries a run-level default
    // that must NOT win over the span value.
    const runExport = (spanIds: [string, string], labels: [string, string]) => ({
      resourceSpans: [
        {
          resource: { attributes: [caseAttr('resource-level-default')] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: `trace-${spanIds[0]}`,
                  spanId: spanIds[0],
                  attributes: [caseAttr('case-refund-policy')],
                  events: [{ name: 'gen_ai.evaluation.result', attributes: [nameAttr('relevance'), labelAttr(labels[0])] }],
                },
                {
                  traceId: `trace-${spanIds[1]}`,
                  spanId: spanIds[1],
                  attributes: [caseAttr('case-shipping-eta')],
                  events: [{ name: 'gen_ai.evaluation.result', attributes: [nameAttr('relevance'), labelAttr(labels[1])] }],
                },
              ],
            },
          ],
        },
      ],
    });

    const importReport = async (inputPath: string, caseIdAttribute?: string) => {
      const outPath = path.join(path.dirname(inputPath), '.evals_output', 'import-otel-genai.json');
      await importFromSource({ source: 'otel-genai', inputPath, outPath, caseIdAttribute });
      const validated = validateEvalReport(JSON.parse(await readFile(outPath, 'utf8')) as unknown);
      if (!validated.ok) throw new Error('invalid report');
      return validated.report;
    };

    it('uses the case id so a baseline comparison sees persistent failures, not new ones', async () => {
      const run1 = await importReport(
        await writeJson('run1.json', runExport(['aaaa1111', 'bbbb2222'], ['fail', 'pass'])),
        'eval.case.id',
      );
      const run2 = await importReport(
        await writeJson('run2.json', runExport(['cccc3333', 'dddd4444'], ['fail', 'fail'])),
        'eval.case.id',
      );

      expect(run2.rows.map((row) => row.id)).toEqual(['case-refund-policy:relevance', 'case-shipping-eta:relevance']);
      // spanId still kept for trace linking.
      expect(run2.rows[0]?.trace?.spanId).toBe('cccc3333');

      const comparison = compareRuns(run2, run1);
      expect(comparison.persistentFailures.map((row) => row.id)).toEqual(['case-refund-policy:relevance']);
      expect(comparison.newlyFailing.map((row) => row.id)).toEqual(['case-shipping-eta:relevance']);
      expect(comparison.disappeared).toHaveLength(0);
    });

    it('without the option, the same two runs show every failure as new (the gap this option fixes)', async () => {
      const run1 = await importReport(await writeJson('run1.json', runExport(['aaaa1111', 'bbbb2222'], ['fail', 'pass'])));
      const run2 = await importReport(await writeJson('run2.json', runExport(['cccc3333', 'dddd4444'], ['fail', 'fail'])));

      const comparison = compareRuns(run2, run1);
      expect(comparison.persistentFailures).toHaveLength(0);
      expect(comparison.newlyFailing).toHaveLength(2);
      expect(comparison.disappeared).toHaveLength(2);
    });

    it('reads the case id from the event first, then the resource', async () => {
      const report = await importReport(
        await writeJson('scopes.json', {
          resourceLogs: [
            {
              resource: { attributes: [caseAttr('from-resource')] },
              scopeLogs: [
                {
                  logRecords: [
                    {
                      eventName: 'gen_ai.evaluation.result',
                      spanId: 's1',
                      attributes: [caseAttr('from-event'), nameAttr('relevance'), labelAttr('pass')],
                    },
                    {
                      eventName: 'gen_ai.evaluation.result',
                      spanId: 's2',
                      attributes: [nameAttr('groundedness'), labelAttr('pass')],
                    },
                  ],
                },
              ],
            },
          ],
        }),
        'eval.case.id',
      );

      expect(report.rows.map((row) => row.id)).toEqual(['from-event:relevance', 'from-resource:groundedness']);
    });

    it('keeps non-string case ids exact: large int64, zero, false, and skips blank values', async () => {
      const event = (spanId: string, caseValue: Record<string, unknown>) => ({
        traceId: `t-${spanId}`,
        spanId,
        attributes: [{ key: 'eval.case.id', value: caseValue }],
        events: [{ name: 'gen_ai.evaluation.result', attributes: [nameAttr('relevance'), labelAttr('pass')] }],
      });
      const report = await importReport(
        await writeJson('typed.json', {
          resourceSpans: [
            {
              resource: { attributes: [caseAttr('resource-fallback')] },
              scopeSpans: [
                {
                  spans: [
                    // Above 2^53: Number() would round this to ...992.
                    event('s1', { intValue: '9007199254740993' }),
                    event('s2', { intValue: 0 }),
                    event('s3', { boolValue: false }),
                    // Blank on the span: fall through to the resource value.
                    event('s4', { stringValue: '   ' }),
                  ],
                },
              ],
            },
          ],
        }),
        'eval.case.id',
      );

      expect(report.rows.map((row) => row.id)).toEqual([
        '9007199254740993:relevance',
        '0:relevance',
        'false:relevance',
        'resource-fallback:relevance',
      ]);
    });

    it('fails clearly when an event has no case id', async () => {
      const inputPath = await writeJson('missing.json', spanExport('s1', [nameAttr('relevance'), labelAttr('pass')]));
      await expect(
        importFromSource({
          source: 'otel-genai',
          inputPath,
          outPath: path.join(path.dirname(inputPath), '.evals_output', 'out.json'),
          caseIdAttribute: 'eval.case.id',
        }),
      ).rejects.toThrow('has no eval.case.id attribute on the event, span, or resource');
    });
  });

  it('fails clearly when no gen_ai.evaluation.result events are present', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'otel-genai-empty.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      inputPath,
      JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans: [{ traceId: 't1', spanId: 's1', events: [] }] }] }] }),
      'utf8',
    );

    await expect(
      importFromSource({
        source: 'otel-genai',
        inputPath,
        outPath: path.join(dir, '.evals_output', 'import-otel-genai.json'),
      }),
    ).rejects.toThrow('No gen_ai.evaluation.result events found');
  });

  it('fails clearly when an evaluation event has no score label or value', async () => {
    const dir = await createTempDir();
    const inputPath = path.join(dir, 'otel-genai-no-signal.json');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      inputPath,
      JSON.stringify({
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 't1',
                    spanId: 's1',
                    events: [
                      {
                        name: 'gen_ai.evaluation.result',
                        attributes: [
                          { key: 'gen_ai.evaluation.name', value: { stringValue: 'hallucination' } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
      'utf8',
    );

    await expect(
      importFromSource({
        source: 'otel-genai',
        inputPath,
        outPath: path.join(dir, '.evals_output', 'import-otel-genai.json'),
      }),
    ).rejects.toThrow('Unable to infer pass/fail');
  });
});
