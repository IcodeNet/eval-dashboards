import type { GateConfig } from './check-gates.js';

/**
 * Segregation-of-duties guard for 4F.6: detects when a *resolved* gate
 * configuration (after CLI/config merge, exactly what `checkGates` will
 * enforce this run) is looser than a recorded baseline gate configuration.
 * A PR should not be able to both lower its own bar and pass on its own
 * authority — any loosening must be either explicitly allowed
 * (`--allow-gate-loosening` / `gates.allowLoosening` — the CODEOWNER-approval
 * escape hatch) or it fails the gate outright, regardless of whether the
 * run's rows themselves pass.
 */

export type ThresholdChangeDirection = 'loosened' | 'tightened' | 'unchanged';

export type ThresholdChange = {
  /** Dotted path into GateConfig, e.g. "minPassRate" or "calibration.maxAgeHours". */
  field: string;
  baselineValue: unknown;
  resolvedValue: unknown;
  direction: ThresholdChangeDirection;
  description: string;
};

export type ThresholdChangeResult = {
  /** Every detected change, including tightened/unchanged ones the caller may want to log. */
  changes: ThresholdChange[];
  /** True if at least one field loosened relative to the baseline. */
  loosened: boolean;
  failures: string[];
  diagnostics: string[];
};

const numberField = (
  field: string,
  baselineValue: number | undefined,
  resolvedValue: number | undefined,
  // 'higher' = a higher resolved value is looser (e.g. maxNewFailures);
  // 'lower' = a lower resolved value is looser (e.g. minPassRate).
  looserWhen: 'higher' | 'lower',
): ThresholdChange | undefined => {
  if (baselineValue === undefined || resolvedValue === undefined) return undefined;
  if (resolvedValue === baselineValue) {
    return {
      field,
      baselineValue,
      resolvedValue,
      direction: 'unchanged',
      description: `${field} unchanged (${baselineValue}).`,
    };
  }
  const isLooser = looserWhen === 'higher' ? resolvedValue > baselineValue : resolvedValue < baselineValue;
  const direction: ThresholdChangeDirection = isLooser ? 'loosened' : 'tightened';
  return {
    field,
    baselineValue,
    resolvedValue,
    direction,
    description: `${field} ${direction} from ${baselineValue} to ${resolvedValue}.`,
  };
};

const booleanField = (
  field: string,
  baselineValue: boolean | undefined,
  resolvedValue: boolean | undefined,
  // The value considered "strict"; flipping away from it is a loosening.
  strictValue: boolean,
): ThresholdChange | undefined => {
  if (baselineValue === undefined || resolvedValue === undefined) return undefined;
  if (resolvedValue === baselineValue) {
    return {
      field,
      baselineValue,
      resolvedValue,
      direction: 'unchanged',
      description: `${field} unchanged (${baselineValue}).`,
    };
  }
  const isLooser = baselineValue === strictValue && resolvedValue !== strictValue;
  const direction: ThresholdChangeDirection = isLooser ? 'loosened' : 'tightened';
  return {
    field,
    baselineValue,
    resolvedValue,
    direction,
    description: `${field} ${direction} from ${baselineValue} to ${resolvedValue}.`,
  };
};

const requiredPassingSuitesChange = (
  baselineValue: string[] | undefined,
  resolvedValue: string[] | undefined,
): ThresholdChange | undefined => {
  if (baselineValue === undefined || resolvedValue === undefined) return undefined;
  const baselineSet = new Set(baselineValue);
  const resolvedSet = new Set(resolvedValue);
  const removed = [...baselineSet].filter((suite) => !resolvedSet.has(suite));
  const added = [...resolvedSet].filter((suite) => !baselineSet.has(suite));
  if (removed.length === 0 && added.length === 0) {
    return {
      field: 'requiredPassingSuites',
      baselineValue,
      resolvedValue,
      direction: 'unchanged',
      description: 'requiredPassingSuites unchanged.',
    };
  }
  // Removing a required suite is a loosening even if suites were also added;
  // adding suites without removing any is a tightening.
  const direction: ThresholdChangeDirection = removed.length > 0 ? 'loosened' : 'tightened';
  const parts: string[] = [];
  if (removed.length > 0) parts.push(`removed [${removed.join(', ')}]`);
  if (added.length > 0) parts.push(`added [${added.join(', ')}]`);
  return {
    field: 'requiredPassingSuites',
    baselineValue,
    resolvedValue,
    direction,
    description: `requiredPassingSuites ${direction}: ${parts.join(', ')}.`,
  };
};

