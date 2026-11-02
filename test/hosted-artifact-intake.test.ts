import { createHash } from 'node:crypto';
import { createServer, request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { mkdtemp, readFile, readdir, rm, stat, writeFile, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createArtifactIntakeHandler } from '../hosted/ingestion/http.js';
import { privateArtifactFiles } from '../hosted/ingestion/private-blobs.js';
import { postgresArtifactAcceptance } from '../hosted/ingestion/store.js';
import type { ApiPrincipal } from '../hosted/auth/api-credentials.js';

const principal: ApiPrincipal = { credentialId: '50000000-0000-0000-0000-000000000001',
  tenantId: '10000000-0000-0000-0000-000000000001', projectId: '20000000-0000-0000-0000-000000000001',
  accountId: '40000000-0000-0000-0000-000000000001', scopes: ['ingest'] };
const token = 'evd_v1.' + Buffer.alloc(32, 0x5a).toString('base64url');
const report = { schemaVersion: 'eval-report/v1', run: { id: 'upload-run', generatedAt: '2026-11-02T00:00:00Z', project: 'untrusted-tenant' },
  suites: [{ id: 'suite', name: 'Suite', total: 1, passed: 0, failed: 1, passRate: 0 }],
  rows: [{ id: 'case', suite: 'suite', kind: 'agent', severity: 'high', passed: false, output: '<script>private evidence</script>' }] };
const bytes = Buffer.from(JSON.stringify(report));
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const receipt = { artifactId: '30000000-0000-0000-0000-000000000001', jobId: '60000000-0000-0000-0000-000000000001', processingStatus: 'queued' as const, replayed: false };
const stored = { credential_id: principal.credentialId, tenant_id: principal.tenantId, project_id: principal.projectId,
  account_id: principal.accountId, scopes: ['ingest'] };
const servers: ReturnType<typeof createServer>[] = [];
const directories: string[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
async function fixture(overrides: Partial<Parameters<typeof createArtifactIntakeHandler>[0]> = {}) {
  const lookup = vi.fn(async (_digest: Buffer) => [stored]);
  const saveBytes = vi.fn(async (_identity: ApiPrincipal, value: Buffer) => hash(value));
  const accept = vi.fn(async () => receipt);
  const server = createServer(createArtifactIntakeHandler({ lookup, saveBytes, accept, ...overrides }));
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected listener');
  const send = (body = bytes, headers: IncomingHttpHeaders | string[] = {}, path = `/v1/projects/${principal.projectId}/artifacts`, method = 'POST', finish = true) =>
    new Promise<{ status: number; body: Record<string, unknown>; headers: IncomingHttpHeaders }>((resolve, reject) => {
      const defaults = { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': 'delivery-1' };
      const req = httpRequest({ host: '127.0.0.1', port: address.port, path, method,
        headers: Array.isArray(headers) ? ['Host', '127.0.0.1', 'Connection', 'close', ...headers] : { ...defaults, ...headers } }, res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => { try { resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()), headers: res.headers }); } catch (error) { reject(error); } });
      });
      req.on('error', reject);
      req.setTimeout(5_000, () => req.destroy(new Error('Test request timed out')));
      req.write(body);
      if (finish) req.end();
    });
  return { send, lookup, saveBytes, accept, server, port: address.port };
}
async function root() { const path = await mkdtemp(join(tmpdir(), 'eval-intake-test-')); directories.push(path); return path; }

