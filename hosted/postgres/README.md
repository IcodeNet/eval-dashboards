# Hosted PostgreSQL storage foundation

These are the initial M2 storage and credential slices. They add a schema and real database tests,
not a hosted application. The portable npm package still works offline and has
no PostgreSQL dependency. PostgreSQL is [free software](https://www.postgresql.org/about/licence/) and can be self-hosted;
no managed database or paid service is required.

## Run the checks

With Docker CLI and a running engine, from the repository root:

```sh
pnpm test:hosted-db
```

The harness freezes a local socket-based Docker context, rejects remote Docker
endpoints, and starts an owned disposable PostgreSQL container with no network,
no host port and temporary database storage. It accepts no external database
URL and removes that exact container afterwards. Test-only trust authentication
stays inside the isolated container. The pinned official multi-platform image
is declared in `test/Dockerfile`, so normal Dockerfile dependency updates can
propose a reviewed image refresh. Required CI runs the same checks; ordinary
`pnpm test` and offline package consumers need neither Docker nor PostgreSQL.

## What this slice provides

`migrations/001-storage-foundation.sql` defines tenants, private account records,
memberships, projects, immutable artifact references, idempotency associations
and ingestion-job metadata. It applies in one transaction to a new dedicated
database using a database owner with role-creation permission. A superuser is
not required; the integration harness applies both migrations as a non-superuser
`CREATEROLE` database owner. The schema and
`eval_hosted_app` role names must be unused. Reapplying fails without changing
existing records; a production migration runner is still future work.

Every application-visible table forces row security. Missing tenant context
returns no rows and rejects inserts. Optional project context narrows access
within a tenant. Composite foreign keys include tenant and project identifiers,
so an artifact or job cannot point at another tenant's or project's parent row
even when a privileged writer supplies a valid foreign UUID.

The application role has only explicit read/insert privileges and job-state
column updates. It cannot read global account emails, create schema objects,
truncate tables, delete artifacts or overwrite artifact revisions/idempotency
mappings. The migration removes PUBLIC table privileges even when the database
owner's defaults were permissive. Runtime logins must be separate from the
migration owner and inherit only the intended restricted application role.

Artifact identity is project-scoped run ID plus revision. Changed payloads
require a new revision; identical bytes have one project-scoped digest record.
Source keys derive from tenant/project UUIDs and SHA-256 rather than caller
paths. Run IDs and idempotency keys are limited to 512 bytes for hosted indexes;
this does not change the portable `eval-report/v1` validator. Digest and byte
count metadata do not themselves prove that blob contents have been stored or
validated. Private blob storage and core artifact validation remain intake work.

A delivery key binds a project, artifact and exact digest. One immutable artifact
has one durable job record, with attempts, lease fields and completion metadata.
These constraints prevent inconsistent records; the API's idempotent replay,
conflict response and worker claim/retry protocols are not implemented yet.
Processing completion and quality are separate: completed indexing may have a
failed quality decision. No telemetry is defaulted to zero or inferred from a
processing error; analytical facts will reuse the portable semantics.

## Context and authorization boundary

Future server code must derive tenant/project context from authenticated,
authorized identity or credentials and set it with `SET LOCAL` inside each
transaction. Never take this context from an artifact body or public request.
For example, after authorization, a trusted database transaction uses:

```sql
BEGIN;
SET LOCAL ROLE eval_hosted_app;
SET LOCAL eval_hosted.tenant_id = '10000000-0000-0000-0000-000000000001';
SET LOCAL eval_hosted.project_id = '20000000-0000-0000-0000-000000000001';
SELECT id, external_run_id, revision FROM eval_hosted.artifacts;
COMMIT;
```

Those IDs are synthetic. Production queries must bind validated server values
through the database client. A null project scope is tenant-wide and must only
be used after tenant-wide authorization. Commit and rollback clear local scope,
which the tests verify on the same connection using a real restricted runtime
login separate from the migration owner.

These settings are not credentials. Anyone permitted to execute arbitrary SQL
as the application role can set them; database credentials must stay within the
trusted service. Row security alone does not implement authentication or an HTTP tenant boundary.
The credential lookup below checks current membership, but HTTP code must still
verify the bearer token and enforce the returned operation scopes. Superusers/BYPASSRLS roles also
bypass it; the application must not use them. Global identity records receive
no application grant in this migration.

Next M2 slices still need HTTP authentication and credential issuance, bounded artifact
upload and validation, private blob persistence, transactional job creation,
idempotent delivery/conflict handling, and worker indexing/retries. M2 remains
open. There is no deployment, account signup, ingestion endpoint or live stream
in this slice. ClickHouse remains an optional later analytics candidate.

PostgreSQL references: [row security and privileged-role behavior](https://www.postgresql.org/docs/17/ddl-rowsecurity.html),
[composite constraints](https://www.postgresql.org/docs/17/ddl-constraints.html),
and [transaction-local settings](https://www.postgresql.org/docs/17/sql-set.html).

## Project-scoped credential lookup — source only

Apply `migrations/002-api-credentials.sql` after 001, as the migration owner.
It requires unused `eval_hosted_auth_owner` and `eval_hosted_auth_lookup` role
names and records migration version 2. Ownership transfer explicitly grants
the trusted migration owner SET permission on the new function-owner role,
with inheritance disabled. Runtime logins receive no such membership. Both migrations are transactional and
apply once; neither is a production migration runner. Back up and test migrations
before deployment. No deployment or issuance endpoint is provided here.

Each stored key binds one account's tenant membership to one project, with
explicit `read` and/or `ingest` scopes, a finite expiry, an optional revocation
time, and a unique 32-byte SHA-256 digest. Composite references reject a key
whose member or project belongs to another tenant. Deleting a membership
removes its keys; rejoining does not restore them. The database stores no raw
token. The future issuer must generate at least 32 cryptographically random
secret bytes, return the secret once, and hash the full canonical token before
storage/lookup. This digest design is for random API secrets, not passwords.
Private [secret/header helpers](../auth/README.md) now provide generation,
canonical format/parsing and stored project/scope enforcement. Persistent
issuance, rotation UX, HTTP route integration and audit remain future work.

A dedicated service login may inherit **only** `eval_hosted_auth_lookup` and
call `eval_hosted.resolve_api_credential($1::bytea)` with a bound digest. It
cannot list hashes, read account emails, issue/revoke keys or write artifacts.
The function returns at most one credential ID, tenant ID, project ID, account
ID and effective scope array. No caller-supplied tenant/project context affects
the lookup. Unknown, malformed, expired, revoked or future-dated keys return
no rows. Expiry uses the current statement's time, including in an older
transaction. Each query uses its PostgreSQL statement snapshot; this is not a
promise to cancel requests already authorized before a revocation commits.

Effective scopes are the intersection of the key's scopes and the current
membership: owner/admin/editor allow read and ingest; viewer allows only read.
A viewer's ingest-only key returns no identity. A read-only key never gains
ingest when its member is promoted. Changes are checked on each lookup;
no authorization cache is implemented. An account membership currently applies
to all projects in its tenant; project-specific member assignments are not modeled.

The function runs as `eval_hosted_auth_owner`, a non-login, non-superuser,
non-BYPASSRLS role with SELECT only on credentials, memberships and projects.
Its narrow SELECT policies permit this lookup across tenants. Runtime logins
must never inherit that owner role. The fixed search path and fully qualified
relations prevent temporary-table substitution. PUBLIC and application-role
execution are revoked in the same transaction. See PostgreSQL's
[security-definer guidance](https://www.postgresql.org/docs/17/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

Future HTTP handlers can use the private header helper to parse and hash a
presented token. They must require a returned
identity and the operation's scope, then use only the returned tenant/project
in a fresh application transaction. Keep lookup and application database logins
separate from the migration owner; neither login may be exposed to end users.
Database lookup alone does not enforce an HTTP route, authenticate browser
sessions, limit requests, or validate/upload artifacts. Those remain M2 work.
Run `pnpm test:hosted-db` for actual restricted-login, cross-tenant, expiry,
revocation, membership-change and hostile search-path checks.


## Authenticated intake protocol — source only

Apply `003-artifact-intake.sql` after 001/002. The restricted application login
can call `accept_artifact` through the [authenticated HTTP intake adapter](../ingestion/README.md).
It records artifact/key/job atomically, returns the current processing state,
and handles exact retries and explicit revision conflicts. Its supplied scope
comes only from trusted authentication; SQL access remains a service boundary.
It retains invoker permissions/RLS and restores prior transaction-local context.

The integration harness now applies all three migrations as the non-superuser
owner and exercises real HTTP/private files/database acceptance, concurrent
retries/conflicts and rollback. Accounts, key issuance, worker processing and
operations remain open. Earlier slice records above describe their original
scope; no hosted deployment or portable database dependency is added.
