import { describe, expect, it } from 'vitest';
import { detectGateConfigLoosening } from '../src/gates/threshold-change.js';

describe('detectGateConfigLoosening', () => {
  it('flags a lowered minPassRate as a loosening failure', () => {
    const result = detectGateConfigLoosening({ minPassRate: 0.9 }, { minPassRate: 0.5 });
    expect(result.loosened).toBe(true);
    expect(result.failures.some((f) => f.includes('minPassRate loosened from 0.9 to 0.5'))).toBe(true);
  });

  it('does not flag a raised minPassRate as loosening', () => {
    const result = detectGateConfigLoosening({ minPassRate: 0.5 }, { minPassRate: 0.9 });
    expect(result.loosened).toBe(false);
    expect(result.changes.find((c) => c.field === 'minPassRate')?.direction).toBe('tightened');
  });

  it('flags a raised maxNewFailures as loosening', () => {
    const result = detectGateConfigLoosening({ maxNewFailures: 0 }, { maxNewFailures: 5 });
    expect(result.loosened).toBe(true);
  });

  it('flags zeroCritical flipped off as loosening', () => {
    const result = detectGateConfigLoosening({ zeroCritical: true }, { zeroCritical: false });
    expect(result.loosened).toBe(true);
  });

  it('flags removal of a required passing suite as loosening', () => {
    const result = detectGateConfigLoosening(
      { requiredPassingSuites: ['safety', 'quality'] },
      { requiredPassingSuites: ['quality'] },
    );
    expect(result.loosened).toBe(true);
  });

  it('flags a removed maxWarningsByCode budget as loosening', () => {
    const result = detectGateConfigLoosening(
      { maxWarningsByCode: { 'low-category-coverage': 0 } },
      { maxWarningsByCode: {} },
    );
    expect(result.loosened).toBe(true);
  });

  it('is a no-op when fields are absent from either side', () => {
    const result = detectGateConfigLoosening({}, { minPassRate: 0.5 });
    expect(result.loosened).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('reports unchanged values without marking loosened', () => {
    const result = detectGateConfigLoosening({ minPassRate: 0.8 }, { minPassRate: 0.8 });
    expect(result.loosened).toBe(false);
    expect(result.changes[0]?.direction).toBe('unchanged');
  });
});
