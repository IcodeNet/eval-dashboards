-- Apply after 001/002 as the migration owner. No new runtime role or table grants.
BEGIN;

-- Invoker privileges and RLS remain active. Tenant/project arguments come ONLY
-- from server authentication; SQL access itself is trusted service access.
CREATE FUNCTION eval_hosted.accept_artifact(
  p_tenant uuid, p_project uuid, p_run text, p_revision integer,
  p_sha256 bytea, p_bytes bigint, p_key text
) RETURNS TABLE (artifact_id uuid, job_id uuid, processing_state text, replayed boolean)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  previous_tenant text := current_setting('eval_hosted.tenant_id', true);
  previous_project text := current_setting('eval_hosted.project_id', true);
  stored eval_hosted.artifacts%ROWTYPE;
  delivery eval_hosted.idempotency_records%ROWTYPE;
  had_delivery boolean;
  reused boolean := false;
BEGIN
  IF p_tenant IS NULL OR p_project IS NULL OR p_run IS NULL
    OR octet_length(p_run) NOT BETWEEN 1 AND 512 OR p_revision IS NULL OR p_revision < 1
    OR p_sha256 IS NULL OR octet_length(p_sha256) <> 32 OR p_bytes IS NULL OR p_bytes < 1
    OR p_key IS NULL OR octet_length(p_key) NOT BETWEEN 1 AND 128
    OR p_key !~ '^[!-~]+$' THEN
    RAISE EXCEPTION 'Invalid intake metadata' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('eval_hosted.tenant_id', p_tenant::text, true);
  PERFORM set_config('eval_hosted.project_id', p_project::text, true);
  -- Serialize this project's intake calls at READ COMMITTED. Hash collisions
  -- only cause extra waiting. This is correctness groundwork, not a scale claim.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text || '/' || p_project::text, 0));
  SELECT i.* INTO delivery FROM eval_hosted.idempotency_records i
    WHERE i.tenant_id=p_tenant AND i.project_id=p_project AND i.request_key=p_key;
  had_delivery := FOUND;
  IF had_delivery THEN
    SELECT a.* INTO STRICT stored FROM eval_hosted.artifacts a
      WHERE a.tenant_id=p_tenant AND a.project_id=p_project AND a.id=delivery.artifact_id;
    IF stored.external_run_id <> p_run OR stored.revision <> p_revision
      OR stored.sha256 <> p_sha256 OR stored.content_bytes <> p_bytes THEN
      RAISE EXCEPTION 'Artifact conflict' USING ERRCODE = 'EVD01';
    END IF;
    reused := true;
  ELSE
    SELECT a.* INTO stored FROM eval_hosted.artifacts a
      WHERE a.tenant_id=p_tenant AND a.project_id=p_project AND a.external_run_id=p_run AND a.revision=p_revision;
    IF FOUND THEN
      IF stored.sha256 <> p_sha256 OR stored.content_bytes <> p_bytes THEN
        RAISE EXCEPTION 'Artifact conflict' USING ERRCODE = 'EVD01';
      END IF;
      reused := true;
    ELSE
      -- The source contract has one run.id per byte artifact. Never alias a
      -- stored digest to a different run/revision to satisfy a uniqueness error.
      IF EXISTS (SELECT 1 FROM eval_hosted.artifacts a
        WHERE a.tenant_id=p_tenant AND a.project_id=p_project AND a.sha256=p_sha256) THEN
        RAISE EXCEPTION 'Artifact conflict' USING ERRCODE = 'EVD01';
      END IF;
      INSERT INTO eval_hosted.artifacts (tenant_id, project_id, external_run_id, revision, schema_version, sha256, content_bytes)
        VALUES (p_tenant, p_project, p_run, p_revision, 'eval-report/v1', p_sha256, p_bytes)
        RETURNING * INTO stored;
    END IF;
  END IF;
  INSERT INTO eval_hosted.ingestion_jobs (tenant_id, project_id, artifact_id)
    VALUES (p_tenant, p_project, stored.id)
    ON CONFLICT ON CONSTRAINT ingestion_jobs_tenant_id_project_id_artifact_id_key DO NOTHING;
  IF NOT had_delivery THEN
    INSERT INTO eval_hosted.idempotency_records (tenant_id, project_id, request_key, artifact_id, sha256)
      VALUES (p_tenant, p_project, p_key, stored.id, p_sha256);
  END IF;
  RETURN QUERY SELECT stored.id, j.id, j.state, reused FROM eval_hosted.ingestion_jobs j
    WHERE j.tenant_id=p_tenant AND j.project_id=p_project AND j.artifact_id=stored.id;
  -- RETURN QUERY appends rows and continues. Restore before returning control.
  -- An exception rolls back all changes, including context, with its statement.
  PERFORM set_config('eval_hosted.tenant_id', coalesce(previous_tenant, ''), true);
  PERFORM set_config('eval_hosted.project_id', coalesce(previous_project, ''), true);
END $$;
REVOKE ALL ON FUNCTION eval_hosted.accept_artifact(uuid,uuid,text,integer,bytea,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION eval_hosted.accept_artifact(uuid,uuid,text,integer,bytea,bigint,text) TO eval_hosted_app;
INSERT INTO eval_hosted.schema_migrations (version) VALUES (3);
COMMIT;
