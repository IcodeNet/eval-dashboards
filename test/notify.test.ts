import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('nodemailer', () => {
  const sendMail = vi.fn().mockResolvedValue({ messageId: 'msg-1' });
  const createTransport = vi.fn(() => ({ sendMail }));
  return {
    default: {
      createTransport,
    },
    __mocks: { createTransport, sendMail },
  };
});

import nodemailer from 'nodemailer';
import { sendGateNotifications } from '../src/notifications/notify.js';

const mockedFetch = vi.fn();

beforeEach(() => {
  mockedFetch.mockReset();
  vi.stubGlobal('fetch', mockedFetch);
});

describe('sendGateNotifications', () => {
  const event = {
    runId: 'run-007',
    baselineRunId: 'run-006',
    reportLink: '/tmp/eval-report/index.html',
    failingSuites: ['policy', 'retrieval'],
    failures: ['Pass rate 0.70 is below required 0.90.'],
    baselineCompatibility: {
      status: 'compatible' as const,
      issues: [],
    },
  };

  it('sends Slack webhook notifications with run context', async () => {
    mockedFetch.mockResolvedValue({ ok: true, text: async () => '' });

    const results = await sendGateNotifications(
      ['slack'],
      { slackWebhookUrl: 'https://hooks.slack.test/services/abc' },
      event,
    );

    expect(results).toEqual([{ channel: 'slack', status: 'sent' }]);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [, request] = mockedFetch.mock.calls[0] as [string, RequestInit];
    expect(request.method).toBe('POST');
    expect(String(request.body)).toContain('run-007');
    expect(String(request.body)).toContain('policy, retrieval');
    expect(String(request.body)).toContain('/tmp/eval-report/index.html');
  });

  it('sends Teams adaptive-card webhooks and reports webhook errors', async () => {
    mockedFetch
      .mockResolvedValueOnce({ ok: true, text: async () => '' })
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'internal error' });

    const results = await sendGateNotifications(
      ['teams', 'slack'],
      {
        teamsWebhookUrl: 'https://teams.test/hook',
        slackWebhookUrl: 'https://hooks.slack.test/services/abc',
      },
      event,
    );

    expect(results).toEqual([
      { channel: 'teams', status: 'sent' },
      {
        channel: 'slack',
        status: 'failed',
        reason: expect.stringContaining('webhook responded 500'),
      },
    ]);

    const [teamsCall] = mockedFetch.mock.calls;
    const [, teamsRequest] = teamsCall as [string, RequestInit];
    expect(String(teamsRequest.body)).toContain('AdaptiveCard');
    expect(String(teamsRequest.body)).toContain('attachments');
  });

  it('sends email notifications via SMTP', async () => {
    const results = await sendGateNotifications(
      ['email'],
      {
        emailSmtpUrl: 'smtp://localhost:2525',
        emailFrom: 'evals@example.com',
        emailTo: ['team@example.com'],
      },
      event,
    );

    expect(results).toEqual([{ channel: 'email', status: 'sent' }]);

    const transportFactory = vi.mocked(nodemailer.createTransport);
    expect(transportFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'smtp://localhost:2525',
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      }),
    );

    const transport = transportFactory.mock.results[0]?.value as { sendMail: ReturnType<typeof vi.fn> };
    expect(transport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'evals@example.com',
        to: ['team@example.com'],
        subject: expect.stringContaining('run-007'),
      }),
    );
  });

  it('skips channels with missing configuration', async () => {
    const results = await sendGateNotifications(['slack', 'email'], {}, event);

    expect(results).toEqual([
      { channel: 'slack', status: 'skipped', reason: 'missing Slack webhook URL' },
      { channel: 'email', status: 'skipped', reason: 'missing email SMTP URL or sender address' },
    ]);
  });

  it('redacts SMTP credentials from notification errors', async () => {
    const transportFactory = vi.mocked(nodemailer.createTransport);
    transportFactory.mockImplementationOnce(() => ({
      sendMail: vi.fn().mockRejectedValue(new Error('auth failed for smtp://user:password@mail.example.com')),
    }) as any);

    const results = await sendGateNotifications(
      ['email'],
      {
        emailSmtpUrl: 'smtp://user:password@mail.example.com',
        emailFrom: 'evals@example.com',
        emailTo: ['team@example.com'],
      },
      event,
    );

    expect(results).toEqual([
      {
        channel: 'email',
        status: 'failed',
        reason: expect.stringContaining('smtp://[REDACTED]:[REDACTED]@mail.example.com'),
      },
    ]);
  });
});
