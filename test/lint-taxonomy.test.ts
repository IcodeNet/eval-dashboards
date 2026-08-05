import { describe, expect, it } from 'vitest';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';
import { lintReportTaxonomy, lintReportsTaxonomy } from '../src/gates/lint-taxonomy.js';

const makeReport = (overrides?: Partial<EvalReportV1>): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1',
  run: { id: 'run-1', generatedAt: '2026-08-03T10:00:00.000Z' },
  suites: [{ id: 'quality', total: 2, passed: 1, failed: 1 }],
  rows: [
    {
      id: 'row-1',
      suite: 'quality',
      passed: true,
      kind: 'agent',
      severity: 'high',
      category: 'tool-selection',
      agentVersion: 'agent-v1',
      promptVersion: 'prompt-v1',
      toolCalls: [{ name: 'knowledge-base', durationMs: 120 }],
    },
    {
      id: 'row-2',
      suite: 'quality',
      passed: false,
      kind: 'llm-judge',
      severity: 'critical',
      category: 'groundedness',
      judgeModel: 'judge-v1',
      judgeVerdict: false,
      judgeReasoning: 'Unsupported claim in answer.',
    },
  ],
  ...overrides,
});

describe('lintReportTaxonomy', () => {
  it('passes for taxonomy-complete report with consistent suite summaries', () => {
    const result = lintReportTaxonomy(makeReport());
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('fails when row references an unknown suite', () => {
    const report = makeReport({
      rows: [{ id: 'row-1', suite: 'missing-suite', passed: true }],
    });

    const result = lintReportTaxonomy(report);
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'unknown-suite' && issue.level === 'error')).toBe(
      true,
    );
  });

  it('fails when suite summary counts disagree with row-level totals', () => {
    const report = makeReport({
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
    });

    const result = lintReportTaxonomy(report);
    expect(result.passed).toBe(false);
    expect(
      result.issues.some((issue) => issue.code === 'suite-summary-mismatch' && issue.level === 'error'),
    ).toBe(true);
  });

  it('reports warnings for missing taxonomy and evidence fields', () => {
    const report = makeReport({
      rows: [
        {
          id: 'row-1',
          suite: 'quality',
          passed: true,
          kind: 'agent',
        },
      ],
      suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
    });

    const result = lintReportTaxonomy(report);
    expect(result.passed).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'missing-severity')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'missing-category')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'missing-agent-evidence')).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'missing-agent-versioning')).toBe(true);
  });

  it('detects duplicate row ids within the same suite', () => {
    const report = makeReport({
      rows: [
        { id: 'same-id', suite: 'quality', passed: true },
        { id: 'same-id', suite: 'quality', passed: false },
      ],
    });

    const result = lintReportTaxonomy(report);
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'duplicate-row-key')).toBe(true);
  });

  it('warns when suite manifests are present but missing a suite match', () => {
    const report = makeReport({
      suiteManifests: [
        {
          name: 'other-suite',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['deterministic-assertions'],
          gate: { mode: 'report-only', thresholds: { passRate: 0.9 } },
        },
      ],
    });

    const result = lintReportTaxonomy(report);
    expect(result.passed).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'missing-suite-manifest')).toBe(true);
  });

  it('fails when dataset-governed suite rows are missing lifecycle metadata', () => {
    const report = makeReport({
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['deterministic-assertions'],
          gate: { mode: 'report-only', thresholds: { passRate: 0.9 } },
        },
      ],
    });

    const result = lintReportTaxonomy(report);
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'missing-row-lifecycle' && issue.level === 'error')).toBe(true);
  });

  it('fails when dataset-governed suite rows are missing provenance metadata', () => {
    const report = makeReport({
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['deterministic-assertions'],
          gate: { mode: 'report-only', thresholds: { passRate: 0.9 } },
        },
      ],
      rows: [
        {
          id: 'row-1',
          suite: 'quality',
          passed: true,
          kind: 'agent',
          severity: 'high',
          category: 'tool-selection',
          agentVersion: 'agent-v1',
          promptVersion: 'prompt-v1',
          toolCalls: [{ name: 'knowledge-base', durationMs: 120 }],
          metadata: { lifecycle: { status: 'active' } },
        },
        {
          id: 'row-2',
          suite: 'quality',
          passed: false,
          kind: 'llm-judge',
          severity: 'critical',
          category: 'groundedness',
          judgeModel: 'judge-v1',
          judgeVerdict: false,
          judgeReasoning: 'Unsupported claim in answer.',
          metadata: { lifecycle: { status: 'active' } },
        },
      ],
    });

    const result = lintReportTaxonomy(report);
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'missing-row-provenance' && issue.level === 'error')).toBe(true);
  });

  it('passes dataset-governed suite rows when lifecycle metadata is present', () => {
    const report = makeReport({
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['deterministic-assertions'],
          gate: { mode: 'report-only', thresholds: { passRate: 0.9 } },
        },
      ],
      rows: [
        {
          id: 'row-1',
          suite: 'quality',
          passed: true,
          kind: 'agent',
          severity: 'high',
          category: 'tool-selection',
          agentVersion: 'agent-v1',
          promptVersion: 'prompt-v1',
          toolCalls: [{ name: 'knowledge-base', durationMs: 120 }],
          metadata: {
            lifecycle: { status: 'active' },
            provenance: { source: 'synthetic' },
          },
        },
        {
          id: 'row-2',
          suite: 'quality',
          passed: false,
          kind: 'llm-judge',
          severity: 'critical',
          category: 'groundedness',
          judgeModel: 'judge-v1',
          judgeVerdict: false,
          judgeReasoning: 'Unsupported claim in answer.',
          metadata: {
            lifecycle: { status: 'active' },
            provenance: { source: 'synthetic' },
          },
        },
      ],
    });

    const result = lintReportTaxonomy(report);
    expect(result.passed).toBe(true);
    expect(result.issues.some((issue) => issue.code === 'missing-row-lifecycle')).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'missing-row-provenance')).toBe(false);
  });
});

describe('lintReportsTaxonomy', () => {
  it('prefixes issues with run id in multi-report lint results', () => {
    const reportA = makeReport({ run: { id: 'run-a', generatedAt: '2026-08-03T10:00:00.000Z' } });
    const reportB = makeReport({
      run: { id: 'run-b', generatedAt: '2026-08-03T10:01:00.000Z' },
      rows: [{ id: 'row-1', suite: 'missing-suite', passed: false }],
      suites: [{ id: 'quality', total: 1, passed: 0, failed: 1 }],
    });

    const result = lintReportsTaxonomy([reportA, reportB]);

    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.message.startsWith('[run:run-b]'))).toBe(true);
  });
});
