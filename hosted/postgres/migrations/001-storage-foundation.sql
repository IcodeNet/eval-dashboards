-- Apply once with a migration owner, never with the application's login.
-- Authentication must supply trusted tenant/project context inside a transaction.
BEGIN;

-- The name must be unused. Refuse to reuse a pre-existing role whose grants,
-- memberships or object ownership this migration cannot safely assume.
CREATE ROLE eval_hosted_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;

CREATE SCHEMA eval_hosted;
REVOKE ALL ON SCHEMA eval_hosted FROM PUBLIC;
GRANT USAGE ON SCHEMA eval_hosted TO eval_hosted_app;

CREATE TABLE eval_hosted.schema_migrations (
  version integer PRIMARY KEY CHECK (version > 0),
  applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO eval_hosted.schema_migrations (version) VALUES (1);

-- These settings are server context, not authentication credentials. Application
-- users must not receive database access or be allowed to set them from a body.
CREATE FUNCTION eval_hosted.current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('eval_hosted.tenant_id', true), '')::uuid
$$;
CREATE FUNCTION eval_hosted.current_project() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('eval_hosted.project_id', true), '')::uuid
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA eval_hosted FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA eval_hosted TO eval_hosted_app;

CREATE TABLE eval_hosted.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Global identity records are private to future authentication code. No direct
-- application-role grant is made; this migration implements no login mechanism.
CREATE TABLE eval_hosted.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND octet_length(email) BETWEEN 3 AND 320),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE eval_hosted.memberships (
  tenant_id uuid NOT NULL REFERENCES eval_hosted.tenants(id),
  account_id uuid NOT NULL REFERENCES eval_hosted.accounts(id),
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, account_id)
);

