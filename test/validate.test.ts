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

  it('rejects blocking suite manifests without rubricVersion', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['deterministic-assertions'],
          gate: { mode: 'blocking', thresholds: { passRate: 0.9 } },
        },
      ],
      rows: [{ id: 'row-1', suite: 'quality', passed: true }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'suiteManifests[0].rubricVersion is required when gate.mode is blocking or graders include llm-judge.',
    );
  });

  it('rejects llm-judge suite manifests without rubricVersion', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      suiteManifests: [
        {
          name: 'quality',
          target: 'judge',
          datasetSource: 'labelled-synthetic',
          datasetVersion: '1.0.0',
          riskArea: 'relevance',
          graders: ['llm-judge'],
          gate: { mode: 'report-only', thresholds: { passRate: 0.9 } },
        },
      ],
      rows: [{ id: 'row-1', suite: 'quality', passed: true }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'suiteManifests[0].rubricVersion is required when gate.mode is blocking or graders include llm-judge.',
    );
  });

  it('accepts deterministic report-only suite manifests without rubricVersion', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['deterministic-assertions'],
          gate: { mode: 'report-only', thresholds: { passRate: 0.9 } },
        },
      ],
      rows: [{ id: 'row-1', suite: 'quality', passed: true }],
    });

    expect(result.ok).toBe(true);
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
            { role: 'assistant', content: 'eval-dashboards report --input=.evals_output' },
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

  it('accepts portable row provenance and lifecycle metadata conventions', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'r',
          suite: 'q',
          passed: true,
          metadata: {
            provenance: {
              source: 'incident',
              addedBy: 'eval-maintainer',
              reason: 'Captured after production incident replay',
            },
            lifecycle: {
              status: 'active',
              since: '2026-07-31',
            },
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects invalid lifecycle status in row metadata', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'r',
          suite: 'q',
          passed: true,
          metadata: {
            lifecycle: {
              status: 'retired',
            },
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].metadata.lifecycle.status must be one of proposed, active, deprecated, quarantined, custom.',
    );
  });

  it('accepts valid datasetChangelog entries', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true }],
      datasetChangelog: [
        {
          suiteName: 'q',
          datasetVersion: '1.1.0',
          rubricVersion: '1.0.0',
          changedAt: '2026-08-03',
          changeType: 'minor',
          summary: 'Added new rows for broader coverage.',
          rowChanges: { added: 5, updated: 1, removed: 0, relabelled: 0 },
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects datasetChangelog entries with invalid changeType', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true }],
      datasetChangelog: [
        {
          suiteName: 'q',
          datasetVersion: '1.1.0',
          rubricVersion: '1.0.0',
          changedAt: '2026-08-03',
          changeType: 'breaking',
          summary: 'Invalid change type test.',
          rowChanges: { added: 1, updated: 0, removed: 0, relabelled: 0 },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'datasetChangelog[0].changeType must be one of initial-baseline, patch, minor, major.',
    );
  });
});