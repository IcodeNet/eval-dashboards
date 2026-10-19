import { describe, expect, it } from 'vitest';
import { renderStepSummary } from '../src/gates/step-summary.js';

describe('renderStepSummary', () => {
  it('should show a passed heading and no failure sections when the gate passed', () => {
    const out = renderStepSummary({
      runId: 'r1',
      passed: true,
      failures: [],
      diagnostics: [],
      newlyFailingRows: [],
    });
    expect(out).toBe('## Eval gate: passed\n\nRun `r1` (no baseline).\n\n');
  });

  it('should list failures and newly failing rows when the gate failed', () => {
    const out = renderStepSummary({
      runId: 'r2',
      baselineRunId: 'r1',
      passed: false,
      failures: ['pass rate 50% is below 90%'],
      diagnostics: ['baseline is stale'],
      newlyFailingRows: [{ suite: 'safety', id: 'row-1', category: 'pii', severity: 'critical' }],
    });
    expect(out).toContain('## Eval gate: FAILED');
    expect(out).toContain('compared with baseline `r1`');
    expect(out).toContain('- pass rate 50% is below 90%');
    expect(out).toContain('| safety | row-1 | pii | critical |');
    expect(out).toContain('- baseline is stale');
  });

  it('should escape html, pipes and newlines when text echoes model output', () => {
    const out = renderStepSummary({
      runId: 'r3',
      passed: false,
      failures: ['<img src=x onerror=1>\nnext'],
      diagnostics: [],
      newlyFailingRows: [{ suite: 'a|b', id: 'x' }],
    });
    expect(out).toContain('- &lt;img src=x onerror=1&gt; next');
    expect(out).toContain('| a\\|b | x | - | - |');
  });
});
