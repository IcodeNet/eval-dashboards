import { timingSafeEqual } from 'node:crypto';
import { authenticateApiCredential, generateApiCredentialSecret } from './api-credentials.js';

// Provider-free demonstration only. Production lookup must call PostgreSQL's
// restricted resolver with a bound digest, rather than this in-memory fixture.
const { token, secretSha256 } = generateApiCredentialSecret();
const projectId = '20000000-0000-0000-0000-000000000001';
const stored = { credential_id: '50000000-0000-0000-0000-000000000001',
  tenant_id: '10000000-0000-0000-0000-000000000001', project_id: projectId,
  account_id: '40000000-0000-0000-0000-000000000001', scopes: ['read'] };
let revoked = false;
const lookup = async (hash: Buffer) => !revoked && hash.length === secretSha256.length
  && timingSafeEqual(hash, secretSha256) ? [stored] : [];
const request = { authorization: `Bearer ${token}`, projectId, lookup };
// Print decisions only; never print the token, digest or Authorization header.
console.log('Read own project:', (await authenticateApiCredential({ ...request, requiredScope: 'read' })).status);
console.log('Ingest with read-only key:', (await authenticateApiCredential({ ...request, requiredScope: 'ingest' })).status);
console.log('Read another project:', (await authenticateApiCredential({ ...request, projectId: '20000000-0000-0000-0000-000000000002', requiredScope: 'read' })).status);
revoked = true;
console.log('Read revoked key:', (await authenticateApiCredential({ ...request, requiredScope: 'read' })).status);
