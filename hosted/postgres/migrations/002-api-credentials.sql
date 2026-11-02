-- Apply after 001 using the migration owner. Runtime logins never own objects.
BEGIN;

-- Separate the executable lookup from its private read privileges. Never grant
-- the owner role to runtime logins; they inherit only eval_hosted_auth_lookup.
CREATE ROLE eval_hosted_auth_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
CREATE ROLE eval_hosted_auth_lookup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA eval_hosted TO eval_hosted_auth_owner, eval_hosted_auth_lookup;

CREATE TABLE eval_hosted.api_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  account_id uuid NOT NULL,
  -- SHA-256 of a high-entropy bearer secret, never a password or raw token.
  secret_sha256 bytea NOT NULL UNIQUE CHECK (octet_length(secret_sha256) = 32),
  scopes text[] NOT NULL CHECK (scopes IN (ARRAY['read'], ARRAY['ingest'], ARRAY['read','ingest'])),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at) AND expires_at > created_at),
  revoked_at timestamptz CHECK (isfinite(revoked_at) AND revoked_at >= created_at),
  FOREIGN KEY (tenant_id, project_id) REFERENCES eval_hosted.projects(tenant_id, id),
  FOREIGN KEY (tenant_id, account_id) REFERENCES eval_hosted.memberships(tenant_id, account_id)
    ON DELETE CASCADE
);
-- Remove even permissive migration-owner defaults; no direct runtime access.
REVOKE ALL ON eval_hosted.api_credentials FROM PUBLIC, eval_hosted_app,
  eval_hosted_auth_lookup, eval_hosted_auth_owner;
GRANT SELECT ON eval_hosted.api_credentials, eval_hosted.memberships,
  eval_hosted.projects TO eval_hosted_auth_owner;
ALTER TABLE eval_hosted.api_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_hosted.api_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY credential_lookup ON eval_hosted.api_credentials FOR SELECT
  TO eval_hosted_auth_owner USING (true);
CREATE POLICY credential_membership_lookup ON eval_hosted.memberships FOR SELECT
  TO eval_hosted_auth_owner USING (true);
CREATE POLICY credential_project_lookup ON eval_hosted.projects FOR SELECT
  TO eval_hosted_auth_owner USING (true);

-- Fixed search path and schema-qualified relations prevent caller-controlled
-- temporary objects from changing this privileged lookup. No dynamic SQL.
-- statement_timestamp() uses the lookup statement, not transaction-start time.
CREATE FUNCTION eval_hosted.resolve_api_credential(p_secret_sha256 bytea)
RETURNS TABLE (credential_id uuid, tenant_id uuid, project_id uuid, account_id uuid, scopes text[])
LANGUAGE sql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT c.id, c.tenant_id, c.project_id, c.account_id,
    ARRAY(SELECT s FROM unnest(c.scopes) AS s
      WHERE s = 'read' OR (s = 'ingest' AND m.role IN ('owner','admin','editor')))
  FROM eval_hosted.api_credentials AS c
  JOIN eval_hosted.memberships AS m ON m.tenant_id = c.tenant_id AND m.account_id = c.account_id
  JOIN eval_hosted.projects AS p ON p.tenant_id = c.tenant_id AND p.id = c.project_id
  WHERE c.secret_sha256 = p_secret_sha256 AND octet_length(p_secret_sha256) = 32
    AND c.revoked_at IS NULL AND c.created_at <= statement_timestamp()
    AND c.expires_at > statement_timestamp()
    AND ('read' = ANY(c.scopes) OR m.role IN ('owner','admin','editor'))
$$;
REVOKE ALL ON FUNCTION eval_hosted.resolve_api_credential(bytea) FROM PUBLIC, eval_hosted_app;
-- Grant execution while the migration role still owns the function.
GRANT EXECUTE ON FUNCTION eval_hosted.resolve_api_credential(bytea) TO eval_hosted_auth_lookup;
-- PostgreSQL requires CREATE on the containing schema to transfer ownership.
-- It is removed within this transaction, before the lookup becomes visible.
GRANT CREATE ON SCHEMA eval_hosted TO eval_hosted_auth_owner;
-- A non-superuser creator initially has ADMIN but not SET on its new role.
-- Only the trusted migration owner gets SET; do not inherit private read grants.
GRANT eval_hosted_auth_owner TO CURRENT_USER WITH INHERIT FALSE;
GRANT eval_hosted_auth_owner TO CURRENT_USER WITH SET TRUE;
ALTER FUNCTION eval_hosted.resolve_api_credential(bytea) OWNER TO eval_hosted_auth_owner;
REVOKE CREATE ON SCHEMA eval_hosted FROM eval_hosted_auth_owner;

INSERT INTO eval_hosted.schema_migrations (version) VALUES (2);
COMMIT;
