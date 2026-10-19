import { describe, expect, it } from 'vitest';
import { detectGateConfigLoosening } from '../src/gates/threshold-change.js';

describe('detectGateConfigLoosening for per-suite thresholds', () => {
  it('should flag a lowered per-suite minPassRate when one suite gets an easier bar', () => {
    const result = detectGateConfigLoosening(
      { suites: { safety: { minPassRate: 1 } } },
      { suites: { safety: { minPassRate: 0.8 } } },
    );

    expect(result.loosened).toBe(true);
    expect(result.failures).toEqual([
      'Gate configuration loosened without approval: suites.safety.minPassRate loosened from 1 to 0.8.',
    ]);
  });

  it('should flag a removed per-suite threshold when a suite drops out of gates.suites', () => {
    const result = detectGateConfigLoosening({ suites: { safety: { maxNewFailures: 0 } } }, { suites: {} });

    expect(result.loosened).toBe(true);
    expect(result.failures).toEqual([
      'Gate configuration loosened without approval: suites.safety.maxNewFailures removed (was 0).',
    ]);
  });

  it('should not flag a raised per-suite bar when the suite gets stricter', () => {
    const result = detectGateConfigLoosening(
      { suites: { safety: { minPassRate: 0.8 } } },
      { suites: { safety: { minPassRate: 1 } } },
    );

    expect(result.loosened).toBe(false);
  });

  it('should flag a raised per-suite failure budget when the allowance grows', () => {
    const result = detectGateConfigLoosening(
      { suites: { quality: { maxNewFailures: 1 } } },
      { suites: { quality: { maxNewFailures: 4 } } },
    );

    expect(result.loosened).toBe(true);
  });

  it('should not compare a suite that only the new config sets when it has no earlier bar', () => {
    const result = detectGateConfigLoosening({}, { suites: { safety: { minPassRate: 0.5 } } });

    expect(result.loosened).toBe(false);
    expect(result.changes).toEqual([]);
  });
});
