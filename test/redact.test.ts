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
  turns: [{ role: 'user', content: 'hello there, sensitive' }],
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
  });

  it('finds nothing once redacted', () => {
    const report = redactEvalReport(buildReport([sensitiveRow]));
    expect(findSensitiveFields(report)).toEqual([]);
  });
});
