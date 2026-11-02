# Durable ingestion worker leases — private source

Migration `004-worker-leases.sql` adds the database coordination protocol for
M2 workers. It is MIT licensed and needs no paid queue. It does not yet install
an indexing worker, scheduler or hosted deployment. The portable npm package
remains database-free. Artifact indexing is the next slice.

## Verify it

From the repository root with local Docker running:

```sh
pnpm test:hosted-db
```

The test harness applies migrations 001–004 as a non-superuser owner, then
uses restricted application/lookup logins. Real concurrent connections verify
distinct claims, skipping locked work, stale-token denial, heartbeat, delayed
retries, the attempt cap, transaction rollback and context restoration. It
accepts no external database URL and removes only its owned test container.
See [database setup](../postgres/README.md).

## Claim one job

Call `eval_hosted.claim_ingestion_job(tenant_uuid, project_uuid, lease_seconds)`
with bound parameters, using the restricted application login. The service
supplies an assigned tenant/project from trusted configuration. These arguments
are not authentication; never expose these functions directly to public users.
Apply the migration as the owner and keep migration credentials out of workers.

The function locks one due queued job or expired running job using
`FOR UPDATE SKIP LOCKED`. Concurrent workers get different available jobs;
a locked older job does not block later work. There is no strict FIFO promise.
A claim returns `outcome=claimed`, the job/artifact IDs, a new random lease
UUID, expiration, attempt number, and the stored source key, digest, byte count,
run ID and revision. No returned row means no eligible unlocked work now;
workers should poll again with a bounded delay rather than busy-looping.

Lease duration defaults to 60 seconds and must be 1–3600 seconds. A new claim
increments attempts and replaces the token, including after a crashed worker's
lease expires. Use an autocommit READ COMMITTED client: work must begin only
after the claim transaction commits. A rolled-back claim consumes no attempt.
Set database statement/lock timeouts and use a bounded worker pool.

Jobs default to three allowed attempts. `max_attempts` is stored on each job,
with a 1–10 range; intake uses the database default. It has no public upload
option or application-role update grant. The migration owner can configure
per-job policy as an administrative action. The protocol is at-least-once:
work from an expired attempt can still be executing outside PostgreSQL.

If an expired final attempt is found, the function retires it with
`outcome=exhausted`, a null lease and `failed/RETRY_EXHAUSTED`. It handles at most
one job per call, so retirement is progress, not an empty-queue signal. Continue
polling to reach other queued work. Terminal jobs are not automatically revived.

## Renew or settle a lease

Call `renew_ingestion_lease(tenant, project, job, token, seconds)` before expiry.
It returns the new expiration or NULL when the current unexpired lease does
not match. Renewal never shortens an existing lease. A heartbeat cannot revive
an expired lease. Do not log lease tokens or treat them as public API secrets.

Call `finish_ingestion_job(tenant, project, job, token, action, quality, error, delay)`
with bound values. The result is true only when the current running lease is
still active after its row lock is acquired. Wrong project/token, expiration,
or an already-settled job returns false without changing it. Check that result;
a stale worker must discard its result instead of retrying an unconditional write.

- `complete`: quality is `passed`, `failed`, `inconclusive` or `not-evaluated`;
  error must be NULL and delay zero. Processing becomes completed even when
  eval quality is failed. This protocol records status, not indexed facts.
- `retry`: quality must be NULL, error a bounded categorical code, and delay
  0–3600 seconds. The job returns to queued until `next_attempt_at`, retaining
  `last_error_code`. At the attempt cap it becomes failed/RETRY_EXHAUSTED.
- `fail`: quality must be NULL, error a bounded categorical code and delay zero.
  This is a permanent processing failure and is not retried automatically.

Error codes use `[A-Z][A-Z0-9_]{0,63}`. Never put payloads, paths, tokens, SQL
messages or model text in them. Every terminal transition clears its lease.
The protocol uses PostgreSQL's current wall clock after acquiring a row lock,
not the transaction-start clock. Server clock synchronization remains an
operating requirement; this is not a monotonic-clock guarantee.

All three functions retain invoker privileges and row security, use qualified
relations/fixed search paths, and restore the caller's previous tenant/project
context. Lookup-only logins cannot call them. The application SQL login is a
trusted service boundary and retains its earlier direct table permissions:
all worker transitions must use this protocol. Fencing protects cooperating
workers from stale writes; it does not protect against a compromised SQL login
that bypasses the functions. No per-tenant public worker RPC is exposed.

## Next work

The next slice must read private source files with byte/digest verification,
revalidate artifacts, index their facts, and atomically publish results only
under the active lease. Do not write indexed facts before an unfenced status
update: stale workers must not overwrite a new attempt. Heartbeat scheduling,
process shutdown, error classification, retention and service observability also
remain open. Pure artifact processing may repeat; do not run evals or call LLMs
from this indexing worker. M2 is incomplete.

References: [PostgreSQL row locking](https://www.postgresql.org/docs/17/sql-select.html#SQL-FOR-UPDATE-SHARE),
[clock semantics](https://www.postgresql.org/docs/17/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).
Integration completion must also address the [risk register](../../docs/integrations/risk-register.md),
including runtime/schema drift, synthetic-only evidence, and preservation of
the offline package. This verification is not a production security audit or
throughput benchmark.
