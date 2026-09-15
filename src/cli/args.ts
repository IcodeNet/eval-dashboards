export type CliArgs = {
  command?: string;
  options: Record<string, string | boolean | string[]>;
};

/**
 * Flags each command accepts, kept in sync with `docs/cli-help/*.txt`.
 *
 * Unknown flags are rejected rather than ignored: a mistyped gate flag such as
 * `--min-pass-rat=0.9` would otherwise silently drop the gate and let a bad
 * build pass CI green.
 */
const commonFlags = ['--help'] as const;

export const knownFlagsByCommand: Record<string, readonly string[]> = {
  report: [
    '--input',
    '--report-dir',
    '--reporter',
    '--theme',
    '--locale',
    '--run-id',
    '--baseline-run-id',
    '--baseline-strategy',
    '--baseline-lookback',
    '--profile',
    '--statistical-mode',
    '--confidence-level',
    '--bootstrap-samples',
    '--min-pass-rate-delta',
  ],
  'report-index': ['--input', '--out', '--locale'],
  lint: ['--input', '--strict', '--fail-on-warning-code'],
  check: [
    '--input',
    '--report-dir',
    '--run-id',
    '--min-pass-rate',
    '--max-new-failures',
    '--zero-critical',
    '--max-warnings',
    '--max-warning-code',
    '--fail-on-warning-code',
    '--new-failure-key',
    '--require-suite-pass',
    '--baseline-run-id',
    '--baseline-strategy',
    '--baseline-lookback',
    '--allow-blocked-baseline',
    '--statistical-mode',
    '--confidence-level',
    '--bootstrap-samples',
    '--min-pass-rate-delta',
    '--min-matched-expectation-rate',
    '--json-out',
    '--junit-out',
    '--sarif-out',
    '--github-annotations-out',
    '--heartbeat-out',
    '--notify',
    '--notify-webhook',
    '--notify-slack-webhook',
    '--notify-teams-webhook',
    '--notify-email-smtp',
    '--notify-email-from',
    '--notify-email-to',
    '--notify-report-link',
    '--calibration-suite',
    '--calibration-max-age-hours',
    '--calibration-preflight',
    '--allow-stale-calibration',
    '--no-calibration-preflight',
  ],
  merge: ['--input', '--out'],
  history: ['--input', '--out'],
  publish: [
    '--target',
    '--report-dir',
    '--input',
    '--out-dir',
    '--dry-run',
    '--redact',
    '--repo',
    '--branch',
    '--token',
    '--app-name',
    '--account',
    '--container',
  ],
  teach: [
    '--preset',
    '--setup',
    '--runner',
    '--ci',
    '--write',
    '--dry-run',
    '--teach',
    '--out-dir',
    '--force',
    '--playbook',
  ],
  init: [
    '--preset',
    '--setup',
    '--runner',
    '--ci',
    '--write',
    '--dry-run',
    '--teach',
    '--out-dir',
    '--force',
    '--playbook',
  ],
  completion: ['--shell'],
  import: ['--from', '--input', '--out', '--suite'],
  adjudicate: ['--input', '--run-id', '--out', '--bundle', '--include-passed', '--allow-single-reviewer'],
};

const levenshtein = (a: string, b: string): number => {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, index) => index);

  for (let i = 1; i < rows; i += 1) {
    const current = [i];

    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }

    previous = current;
  }

  return previous[cols - 1] ?? 0;
};

const suggestFlag = (flag: string, candidates: readonly string[]): string | undefined => {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = levenshtein(flag, candidate);

    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  // Only suggest genuinely close matches, so a wild flag does not get a
  // confident but useless "did you mean".
  return bestDistance <= 3 ? best : undefined;
};

export class UnknownFlagError extends Error {
  readonly flag: string;
  readonly suggestion?: string;

  constructor(flag: string, command: string, suggestion?: string) {
    const hint = suggestion ? ` Did you mean ${suggestion}?` : '';
    super(
      `Unknown option ${flag} for command "${command}".${hint}` +
        `\nRun "eval-dashboards ${command} --help" to see supported options.`,
    );
    this.name = 'UnknownFlagError';
    this.flag = flag;
    this.suggestion = suggestion;
  }
}

/**
 * Throws {@link UnknownFlagError} when the parsed options contain a flag the
 * command does not support. Commands absent from the registry are skipped so
 * new commands fail open rather than breaking.
 */
export const assertKnownFlags = (args: CliArgs): void => {
  const { command, options } = args;

  if (!command) {
    return;
  }

  const known = knownFlagsByCommand[command];

  if (!known) {
    return;
  }

  const allowed = [...known, ...commonFlags];

  for (const key of Object.keys(options)) {
    const flag = `--${key}`;

    if (!allowed.includes(flag)) {
      throw new UnknownFlagError(flag, command, suggestFlag(flag, allowed));
    }
  }
};

export const parseArgs = (argv: string[]): CliArgs => {
  const [command, ...rest] = argv;
  const options: Record<string, string | boolean | string[]> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];

    if (!token?.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const next = rest[index + 1];
    const value = inlineValue ?? (next && !next.startsWith('--') ? next : true);

    if (value === next) {
      index += 1;
    }

    const existing = options[rawKey];

    if (existing === undefined) {
      options[rawKey] = value;
    } else if (Array.isArray(existing)) {
      existing.push(String(value));
    } else {
      options[rawKey] = [String(existing), String(value)];
    }
  }

  return { command, options };
};

export const optionString = (
  options: Record<string, string | boolean | string[]>,
  name: string,
  fallback: string,
): string => {
  const value = options[name];

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0] ?? fallback;
  }

  return fallback;
};

export const optionStrings = (
  options: Record<string, string | boolean | string[]>,
  name: string,
  fallback: string[],
): string[] => {
  const value = options[name];

  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return fallback;
};

export const optionNumber = (
  options: Record<string, string | boolean | string[]>,
  name: string,
): number | undefined => {
  const value = options[name];

  if (typeof value !== 'string') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const optionBoolean = (
  options: Record<string, string | boolean | string[]>,
  name: string,
): boolean => options[name] === true || options[name] === 'true';