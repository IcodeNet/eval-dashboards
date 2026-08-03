import { describe, expect, it } from 'vitest';
import { assessBaselineCompatibility } from '../src/history/baseline-compatibility.js';
import type { SuiteManifest } from '../src/model/eval-report-v1.js';

const makeManifest = (overrides: Partial<SuiteManifest> = {}): SuiteManifest => ({
  name: 'quality',
  target: 'agent',
  datasetSource: 'synthetic',
  datasetVersion: '1.0.0',
  rubricVersion: '1.0.0',
  riskArea: 'response-quality',
  graders: ['deterministic-assertions', 'llm-judge'],
  gate: { mode: 'blocking', thresholds: { overallPassRate: 0.8 } },
  ...overrides,
});

describe('assessBaselineCompatibility', () => {
  it('returns compatible when blocking suite dataset and rubric versions match', () => {
    const result = assessBaselineCompatibility([makeManifest()], [makeManifest()], true);

    expect(result).toEqual({ status: 'compatible', issues: [] });
  });

  it('blocks when a blocking suite changes dataset or rubric version', () => {
    const result = assessBaselineCompatibility(
      [makeManifest({ rubricVersion: '2.0.0' })],
      [makeManifest({ rubricVersion: '1.0.0' })],
      true,
    );

    expect(result?.status).toBe('blocked');
    expect(result?.issues[0]?.severity).toBe('blocking');
  });

  it('warns when the baseline has no suite manifest metadata', () => {
    const result = assessBaselineCompatibility([makeManifest()], undefined, true);

    expect(result?.status).toBe('warning');
    expect(result?.issues[0]?.reason).toBe('baseline report does not include suite manifest metadata');
  });
});