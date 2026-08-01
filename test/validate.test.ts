import { describe, expect, it } from 'vitest';
import { validateEvalReport } from '../src/model/validate.js';

describe('validateEvalReport', () => {
  it('accepts a minimal eval-report/v1 artifact', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: true }],
    });

    expect(result.ok).toBe(true);
  });

  it('accepts first-class LLM judge row fields', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'row-1',
          suite: 'quality',
          kind: 'llm-judge',
          datasetId: 'support-smoke',
          scenarioId: 'clear-answer',
          rubricId: 'clarity-v1',
          judgeModel: 'example-judge-v1',
          judgeReasoning: 'The answer is clear and grounded.',
          promptVersion: 'assistant-policy-v2',
          passed: true,
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('accepts agent and judge suite governance metadata', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 2, passed: 2, failed: 0 }],
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['deterministic-assertions', 'llm-judge'],
          gate: { mode: 'blocking', thresholds: { overallPassRate: 0.8 } },
        },
      ],
      rubricContracts: [
        {
          suiteName: 'quality',
          rubricVersion: '1.0.0',
          rubrics: [{ axis: 'clarity', version: '1.0.0', summary: 'Clear and direct.' }],
        },
      ],
      rows: [
        { id: 'agent-row', suite: 'quality', kind: 'agent', agentVersion: 'agent-v1', passed: true },
        {
          id: 'judge-row',
          suite: 'quality',
          kind: 'llm-judge',
          judgeVerdict: true,
          judgeCategory: 'clear',
          passed: true,
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects invalid row severity values', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 0, failed: 1 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: false, severity: 'urgent' }],
    });

    expect(result.ok).toBe(false);
  });

  it('rejects invalid row kind values', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 0, failed: 1 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: false, kind: 'model-vote' }],
    });

    expect(result.ok).toBe(false);
  });

  it('rejects invalid suite manifest gate thresholds', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 0, failed: 1 }],
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          gate: { mode: 'blocking', thresholds: { overallPassRate: 'high' } },
        },
      ],
      rows: [{ id: 'row-1', suite: 'quality', passed: false }],
    });

    expect(result.ok).toBe(false);
  });

  it('accepts turns, toolCalls, axisScores, and agentReasoning on a row', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'row-1',
          suite: 'quality',
          passed: true,
          agentReasoning: 'Chose knowledge-base because the user asked about docs.',
          turns: [
            { role: 'user', content: 'What command do I run?' },
            { role: 'assistant', content: 'eval-reports report --input=.evals_output' },
          ],
          toolCalls: [{ name: 'knowledge-base', args: { query: 'report command' }, durationMs: 120 }],
          axisScores: { clarity: 0.9, groundedness: 1.0 },
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects a turn with an invalid role', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, turns: [{ role: 'bot', content: 'hi' }] }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors[0]).toMatch(/role must be one of/);
  });

  it('rejects a toolCall entry with an empty name', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, toolCalls: [{ name: '' }] }],
    });

    expect(result.ok).toBe(false);
  });

  it('rejects axisScores with a non-numeric value', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, axisScores: { clarity: 'high' } }],
    });

    expect(result.ok).toBe(false);
  });
});