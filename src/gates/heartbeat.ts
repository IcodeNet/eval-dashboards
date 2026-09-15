/**
 * Shared heartbeat payload contract (`eval-check-heartbeat/v1`), plus the
 * heartbeat *verifier* for 4F.7: a scheduled, independent check that a fresh
 * heartbeat exists at all. `check --heartbeat-out=<path>` (4E.2) only proves
 * a gate produced a distinguishable status *when it runs*. It cannot detect
 * a release where the gate step itself was deleted or skipped from the
 * pipeline entirely, because in that case nothing ever writes the file, and
 * `check` never runs to notice. The verifier closes that gap by running on
 * its own schedule (independent of the release pipeline) and asserting a
 * fresh heartbeat exists for the subject — absence or staleness is itself
 * the alert.
 */

export type GateRunStatus = 'ran' | 'skipped' | 'errored';

export type CheckHeartbeatPayload = {
  schemaVersion: 'eval-check-heartbeat/v1';
  gateRunStatus: GateRunStatus;
  generatedAt: string;
  exitCode: number;
  runId?: string;
  baselineRunId?: string;
  message?: string;
};

export const gateRunStatusFromExitCode = (exitCode: number): GateRunStatus => {
  if (exitCode === 0 || exitCode === 1) {
    return 'ran';
  }
  if (exitCode === 3) {
    return 'skipped';
  }
  return 'errored';
};

export type HeartbeatVerificationResult = {
  ok: boolean;
  /** Present when a heartbeat file was read and parsed, even if verification failed. */
  payload?: CheckHeartbeatPayload;
  /** Age of the heartbeat in hours, when computable. */
  ageHours?: number;
  reasons: string[];
};

export type VerifyHeartbeatFreshnessOptions = {
  maxAgeHours: number;
  /** Injectable for deterministic tests; defaults to the real clock. */
  now?: Date;
};

/**
 * Pure freshness/status check over an already-parsed heartbeat payload.
 * Fails closed: a `skipped`/`errored` gateRunStatus, a stale `generatedAt`,
 * or an unparseable timestamp are all verification failures, never a silent
 * pass. This is the function a scheduled CI job calls to turn "the gate step
 * quietly disappeared" into a distinguishable, alertable result.
 */
export const verifyHeartbeatFreshness = (
  payload: CheckHeartbeatPayload,
  options: VerifyHeartbeatFreshnessOptions,
): HeartbeatVerificationResult => {
  const reasons: string[] = [];
  const now = options.now ?? new Date();

  if (payload.schemaVersion !== 'eval-check-heartbeat/v1') {
    reasons.push(`Unexpected heartbeat schemaVersion: ${String(payload.schemaVersion)}.`);
  }

  if (payload.gateRunStatus !== 'ran') {
    reasons.push(
      `Heartbeat reports gateRunStatus="${payload.gateRunStatus}" instead of "ran"` +
        (payload.message ? `: ${payload.message}` : '.'),
    );
  }

  const generatedAtMs = Date.parse(payload.generatedAt);
  let ageHours: number | undefined;
  if (!Number.isFinite(generatedAtMs)) {
    reasons.push(`Heartbeat generatedAt "${payload.generatedAt}" is not a parseable timestamp.`);
  } else {
    ageHours = (now.getTime() - generatedAtMs) / (1000 * 60 * 60);
    if (ageHours < 0) {
      reasons.push(`Heartbeat generatedAt "${payload.generatedAt}" is in the future relative to the verifier clock.`);
    } else if (ageHours > options.maxAgeHours) {
      reasons.push(
        `Heartbeat is stale: generated ${ageHours.toFixed(2)}h ago, exceeding the ${options.maxAgeHours}h freshness window. ` +
          `Absence of a fresh heartbeat may mean the gate step was skipped or removed from the pipeline.`,
      );
    }
  }

  return { ok: reasons.length === 0, payload, ageHours, reasons };
};

/**
 * Full verification against a heartbeat *file path*: missing file is the
 * canonical "gate step was deleted/skipped" signal and is itself a failure,
 * not treated as an implicit pass. Malformed JSON is likewise a failure.
 */
export const verifyHeartbeatFile = async (
  filePath: string,
  options: VerifyHeartbeatFreshnessOptions,
): Promise<HeartbeatVerificationResult> => {
  const { readFile } = await import('node:fs/promises');
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reasons: [
        `No heartbeat file found at ${filePath} (${message}). This is itself an alertable signal: ` +
          `the eval gate step may have been skipped, deleted, or never wired into this release's pipeline.`,
      ],
    };
  }

  let payload: CheckHeartbeatPayload;
  try {
    payload = JSON.parse(raw) as CheckHeartbeatPayload;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      reasons: [`Heartbeat file ${filePath} is not valid JSON: ${message}.`],
    };
  }

  return verifyHeartbeatFreshness(payload, options);
};