describe('authenticated bounded artifact intake over real HTTP', () => {
  it('accepts a valid failing eval as queued, preserving bytes and using stored identity', async () => {
    const f = await fixture();
    const result = await f.send();
    expect(result.status).toBe(202);
    expect(result.body).toEqual({ schemaVersion: 'eval-ingestion-receipt/v1', ...receipt });
    expect(result.body).not.toHaveProperty('passed');
    expect(result.headers['cache-control']).toBe('no-store');
    expect(f.saveBytes).toHaveBeenCalledWith(principal, bytes);
    expect(f.accept).toHaveBeenCalledWith(principal, { runId: 'upload-run', revision: 1, sha256: hash(bytes), contentBytes: bytes.length, idempotencyKey: 'delivery-1' });
    expect(f.lookup.mock.calls[0][0]).toEqual(createHash('sha256').update(token).digest());
    expect(JSON.stringify(result)).not.toContain('private evidence');
  });
  it('rejects unrelated routes and methods before authorization', async () => {
    const f = await fixture();
    expect((await f.send(bytes, {}, '/elsewhere')).status).toBe(404);
    expect(await f.send(bytes, {}, undefined, 'PUT')).toMatchObject({ status: 405, headers: { allow: 'POST' } });
    expect(f.lookup).not.toHaveBeenCalled(); expect(f.accept).not.toHaveBeenCalled();
  });
  it('accepts explicit revisions and returns existing job state on replay', async () => {
    const accept = vi.fn(async () => ({ ...receipt, replayed: true, processingStatus: 'completed' as const }));
    const f = await fixture({ accept });
    expect((await f.send(bytes, { 'x-eval-revision': '2' })).body).toMatchObject({ replayed: true, processingStatus: 'completed' });
    expect(accept.mock.calls[0]).toBeDefined();
  });
  it.each([['authorization', 401], ['idempotency-key', 400], ['content-type', 415]])('rejects missing %s before persistence', async (header, status) => {
    const f = await fixture();
    const result = await f.send(bytes, { [header]: '' });
    expect(result.status).toBe(status);
    if (status === 401) expect(result.headers['www-authenticate']).toBe('Bearer realm="eval-artifacts"');
    expect(f.saveBytes).not.toHaveBeenCalled(); expect(f.accept).not.toHaveBeenCalled();
  });
  it.each(['authorization', 'idempotency-key', 'x-eval-revision', 'content-type', 'content-encoding'])('rejects duplicate raw %s headers before lookup', async header => {
    const f = await fixture();
    const headers = ['Authorization', `Bearer ${token}`, 'Content-Type', 'application/json', 'Idempotency-Key', 'key'];
    if (header === 'x-eval-revision' || header === 'content-encoding') headers.push(header, header === 'x-eval-revision' ? '1' : 'identity');
    headers.push(header.toUpperCase(), header === 'authorization' ? `Bearer ${token}` : 'second');
    expect((await f.send(bytes, headers)).status).toBe(400);
    expect(f.lookup).not.toHaveBeenCalled(); expect(f.saveBytes).not.toHaveBeenCalled();
  });
  it('denies another project, a read-only key, a revoked key and an unavailable lookup before persistence', async () => {
    const f = await fixture();
    expect((await f.send(bytes, {}, '/v1/projects/20000000-0000-0000-0000-000000000002/artifacts')).status).toBe(403);
    const read = await fixture({ lookup: async () => [{ ...stored, scopes: ['read'] }] });
    expect((await read.send()).status).toBe(403);
    const revoked = await fixture({ lookup: async () => [] }); expect((await revoked.send()).status).toBe(401);
    const unavailable = await fixture({ lookup: async () => { throw new Error(token); } });
    expect(await unavailable.send()).toMatchObject({ status: 503, body: { error: 'unavailable' } });
    for (const x of [f, read, revoked, unavailable]) expect(x.saveBytes).not.toHaveBeenCalled();
  });
  it.each([Buffer.from('{'), Buffer.from([0xff]), Buffer.from('null'), Buffer.from('{}'), Buffer.from(JSON.stringify({ ...report, schemaVersion: 'other' }))])('rejects invalid UTF-8/JSON/core contracts without storage (%#)', async body => {
    const f = await fixture(); expect((await f.send(body)).status).toBe(422);
    expect(f.saveBytes).not.toHaveBeenCalled(); expect(f.accept).not.toHaveBeenCalled();
  });
  it('rejects excessive run IDs under hosted limits without narrowing the portable contract', async () => {
    const f = await fixture();
    expect((await f.send(Buffer.from(JSON.stringify({ ...report, run: { ...report.run, id: '界'.repeat(171) } })))).status).toBe(422);
    expect(f.saveBytes).not.toHaveBeenCalled();
  });
  it('enforces both declared and streamed limits and accepts the exact boundary', async () => {
    const f = await fixture({ maxBytes: bytes.length });
    expect((await f.send(bytes)).status).toBe(202);
    expect((await f.send(Buffer.concat([bytes, Buffer.from(' ')]))).status).toBe(413);
    expect((await f.send(bytes, { 'content-length': String(bytes.length + 1) })).status).toBe(413);
    expect(f.accept).toHaveBeenCalledTimes(1);
  });
  it('times out partial uploads without storing a partial artifact', async () => {
    const f = await fixture({ uploadTimeoutMs: 30 });
    expect((await f.send(bytes.subarray(0, 12), {}, undefined, undefined, false)).status).toBe(408);
    expect(f.saveBytes).not.toHaveBeenCalled();
  });
  it('rejects a client-aborted body without persisting partial bytes', async () => {
    const f = await fixture();
    let observeAbort!: () => void;
    const aborted = new Promise<void>(resolve => { observeAbort = resolve; });
    const seen = new Promise<void>(resolve => f.server.once('request', req => {
      req.once('aborted', () => {
        observeAbort();
        setImmediate(() => req.emit('error', new Error('late disconnected-client error')));
      }); resolve();
    }));
    const req = httpRequest({ host: '127.0.0.1', port: f.port,
      path: `/v1/projects/${principal.projectId}/artifacts`, method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
        'idempotency-key': 'aborted', 'content-length': String(bytes.length + 1) } });
    req.on('error', () => undefined);
    req.write(bytes); await seen; req.destroy(); await aborted;
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(f.saveBytes).not.toHaveBeenCalled(); expect(f.accept).not.toHaveBeenCalled();
  });
  it.each([{ 'x-eval-revision': '0' }, { 'x-eval-revision': '2147483648' }, { 'x-eval-revision': '01' }, { 'idempotency-key': 'x'.repeat(129) }, { 'content-encoding': 'gzip' }])('rejects invalid upload metadata before storage (%#)', async headers => {
    const f = await fixture(); expect((await f.send(bytes, headers)).status).toBeGreaterThanOrEqual(400);
    expect(f.saveBytes).not.toHaveBeenCalled();
  });
  it('returns conflict for reused identities and secret-free unavailability on storage/database errors', async () => {
    const conflict = await fixture({ accept: async () => 'conflict' });
    expect(await conflict.send()).toMatchObject({ status: 409, body: { error: 'artifact_conflict' } });
    const blobFailure = await fixture({ saveBytes: async () => { throw new Error(token); } });
    expect(await blobFailure.send()).toMatchObject({ status: 503, body: { error: 'unavailable' } });
    expect(blobFailure.accept).not.toHaveBeenCalled();
    const badDigest = await fixture({ saveBytes: async () => 'wrong' });
    expect((await badDigest.send()).status).toBe(503); expect(badDigest.accept).not.toHaveBeenCalled();
    const dbFailure = await fixture({ accept: async () => { throw new Error('database secret'); } });
    expect(await dbFailure.send()).toMatchObject({ status: 503, body: { error: 'unavailable' } });
  });
});

