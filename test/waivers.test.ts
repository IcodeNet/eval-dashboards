import { describe, expect, it } from 'vitest';
import { applyWaivers, loadWaiverRegister, WaiverRegisterError, type WaiverRegisterV1 } from '../src/gates/waivers.js';
import { checkGates } from '../src/gates/check-gates.js';
import { compareRuns } from '../src/history/history.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const report: EvalReportV1 = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'current', generatedAt: '2026-09-15T10:00:00.000Z' },
  suites: [{ id: 'quality', total: 2, passed: 1, failed: 1 }],
  rows: [
    { id: 'tone', suite: 'quality', passed: true },
    { id: 'safety', suite: 'quality', passed: false, severity: 'critical' },
  ],
};

describe('loadWaiverRegister', () => {
  let dir: string;

  const write = async (contents: string) => {
    dir = await mkdtemp(path.join(tmpdir(), 'waivers-'));
    const file = path.join(dir, 'waivers.json');
    await writeFile(file, contents, 'utf8');
    return file;
  };

  it('parses a valid register', async () => {
    const file = await write(
      JSON.stringify({
        schemaVersion: 'eval-waiver-register/v1',
        waivers: [
          {
            id: 'w-1',
            suite: 'quality',
            rowId: 'safety',
            reason: 'Known flaky judge, fix tracked',
            riskOwner: 'alice@example.com',
            ticket: 'JIRA-123',
            expiresAt: '2099-01-01T00:00:00.000Z',
          },
        ],
      }),
    );
    const register = await loadWaiverRegister(file);
    expect(register.waivers).toHaveLength(1);
    await rm(dir, { recursive: true, force: true });
  });

  it('rejects malformed JSON', async () => {
    const file = await write('not json');
    await expect(loadWaiverRegister(file)).rejects.toThrow(WaiverRegisterError);
    await rm(dir, { recursive: true, force: true });
  });

  it('rejects a register missing required fields', async () => {
    const file = await write(
      JSON.stringify({ schemaVersion: 'eval-waiver-register/v1', waivers: [{ id: 'w-1' }] }),
    );
    await expect(loadWaiverRegister(file)).rejects.toThrow(/missing required string field/);
    await rm(dir, { recursive: true, force: true });
  });

  it('rejects an invalid expiresAt date', async () => {
    const file = await write(
      JSON.stringify({
        schemaVersion: 'eval-waiver-register/v1',
        waivers: [
          {
            id: 'w-1',
            suite: 'quality',
            reason: 'x',
            riskOwner: 'alice',
            ticket: 'JIRA-1',
            expiresAt: 'not-a-date',
          },
        ],
      }),
    );
    await expect(loadWaiverRegister(file)).rejects.toThrow(/invalid expiresAt/);
    await rm(dir, { recursive: true, force: true });
  });
});

describe('applyWaivers', () => {
  it('treats a matched active waiver row as passed for gating', () => {
    const register: WaiverRegisterV1 = {
      schemaVersion: 'eval-waiver-register/v1',
      waivers: [
        {
          id: 'w-1',
          suite: 'quality',
          rowId: 'safety',
          reason: 'Known issue, fix in flight',
          riskOwner: 'alice@example.com',
          ticket: 'JIRA-123',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      ],
    };

    const result = applyWaivers(report, register, new Date('2026-09-15T12:00:00.000Z'));
    expect(result.active).toHaveLength(1);
    expect(result.expired).toHaveLength(0);
    expect(result.failures).toHaveLength(0);
    expect(result.diagnostics.some((line) => line.includes('ACTIVE WAIVER'))).toBe(true);
    const gatedRow = result.reportForGating.rows.find((row) => row.id === 'safety');
    expect(gatedRow?.passed).toBe(true);

    const gateResult = checkGates(result.reportForGating, compareRuns(result.reportForGating, undefined), {
      minPassRate: 1,
    });
    expect(gateResult.passed).toBe(true);
  });

  it('fails the gate when a waiver has expired, even if the row still fails', () => {
    const register: WaiverRegisterV1 = {
      schemaVersion: 'eval-waiver-register/v1',
      waivers: [
        {
          id: 'w-1',
          suite: 'quality',
          rowId: 'safety',
          reason: 'Known issue',
          riskOwner: 'alice@example.com',
          ticket: 'JIRA-123',
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    };

    const result = applyWaivers(report, register, new Date('2026-09-15T12:00:00.000Z'));
    expect(result.expired).toHaveLength(1);
    expect(result.failures.some((line) => line.includes('expired'))).toBe(true);
    // Expired waivers do not suppress the underlying failure.
    const gatedRow = result.reportForGating.rows.find((row) => row.id === 'safety');
    expect(gatedRow?.passed).toBe(false);
  });

  it('reports unmatched active waivers as diagnostics only, not failures', () => {
    const register: WaiverRegisterV1 = {
      schemaVersion: 'eval-waiver-register/v1',
      waivers: [
        {
          id: 'w-stale',
          suite: 'quality',
          rowId: 'nonexistent-row',
          reason: 'Old issue, already fixed',
          riskOwner: 'bob@example.com',
          ticket: 'JIRA-999',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      ],
    };

    const result = applyWaivers(report, register, new Date('2026-09-15T12:00:00.000Z'));
    expect(result.unmatched).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
    expect(result.diagnostics.some((line) => line.includes('did not match any row'))).toBe(true);
  });

  it('waives an entire suite when rowId is omitted', () => {
    const register: WaiverRegisterV1 = {
      schemaVersion: 'eval-waiver-register/v1',
      waivers: [
        {
          id: 'w-suite',
          suite: 'quality',
          reason: 'Suite-wide known regression',
          riskOwner: 'carol@example.com',
          ticket: 'JIRA-1',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      ],
    };

    const result = applyWaivers(report, register, new Date('2026-09-15T12:00:00.000Z'));
    expect(result.active).toHaveLength(1);
    expect(result.active[0].matchedRowIds).toEqual(['tone', 'safety']);
  });

  it('is a no-op when no register is provided', () => {
    const result = applyWaivers(report, undefined);
    expect(result.reportForGating).toBe(report);
    expect(result.active).toHaveLength(0);
  });
});
