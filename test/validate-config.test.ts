import { describe, expect, it } from 'vitest';
import { findUnknownConfigKeys } from '../src/config/validate-config.js';

describe('findUnknownConfigKeys', () => {
  it('should report nothing when every key is a real setting', () => {
    const config = {
      input: ['.evals_output'],
      reportDir: 'eval-report',
      gates: { minPassRate: 0.9, statistical: { mode: 'bootstrap' }, calibration: { suite: 'judge-calibration' } },
      baseline: { strategy: 'rolling', lookback: 5 },
      notifications: { channels: ['slack'], slack: { webhookUrl: 'https://example.test' } },
    };

    expect(findUnknownConfigKeys(config)).toEqual([]);
  });

  it('should suggest minPassRate when gates.minPassRat is set', () => {
    const issues = findUnknownConfigKeys({ gates: { minPassRat: 0.9 } });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('gates.minPassRat: not a setting. Did you mean "minPassRate"?');
  });

  it('should report a misspelled top-level key when gatez is set', () => {
    expect(findUnknownConfigKeys({ gatez: {} })[0]).toContain('gatez: not a setting. Did you mean "gates"?');
  });

  it('should report a nested key with its dotted path when a statistical key is wrong', () => {
    expect(findUnknownConfigKeys({ gates: { statistical: { mod: 'bootstrap' } } })[0]).toContain(
      'gates.statistical.mod: not a setting. Did you mean "mode"?',
    );
  });

  it('should list the allowed keys without a suggestion when nothing is close', () => {
    const [issue] = findUnknownConfigKeys({ qqqqqqqqqqqq: 1 });

    expect(issue).not.toContain('Did you mean');
    expect(issue).toContain('Allowed here: input,');
  });

  it('should not check keys inside free-form maps when maxWarningsByCode holds custom codes', () => {
    expect(findUnknownConfigKeys({ gates: { maxWarningsByCode: { 'custom-code': 1 } } })).toEqual([]);
  });

  it('should accept gates.suites when a per-suite threshold map is set', () => {
    expect(findUnknownConfigKeys({ gates: { suites: { safety: { minPassRate: 1 } } } })).toEqual([]);
  });

  it('should report every unknown key when several are wrong', () => {
    expect(findUnknownConfigKeys({ gates: { minPassRat: 1, zeroCriticall: true }, themee: 'dark' })).toHaveLength(3);
  });
});