const maxWarningsByCodeChanges = (
  baselineValue: Record<string, number> | undefined,
  resolvedValue: Record<string, number> | undefined,
): ThresholdChange[] => {
  if (baselineValue === undefined && resolvedValue === undefined) return [];
  const codes = new Set([...Object.keys(baselineValue ?? {}), ...Object.keys(resolvedValue ?? {})]);
  const changes: ThresholdChange[] = [];
  for (const code of codes) {
    const baselineCount = baselineValue?.[code];
    const resolvedCount = resolvedValue?.[code];
    const change = numberField(`maxWarningsByCode.${code}`, baselineCount, resolvedCount, 'higher');
    if (change) changes.push(change);
    if (baselineCount !== undefined && resolvedCount === undefined) {
      changes.push({
        field: `maxWarningsByCode.${code}`,
        baselineValue: baselineCount,
        resolvedValue: undefined,
        direction: 'loosened',
        description: `maxWarningsByCode.${code} budget removed (was ${baselineCount}).`,
      });
    }
  }
  return changes;
};

const failOnWarningCodesChange = (
  baselineValue: string[] | undefined,
  resolvedValue: string[] | undefined,
): ThresholdChange | undefined => {
  if (baselineValue === undefined || resolvedValue === undefined) return undefined;
  const baselineSet = new Set(baselineValue);
  const resolvedSet = new Set(resolvedValue);
  const removed = [...baselineSet].filter((code) => !resolvedSet.has(code));
  const added = [...resolvedSet].filter((code) => !baselineSet.has(code));
  if (removed.length === 0 && added.length === 0) {
    return {
      field: 'failOnWarningCodes',
      baselineValue,
      resolvedValue,
      direction: 'unchanged',
      description: 'failOnWarningCodes unchanged.',
    };
  }
  const direction: ThresholdChangeDirection = removed.length > 0 ? 'loosened' : 'tightened';
  const parts: string[] = [];
  if (removed.length > 0) parts.push(`removed [${removed.join(', ')}]`);
  if (added.length > 0) parts.push(`added [${added.join(', ')}]`);
  return {
    field: 'failOnWarningCodes',
    baselineValue,
    resolvedValue,
    direction,
    description: `failOnWarningCodes ${direction}: ${parts.join(', ')}.`,
  };
};

/**
 * Compare a resolved gate configuration against a recorded baseline gate
 * configuration and report which thresholds loosened, tightened, or were
 * unchanged. Fields absent from either side are skipped (not compared) —
 * a field only newly introduced in the baseline or resolved config is not
 * treated as a "change" here, since there's no prior threshold to compare
 * against.
 */
export const detectGateConfigLoosening = (
  baseline: GateConfig,
  resolved: GateConfig,
): ThresholdChangeResult => {
  const changes: ThresholdChange[] = [];

  const push = (change: ThresholdChange | undefined) => {
    if (change) changes.push(change);
  };

  push(numberField('minPassRate', baseline.minPassRate, resolved.minPassRate, 'lower'));
  push(
    numberField(
      'minMatchedExpectationRate',
      baseline.minMatchedExpectationRate,
      resolved.minMatchedExpectationRate,
      'lower',
    ),
  );
  push(numberField('maxNewFailures', baseline.maxNewFailures, resolved.maxNewFailures, 'higher'));
  push(numberField('maxWarnings', baseline.maxWarnings, resolved.maxWarnings, 'higher'));
  push(booleanField('zeroCritical', baseline.zeroCritical, resolved.zeroCritical, true));
  push(
    booleanField(
      'failOnBaselineBlocked',
      baseline.failOnBaselineBlocked,
      resolved.failOnBaselineBlocked,
      true,
    ),
  );
  push(requiredPassingSuitesChange(baseline.requiredPassingSuites, resolved.requiredPassingSuites));
  push(failOnWarningCodesChange(baseline.failOnWarningCodes, resolved.failOnWarningCodes));
  changes.push(...maxWarningsByCodeChanges(baseline.maxWarningsByCode, resolved.maxWarningsByCode));

  push(
    numberField(
      'statistical.minPassRateDelta',
      baseline.statistical?.minPassRateDelta,
      resolved.statistical?.minPassRateDelta,
      'lower',
    ),
  );
  push(
    numberField(
      'statistical.confidenceLevel',
      baseline.statistical?.confidenceLevel,
      resolved.statistical?.confidenceLevel,
      'lower',
    ),
  );
  push(
    booleanField(
      'calibration.enabled',
      baseline.calibration?.enabled,
      resolved.calibration?.enabled,
      true,
    ),
  );
  push(
    numberField(
      'calibration.maxAgeHours',
      baseline.calibration?.maxAgeHours,
      resolved.calibration?.maxAgeHours,
      'higher',
    ),
  );
  push(
    booleanField(
      'calibration.allowBlockingWithoutRecentMatch',
      baseline.calibration?.allowBlockingWithoutRecentMatch,
      resolved.calibration?.allowBlockingWithoutRecentMatch,
      false,
    ),
  );

  const loosenedChanges = changes.filter((change) => change.direction === 'loosened');
  const loosened = loosenedChanges.length > 0;

  const failures = loosenedChanges.map(
    (change) => `Gate configuration loosened without approval: ${change.description}`,
  );
  const diagnostics = changes
    .filter((change) => change.direction !== 'unchanged')
    .map((change) => `Gate config change (${change.direction}): ${change.description}`);

  return { changes, loosened, failures, diagnostics };
};
