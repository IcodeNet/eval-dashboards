import { createHash, randomBytes } from 'node:crypto';

/** Private hosted-service source; not an export of the portable npm package. */
export type ApiScope = 'read' | 'ingest';
export interface ApiPrincipal {
  readonly credentialId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly accountId: string;
  readonly scopes: readonly ApiScope[];
}

/** Return the SQL resolver's row array, using a bound bytea parameter. */
export type CredentialLookup = (secretSha256: Buffer) => Promise<unknown>;
export type CredentialAuthentication =
  | { status: 'authorized'; principal: ApiPrincipal }
  | { status: 'unauthenticated' | 'forbidden' | 'unavailable' };

const prefix = 'evd_v1.';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const isUuid = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const isScope = (value: unknown): value is ApiScope => value === 'read' || value === 'ingest';
const digest = (token: string): Buffer => createHash('sha256').update(token, 'utf8').digest();

/** Secret material: never log either the returned token or its Authorization header. */
export function generateApiCredentialSecret(): { token: string; secretSha256: Buffer } {
  const token = prefix + randomBytes(32).toString('base64url');
  return { token, secretSha256: digest(token) };
}

function tokenFromHeader(authorization: unknown): string | undefined {
  // Bound work before parsing; arrays/duplicates and non-string headers fail closed.
  if (typeof authorization !== 'string' || authorization.length > 128) return;
  const match = /^Bearer +([^\s,]+)$/i.exec(authorization);
  const token = match?.[1];
  if (!token?.startsWith(prefix)) return;
  const secret = token.slice(prefix.length);
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return;
  const bytes = Buffer.from(secret, 'base64url');
  // Buffer decoding is lenient; reject padding aliases and non-canonical tail bits.
  if (bytes.length !== 32 || bytes.toString('base64url') !== secret) return;
  return token;
}

function principalFromRow(row: unknown): ApiPrincipal | undefined {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return;
  const record = row as Record<string, unknown>;
  if (!['credential_id', 'tenant_id', 'project_id', 'account_id', 'scopes'].every(key => Object.hasOwn(record, key))) return;
  const { credential_id, tenant_id, project_id, account_id, scopes } = record;
  if (!isUuid(credential_id) || !isUuid(tenant_id) || !isUuid(project_id) || !isUuid(account_id)) return;
  if (!Array.isArray(scopes) || scopes.length < 1 || scopes.length > 2
    || !scopes.every(isScope) || new Set(scopes).size !== scopes.length) return;
  // Copy only the resolver's contract; never forward extra columns or mutable rows.
  return Object.freeze({ credentialId: credential_id, tenantId: tenant_id,
    projectId: project_id, accountId: account_id, scopes: Object.freeze([...scopes]) });
}

/**
 * Verify every request against the stored active-key lookup; no authorization cache.
 * The project is a requested resource, never a source of trusted tenant context.
 * This helper installs no HTTP route and issues no persistent credential record.
 */
export async function authenticateApiCredential(options: {
  authorization: unknown;
  projectId: unknown;
  requiredScope: ApiScope;
  lookup: CredentialLookup;
}): Promise<CredentialAuthentication> {
  const token = tokenFromHeader(options.authorization);
  if (!token) return { status: 'unauthenticated' };
  if (!isScope(options.requiredScope)) return { status: 'unavailable' };
  if (!isUuid(options.projectId)) return { status: 'forbidden' };
  try {
    // The lookup receives no bearer token or caller-supplied tenant/project IDs.
    const rows = await options.lookup(digest(token));
    if (!Array.isArray(rows)) return { status: 'unavailable' };
    if (rows.length === 0) return { status: 'unauthenticated' };
    if (rows.length !== 1) return { status: 'unavailable' };
    const principal = principalFromRow(rows[0]);
    if (!principal) return { status: 'unavailable' };
    if (principal.projectId !== options.projectId || !principal.scopes.includes(options.requiredScope))
      return { status: 'forbidden' };
    return { status: 'authorized', principal };
  } catch {
    // Backend outages/malformed results deny access without exposing exceptions/secrets.
    return { status: 'unavailable' };
  }
}
