import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createEvalReportArtifact,
  writeEvalReportArtifact,
  type RunnerEvalCaseResult,
} from '../src/index.js';

const generatedAt = '2026-08-03T12:00:00.000Z';

describe('runner adapter', () => {
  it('creates a validated eval-report/v1 artifact and computes suite totals from rows', () => {
    const report = createEvalReportArtifact(
      {
        run: { id: 'run-1', project: 'adapter-test' },
        cases: [
          { id: 'case-1', suite: 'retrieval-recall', passed: true, severity: 'none' },
          { id: 'case-2', suite: 'retrieval-recall', passed: false, severity: 'high' },
          { id: 'case-3', suite: 'answer-quality', passed: true, severity: 'none' },
        ],
      },
      { generatedAt },
    );

    expect(report.schemaVersion).toBe('eval-report/v1');
    expect(report.run).toMatchObject({ id: 'run-1', generatedAt, project: 'adapter-test' });
    expect(report.suites).toEqual([
      { id: 'retrieval-recall', name: 'retrieval-recall', total: 2, passed: 1, failed: 1, passRate: 0.5 },
      { id: 'answer-quality', name: 'answer-quality', total: 1, passed: 1, failed: 0, passRate: 1 },
    ]);
  });

  it('supports project-specific row mapping and generated suite manifests', () => {
    type LocalCase = RunnerEvalCaseResult & { expectedTool: string };

    const report = createEvalReportArtifact<LocalCase>(
      {
        run: { id: 'run-2' },
        cases: [{ suite: 'mcp-routing', passed: true, expectedTool: 'account.lookup' }],
      },
      {
        generatedAt,
        rowId: (caseResult) => `tool-${caseResult.expectedTool}`,
        mapRow: (caseResult, index) => ({
          id: `mapped-${index + 1}`,
          suite: caseResult.suite,
          kind: 'agent',
          passed: caseResult.passed,
          agentVersion: 'agent-v1',
          promptVersion: 'prompt-v1',
          toolCalls: [{ name: caseResult.expectedTool }],
        }),
        createSuiteManifest: (suiteName) => ({
          name: suiteName,
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: 'dataset-v1',
          rubricVersion: 'rubric-v1',
          riskArea: 'tool-routing',
          graders: ['tool-call-check'],
          gate: { mode: 'blocking', thresholds: { passRate: 0.95 } },
        }),
      },
    );

    expect(report.rows[0]).toMatchObject({ id: 'mapped-1', kind: 'agent' });
    expect(report.suiteManifests?.[0]).toMatchObject({ name: 'mcp-routing', riskArea: 'tool-routing' });
  });

  it('throws when mapped rows do not satisfy eval-report/v1 validation', () => {
    expect(() =>
      createEvalReportArtifact(
        { run: { id: 'run-3' }, cases: [{ suite: 'quality', passed: true }] },
        {
          generatedAt,
          mapRow: () => ({ id: '', suite: 'quality', passed: true }),
        },
      ),
    ).toThrow('Invalid eval report artifact');
  });

  it('writes a validated artifact and can clean generated output first', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'eval-runner-adapter-'));
    const outputPath = path.join(tempDir, '.evals_output', 'run.json');

    const report = await writeEvalReportArtifact(
      outputPath,
      {
        run: { id: 'run-4' },
        cases: [{ suite: 'quality', passed: true }],
      },
      { generatedAt, cleanOutputDir: true },
    );

    const written = JSON.parse(await readFile(outputPath, 'utf8')) as unknown;

    expect(report.run.id).toBe('run-4');
    expect(written).toMatchObject({ schemaVersion: 'eval-report/v1', run: { id: 'run-4' } });
  });

  it('defaults row metadata provenance and lifecycle when mapping cases', () => {
    const report = createEvalReportArtifact(
      {
        run: { id: 'run-5' },
        cases: [{ suite: 'quality', passed: true }],
      },
      { generatedAt },
    );

    expect(report.rows[0].metadata).toMatchObject({
      provenance: { source: 'synthetic' },
      lifecycle: { status: 'active' },
    });
  });

  it('merges explicit row metadata with default provenance and lifecycle values', () => {
    const report = createEvalReportArtifact(
      {
        run: { id: 'run-6' },
        cases: [
          {
            suite: 'quality',
            passed: true,
            metadata: {
              provenance: { source: 'labelled-synthetic', reason: 'labelled example' },
              lifecycle: { status: 'deprecated', note: 'legacy case' },
            },
          },
        ],
      },
      { generatedAt },
    );

    expect(report.rows[0].metadata).toMatchObject({
      provenance: { source: 'labelled-synthetic', reason: 'labelled example' },
      lifecycle: { status: 'deprecated', note: 'legacy case' },
    });
  });
});