describe('durable private artifact files', () => {
  it('publishes complete bytes once under tenant/project/digest, including concurrent retries', async () => {
    const directory = await root(), save = privateArtifactFiles(directory);
    expect(await Promise.all([save(principal, bytes), save(principal, bytes)])).toEqual([hash(bytes), hash(bytes)]);
    const folder = join(directory, 'artifacts', principal.tenantId, principal.projectId);
    expect(await readdir(folder)).toEqual([hash(bytes)]);
    expect(await readFile(join(folder, hash(bytes)))).toEqual(bytes);
    expect((await stat(join(folder, hash(bytes)))).mode & 0o777).toBe(0o600);
    expect((await stat(folder)).mode & 0o777).toBe(0o700);
  });
  it('separates tenant/project paths and refuses forged path identities', async () => {
    const directory = await root(), save = privateArtifactFiles(directory);
    await save(principal, bytes);
    await save({ ...principal, projectId: '20000000-0000-0000-0000-000000000002' }, bytes);
    expect(await readdir(join(directory, 'artifacts', principal.tenantId))).toHaveLength(2);
    await expect(save({ ...principal, projectId: '../escape' }, bytes)).rejects.toThrow();
  });
  it('rejects existing corrupt bytes, symlinks and public permissions without overwriting', async () => {
    const directory = await root(), save = privateArtifactFiles(directory);
    await save(principal, bytes);
    const path = join(directory, 'artifacts', principal.tenantId, principal.projectId, hash(bytes));
    await writeFile(path, 'corrupt'); await expect(save(principal, bytes)).rejects.toThrow('mismatch');
    expect(await readFile(path, 'utf8')).toBe('corrupt');
    await rm(path); await symlink(join(directory, 'outside'), path);
    await expect(save(principal, bytes)).rejects.toThrow();
    await chmod(directory, 0o755); await expect(save(principal, bytes)).rejects.toThrow('private');
  });
});

describe('parameterized PostgreSQL acceptance adapter', () => {
  const metadata = { runId: "run'; DROP TABLE", revision: 2, sha256: hash(bytes), contentBytes: bytes.length, idempotencyKey: 'key' };
  it('binds trusted scope and metadata, exposes only the receipt', async () => {
    const query = vi.fn(async (_sql: string, _values: unknown[]) => ({ rows: [{ artifact_id: receipt.artifactId, job_id: receipt.jobId, processing_state: 'queued', replayed: false, private: token }] }));
    expect(await postgresArtifactAcceptance(query)(principal, metadata)).toEqual(receipt);
    expect(query.mock.calls[0][0]).not.toContain(metadata.runId);
    expect(query.mock.calls[0][1]).toEqual([principal.tenantId, principal.projectId, metadata.runId, 2, Buffer.from(metadata.sha256, 'hex'), bytes.length, 'key']);
  });
  it('recognizes only the explicit conflict SQLSTATE and denies malformed results', async () => {
    expect(await postgresArtifactAcceptance(async () => { throw { code: 'EVD01' }; })(principal, metadata)).toBe('conflict');
    for (const rows of [[], [null], [{ artifact_id: 'bad' }], [{ artifact_id: receipt.artifactId, job_id: receipt.jobId, processing_state: 'unknown', replayed: true }], [{ artifact_id: receipt.artifactId, job_id: receipt.jobId, processing_state: { toString: () => 'queued' }, replayed: true }]])
      await expect(postgresArtifactAcceptance(async () => ({ rows }))(principal, metadata)).rejects.toThrow();
    await expect(postgresArtifactAcceptance(async () => { throw { code: '23505' }; })(principal, metadata)).rejects.toEqual({ code: '23505' });
  });
});
