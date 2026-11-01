import { suggestClosest } from '../utils/suggest.js';

type KeyTree = { [key: string]: KeyTree | null };

/** Every key a config file may set. A `null` value means the key holds a plain value or free-form map. */
const CONFIG_KEYS: KeyTree = {
  input: null,
  reportDir: null,
  reporters: null,
  theme: null,
  locale: null,
  waiverFile: null,
  baselineGateConfigFile: null,
  bypassLogFile: null,
  baseline: { strategy: null, lookback: null },
  gates: {
    minPassRate: null,
    minMatchedExpectationRate: null,
    maxNewFailures: null,
    zeroCritical: null,
    failOnBaselineBlocked: null,
    maxWarnings: null,
    maxWarningsByCode: null,
    failOnWarningCodes: null,
    newFailureKey: null,
    requiredPassingSuites: null,
    suites: null,
    allowLoosening: null,
    paired: { confidenceLevel: null, minDelta: null, minClusters: null, independentClusters: null },
    statistical: { mode: null, confidenceLevel: null, bootstrapSamples: null, minPassRateDelta: null },
    repeat: { runs: null, requiredPasses: null },
    calibration: { enabled: null, suite: null, maxAgeHours: null, allowBlockingWithoutRecentMatch: null },
  },
  notifications: {
    channels: null,
    reportUrl: null,
    slack: { webhookUrl: null },
    teams: { webhookUrl: null },
    email: { smtpUrl: null, from: null, to: null },
  },
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const collectIssues = (value: Record<string, unknown>, tree: KeyTree, prefix: string, issues: string[]): void => {
  const allowed = Object.keys(tree);
  for (const [key, child] of Object.entries(value)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (!Object.hasOwn(tree, key)) {
      const suggestion = suggestClosest(key, allowed);
      const hint = suggestion ? ` Did you mean "${suggestion}"?` : '';
      issues.push(`${dotted}: not a setting.${hint} Allowed here: ${allowed.join(', ')}.`);
      continue;
    }
    const subtree = tree[key];
    if (subtree && isPlainObject(child)) {
      collectIssues(child, subtree, dotted, issues);
    }
  }
};

/**
 * One message per unknown key. A misspelled gate key is otherwise ignored, which
 * silently turns that gate off.
 */
export const findUnknownConfigKeys = (config: Record<string, unknown>): string[] => {
  const issues: string[] = [];
  collectIssues(config, CONFIG_KEYS, '', issues);
  return issues;
};
