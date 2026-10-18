import { describe, expect, it } from 'vitest';
import { redactEvalReport, redactEvalRow, findSensitiveFields } from '../src/model/redact.js';
import type { EvalReportV1, EvalRow } from '../src/model/eval-report-v1.js';

const sensitiveRow: EvalRow = {
  id: 'row-1',
  suite: 'suite-a',
  question: 'What is the secret?',
  input: 'raw prompt text',
  output: 'raw model output',
  expected: 'expected text',
  reason: 'why it failed',
  judgeReasoning: 'the judge thought long and hard',
  agentReasoning: 'the agent reasoned',
  groundTruthAnnotation: 'annotator notes',
  passed: true,
  category: 'safety',
  severity: 'high',
  turns: [{ role: 'user', content: 'hello there, sensitive', toolCall: { name: 'search', args: { q: 'sensitive args' } }, toolResult: 'sensitive turn result' }],
  toolCalls: [{ name: 'search', args: { q: 'x' }, result: 'sensitive result' }],
};

const buildReport = (rows: EvalRow[]): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1',
  run: { id: 'run-1', generatedAt: new Date().toISOString() },
  suites: [{ id: 'suite-a', total: 1, passed: 1, failed: 0 }],
  rows,
});

describe('redactEvalRow', () => {
  it('strips sensitive evidence text fields', () => {
    const redacted = redactEvalRow(sensitiveRow);

    expect(redacted.question).toBeUndefined();
    expect(redacted.input).toBeUndefined();
    expect(redacted.output).toBeUndefined();
    expect(redacted.expected).toBeUndefined();
    expect(redacted.reason).toBeUndefined();
    expect(redacted.judgeReasoning).toBeUndefined();
    expect(redacted.agentReasoning).toBeUndefined();
    expect(redacted.groundTruthAnnotation).toBeUndefined();
  });

  it('keeps public-tier fields intact', () => {
    const redacted = redactEvalRow(sensitiveRow);
    expect(redacted.id).toBe('row-1');
    expect(redacted.suite).toBe('suite-a');
    expect(redacted.category).toBe('safety');
    expect(redacted.severity).toBe('high');
    expect(redacted.passed).toBe(true);
  });

  it('redacts conversation turn content and tool call results', () => {
    const redacted = redactEvalRow(sensitiveRow);
    expect(redacted.turns?.[0]?.content).not.toContain('sensitive');
    expect(redacted.toolCalls?.[0]?.result).not.toContain('sensitive');
    expect(redacted.toolCalls?.[0]?.name).toBe('search');
    expect(redacted.toolCalls?.[0]?.args).toBeUndefined();
    expect(redacted.turns?.[0]?.toolCall).toEqual({ name: 'search', args: {} });
    expect(redacted.turns?.[0]?.toolResult).toBeUndefined();
    expect(sensitiveRow.turns?.[0]?.toolCall?.args.q).toBe('sensitive args');
  });
});

describe('redactEvalReport', () => {
  it('redacts every row and records the applied profile', () => {
    const report = buildReport([sensitiveRow]);
    const redacted = redactEvalReport(report);

    expect(findSensitiveFields(redacted)).toEqual([]);
    expect(redacted.metadata?.redactionProfile).toBe('default');
    expect(redacted.metadata?.redacted).toBe(true);
  });
});

describe('findSensitiveFields', () => {
  it('detects sensitive fields present in an unredacted report', () => {
    const report = buildReport([sensitiveRow]);
    const hits = findSensitiveFields(report);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits).toContain('input');
    expect(hits).toContain('toolCalls[].args');
    expect(hits).toContain('turns[].toolCall.args');
    expect(hits).toContain('turns[].toolResult');
  });

  it('finds nothing once redacted', () => {
    const report = redactEvalReport(buildReport([sensitiveRow]));
    expect(findSensitiveFields(report)).toEqual([]);
  });
});

describe('redaction of structured evidence fields', () => {
  const structuredRow: EvalRow = {
    id: 'row-2',
    suite: 'suite-a',
    passed: false,
    judgeTraces: { input: 'judge saw this', output: 'judge said that' },
    axisReasoning: { quality: 'axis explanation' },
    humanReviews: [{ reviewer: 'jane@example.com', verdict: 'fail', category: 'tone', note: 'reviewer note', decidedAt: '2026-10-01' }],
    checks: [{ type: 'contains', expected: 'expected value', actual: 'actual value', threshold: 0.5, weight: 2, pass: false }],
    trace: { traceId: 't-1', spanId: 's-1', traceUrl: 'https://host/trace/1', spanUrl: 'https://host/span/1' },
    metadata: { provenance: { source: 'labelled-synthetic' }, lifecycle: { status: 'active' }, prompt: 'free-form prompt text' },
  };

  it('should remove judge traces and axis reasoning when a row is redacted', () => {
    const redacted = redactEvalRow(structuredRow);

    expect(redacted.judgeTraces).toBeUndefined();
    expect(redacted.axisReasoning).toBeUndefined();
  });

  it('should keep verdicts but drop reviewer names and notes when human reviews are redacted', () => {
    const redacted = redactEvalRow(structuredRow);

    expect(redacted.humanReviews).toEqual([{ reviewer: '[redacted]', verdict: 'fail', category: 'tone', decidedAt: '2026-10-01' }]);
  });

  it('should keep the check type and result but drop expected and actual values when checks are redacted', () => {
    const redacted = redactEvalRow(structuredRow);

    expect(redacted.checks).toEqual([{ type: 'contains', pass: false, threshold: 0.5, weight: 2 }]);
  });

  it('should keep trace ids but drop trace and span URLs when a trace is redacted', () => {
    const redacted = redactEvalRow(structuredRow);

    expect(redacted.trace).toEqual({ traceId: 't-1', spanId: 's-1' });
  });

  it('should keep provenance and lifecycle but replace free-form metadata when metadata is redacted', () => {
    const redacted = redactEvalRow(structuredRow);

    expect(redacted.metadata).toEqual({
      provenance: { source: 'labelled-synthetic' },
      lifecycle: { status: 'active' },
      prompt: '[redacted]',
    });
  });

  it('should replace every config snapshot value when a report is redacted', () => {
    const report: EvalReportV1 = {
      ...buildReport([structuredRow]),
      run: {
        id: 'run-1',
        generatedAt: '2026-10-01T00:00:00.000Z',
        configSnapshot: { values: { OPENAI_API_KEY: 'sk-secret', temperature: 0.2 } },
      },
    };

    const redacted = redactEvalReport(report);

    expect(redacted.run.configSnapshot).toEqual({
      redacted: true,
      values: { OPENAI_API_KEY: '[redacted]', temperature: '[redacted]' },
    });
  });

  it('should report no sensitive fields when a report has been redacted', () => {
    const report = buildReport([structuredRow]);

    expect(findSensitiveFields(redactEvalReport(report))).toEqual([]);
  });

  it('should list every structured field when a report has not been redacted', () => {
    const report: EvalReportV1 = {
      ...buildReport([structuredRow]),
      run: { id: 'run-1', generatedAt: '2026-10-01T00:00:00.000Z', configSnapshot: { values: { key: 'secret' } } },
    };

    expect(findSensitiveFields(report).sort()).toEqual([
      'axisReasoning',
      'checks[].expected/actual',
      'humanReviews[].note/reviewer',
      'judgeTraces',
      'metadata.*',
      'run.configSnapshot.values',
      'trace.traceUrl/spanUrl',
    ]);
  });
});
