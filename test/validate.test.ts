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

  it('accepts a sanitized run.configSnapshot block', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-1',
        generatedAt: '2026-07-31T10:00:00.000Z',
        configSnapshot: {
          redacted: true,
          source: 'ci-live-preflight',
          values: {
            mode: 'live',
            searchIndexName: 'byron-profile',
            retrievalThreshold: 0.01,
            searchApiKeySet: false,
            openAiApiKeySet: false,
          },
        },
      },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: true }],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects run.configSnapshot values with unsupported types', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-1',
        generatedAt: '2026-07-31T10:00:00.000Z',
        configSnapshot: {
          values: {
            bad: ['not-supported'],
          },
        },
      },
      suites: [],
      rows: [],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'run.configSnapshot.values.bad must be a string, number, boolean, or null.',
    );
  });

  it('accepts run.experimentId and run.variantLabel as plain optional strings', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-1',
        generatedAt: '2026-07-31T10:00:00.000Z',
        experimentId: 'prompt-tuning-2026-07',
        variantLabel: 'v3-cot',
      },
      suites: [],
      rows: [],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects non-string run.experimentId / run.variantLabel', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: {
        id: 'run-1',
        generatedAt: '2026-07-31T10:00:00.000Z',
        experimentId: 42,
        variantLabel: { label: 'v3' },
      },
      suites: [],
      rows: [],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'run.experimentId must be a string when provided.',
    );
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'run.variantLabel must be a string when provided.',
    );
  });

  it('accepts rows[].complianceRefs and suiteManifests[].complianceFrameworks (4F.14)', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'pii', total: 1, passed: 1, failed: 0 }],
      suiteManifests: [
        {
          name: 'pii',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: 'v1',
          riskArea: 'pii',
          graders: ['deterministic-assertions'],
          gate: { mode: 'report-only', thresholds: {} },
          complianceFrameworks: ['owasp:llm', 'nist:ai:measure:1.1', 'eu:ai-act'],
        },
      ],
      rows: [{ id: 'row-1', suite: 'pii', passed: true, complianceRefs: ['owasp:llm:01'] }],
    });

    expect(result.ok).toBe(true);
  });

  it('accepts suiteManifests[].scoreScale (4F.18)', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'likert', total: 1, passed: 1, failed: 0 }],
      suiteManifests: [
        {
          name: 'likert',
          target: 'judge',
          datasetSource: 'synthetic',
          datasetVersion: 'v1',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          rubricVersion: 'v1',
          gate: { mode: 'report-only', thresholds: {} },
          scoreScale: { min: 0, max: 3 },
        },
      ],
      rows: [{ id: 'row-1', suite: 'likert', passed: true, score: 2 }],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects an invalid suiteManifests[].scoreScale (4F.18)', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'likert', total: 1, passed: 1, failed: 0 }],
      suiteManifests: [
        {
          name: 'likert',
          target: 'judge',
          datasetSource: 'synthetic',
          datasetVersion: 'v1',
          riskArea: 'response-quality',
          graders: ['llm-judge'],
          rubricVersion: 'v1',
          gate: { mode: 'report-only', thresholds: {} },
          scoreScale: { min: 3, max: 0 },
        },
      ],
      rows: [{ id: 'row-1', suite: 'likert', passed: true, score: 2 }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'suiteManifests[0].scoreScale.min must be less than scoreScale.max.',
    );
  });

  it('rejects non-string rows[].complianceRefs entries', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: true, complianceRefs: [42] }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].complianceRefs[0] must be a non-empty string.',
    );
  });

  it('rejects non-string suiteManifests[].complianceFrameworks entries', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'pii', total: 1, passed: 1, failed: 0 }],
      suiteManifests: [
        {
          name: 'pii',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: 'v1',
          riskArea: 'pii',
          graders: ['deterministic-assertions'],
          gate: { mode: 'report-only', thresholds: {} },
          complianceFrameworks: [42],
        },
      ],
      rows: [{ id: 'row-1', suite: 'pii', passed: true }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'suiteManifests[0].complianceFrameworks[0] must be a non-empty string.',
    );
  });

  it('accepts a top-level tags record (4F.15)', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: true }],
      tags: { pr: '42', model: 'gpt-4o' },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.report.tags).toEqual({ pr: '42', model: 'gpt-4o' });
    }
  });

  it('rejects tags with non-string values', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: true }],
      tags: { pr: 42 },
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain('tags.pr must be a string.');
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
          trace: {
            traceId: 'trace-abc123',
            spanId: 'span-def456',
            traceUrl: 'https://observability.example/trace/trace-abc123',
            spanUrl: 'https://observability.example/trace/trace-abc123/span/span-def456',
            spanType: 'tool',
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('accepts any free-form string for trace.spanType', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, trace: { spanType: 'anything-goes' } }],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects non-string trace.spanType', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, trace: { spanType: 123 } }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].trace.spanType must be a string when provided.',
    );
  });

  it('rejects non-string trace reference fields', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, trace: { traceId: 42 } }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].trace.traceId must be a string when provided.',
    );
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

  it('accepts axisReasoning alongside axisScores on a row', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'r',
          suite: 'q',
          passed: true,
          axisScores: { clarity: 0.9, groundedness: 1.0 },
          axisReasoning: {
            clarity: 'The explanation was easy to follow.',
            groundedness: 'Every claim cited a source passage.',
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects axisReasoning with a non-string value', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, axisReasoning: { clarity: 42 } }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].axisReasoning.clarity must be a string.',
    );
  });

  it('rejects axisReasoning that is not an object', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, axisReasoning: 'nope' }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].axisReasoning must be an object when provided.',
    );
  });

  it('accepts judgeTraces with input/output strings on a row', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'r',
          suite: 'q',
          passed: true,
          judgeTraces: {
            input: 'What is the capital of France?',
            output: 'Paris',
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('accepts judgeTraces with only one of input/output', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, judgeTraces: { output: 'Paris' } }],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects judgeTraces with a non-string field', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, judgeTraces: { input: 42 } }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].judgeTraces.input must be a string when provided.',
    );
  });

  it('rejects judgeTraces that is not an object', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, judgeTraces: 'nope' }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].judgeTraces must be an object when provided.',
    );
  });


  it('rejects non-numeric score and durationMs values on rows', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, score: 'bad', durationMs: 'bad' }],
    });

    expect(result.ok).toBe(false);
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].score must be a number when provided.',
    );
    expect((result as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].durationMs must be a number when provided.',
    );
  });

  it('accepts a first-class row.usage object with tokens/cost/model', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'r',
          suite: 'q',
          passed: true,
          durationMs: 120,
          usage: { promptTokens: 100, completionTokens: 40, totalTokens: 140, costUsd: 0.002, model: 'gpt-4o' },
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects a non-object row.usage and non-numeric usage fields', () => {
    const objectResult = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, usage: 'bad' }],
    });
    expect(objectResult.ok).toBe(false);
    expect((objectResult as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].usage must be an object when provided.',
    );

    const fieldResult = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, usage: { totalTokens: 'lots', model: 42 } }],
    });
    expect(fieldResult.ok).toBe(false);
    expect((fieldResult as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].usage.totalTokens must be a number when provided.',
    );
    expect((fieldResult as { ok: false; errors: string[] }).errors).toContain(
      'rows[0].usage.model must be a string when provided.',
    );
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

  it('returns stable structured validation issues', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'q', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'r', suite: 'q', passed: true, trace: { traceId: 42 } }],
    });

    expect(result.ok).toBe(false);
    const failed = result as {
      ok: false;
      errors: string[];
      issues: Array<{ code: string; path: string; message: string }>;
    };
    expect(failed.issues[0]).toMatchObject({
      code: 'VALIDATION_ERROR',
      path: 'rows[0].trace.traceId',
      message: 'rows[0].trace.traceId must be a string when provided.',
    });
  });

  it('returns specific issue path for blocking suite rubricVersion requirement', () => {
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
    const failed = result as {
      ok: false;
      issues: Array<{ code: string; path: string; message: string }>;
    };
    expect(failed.issues.some((issue) => issue.path === 'suiteManifests[0].rubricVersion')).toBe(true);
  });

  it('accepts rows with valid humanReviews and reviewAgreement (4F.19)', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'row-1',
          suite: 'quality',
          passed: true,
          humanReviews: [
            { reviewer: 'alice', verdict: 'pass', category: 'acceptable', note: 'looks good', decidedAt: '2026-07-31T10:00:00.000Z' },
            { reviewer: 'bob', verdict: 'pass' },
          ],
          reviewAgreement: 1,
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects humanReviews entries missing reviewer/verdict (4F.19)', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'row-1',
          suite: 'quality',
          passed: true,
          humanReviews: [{ category: 'acceptable' }],
        },
      ],
    });

    expect(result.ok).toBe(false);
    const failed = result as { ok: false; errors: string[] };
    expect(failed.errors).toContain('rows[0].humanReviews[0].reviewer must be a non-empty string.');
    expect(failed.errors).toContain('rows[0].humanReviews[0].verdict must be a non-empty string.');
  });

  it('rejects reviewAgreement outside 0-1 (4F.19)', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: true, reviewAgreement: 1.5 }],
    });

    expect(result.ok).toBe(false);
    const failed = result as { ok: false; errors: string[] };
    expect(failed.errors).toContain('rows[0].reviewAgreement must be a number between 0 and 1 when provided.');
  });

  it('accepts rows with a valid repeated aggregation record (4F.22)', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'row-1',
          suite: 'quality',
          passed: true,
          repeated: { runs: 5, passes: 4, aggregation: 'majority' },
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects an invalid repeated aggregation record (4F.22)', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'row-1',
          suite: 'quality',
          passed: true,
          repeated: { runs: 3, passes: 5, aggregation: 'bogus' },
        },
      ],
    });

    expect(result.ok).toBe(false);
    const failed = result as { ok: false; errors: string[] };
    expect(failed.errors).toContain('rows[0].repeated.passes must not exceed repeated.runs.');
    expect(failed.errors).toContain(
      "rows[0].repeated.aggregation must be one of 'mean', 'majority', 'all'.",
    );
  });

  it('accepts rows with valid structured checks (4F.24)', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'row-1',
          suite: 'quality',
          passed: true,
          checks: [
            { type: 'contains', expected: 'refund', actual: 'refund policy', pass: true, weight: 1 },
            { type: 'latency-ms', threshold: 2000, actual: 1450, pass: true, weight: 0.5 },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects invalid structured checks (4F.24)', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [
        {
          id: 'row-1',
          suite: 'quality',
          passed: true,
          checks: [{ type: '', pass: 'yes', threshold: 'nope', weight: 'nope' } as unknown],
        },
      ],
    });

    expect(result.ok).toBe(false);
    const failed = result as { ok: false; errors: string[] };
    expect(failed.errors).toContain('rows[0].checks[0].type must be a non-empty string.');
    expect(failed.errors).toContain('rows[0].checks[0].pass must be a boolean.');
    expect(failed.errors).toContain('rows[0].checks[0].threshold must be a number when provided.');
    expect(failed.errors).toContain('rows[0].checks[0].weight must be a number when provided.');
  });

  it('rejects a non-array checks field (4F.24)', () => {
    const result = validateEvalReport({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-07-31T10:00:00.000Z' },
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'row-1', suite: 'quality', passed: true, checks: 'nope' as unknown }],
    });

    expect(result.ok).toBe(false);
    const failed = result as { ok: false; errors: string[] };
    expect(failed.errors).toContain('rows[0].checks must be an array when provided.');
  });
});