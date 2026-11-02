# Hosted API secret and bearer-header helpers

This is private hosted-service source for M2. It is not exported or installed
by the portable npm package. No account provider, HTTP endpoint, token-management
UI, persistent key issuer or deployment is included. The software stays MIT
licensed and needs no paid service. Browser sign-in remains separate work.

## Try the example

From the repository root after `pnpm install --frozen-lockfile`:

```sh
pnpm exec tsx hosted/auth/example.ts
```

The provider-free example uses an in-memory lookup and prints only decisions:

```text
Read own project: authorized
Ingest with read-only key: forbidden
Read another project: forbidden
Read revoked key: unauthenticated
```

It is not a production database adapter. Real database integration is checked by
`pnpm test:hosted-db` with local Docker; normal offline tests require no database:

```sh
pnpm exec vitest run test/hosted-api-credentials.test.ts
```

## Generate a secret

`generateApiCredentialSecret()` returns `{ token, secretSha256 }`. It uses
Node's cryptographic `randomBytes(32)` and a canonical unpadded base64url format:
`evd_v1.<43 characters>`. SHA-256 covers the full versioned UTF-8 token and
returns the 32-byte buffer expected by PostgreSQL migration 002. Do not use this
hashing design for passwords or user-chosen secrets. See [Node 20 crypto](https://nodejs.org/docs/latest-v20.x/api/crypto.html#cryptorandombytessize-callback).

The future authorized issuer must persist only the digest and its validated
project/member/scopes/expiry metadata, then return the token once over HTTPS.
This generator writes no database record and enforces no issuance permission.
Never log the returned object, token, digest or Authorization header. Do not put
tokens in URLs, artifact bodies or analytics. Rotation, audit and the actual
one-time issuance response remain future work; this helper alone does not
implement their lifecycle.

## Authenticate one parsed header

`authenticateApiCredential({ authorization, projectId, requiredScope, lookup })`
accepts one server-parsed Authorization value, the requested project's UUID,
and a server-selected `read` or `ingest` operation. It validates the versioned
bearer format before lookup, including canonical encoding and a bounded header
length. The Bearer scheme is case-insensitive; the token is case-sensitive.
Arrays, comma lists, extra credentials, line breaks and unknown versions fail.

The trusted lookup callback receives **only the digest** and must call
`eval_hosted.resolve_api_credential($1::bytea)` with a bound parameter, using
only the restricted lookup login. Return its row array without converting an
outage into an empty result. Set database/query timeouts in that adapter. See
[the storage credential guide](../postgres/README.md#project-scoped-credential-lookup--source-only).
No production database client or adapter is installed by this source slice.

The result has one of these statuses:

- `authorized`: an immutable copied principal with stored credential, tenant,
  project, account and effective scopes. Extra database fields are not forwarded.
- `unauthenticated`: malformed, unknown or inactive key; no identity is returned.
- `forbidden`: the key's stored project or scopes do not allow the requested action.
- `unavailable`: the lookup failed, returned invalid/ambiguous rows, or the route
  supplied an unsupported operation. Access is denied without exception details.

Every request performs a fresh lookup. There is no authorization cache or
fallback identity on failure. Use the returned principal's tenant/project in
an application transaction, never values from the artifact or request body.
Database permissions and statement snapshots remain as documented in the
storage guide; revocation does not cancel work authorized before it commits.

Future HTTP adapters must reject duplicate **raw** Authorization headers before
framework normalization: this helper cannot detect duplicates already discarded
by the framework. They must require `authorized`, enforce the operation for
each route, map denied/unavailable results appropriately (normally 401/403/503),
use TLS, limit headers/requests, and redact logs. This helper installs none of
those routes or transport controls. Account sessions, issuance/rotation/audit,
bounded uploads, private blobs and workers remain open; M2 is incomplete.


The later [artifact intake handler](../ingestion/README.md) now connects these
helpers to a raw-header-aware Node HTTP upload route and durable acceptance.
It is private service source, not a deployed endpoint. Persistent key issuance,
browser accounts and launch controls remain open.
