import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { authenticateApiCredential, generateApiCredentialSecret, type ApiScope } from '../hosted/auth/api-credentials.js';

// Public synthetic test material, never a production credential.
const token = 'evd_v1.' + Buffer.alloc(32, 0x5a).toString('base64url');
const project = '20000000-0000-0000-0000-000000000001';
const otherProject = '20000000-0000-0000-0000-000000000002';
const row = (scopes: ApiScope[] = ['read', 'ingest']) => ({
  credential_id: '50000000-0000-0000-0000-000000000001',
  tenant_id: '10000000-0000-0000-0000-000000000001',
  project_id: project, account_id: '40000000-0000-0000-0000-000000000001', scopes,
});
const authenticate = (lookup: (hash: Buffer) => Promise<unknown>, authorization: unknown = `Bearer ${token}`,
  projectId: unknown = project, requiredScope: ApiScope = 'read') =>
  authenticateApiCredential({ authorization, projectId, requiredScope, lookup });

describe('private hosted bearer authentication', () => {
  it('generates canonical versioned secrets with 32 random bytes and only a storage digest', () => {
    const first = generateApiCredentialSecret(), second = generateApiCredentialSecret();
    expect(first.token).toMatch(/^evd_v1\.[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first.token.slice(7), 'base64url')).toHaveLength(32);
    expect(first.token).not.toBe(second.token);
    expect(first.secretSha256).toHaveLength(32);
    expect(first.secretSha256.equals(createHash('sha256').update(first.token).digest())).toBe(true);
  });
  it.each([undefined, null, 7, {}, [], [`Bearer ${token}`], '', 'Basic x', token,
    `Bearer ${token},Bearer ${token}`, `Bearer ${token}\r\nX: value`, ` Bearer ${token}`,
    `Bearer ${token} `, `Bearer ${token}\n`, `Bearer ${token}\r`, `Bearer ${token}\r\n`, `Bearer\t${token}`, `Bearer ${token}=`, 'Bearer ' + 'x'.repeat(1000),
    `Bearer ${token.replace('evd_v1.', 'evd_v2.')}`, `Bearer ${token.replace('evd_v1.', 'EVD_V1.')}`,
    'Bearer evd_v1.' + 'A'.repeat(42), 'Bearer evd_v1.' + 'A'.repeat(42) + 'B',
    'Bearer evd_v1.' + '+'.repeat(43), 'Bearer evd_v1.' + '/'.repeat(43),
  ])('denies malformed headers without a backend lookup (%#)', async header => {
    const lookup = vi.fn(async (_hash: Buffer) => [row()]);
    expect(await authenticateApiCredential({ authorization: header, projectId: project, requiredScope: 'read', lookup })).toEqual({ status: 'unauthenticated' });
    expect(lookup).not.toHaveBeenCalled();
  });
  it('accepts case-insensitive bearer scheme and multiple spaces, passing only the digest', async () => {
    const lookup = vi.fn(async (_hash: Buffer) => [row()]);
    expect(await authenticate(lookup, `bEaReR   ${token}`)).toMatchObject({ status: 'authorized' });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0]).toHaveLength(1);
    expect(lookup.mock.calls[0][0]).toEqual(createHash('sha256').update(token).digest());
  });
  it('uses the stored identity and copies only known fields into an immutable principal', async () => {
    const source = { ...row(), email: 'private@example.invalid', secret_sha256: 'do not forward' };
    const result = await authenticateApiCredential({ authorization: `Bearer ${token}`, projectId: project,
      requiredScope: 'read', lookup: async () => [source], ...{ tenantId: 'forged' } });
    expect(result).toEqual({ status: 'authorized', principal: {
      credentialId: source.credential_id, tenantId: source.tenant_id, projectId: project,
      accountId: source.account_id, scopes: ['read', 'ingest'],
    } });
    source.scopes.splice(0); source.tenant_id = 'changed';
    if (result.status !== 'authorized') throw new Error('Expected authorization');
    expect(result.principal.scopes).toEqual(['read', 'ingest']);
    expect(result.principal.tenantId).not.toBe('changed');
    expect(Object.isFrozen(result.principal)).toBe(true);
    expect(Object.isFrozen(result.principal.scopes)).toBe(true);
  });
  it('denies another project and missing operation scope', async () => {
    expect(await authenticate(async () => [row()], undefined, otherProject)).toEqual({ status: 'forbidden' });
    expect(await authenticate(async () => [row(['read'])], undefined, project, 'ingest')).toEqual({ status: 'forbidden' });
    expect(await authenticate(async () => [row(['ingest'])])).toEqual({ status: 'forbidden' });
  });
  it('denies invalid requested projects and unknown route operations before lookup', async () => {
    const lookup = vi.fn(async (_hash: Buffer) => [row()]);
    expect(await authenticate(lookup, undefined, 'not-a-uuid')).toEqual({ status: 'forbidden' });
    expect(await authenticate(lookup, undefined, project, 'admin' as ApiScope)).toEqual({ status: 'unavailable' });
    expect(lookup).not.toHaveBeenCalled();
  });
  it('looks up every request, so a revoked key cannot reuse an earlier authorization', async () => {
    const lookup = vi.fn().mockResolvedValueOnce([row()]).mockResolvedValueOnce([]);
    expect(await authenticate(lookup)).toMatchObject({ status: 'authorized' });
    expect(await authenticate(lookup)).toEqual({ status: 'unauthenticated' });
    expect(lookup).toHaveBeenCalledTimes(2);
  });
  it.each([null, {}, [row(), row()], [null], [{ ...row(), scopes: ['admin'] }],
    [{ ...row(), scopes: [] }], [{ ...row(), scopes: ['read', 'read'] }],
    [{ ...row(), tenant_id: 'forged' }], [{ ...row(), account_id: undefined }],
    [Object.create(row())],
  ])('fails closed on invalid or ambiguous lookup results (%#)', async rows => {
    expect(await authenticate(async () => rows)).toEqual({ status: 'unavailable' });
  });
  it('does not expose lookup exceptions, tokens, or extra result fields on failure', async () => {
    const result = await authenticate(async () => { throw new Error(`database failure: ${token}`); });
    expect(result).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(result)).not.toContain(token);
    const poisonous = Object.defineProperty(row(), 'scopes', { get() { throw new Error(token); } });
    expect(await authenticate(async () => [poisonous])).toEqual({ status: 'unavailable' });
  });
});
