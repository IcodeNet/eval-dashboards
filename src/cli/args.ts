import { suggestClosest } from '../utils/suggest.js';

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
    '--json-v2-out',
    '--junit-out',
    '--sarif-out',
    '--github-annotations-out',
    '--step-summary-out',
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
    '--waiver-file',
    '--baseline-gate-config',
    '--allow-gate-loosening',
    '--bypass-log',
    '--tier',
    '--max-pr-cost-usd',
    '--max-pr-duration-ms',
    '--repeat-runs',
    '--repeat-required-passes',
  ],
  merge: ['--input', '--out'],
  history: ['--input', '--out', '--bypass-log'],
  'history-convert': ['--input', '--out'],
  'history-report': ['--input', '--out', '--since', '--until', '--branch', '--suite', '--keep-last', '--max-age-days', '--prune-to', '--locale'],
  publish: [
    '--target',
    '--report-dir',
    '--input',
    '--out-dir',
    '--dry-run',
    '--redact',
    '--allow-sensitive-publish',
    '--repo',
    '--branch',
    '--token',
    '--app-name',
    '--account',
    '--container',
    '--bypass-log',
    '--pr-number',
    '--comment-marker',
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
  import: ['--from', '--input', '--out', '--suite', '--case-id-attribute'],
  adjudicate: ['--input', '--run-id', '--out', '--bundle', '--include-passed', '--allow-single-reviewer'],
  'heartbeat-verify': ['--heartbeat', '--max-age-hours'],
  'org-rollup': ['--input', '--out', '--locale'],
  'evidence-export': [
    '--report',
    '--check-result',
    '--waiver-file',
    '--bypass-log',
    '--approval-trail',
    '--signature',
    '--redact',
    '--run-id',
    '--baseline-run-id',
    '--out',
  ],
  sign: ['--artifact', '--out'],
  verify: ['--artifact', '--signature', '--certificate-identity-regexp', '--certificate-oidc-issuer'],
  schema: [],
  'evidence-verify': ['--bundle'],
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
      throw new UnknownFlagError(flag, command, suggestClosest(flag, allowed));
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

/** Parse an optional finite numeric flag; reject malformed values with CLI exit code 2. */
export const optionNumber = (
  options: Record<string, string | boolean | string[]>,
  name: string,
): number | undefined => {
  const value = options[name];

  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '' || !Number.isFinite(Number(value))) {
    throw Object.assign(new Error(`Invalid value for --${name}: expected a finite number.`), {
      exitCode: 2,
    });
  }
  return Number(value);
};

export const optionBoolean = (
  options: Record<string, string | boolean | string[]>,
  name: string,
): boolean => options[name] === true || options[name] === 'true';