CREATE TABLE eval_hosted.projects (
  tenant_id uuid NOT NULL REFERENCES eval_hosted.tenants(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

-- One portable artifact can contain many datasets, suites, models and graders.
-- Keep immutable source references; do not force a single dataset/model per run.
CREATE TABLE eval_hosted.artifacts (
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  external_run_id text NOT NULL CHECK (octet_length(external_run_id) BETWEEN 1 AND 512),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  schema_version text NOT NULL CHECK (schema_version = 'eval-report/v1'),
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  content_bytes bigint NOT NULL CHECK (content_bytes > 0),
  object_key text GENERATED ALWAYS AS (
    'artifacts/' || tenant_id::text || '/' || project_id::text || '/' || encode(sha256, 'hex')
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, project_id, id),
  UNIQUE (tenant_id, project_id, external_run_id, revision),
  UNIQUE (tenant_id, project_id, sha256),
  UNIQUE (tenant_id, project_id, id, sha256),
  FOREIGN KEY (tenant_id, project_id) REFERENCES eval_hosted.projects(tenant_id, id)
);

CREATE TABLE eval_hosted.idempotency_records (
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  request_key text NOT NULL CHECK (octet_length(request_key) BETWEEN 1 AND 512),
  artifact_id uuid NOT NULL,
  sha256 bytea NOT NULL CHECK (octet_length(sha256) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, project_id, request_key),
  FOREIGN KEY (tenant_id, project_id, artifact_id, sha256)
    REFERENCES eval_hosted.artifacts(tenant_id, project_id, id, sha256)
);

-- Processing state and evaluation quality are distinct: completed indexing can
-- have a failed quality decision. Worker claiming/retries are not implemented here.
CREATE TABLE eval_hosted.ingestion_jobs (
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  artifact_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  quality_status text CHECK (quality_status IN ('passed', 'failed', 'inconclusive', 'not-evaluated')),
  error_code text CHECK (error_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  PRIMARY KEY (tenant_id, project_id, id),
  UNIQUE (tenant_id, project_id, artifact_id),
  FOREIGN KEY (tenant_id, project_id, artifact_id)
    REFERENCES eval_hosted.artifacts(tenant_id, project_id, id),
  CHECK ((state = 'running') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (state = 'running' OR (lease_token IS NULL AND lease_expires_at IS NULL)),
  CHECK (state = 'queued' OR (attempts > 0 AND started_at IS NOT NULL)),
  CHECK (lease_expires_at IS NULL OR lease_expires_at > started_at),
  CHECK ((state IN ('completed', 'failed')) = (finished_at IS NOT NULL)),
  CHECK (started_at IS NULL OR started_at >= created_at),
  CHECK (finished_at IS NULL OR (finished_at >= created_at AND finished_at >= started_at)),
  CHECK ((state = 'completed') = (quality_status IS NOT NULL)),
  CHECK ((state = 'failed') = (error_code IS NOT NULL))
);
CREATE INDEX ingestion_jobs_queue ON eval_hosted.ingestion_jobs (tenant_id, project_id, state, created_at)
  WHERE state IN ('queued', 'running');

CREATE FUNCTION eval_hosted.reject_immutable_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Artifact revisions and idempotency mappings are immutable; append a revision instead'
    USING ERRCODE = '55000';
END $$;
REVOKE ALL ON FUNCTION eval_hosted.reject_immutable_update() FROM PUBLIC;
CREATE TRIGGER artifacts_immutable BEFORE UPDATE ON eval_hosted.artifacts
  FOR EACH ROW EXECUTE FUNCTION eval_hosted.reject_immutable_update();
CREATE TRIGGER idempotency_immutable BEFORE UPDATE ON eval_hosted.idempotency_records
  FOR EACH ROW EXECUTE FUNCTION eval_hosted.reject_immutable_update();

ALTER TABLE eval_hosted.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_hosted.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON eval_hosted.tenants TO eval_hosted_app
  USING (id = eval_hosted.current_tenant()) WITH CHECK (id = eval_hosted.current_tenant());

ALTER TABLE eval_hosted.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_hosted.memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON eval_hosted.memberships TO eval_hosted_app
  USING (tenant_id = eval_hosted.current_tenant()) WITH CHECK (tenant_id = eval_hosted.current_tenant());

ALTER TABLE eval_hosted.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_hosted.projects FORCE ROW LEVEL SECURITY;
CREATE POLICY project_scope ON eval_hosted.projects TO eval_hosted_app
  USING (tenant_id = eval_hosted.current_tenant()
    AND (eval_hosted.current_project() IS NULL OR id = eval_hosted.current_project()))
  WITH CHECK (tenant_id = eval_hosted.current_tenant()
    AND (eval_hosted.current_project() IS NULL OR id = eval_hosted.current_project()));

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['artifacts', 'idempotency_records', 'ingestion_jobs'] LOOP
    EXECUTE format('ALTER TABLE eval_hosted.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE eval_hosted.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY project_scope ON eval_hosted.%I TO eval_hosted_app
      USING (tenant_id = eval_hosted.current_tenant()
        AND (eval_hosted.current_project() IS NULL OR project_id = eval_hosted.current_project()))
      WITH CHECK (tenant_id = eval_hosted.current_tenant()
        AND (eval_hosted.current_project() IS NULL OR project_id = eval_hosted.current_project()))', table_name);
  END LOOP;
END $$;

-- Do not inherit permissive ALTER DEFAULT PRIVILEGES from the migration owner.
REVOKE ALL ON ALL TABLES IN SCHEMA eval_hosted FROM PUBLIC, eval_hosted_app;

GRANT SELECT ON eval_hosted.tenants, eval_hosted.memberships, eval_hosted.projects,
  eval_hosted.artifacts, eval_hosted.idempotency_records, eval_hosted.ingestion_jobs TO eval_hosted_app;
GRANT INSERT ON eval_hosted.artifacts, eval_hosted.idempotency_records, eval_hosted.ingestion_jobs TO eval_hosted_app;
GRANT UPDATE (state, attempts, lease_token, lease_expires_at, quality_status, error_code, started_at, finished_at)
  ON eval_hosted.ingestion_jobs TO eval_hosted_app;

COMMIT;
