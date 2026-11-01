# Hosted PostgreSQL storage foundation

This is the first M2 storage slice. It adds a schema and real database tests,
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
database using a migration owner with role-creation permission. The schema and
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
trusted service. Row security does not implement authentication, membership
permission checks or an HTTP tenant boundary. Superusers/BYPASSRLS roles also
bypass it; the application must not use them. Global identity records receive
no application grant in this migration.

Next M2 slices still need authentication and scoped credentials, bounded artifact
upload and validation, private blob persistence, transactional job creation,
idempotent delivery/conflict handling, and worker indexing/retries. M2 remains
open. There is no deployment, account signup, ingestion endpoint or live stream
in this slice. ClickHouse remains an optional later analytics candidate.

PostgreSQL references: [row security and privileged-role behavior](https://www.postgresql.org/docs/17/ddl-rowsecurity.html),
[composite constraints](https://www.postgresql.org/docs/17/ddl-constraints.html),
and [transaction-local settings](https://www.postgresql.org/docs/17/sql-set.html).
