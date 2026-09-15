/**
 * 4F.9 — Bypass accounting.
 *
 * The gate escape hatches (`--allow-blocked-baseline`, `--allow-stale-calibration`,
 * `--allow-gate-loosening`, `--allow-sensitive-publish`) exist so a human can make
 * an informed, auditable exception. Each one is legitimate in isolation. The risk
 * this module addresses is *erosion*: nobody notices when the same flag is passed
 * on every run for months, quietly turning a gate into a no-op. This module turns
 * "how often are we bypassing the gate" into a first-class, queryable count instead
 * of something only discoverable by reading CI logs during an audit.
 */

/** Which bypass flags were active for a single command invocation. */
export type BypassFlags = {
  allowBlockedBaseline: boolean;
  allowStaleCalibration: boolean;
  allowGateLoosening: boolean;
  allowSensitivePublish: boolean;
};

export const NO_BYPASSES: BypassFlags = {
  allowBlockedBaseline: false,
  allowStaleCalibration: false,
  allowGateLoosening: false,
  allowSensitivePublish: false,
};

/** Summary of bypass usage for a single invocation: which flags, and how many. */
export type BypassUsageSummary = {
  flags: BypassFlags;
  /** Names of the flags that were used (true), in a stable, documented order. */
  used: Array<keyof BypassFlags>;
  count: number;
};

const FLAG_ORDER: Array<keyof BypassFlags> = [
  'allowBlockedBaseline',
  'allowStaleCalibration',
  'allowGateLoosening',
  'allowSensitivePublish',
];

/** Human-readable CLI flag name for a given bypass flag key, for diagnostics. */
export const BYPASS_FLAG_CLI_NAMES: Record<keyof BypassFlags, string> = {
  allowBlockedBaseline: '--allow-blocked-baseline',
  allowStaleCalibration: '--allow-stale-calibration',
  allowGateLoosening: '--allow-gate-loosening',
  allowSensitivePublish: '--allow-sensitive-publish',
};

/** Build a bypass usage summary from a set of flags (defaults fill in `false`). */
export const summarizeBypassUsage = (flags: Partial<BypassFlags>): BypassUsageSummary => {
  const resolved: BypassFlags = { ...NO_BYPASSES, ...flags };
  const used = FLAG_ORDER.filter((key) => resolved[key]);
  return {
    flags: resolved,
    used,
    count: used.length,
  };
};

/** One recorded bypass-usage event, persisted across runs for trend accounting. */
export type BypassLogEntryV1 = {
  schemaVersion: 'eval-bypass-log-entry/v1';
  command: 'check' | 'publish';
  runId?: string;
  generatedAt: string;
  flags: BypassFlags;
  used: Array<keyof BypassFlags>;
  count: number;
};

export const BYPASS_LOG_SCHEMA_VERSION = 'eval-bypass-log-entry/v1' as const;

export const buildBypassLogEntry = (
  command: BypassLogEntryV1['command'],
  usage: BypassUsageSummary,
  options: { runId?: string; generatedAt?: string } = {},
): BypassLogEntryV1 => ({
  schemaVersion: BYPASS_LOG_SCHEMA_VERSION,
  command,
  runId: options.runId,
  generatedAt: options.generatedAt ?? new Date().toISOString(),
  flags: usage.flags,
  used: usage.used,
  count: usage.count,
});

/** Parse a bypass log file's contents (one JSON object per line; blank lines ignored). */
export const parseBypassLog = (raw: string): BypassLogEntryV1[] => {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as BypassLogEntryV1);
};

/** Serialize a single bypass log entry as one JSON-lines record (including trailing newline). */
export const serializeBypassLogEntry = (entry: BypassLogEntryV1): string => `${JSON.stringify(entry)}\n`;

/** Aggregate counts across a set of log entries, e.g. for a rollup or trend view. */
export type BypassLogAggregate = {
  totalEvents: number;
  totalBypasses: number;
  byFlag: Record<keyof BypassFlags, number>;
};

export const aggregateBypassLog = (entries: BypassLogEntryV1[]): BypassLogAggregate => {
  const byFlag: Record<keyof BypassFlags, number> = {
    allowBlockedBaseline: 0,
    allowStaleCalibration: 0,
    allowGateLoosening: 0,
    allowSensitivePublish: 0,
  };
  let totalBypasses = 0;

  for (const entry of entries) {
    for (const key of FLAG_ORDER) {
      if (entry.flags[key]) {
        byFlag[key] += 1;
        totalBypasses += 1;
      }
    }
  }

  return {
    totalEvents: entries.length,
    totalBypasses,
    byFlag,
  };
};

/** Bypass usage attributable to a specific runId, for joining into `history`. */
export const bypassUsageForRun = (
  entries: BypassLogEntryV1[],
  runId: string,
): BypassUsageSummary | undefined => {
  const matches = entries.filter((entry) => entry.runId === runId);
  if (matches.length === 0) {
    return undefined;
  }
  // A run may be checked more than once (retries); union the flags used so a
  // single genuine bypass anywhere in the run's history is never hidden by a
  // later invocation of `check` that happened not to need it.
  const flags: BypassFlags = { ...NO_BYPASSES };
  for (const entry of matches) {
    for (const key of FLAG_ORDER) {
      if (entry.flags[key]) {
        flags[key] = true;
      }
    }
  }
  return summarizeBypassUsage(flags);
};
