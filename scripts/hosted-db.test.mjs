import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { after, before, test } from 'node:test';

// Pinned official multi-platform PostgreSQL integration image. The
// database has no network and no host port/volume; only this owned test container
// is removed. No external database URL or production credentials are accepted.
const image = readFileSync(new URL('../hosted/postgres/test/Dockerfile', import.meta.url), 'utf8')
  .match(/^FROM (postgres:[0-9]+@sha256:[a-f0-9]{64})$/m)?.[1];
assert.ok(image, 'Test image must pin an official PostgreSQL tag and digest');
// Freeze a local Docker target for every command; do not follow a remote context
// or a later context switch while creating/removing this disposable container.
const dockerEndpointArgs = (() => {
  const explicitHost = !process.env.DOCKER_CONTEXT && process.env.DOCKER_HOST;
  if (explicitHost) {
    assert.match(explicitHost, /^(unix|npipe):\/\//, 'Hosted DB checks require a local Docker socket');
    return ['--host', explicitHost];
  }
  const context = execFileSync('docker', ['context', 'show'], { encoding: 'utf8' }).trim();
  const endpoint = execFileSync('docker', ['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8' }).trim();
  assert.match(endpoint, /^(unix|npipe):\/\//, 'Hosted DB checks require a local Docker socket');
  return ['--context', context];
})();
const container = `eval-hosted-test-${randomUUID()}`;
const tenantA = '10000000-0000-0000-0000-000000000001';
const tenantB = '10000000-0000-0000-0000-000000000002';
const projectA = '20000000-0000-0000-0000-000000000001';
const projectA2 = '20000000-0000-0000-0000-000000000002';
const projectB = '20000000-0000-0000-0000-000000000003';
const artifactA = '30000000-0000-0000-0000-000000000001';
const artifactA2 = '30000000-0000-0000-0000-000000000002';
const artifactB = '30000000-0000-0000-0000-000000000003';
const digest = `decode('${'11'.repeat(32)}', 'hex')`;
let startAttempted = false;
const sql = (input, errorCode, user = 'postgres') => {
  const result = spawnSync('docker', [...dockerEndpointArgs, 'exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-U', user, '-d', 'eval_hosted_test'], { input, encoding: 'utf8', timeout: 15_000 });
  if (errorCode) {
    assert.equal(result.status, 3, result.stderr);
    assert.match(result.stderr, new RegExp(`ERROR:  ${errorCode}:`));
    return result.stderr;
  }
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
};
const authSql = (input, errorCode) => sql(input, errorCode, 'eval_hosted_auth_test_login');
const appSql = (input, errorCode) => sql(input, errorCode, 'eval_hosted_test_login');
const scoped = (tenant, project, query, errorCode, rollback = false) => appSql(`BEGIN; SET LOCAL ROLE eval_hosted_app;
  SET LOCAL eval_hosted.tenant_id = '${tenant}'; SET LOCAL eval_hosted.project_id = '${project ?? ''}';
  ${query}; ${rollback ? 'ROLLBACK' : 'COMMIT'};`, errorCode);
const artifactInsert = (tenant, project, id, run = 'same-run', revision = 1, hash = digest) =>
  `INSERT INTO eval_hosted.artifacts (tenant_id, project_id, id, external_run_id, revision, schema_version, sha256, content_bytes)
   VALUES ('${tenant}', '${project}', '${id}', '${run}', ${revision}, 'eval-report/v1', ${hash}, 100)`;

before(async () => {
  startAttempted = true;
  execFileSync('docker', [...dockerEndpointArgs, 'run', '--detach', '--name', container, '--network', 'none', '--memory', '256m', '--tmpfs', '/var/lib/postgresql/data:rw', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=eval_hosted_test', image], { stdio: 'pipe', timeout: 120_000 });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    // Wait for the final postmaster, not the temporary initialization server.
    const pid = spawnSync('docker', [...dockerEndpointArgs, 'exec', container, 'cat', '/proc/1/comm'], { encoding: 'utf8', timeout: 5_000 });
    if (pid.status === 0 && pid.stdout.trim() === 'postgres') {
      const probe = spawnSync('docker', [...dockerEndpointArgs, 'exec', container, 'psql', '-XqAt', '-U', 'postgres', '-d', 'eval_hosted_test', '-c', 'SELECT 1'], { encoding: 'utf8', timeout: 5_000 });
      if (probe.status === 0 && probe.stdout.trim() === '1') { ready = true; break; }
    }
    await delay(500);
  }
  assert.ok(ready, 'Isolated PostgreSQL did not become ready');
  // Simulate an existing cluster with permissive defaults. The migration must
  // explicitly remove PUBLIC table access before granting its application role.
  sql('CREATE ROLE eval_hosted_migration_test LOGIN CREATEROLE NOSUPERUSER NOCREATEDB NOREPLICATION NOBYPASSRLS; ALTER DATABASE eval_hosted_test OWNER TO eval_hosted_migration_test');
  sql('ALTER DEFAULT PRIVILEGES FOR ROLE eval_hosted_migration_test GRANT ALL ON TABLES TO PUBLIC');
  sql(readFileSync(new URL('../hosted/postgres/migrations/001-storage-foundation.sql', import.meta.url), 'utf8'), undefined, 'eval_hosted_migration_test');
  assert.equal(sql("SELECT (to_regclass('eval_hosted.api_credentials') IS NULL)::int || ':' || (to_regprocedure('eval_hosted.resolve_api_credential(bytea)') IS NULL)::int"), '1:1');
  console.log('Storage-only baseline has no credential table or resolver; applying credential migration.');
  sql(readFileSync(new URL('../hosted/postgres/migrations/002-api-credentials.sql', import.meta.url), 'utf8'), undefined, 'eval_hosted_migration_test');
  sql('CREATE ROLE eval_hosted_auth_test_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT eval_hosted_auth_lookup TO eval_hosted_auth_test_login');
  sql('CREATE ROLE eval_hosted_test_login LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT eval_hosted_app TO eval_hosted_test_login');
  console.log(`Migrations applied as ${sql('SELECT current_user', undefined, 'eval_hosted_migration_test')}; non-superuser database owner with CREATEROLE.`);
  console.log(`Real database: ${sql('SHOW server_version')}; isolated container; no external database`);
  sql(`INSERT INTO eval_hosted.tenants (id, name) VALUES ('${tenantA}', 'Synthetic A'), ('${tenantB}', 'Synthetic B');
    INSERT INTO eval_hosted.projects (tenant_id, id, name) VALUES
      ('${tenantA}', '${projectA}', 'A1'), ('${tenantA}', '${projectA2}', 'A2'), ('${tenantB}', '${projectB}', 'B1');
    ${artifactInsert(tenantA, projectA, artifactA)};
    ${artifactInsert(tenantA, projectA2, artifactA2)};
    ${artifactInsert(tenantB, projectB, artifactB)};
    INSERT INTO eval_hosted.accounts (email) VALUES ('synthetic-a@example.invalid'), ('synthetic-b@example.invalid');
    INSERT INTO eval_hosted.idempotency_records VALUES
      ('${tenantA}','${projectA}','same-key','${artifactA}',${digest},now()),
      ('${tenantB}','${projectB}','same-key','${artifactB}',${digest},now());`);
});
after(() => {
  if (!startAttempted) return;
  const removed = spawnSync('docker', [...dockerEndpointArgs, 'rm', '--force', '--volumes', container], { encoding: 'utf8', timeout: 15_000 });
  assert.ok(removed.status === 0 || removed.stderr?.includes('No such container'), removed.stderr || removed.error?.message);
  console.log(removed.status === 0 ? 'Owned PostgreSQL test container removed.' : 'No owned PostgreSQL test container remained.');
});

test('application role cannot bypass RLS and every granted table forces it', () => {
  assert.equal(sql("SELECT rolsuper OR rolbypassrls OR rolcanlogin FROM pg_roles WHERE rolname = 'eval_hosted_app'"), 'f');
  assert.equal(sql("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = 'eval_hosted_test_login'"), 'f');
  assert.equal(appSql('SELECT current_user'), 'eval_hosted_test_login');
  assert.equal(sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='eval_hosted' AND c.relname IN ('tenants','memberships','projects','artifacts','idempotency_records','ingestion_jobs') AND c.relrowsecurity AND c.relforcerowsecurity"), '6');
});
test('missing tenant context denies reads and writes', () => {
  assert.equal(appSql('SELECT count(*) FROM eval_hosted.artifacts'), '0');
  appSql(artifactInsert(tenantA, projectA, randomUUID(), 'no-context'), '42501');
});
test('tenant and project context scope reads without caller WHERE filters', () => {
  assert.equal(scoped(tenantA, undefined, 'SELECT count(*) FROM eval_hosted.artifacts'), '2');
  assert.equal(scoped(tenantB, undefined, 'SELECT count(*) FROM eval_hosted.artifacts'), '1');
  assert.equal(scoped(tenantA, projectA, 'SELECT count(*) FROM eval_hosted.artifacts'), '1');
  assert.equal(scoped(tenantA, projectB, 'SELECT count(*) FROM eval_hosted.artifacts'), '0');
});
test('forged tenant or same-tenant project writes fail closed', () => {
  scoped(tenantA, projectA, artifactInsert(tenantB, projectB, randomUUID(), 'forged'), '42501');
  scoped(tenantA, projectA, artifactInsert(tenantA, projectA2, randomUUID(), 'forged'), '42501');
});
test('a UUID-only foreign-key control accepts the mismatch that scoped keys reject', () => {
  const control = sql(`CREATE TEMP TABLE control_projects (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
    CREATE TEMP TABLE control_artifacts (tenant_id uuid NOT NULL, project_id uuid REFERENCES control_projects(id));
    INSERT INTO control_projects VALUES ('${projectB}', '${tenantB}');
    INSERT INTO control_artifacts VALUES ('${tenantA}', '${projectB}');
    SELECT count(*) FROM control_artifacts a JOIN control_projects p ON p.id=a.project_id WHERE a.tenant_id<>p.tenant_id;`);
  assert.equal(control, '1');
  sql(artifactInsert(tenantA, projectB, randomUUID(), 'same-mismatch'), '23503');
  console.log('Synthetic UUID-only FK control accepted 1 cross-tenant reference; scoped schema rejected the same IDs with SQLSTATE 23503.');
});
test('composite foreign keys block cross-tenant and cross-project references even for the owner', () => {
  for (const artifact of [artifactB, artifactA2]) sql(`INSERT INTO eval_hosted.ingestion_jobs (tenant_id, project_id, artifact_id) VALUES ('${tenantA}', '${projectA}', '${artifact}')`, '23503');
  sql(artifactInsert(tenantA, projectB, randomUUID(), 'wrong-parent'), '23503');
});
test('run identity/revision is unique within a project, while explicit new revisions append', () => {
  sql(artifactInsert(tenantA, projectA, randomUUID(), 'same-run', 1, `decode('${'22'.repeat(32)}','hex')`), '23505');
  scoped(tenantA, projectA, artifactInsert(tenantA, projectA, randomUUID(), 'same-run', 2, `decode('${'22'.repeat(32)}','hex')`), undefined, true);
  assert.equal(scoped(tenantA, projectA, "SELECT count(*) FROM eval_hosted.artifacts WHERE external_run_id='same-run'"), '1');
});
test('hosted identity/digest bounds reject malformed metadata without changing the portable schema', () => {
  for (const [run, revision, hash] of [
    ['', 1, `decode('${'22'.repeat(32)}','hex')`],
    ['x'.repeat(513), 1, `decode('${'22'.repeat(32)}','hex')`],
    ['bad-revision', 0, `decode('${'22'.repeat(32)}','hex')`],
    ['bad-digest', 1, `decode('${'22'.repeat(31)}','hex')`],
  ]) sql(artifactInsert(tenantA, projectA, randomUUID(), run, revision, hash), '23514');
  const maxId = 'x'.repeat(512);
  const out = scoped(tenantA, projectA, `${artifactInsert(tenantA, projectA, randomUUID(), maxId, 1, `decode('${'22'.repeat(32)}','hex')`)} RETURNING octet_length(external_run_id)`, undefined, true);
  assert.equal(out, '512');
});
test('artifact revisions and idempotency mappings cannot be overwritten', () => {
  sql(`UPDATE eval_hosted.artifacts SET content_bytes=101 WHERE id='${artifactA}'`, '55000');
  scoped(tenantA, projectA, `DELETE FROM eval_hosted.artifacts WHERE id='${artifactA}'`, '42501');
  sql(`BEGIN; INSERT INTO eval_hosted.idempotency_records VALUES ('${tenantA}','${projectA}','immutable','${artifactA}',${digest},now()); UPDATE eval_hosted.idempotency_records SET request_key='changed'`, '55000');
});
test('idempotency keys bind exact artifact digest and project', () => {
  sql(`BEGIN; INSERT INTO eval_hosted.idempotency_records VALUES ('${tenantA}','${projectA}','delivery-1','${artifactA}',${digest},now()); INSERT INTO eval_hosted.idempotency_records VALUES ('${tenantA}','${projectA}','delivery-1','${artifactA}',${digest},now())`, '23505');
  sql(`INSERT INTO eval_hosted.idempotency_records VALUES ('${tenantA}','${projectA}','bad-digest','${artifactA}',decode('${'22'.repeat(32)}','hex'),now())`, '23503');
  sql(`INSERT INTO eval_hosted.idempotency_records VALUES ('${tenantA}','${projectA}','bad-scope','${artifactB}',${digest},now())`, '23503');
});
test('the same delivery key is isolated across tenants and visible only in its scope', () => {
  assert.equal(scoped(tenantA, projectA, 'SELECT count(*) FROM eval_hosted.idempotency_records'), '1');
  assert.equal(scoped(tenantB, projectB, 'SELECT count(*) FROM eval_hosted.idempotency_records'), '1');
  assert.equal(scoped(tenantA, projectB, 'SELECT count(*) FROM eval_hosted.idempotency_records'), '0');
  assert.equal(scoped(tenantA, projectA, `INSERT INTO eval_hosted.idempotency_records VALUES ('${tenantA}','${projectA}','new-key','${artifactA}',${digest},now()) RETURNING request_key`, undefined, true), 'new-key');
});
test('an immutable artifact has one durable job rather than duplicated work records', () => {
  const insert = `INSERT INTO eval_hosted.ingestion_jobs (tenant_id,project_id,artifact_id) VALUES ('${tenantA}','${projectA}','${artifactA}')`;
  sql(`BEGIN; ${insert}; ${insert}`, '23505');
});
test('processing completion can carry failed quality without becoming a processing error', () => {
  const out = scoped(tenantA, projectA, `INSERT INTO eval_hosted.ingestion_jobs (tenant_id,project_id,artifact_id,state,attempts,started_at,finished_at,quality_status)
    VALUES ('${tenantA}','${projectA}','${artifactA}','completed',1,now(),now(),'failed') RETURNING state || ':' || quality_status`, undefined, true);
  assert.equal(out, 'completed:failed');
});
test('a scoped worker can complete a lease and clears lease metadata', () => {
  const out = scoped(tenantA, projectA, `INSERT INTO eval_hosted.ingestion_jobs (tenant_id,project_id,artifact_id,state,attempts,started_at,lease_token,lease_expires_at)
    VALUES ('${tenantA}','${projectA}','${artifactA}','running',1,now(),gen_random_uuid(),now()+interval '1 minute');
    UPDATE eval_hosted.ingestion_jobs SET state='completed',lease_token=NULL,lease_expires_at=NULL,finished_at=now(),quality_status='passed'
    WHERE artifact_id='${artifactA}' RETURNING state`, undefined, true);
  assert.equal(out, 'completed');
});
test('incomplete job metadata cannot carry completed state, quality, or partial leases', () => {
  const base = `INSERT INTO eval_hosted.ingestion_jobs (tenant_id,project_id,artifact_id,state,lease_token,attempts,started_at,finished_at,quality_status) VALUES ('${tenantA}','${projectA}','${artifactA}',`;
  for (const values of ["'completed',NULL,0,NULL,NULL,NULL)", "'queued',NULL,0,NULL,NULL,'passed')", "'running',gen_random_uuid(),1,now(),NULL,NULL)", "'completed',NULL,1,now()+interval '1 day',now(),'passed')"]) sql(base + values, '23514');
});
test('artifact source keys are tenant/project scoped and digest-derived', () => {
  const key = scoped(tenantA, projectA, `SELECT object_key FROM eval_hosted.artifacts WHERE id='${artifactA}'`);
  assert.equal(key, `artifacts/${tenantA}/${projectA}/${'11'.repeat(32)}`);
  assert.notEqual(key, scoped(tenantB, projectB, `SELECT object_key FROM eval_hosted.artifacts WHERE id='${artifactB}'`));
});
test('SET LOCAL tenant/project context disappears after commit and rollback on the same connection', () => {
  assert.equal(appSql(`BEGIN; SET LOCAL ROLE eval_hosted_app; SET LOCAL eval_hosted.tenant_id='${tenantA}'; SELECT count(*) FROM eval_hosted.artifacts; COMMIT;
    BEGIN; SET LOCAL ROLE eval_hosted_app; SELECT count(*) FROM eval_hosted.artifacts; COMMIT;
    BEGIN; SET LOCAL ROLE eval_hosted_app; SET LOCAL eval_hosted.tenant_id='${tenantA}'; SET LOCAL eval_hosted.project_id='${projectA}'; SELECT count(*) FROM eval_hosted.artifacts; ROLLBACK;
    BEGIN; SET LOCAL ROLE eval_hosted_app; SELECT count(*) FROM eval_hosted.artifacts; COMMIT;`), '2\n0\n1\n0');
});
test('global identity records and schema changes are not granted to the application role', () => {
  appSql('SELECT * FROM eval_hosted.accounts', '42501');
  appSql('TRUNCATE eval_hosted.artifacts', '42501');
  appSql('CREATE TABLE eval_hosted.unauthorized (id integer)', '42501');
  appSql('SET ROLE postgres', '42501');
  appSql('SET row_security=off; SELECT * FROM eval_hosted.artifacts', '42501');
});
test('migration reapply fails transactionally and preserves existing artifacts', () => {
  sql(readFileSync(new URL('../hosted/postgres/migrations/001-storage-foundation.sql', import.meta.url), 'utf8'), '42710', 'eval_hosted_migration_test');
  assert.equal(sql('SELECT version FROM eval_hosted.schema_migrations ORDER BY version'), '1\n2');
  assert.equal(sql('SELECT count(*) FROM eval_hosted.artifacts'), '3');
});

// Credential fixtures contain synthetic digests, never real bearer tokens.
const accountA = '40000000-0000-0000-0000-000000000001';
const accountB = '40000000-0000-0000-0000-000000000002';
const credentialId = '50000000-0000-0000-0000-000000000001';
const credentialHash = `decode('${'aa'.repeat(32)}','hex')`;
const credentialFixture = `
  INSERT INTO eval_hosted.accounts (id,email) VALUES ('${accountA}','credential-a@example.invalid'), ('${accountB}','credential-b@example.invalid');
  INSERT INTO eval_hosted.memberships (tenant_id,account_id,role) VALUES ('${tenantA}','${accountA}','editor'), ('${tenantB}','${accountB}','viewer');
  INSERT INTO eval_hosted.api_credentials (id,tenant_id,project_id,account_id,secret_sha256,scopes,expires_at)
  VALUES ('${credentialId}','${tenantA}','${projectA}','${accountA}',${credentialHash},ARRAY['read','ingest'],now()+interval '1 hour');`;
const resolve = `SELECT tenant_id || ':' || project_id || ':' || array_to_string(scopes,',') FROM eval_hosted.resolve_api_credential(${credentialHash})`;
const ownerFixture = (query, code) => sql(`BEGIN; ${credentialFixture} ${query}; ROLLBACK;`, code);
const authFixture = (query, expected) => {
  // Fixture writes are privileged; the lookup itself uses the restricted role.
  const out = ownerFixture(`SET LOCAL ROLE eval_hosted_auth_test_login; ${query}`);
  assert.equal(out, expected);
};

test('credential lookup is callable by a restricted login with no table access', () => {
  assert.equal(sql("SELECT rolcreaterole AND NOT (rolsuper OR rolbypassrls) FROM pg_roles WHERE rolname='eval_hosted_migration_test'"), 't');
  assert.equal(authSql('SELECT current_user'), 'eval_hosted_auth_test_login');
  for (const table of ['api_credentials','memberships','projects','accounts','artifacts']) authSql(`SELECT * FROM eval_hosted.${table}`, '42501');
  authSql('SET ROLE eval_hosted_auth_owner', '42501');
  authSql('SET ROLE eval_hosted_app', '42501');
  appSql(`SELECT * FROM eval_hosted.resolve_api_credential(${credentialHash})`, '42501');
  appSql('SELECT * FROM eval_hosted.api_credentials', '42501');
  assert.equal(sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('eval_hosted_auth_owner','eval_hosted_auth_lookup') AND NOT (rolsuper OR rolbypassrls OR rolcanlogin OR rolcreaterole OR rolcreatedb)"), '2');
  assert.equal(sql("SELECT pg_get_userbyid(proowner) || ':' || prosecdef::text FROM pg_proc WHERE oid='eval_hosted.resolve_api_credential(bytea)'::regprocedure"), 'eval_hosted_auth_owner:true');
  assert.equal(sql("SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='eval_hosted.api_credentials'::regclass"), 't');
  assert.equal(sql("SELECT has_schema_privilege('eval_hosted_auth_owner','eval_hosted','CREATE')"), 'f');
});
test('active credentials resolve only their stored project even under forged context', () => {
  authFixture(`SET LOCAL eval_hosted.tenant_id='${tenantB}'; SET LOCAL eval_hosted.project_id='${projectB}'; ${resolve}`, `${tenantA}:${projectA}:read,ingest`);
});
test('unknown, null, and malformed credential digests return no identity', () => {
  for (const hash of ["NULL", "decode('aa','hex')", `decode('${'bb'.repeat(32)}','hex')`])
    assert.equal(authSql(`SELECT count(*) FROM eval_hosted.resolve_api_credential(${hash})`), '0');
});
test('revoked, expired, and not-yet-valid credentials return no identity', () => {
  for (const update of ["revoked_at=now()", "created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour'", "created_at=now()+interval '1 hour',expires_at=now()+interval '2 hours'"])
    authFixture(`RESET ROLE; UPDATE eval_hosted.api_credentials SET ${update}; SET LOCAL ROLE eval_hosted_auth_test_login; SELECT count(*) FROM eval_hosted.resolve_api_credential(${credentialHash})`, '0');
});
test('membership downgrade removes ingest immediately, and key scopes never escalate', () => {
  const out = ownerFixture(`${resolve}; UPDATE eval_hosted.memberships SET role='viewer' WHERE account_id='${accountA}';
    SET LOCAL ROLE eval_hosted_auth_test_login; ${resolve}; RESET ROLE;
    UPDATE eval_hosted.api_credentials SET scopes=ARRAY['ingest']; SET LOCAL ROLE eval_hosted_auth_test_login;
    SELECT count(*) FROM eval_hosted.resolve_api_credential(${credentialHash}); RESET ROLE;
    UPDATE eval_hosted.memberships SET role='owner' WHERE account_id='${accountA}'; UPDATE eval_hosted.api_credentials SET scopes=ARRAY['read'];
    SET LOCAL ROLE eval_hosted_auth_test_login; ${resolve}`);
  assert.equal(out, `${tenantA}:${projectA}:read,ingest\n${tenantA}:${projectA}:read\n0\n${tenantA}:${projectA}:read`);
});
test('membership removal invalidates credentials and rejoining does not resurrect them', () => {
  authFixture(`RESET ROLE; DELETE FROM eval_hosted.memberships WHERE account_id='${accountA}';
    INSERT INTO eval_hosted.memberships (tenant_id,account_id,role) VALUES ('${tenantA}','${accountA}','editor');
    SET LOCAL ROLE eval_hosted_auth_test_login; SELECT count(*) FROM eval_hosted.resolve_api_credential(${credentialHash})`, '0');
});
test('credential foreign keys reject mismatched tenant membership and project', () => {
  ownerFixture(`UPDATE eval_hosted.api_credentials SET account_id='${accountB}'`, '23503');
  ownerFixture(`UPDATE eval_hosted.api_credentials SET project_id='${projectB}'`, '23503');
});
test('credential bounds reject unknown or duplicate scopes, bad digests and unlimited expiry', () => {
  for (const update of ["scopes=ARRAY['admin']", "scopes=ARRAY[]::text[]", "scopes=ARRAY['read','read']", "scopes=ARRAY['read',NULL]", "secret_sha256=decode('aa','hex')", "expires_at='infinity'", "expires_at=created_at", "revoked_at=created_at-interval '1 second'"])
    ownerFixture(`UPDATE eval_hosted.api_credentials SET ${update}`, '23514');
  ownerFixture(`INSERT INTO eval_hosted.api_credentials (tenant_id,project_id,account_id,secret_sha256,scopes,expires_at)
    SELECT tenant_id,project_id,account_id,secret_sha256,scopes,expires_at FROM eval_hosted.api_credentials`, '23505');
});
test('lookup ignores caller search path and temporary table shadows', () => {
  authFixture(`CREATE TEMP TABLE api_credentials (secret_sha256 bytea); CREATE TEMP TABLE memberships (role text);
    SET LOCAL search_path=pg_temp,public; ${resolve}`, `${tenantA}:${projectA}:read,ingest`);
  assert.equal(sql("SELECT proconfig::text FROM pg_proc WHERE oid='eval_hosted.resolve_api_credential(bytea)'::regprocedure"), '{"search_path=pg_catalog, pg_temp"}');
});
test('credential migration reapply rolls back without changing migration history', () => {
  sql(readFileSync(new URL('../hosted/postgres/migrations/002-api-credentials.sql', import.meta.url), 'utf8'), '42710', 'eval_hosted_migration_test');
  assert.equal(sql('SELECT version FROM eval_hosted.schema_migrations ORDER BY version'), '1\n2');
});

test('a separately connected lookup login resolves an active key without owner privileges', () => {
  sql(credentialFixture);
  try {
    assert.equal(authSql(resolve), `${tenantA}:${projectA}:read,ingest`);
    authSql('TRUNCATE eval_hosted.api_credentials', '42501');
    authSql("CREATE TABLE eval_hosted.forbidden (id integer)", '42501');
  } finally {
    sql(`DELETE FROM eval_hosted.api_credentials WHERE account_id='${accountA}';
      DELETE FROM eval_hosted.memberships WHERE account_id IN ('${accountA}','${accountB}');
      DELETE FROM eval_hosted.accounts WHERE id IN ('${accountA}','${accountB}')`);
  }
});
test('expiry uses each statement time even inside an already-open transaction', () => {
  // Anchor expiry to the old transaction clock, then move past it before any
  // lookup. Scheduler pauses only make it older; no active-key timing race.
  const out = ownerFixture(`SELECT pg_sleep(0.01);
    UPDATE eval_hosted.api_credentials SET expires_at=transaction_timestamp()+interval '1 microsecond';
    SELECT expires_at > transaction_timestamp() AND expires_at < statement_timestamp() FROM eval_hosted.api_credentials;
    SET LOCAL ROLE eval_hosted_auth_test_login; SELECT count(*) FROM eval_hosted.resolve_api_credential(${credentialHash})`);
  assert.deepEqual(out.split('\n').filter(Boolean), ['t','0']);
});
