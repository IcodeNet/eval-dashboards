# Authenticated artifact intake — private service source

This M2 slice provides an HTTP upload handler, private local file storage, and
transactional PostgreSQL acceptance. It is MIT licensed, needs no paid service,
and is not included in the portable npm package. It is tested over real HTTP
with private files and an isolated real PostgreSQL database. No hosted service
is deployed; accounts, key issuance, workers and the launch gate remain open.

## Verify the complete path

From the repository root after `pnpm install --frozen-lockfile`:

```sh
pnpm exec vitest run test/hosted-artifact-intake.test.ts
pnpm test:hosted-db
```

The first command checks real loopback HTTP and disposable private files. The
second requires local Docker and also verifies actual PostgreSQL transactions,
concurrent delivery, restricted logins, rollback and cross-tenant reads. It
accepts no external database URL and cleans up its owned container and files.
See [database setup and its trust boundary](../postgres/README.md).

## Request and receipt

Mount `createArtifactIntakeHandler` from `http.ts` on a Node HTTP server. The
route accepts `POST /v1/projects/<project UUID>/artifacts` with these headers:

- `Authorization: Bearer <API secret>`; its stored key must permit `ingest` for
  this exact project. Tenant/project values inside artifacts never select storage.
- `Content-Type: application/json` (optional `charset=utf-8`). Compressed bodies
  are rejected; multipart and JSONL are not this route's contract.
- `Idempotency-Key`: 1–128 printable ASCII characters without spaces. Reuse the
  same key only for the same project, run, revision and exact bytes.
- Optional `X-Eval-Revision`: a positive integer up to 2147483647; defaults to 1.

Send the original UTF-8 `eval-report/v1` JSON as the body. The shared core
validator remains the contract. Additional hosted limits are run IDs up to 512
UTF-8 bytes with no null character, and the upload cap. Unknown optional artifact
fields remain portable; original bytes are retained without normalization.

A successful request returns HTTP 202 and `eval-ingestion-receipt/v1`, with
`artifactId`, `jobId`, `replayed` and `processingStatus`. Initial status is
`queued`; a retry returns that job's current queued/running/completed/failed
state. This is ingestion processing, not an evaluation pass/fail decision.
A valid artifact whose evaluations fail is still accepted for indexing.

Exact retries return the existing artifact/job. A new key for identical bytes
and the same run/revision also reuses that job. Changed bytes with the same
run/revision, or a reused key with different metadata, return 409. To append
changed bytes, choose an explicit new revision and a new delivery key. Revision
numbers need not be consecutive. Whitespace changes count as changed bytes.
One project-scoped digest cannot be aliased to a different run/revision.

Errors use a short `{ "error": "..." }` body: 400 for malformed request metadata,
401 for invalid/inactive credentials, 403 for project/scope denial, 408 for
upload timeout, 413 for size, 415 for media/encoding, 422 for invalid artifacts,
409 for conflicts, and 503 for backend failures. Artifact text, bearer tokens,
database messages and filesystem paths are never echoed. Responses disable
caching and close the connection, including rejected unread bodies.

## Wire the adapters

The handler requires three callbacks:

1. `lookup` is the [credential lookup contract](../auth/README.md), using only
   the restricted lookup login and a bound digest.
2. `saveBytes` can be `privateArtifactFiles(absoluteRoot)` from `private-blobs.ts`.
   Provision a durable POSIX directory, owned by the service and mode 0700,
   outside every public/static tree. Its parents must be trusted and stable.
3. `accept` can be `postgresArtifactAcceptance(query)` from `store.ts`. Apply
   migration `003-artifact-intake.sql` after 001/002 as the non-superuser database
   owner with CREATEROLE. Bind the query function to an autocommit READ COMMITTED
   PostgreSQL client using only the restricted application login. The query
   takes SQL plus a values array; never interpolate values into SQL. The test
   harness's synthetic psql transport is not a production database driver.

These source modules install no database driver or framework. Their contracts
allow a service to supply its existing client without adding dependencies to
the offline package. Use distinct lookup and application connections; keep
migration credentials out of the service. SQL access is trusted service access:
`accept_artifact` uses supplied authenticated scope; it does not authenticate
SQL users or validate blobs. Do not expose SQL access or this function directly
to callers. The function is SECURITY INVOKER, uses RLS, restores prior scope,
and serializes each project's acceptance with a transaction advisory lock.
All acceptance callers must use this protocol. Direct table writers bypass
that serialization and may cause retryable database errors.

Use client query/lock timeouts and an autocommit connection; do not return a
receipt before its transaction commits. The handler's default body cap is
1 MiB, configurable from 1 byte to 16 MiB. Its absolute body-read deadline is
10 seconds, configurable up to 120 seconds. It rejects duplicated raw security
and upload headers before framework normalization. Configure the Node server's
header limit, header/request timeouts and concurrent connection limits too;
the body deadline begins after authentication. Lookup/storage/query deadlines,
TLS, quotas, request rate limits, audit and browser sessions remain service and
launch work, not guarantees of this handler.

## Durability and failure handling

Storage computes SHA-256 from the exact bytes. A private temporary file is
written and synced, then atomically linked without replacing an existing digest
file. Existing files must match the bytes and have private permissions; symlinks
and corrupt files fail closed. Created directories and the published file entry
are synced before database acceptance. Paths use only stored tenant/project UUIDs
and the digest, matching the database-generated object key.

PostgreSQL records the artifact, delivery key and queued job in one transaction.
A job write failure rolls back all three. No file write or database error returns
an accepted receipt. A lost response or uncertain database commit can be retried
with the same key. Processing completion remains exclusively worker work.

Filesystem and PostgreSQL are separate durable stores. A database conflict,
failure, or crash between writes can leave an unreferenced private digest or
pending file. Intake never deletes a digest on failure: another retry may have
committed a reference. Retention/orphan collection and backup/restore remain
open M2/M6 work and must coordinate with in-flight uploads. A bounded request is
not a storage quota. This local adapter requires one shared durable filesystem
for all workers serving its database; it is not an object-store or multi-region
implementation, and ephemeral container disks are unsuitable.

References: [Node HTTP](https://nodejs.org/docs/latest-v20.x/api/http.html),
[Node filesystem](https://nodejs.org/docs/latest-v20.x/api/fs.html),
[PostgreSQL transaction locks](https://www.postgresql.org/docs/17/explicit-locking.html).


Integration completion also requires the [risk register](../../docs/integrations/risk-register.md):
use the shared validator for schema drift, keep client/runtime compatibility
checks, and preserve portable offline use. These tests use synthetic fixtures;
they do not demonstrate production-data quality or production readiness.
