import path from 'node:path';
import type { BaselineCompatibilityResult } from '../model/eval-report-v1.js';
import type { NotificationChannel } from '../config/config.js';

export type NotificationDispatchResult = {
  channel: NotificationChannel;
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
};

export type NotificationEvent = {
  runId: string;
  baselineRunId?: string;
  reportLink: string;
  failingSuites: string[];
  failures: string[];
  baselineCompatibility?: BaselineCompatibilityResult;
};

export type NotifierConfig = {
  slackWebhookUrl?: string;
  teamsWebhookUrl?: string;
  emailSmtpUrl?: string;
  emailFrom?: string;
  emailTo?: string[];
};

const FAILURE_PREVIEW_LIMIT = 8;

const eventSubject = (event: NotificationEvent): string =>
  `[eval-dashboards] Gate alert for run ${event.runId}`;

const eventMessage = (event: NotificationEvent): string => {
  const lines = [
    `Run: ${event.runId}`,
    `Baseline: ${event.baselineRunId ?? 'none'}`,
    `Failing suites: ${event.failingSuites.length > 0 ? event.failingSuites.join(', ') : 'none'}`,
    `Baseline compatibility: ${event.baselineCompatibility?.status ?? 'unknown'}`,
    `Report: ${event.reportLink}`,
    'Failures:',
    ...event.failures.slice(0, FAILURE_PREVIEW_LIMIT).map((failure, idx) => `  ${idx + 1}. ${failure}`),
  ];

  if (event.failures.length > FAILURE_PREVIEW_LIMIT) {
    lines.push(`  ... ${event.failures.length - FAILURE_PREVIEW_LIMIT} more`);
  }

  return lines.join('\n');
};

const sendWebhook = async (url: string, payload: Record<string, unknown>): Promise<void> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`webhook responded ${response.status}: ${body.slice(0, 200)}`);
  }
};

const normalizeEmailTargets = (targets: string[] | undefined): string[] =>
  (targets ?? []).map((target) => target.trim()).filter((target) => target.length > 0);

const redactSecrets = (value: string): string =>
  value
    .replace(/(smtp(?:s)?:\/\/)([^\s:@/]+):([^\s@/]+)@/gi, '$1[REDACTED]:[REDACTED]@')
    .replace(/(https?:\/\/)([^\s:@/]+):([^\s@/]+)@/gi, '$1[REDACTED]:[REDACTED]@')
    .replace(/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/gi, 'https://hooks.slack.com/services/[REDACTED]')
    .replace(/https:\/\/[A-Za-z0-9.-]*office\.com\/[A-Za-z0-9/_-]+/gi, 'https://[REDACTED].office.com/[REDACTED]');

const notificationFailure = (error: unknown): string =>
  redactSecrets(error instanceof Error ? error.message : String(error));

const sendWebhookByChannel = async (
  channel: 'slack' | 'teams',
  webhookUrl: string,
  event: NotificationEvent,
): Promise<void> => {
  if (channel === 'teams') {
    await sendWebhook(webhookUrl, {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
              {
                type: 'TextBlock',
                weight: 'Bolder',
                text: eventSubject(event),
                wrap: true,
              },
              {
                type: 'TextBlock',
                text: eventMessage(event),
                wrap: true,
              },
            ],
          },
        },
      ],
    });
    return;
  }

  await sendWebhook(webhookUrl, {
    text: `${eventSubject(event)}\n${eventMessage(event)}`,
  });
};

const sendEmail = async (config: NotifierConfig, event: NotificationEvent): Promise<void> => {
  const recipients = normalizeEmailTargets(config.emailTo);
  if (!config.emailSmtpUrl || !config.emailFrom) {
    throw new Error('missing email SMTP URL or sender address');
  }
  if (recipients.length === 0) {
    throw new Error('missing email recipients');
  }

  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    url: config.emailSmtpUrl,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });
  await transporter.sendMail({
    from: config.emailFrom,
    to: recipients,
    subject: eventSubject(event),
    text: eventMessage(event),
  });
};

export const defaultReportLink = (reportDir: string): string => path.resolve(reportDir, 'index.html');

export const sendGateNotifications = async (
  channels: NotificationChannel[],
  config: NotifierConfig,
  event: NotificationEvent,
): Promise<NotificationDispatchResult[]> => {
  const results: NotificationDispatchResult[] = [];

  for (const channel of channels) {
    if (channel === 'slack') {
      if (!config.slackWebhookUrl) {
        results.push({ channel, status: 'skipped', reason: 'missing Slack webhook URL' });
        continue;
      }
      try {
        await sendWebhookByChannel('slack', config.slackWebhookUrl, event);
        results.push({ channel, status: 'sent' });
      } catch (error) {
        results.push({ channel, status: 'failed', reason: notificationFailure(error) });
      }
      continue;
    }

    if (channel === 'teams') {
      if (!config.teamsWebhookUrl) {
        results.push({ channel, status: 'skipped', reason: 'missing Teams webhook URL' });
        continue;
      }
      try {
        await sendWebhookByChannel('teams', config.teamsWebhookUrl, event);
        results.push({ channel, status: 'sent' });
      } catch (error) {
        results.push({ channel, status: 'failed', reason: notificationFailure(error) });
      }
      continue;
    }

    try {
      await sendEmail(config, event);
      results.push({ channel, status: 'sent' });
    } catch (error) {
      const reason = notificationFailure(error) ?? 'unknown notification error';
      if (reason.includes('missing email')) {
        results.push({ channel, status: 'skipped', reason });
      } else {
        results.push({ channel, status: 'failed', reason });
      }
    }
  }

  return results;
};
