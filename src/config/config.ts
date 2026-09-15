import type { ReporterName } from '../reporters/render.js';
import type { GateConfig } from '../gates/check-gates.js';
import type { EvalReportsTheme } from '../reporters/themes.js';
import type { BaselineStrategy } from '../history/history.js';

export type BaselineConfig = {
  /** Baseline run selection strategy when baselineRunId is not specified. */
  strategy?: BaselineStrategy;
  /** Optional lookback window (number of prior runs considered by the strategy). */
  lookback?: number;
};

export type NotificationChannel = 'slack' | 'teams' | 'email';

export type WebhookNotificationConfig = {
  webhookUrl?: string;
};

export type EmailNotificationConfig = {
  smtpUrl?: string;
  from?: string;
  to?: string | string[];
};

export type NotificationsConfig = {
  /** Channels to notify when check gates fail or baseline compatibility is blocked. */
  channels?: NotificationChannel[];
  /** Optional report URL/path included in notification payloads. */
  reportUrl?: string;
  slack?: WebhookNotificationConfig;
  teams?: WebhookNotificationConfig;
  email?: EmailNotificationConfig;
};

export type EvalReportsConfig = {
  /** Glob patterns or directory for artifact discovery. Default: ['.evals_output/**\/*.json'] */
  input?: string | string[];
  /** Directory where reports are written. Default: 'eval-report' */
  reportDir?: string;
  /** Reporters to run. Default: ['html', 'text'] */
  reporters?: ReporterName[];
  /** Gate configuration applied by eval-dashboards check. */
  gates?: GateConfig;
  /** Built-in theme name ('default' | 'dark' | 'minimal') or a custom theme object. */
  theme?: string | Partial<EvalReportsTheme>;
  /** BCP 47 locale for date/number formatting. Default: 'en-GB' */
  locale?: string;
  /** Baseline comparison selection rules. */
  baseline?: BaselineConfig;
  /** Optional gate alerting adapters (Slack/Teams webhook, email via SMTP). */
  notifications?: NotificationsConfig;
  /** Path to an `eval-waiver-register/v1` JSON file honoured by `check`. */
  waiverFile?: string;
  /**
   * Path to a recorded baseline `GateConfig` JSON file. `check` compares
   * the resolved gate configuration for this run against it and fails the
   * gate on any unapproved loosening (see `gates.allowLoosening`).
   */
  baselineGateConfigFile?: string;
  /**
   * 4F.9 — path to a JSON-lines bypass usage log. `check` and `publish`
   * append one record per invocation when this (or `--bypass-log`) is set,
   * recording which gate escape hatches were used, so usage can be counted
   * and trended over time instead of only discovered by reading CI logs.
   */
  bypassLogFile?: string;
};
