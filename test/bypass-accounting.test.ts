import { describe, expect, it } from 'vitest';
import {
  summarizeBypassUsage,
  buildBypassLogEntry,
  parseBypassLog,
  serializeBypassLogEntry,
  aggregateBypassLog,
  bypassUsageForRun,
  NO_BYPASSES,
  type BypassLogEntryV1,
} from '../src/gates/bypass-accounting.js';

describe('summarizeBypassUsage', () => {
  it('reports a clean count of 0 with no flags set', () => {
    const usage = summarizeBypassUsage({});
    expect(usage.count).toBe(0);
    expect(usage.used).toEqual([]);
    expect(usage.flags).toEqual(NO_BYPASSES);
  });

  it('counts and lists only the flags that are true', () => {
    const usage = summarizeBypassUsage({ allowBlockedBaseline: true, allowGateLoosening: true });
    expect(usage.count).toBe(2);
    expect(usage.used).toEqual(['allowBlockedBaseline', 'allowGateLoosening']);
  });

  it('counts all four flags when all are set', () => {
    const usage = summarizeBypassUsage({
      allowBlockedBaseline: true,
      allowStaleCalibration: true,
      allowGateLoosening: true,
      allowSensitivePublish: true,
    });
    expect(usage.count).toBe(4);
  });
});

describe('bypass log round-trip', () => {
  it('serializes and parses a JSON-lines log', () => {
    const usage = summarizeBypassUsage({ allowBlockedBaseline: true });
    const entry = buildBypassLogEntry('check', usage, { runId: 'run-1', generatedAt: '2026-01-01T00:00:00.000Z' });
    const line = serializeBypassLogEntry(entry);
    expect(line.endsWith('\n')).toBe(true);

    const otherUsage = summarizeBypassUsage({ allowSensitivePublish: true });
    const otherEntry = buildBypassLogEntry('publish', otherUsage, { runId: 'run-2' });
    const raw = line + serializeBypassLogEntry(otherEntry);

    const parsed = parseBypassLog(raw);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.command).toBe('check');
    expect(parsed[0]?.runId).toBe('run-1');
    expect(parsed[1]?.command).toBe('publish');
  });

  it('ignores blank lines', () => {
    const parsed = parseBypassLog('\n\n');
    expect(parsed).toEqual([]);
  });
});

describe('aggregateBypassLog', () => {
  it('counts total events and per-flag usage across entries', () => {
    const entries: BypassLogEntryV1[] = [
      buildBypassLogEntry('check', summarizeBypassUsage({ allowBlockedBaseline: true }), { runId: 'a' }),
      buildBypassLogEntry('check', summarizeBypassUsage({ allowBlockedBaseline: true, allowGateLoosening: true }), {
        runId: 'b',
      }),
      buildBypassLogEntry('publish', summarizeBypassUsage({}), { runId: 'c' }),
    ];

    const aggregate = aggregateBypassLog(entries);
    expect(aggregate.totalEvents).toBe(3);
    expect(aggregate.totalBypasses).toBe(3);
    expect(aggregate.byFlag.allowBlockedBaseline).toBe(2);
    expect(aggregate.byFlag.allowGateLoosening).toBe(1);
    expect(aggregate.byFlag.allowStaleCalibration).toBe(0);
    expect(aggregate.byFlag.allowSensitivePublish).toBe(0);
  });
});

describe('bypassUsageForRun', () => {
  it('returns undefined when no entry matches the run id', () => {
    const entries = [buildBypassLogEntry('check', summarizeBypassUsage({}), { runId: 'other' })];
    expect(bypassUsageForRun(entries, 'run-x')).toBeUndefined();
  });

  it('unions flags across multiple entries for the same run id (retries)', () => {
    const entries = [
      buildBypassLogEntry('check', summarizeBypassUsage({ allowBlockedBaseline: true }), { runId: 'run-x' }),
      buildBypassLogEntry('check', summarizeBypassUsage({ allowGateLoosening: true }), { runId: 'run-x' }),
    ];
    const usage = bypassUsageForRun(entries, 'run-x');
    expect(usage?.count).toBe(2);
    expect(usage?.flags.allowBlockedBaseline).toBe(true);
    expect(usage?.flags.allowGateLoosening).toBe(true);
  });
});
