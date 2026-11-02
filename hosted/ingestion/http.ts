import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticateApiCredential, type ApiPrincipal, type CredentialLookup } from '../auth/api-credentials.js';
import { validateEvalReport } from '../../src/model/validate.js';
import type { AcceptArtifact } from './store.js';

class IntakeError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
const reject = (status: number, code: string): never => { throw new IntakeError(status, code); };

function oneHeader(request: IncomingMessage, name: string): string | undefined {
  const values: string[] = [];
  for (let i = 0; i < request.rawHeaders.length; i += 2)
    if (request.rawHeaders[i].toLowerCase() === name) values.push(request.rawHeaders[i + 1]);
  if (values.length > 1) reject(400, 'duplicate_header');
  return values[0];
}

function readBody(request: IncomingMessage, limit: number, deadlineMs: number): Promise<Buffer> {
  return new Promise((resolve, rejectBody) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const cleanup = () => {
      clearTimeout(timer);
      request.off('data', data); request.off('end', end);
      request.off('aborted', aborted); request.off('error', aborted); request.off('close', closed);
    };
    const fail = (status: number, code: string) => {
      cleanup(); request.pause(); rejectBody(new IntakeError(status, code));
    };
    const data = (chunk: Buffer) => {
      if (!Buffer.isBuffer(chunk)) return fail(400, 'invalid_body_stream');
      size += chunk.length;
      if (size > limit) return fail(413, 'artifact_too_large');
      chunks.push(Buffer.from(chunk));
    };
    const end = () => {
      if (!request.complete) return fail(400, 'incomplete_upload');
      cleanup(); resolve(Buffer.concat(chunks, size));
    };
    const aborted = () => fail(400, 'incomplete_upload');
    const closed = () => { if (!request.complete) aborted(); };
    const timer = setTimeout(() => fail(408, 'upload_timeout'), deadlineMs);
    request.on('data', data); request.once('end', end);
    request.once('aborted', aborted); request.once('error', aborted); request.once('close', closed);
    if (request.destroyed || request.aborted) aborted();
  });
}

/** Private source route. Persistence callbacks must acknowledge durable writes. */
export function createArtifactIntakeHandler(options: {
  lookup: CredentialLookup;
  saveBytes: (principal: ApiPrincipal, bytes: Buffer) => Promise<string>;
  accept: AcceptArtifact;
  maxBytes?: number;
  uploadTimeoutMs?: number;
}) {
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const uploadTimeoutMs = options.uploadTimeoutMs ?? 10_000;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024
    || !Number.isSafeInteger(uploadTimeoutMs) || uploadTimeoutMs < 1 || uploadTimeoutMs > 120_000)
    throw new Error('Invalid intake limits');

  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    // A disconnected client may emit an error after body listeners are cleaned up,
    // or while authentication/storage is pending. Never leave that event unhandled.
    request.on('error', () => undefined);
    const send = (status: number, body: unknown) => {
      // Close every connection: rejected/unread bodies cannot become another request.
      response.setHeader('Connection', 'close');
      if (status === 401) response.setHeader('WWW-Authenticate', 'Bearer realm="eval-artifacts"');
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.once('finish', () => request.destroy());
      response.writeHead(status); response.end(JSON.stringify(body));
    };
    try {
      const route = /^\/v1\/projects\/([a-f0-9-]{36})\/artifacts$/.exec(request.url ?? '');
      if (!route) reject(404, 'not_found');
      if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); reject(405, 'method_not_allowed'); }
      const authorization = oneHeader(request, 'authorization');
      const key = oneHeader(request, 'idempotency-key');
      const revisionText = oneHeader(request, 'x-eval-revision') ?? '1';
      const contentType = oneHeader(request, 'content-type');
      const encoding = oneHeader(request, 'content-encoding');
      const lengthText = oneHeader(request, 'content-length');
      if (!contentType || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType)
        || (encoding && encoding.toLowerCase() !== 'identity')) reject(415, 'unsupported_media_type');
      if (!key || !/^[\x21-\x7e]{1,128}$/.test(key)) reject(400, 'invalid_idempotency_key');
      if (!/^[1-9][0-9]{0,9}$/.test(revisionText) || Number(revisionText) > 2147483647) reject(400, 'invalid_revision');
      if (lengthText !== undefined && (!/^[0-9]+$/.test(lengthText) || !Number.isSafeInteger(Number(lengthText)))) reject(400, 'invalid_content_length');
      if (lengthText !== undefined && Number(lengthText) > maxBytes) reject(413, 'artifact_too_large');
      const auth = await authenticateApiCredential({ authorization, projectId: route![1], requiredScope: 'ingest', lookup: options.lookup });
      if (auth.status !== 'authorized') reject(auth.status === 'unauthenticated' ? 401 : auth.status === 'forbidden' ? 403 : 503, auth.status);
      if (auth.status !== 'authorized') return; // Narrow the discriminated union after reject().
      const bytes = await readBody(request, maxBytes, uploadTimeoutMs);
      if (lengthText !== undefined && Number(lengthText) !== bytes.length) reject(400, 'incomplete_upload');
      let parsed: unknown;
      try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { reject(422, 'invalid_artifact'); }
      const validation = validateEvalReport(parsed);
      if (!validation.ok) reject(422, 'invalid_artifact');
      if (!validation.ok) return;
      const runId = validation.report.run.id;
      if (Buffer.byteLength(runId, 'utf8') > 512 || runId.includes('\0')) reject(422, 'invalid_run_id');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (await options.saveBytes(auth.principal, bytes) !== sha256) throw new Error('Storage digest mismatch');
      const receipt = await options.accept(auth.principal, { runId, revision: Number(revisionText), sha256,
        contentBytes: bytes.length, idempotencyKey: key! });
      if (receipt === 'conflict') { reject(409, 'artifact_conflict'); return; }
      send(202, { schemaVersion: 'eval-ingestion-receipt/v1', ...receipt });
    } catch (error) {
      const failure = error instanceof IntakeError ? error : new IntakeError(503, 'unavailable');
      if (!response.destroyed && !response.headersSent) send(failure.status, { error: failure.code });
    }
  };
}
