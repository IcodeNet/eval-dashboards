-- Worker operations are private trusted-service calls, not public API routes.
BEGIN;
ALTER TABLE eval_hosted.ingestion_jobs
  ADD COLUMN max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN last_error_code text CHECK (last_error_code ~ '^[A-Z][A-Z0-9_]{0,63}$');
GRANT UPDATE (next_attempt_at, last_error_code) ON eval_hosted.ingestion_jobs TO eval_hosted_app;
CREATE INDEX ingestion_jobs_ready ON eval_hosted.ingestion_jobs
  (tenant_id, project_id, next_attempt_at, created_at, id) WHERE state='queued';

CREATE FUNCTION eval_hosted.claim_ingestion_job(p_tenant uuid, p_project uuid, p_seconds integer DEFAULT 60)
RETURNS TABLE (outcome text, job_id uuid, artifact_id uuid, lease_token uuid, lease_expires_at timestamptz,
  attempts integer, object_key text, sha256 bytea, content_bytes bigint, run_id text, revision integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  previous_tenant text := current_setting('eval_hosted.tenant_id', true);
  previous_project text := current_setting('eval_hosted.project_id', true);
  job eval_hosted.ingestion_jobs%ROWTYPE;
  lease_now timestamptz;
  result_outcome text;
BEGIN
  IF p_tenant IS NULL OR p_project IS NULL OR p_seconds IS NULL OR p_seconds NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'Invalid worker scope or lease duration' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('eval_hosted.tenant_id', p_tenant::text, true);
  PERFORM set_config('eval_hosted.project_id', p_project::text, true);
  SELECT j.* INTO job FROM eval_hosted.ingestion_jobs j
    WHERE j.tenant_id=p_tenant AND j.project_id=p_project
      AND ((j.state='queued' AND j.next_attempt_at<=clock_timestamp())
        OR (j.state='running' AND j.lease_expires_at<=clock_timestamp()))
    ORDER BY j.created_at, j.id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF FOUND THEN
    -- Read the wall clock after acquiring the row lock, never the old transaction clock.
    lease_now := clock_timestamp();
    IF job.attempts>=job.max_attempts THEN
      UPDATE eval_hosted.ingestion_jobs j SET state='failed', lease_token=NULL, lease_expires_at=NULL,
        finished_at=lease_now, started_at=coalesce(j.started_at, lease_now), quality_status=NULL, error_code='RETRY_EXHAUSTED',
        last_error_code=coalesce(j.last_error_code, 'LEASE_EXPIRED')
        WHERE j.tenant_id=p_tenant AND j.project_id=p_project AND j.id=job.id RETURNING j.* INTO job;
      result_outcome := 'exhausted';
    ELSE
      UPDATE eval_hosted.ingestion_jobs j SET state='running', attempts=j.attempts+1,
        lease_token=gen_random_uuid(), lease_expires_at=lease_now+make_interval(secs=>p_seconds),
        started_at=lease_now, finished_at=NULL, quality_status=NULL, error_code=NULL
        WHERE j.tenant_id=p_tenant AND j.project_id=p_project AND j.id=job.id RETURNING j.* INTO job;
      result_outcome := 'claimed';
    END IF;
    RETURN QUERY SELECT result_outcome, job.id, job.artifact_id, job.lease_token, job.lease_expires_at,
      job.attempts, a.object_key, a.sha256, a.content_bytes, a.external_run_id, a.revision
      FROM eval_hosted.artifacts a WHERE a.tenant_id=p_tenant AND a.project_id=p_project AND a.id=job.artifact_id;
  END IF;
  PERFORM set_config('eval_hosted.tenant_id', coalesce(previous_tenant,''), true);
  PERFORM set_config('eval_hosted.project_id', coalesce(previous_project,''), true);
END $$;

CREATE FUNCTION eval_hosted.renew_ingestion_lease(p_tenant uuid, p_project uuid, p_job uuid, p_token uuid, p_seconds integer DEFAULT 60)
RETURNS timestamptz LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  previous_tenant text := current_setting('eval_hosted.tenant_id', true);
  previous_project text := current_setting('eval_hosted.project_id', true);
  job eval_hosted.ingestion_jobs%ROWTYPE;
  expiry timestamptz;
BEGIN
  IF p_tenant IS NULL OR p_project IS NULL OR p_seconds IS NULL OR p_seconds NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'Invalid worker scope or lease duration' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('eval_hosted.tenant_id', p_tenant::text, true);
  PERFORM set_config('eval_hosted.project_id', p_project::text, true);
  SELECT j.* INTO job FROM eval_hosted.ingestion_jobs j
    WHERE j.tenant_id=p_tenant AND j.project_id=p_project AND j.id=p_job FOR UPDATE;
  IF FOUND AND job.state='running' AND job.lease_token=p_token AND job.lease_expires_at>clock_timestamp() THEN
    expiry := greatest(job.lease_expires_at, clock_timestamp()+make_interval(secs=>p_seconds));
    UPDATE eval_hosted.ingestion_jobs j SET lease_expires_at=expiry
      WHERE j.tenant_id=p_tenant AND j.project_id=p_project AND j.id=p_job;
  END IF;
  PERFORM set_config('eval_hosted.tenant_id', coalesce(previous_tenant,''), true);
  PERFORM set_config('eval_hosted.project_id', coalesce(previous_project,''), true);
  RETURN expiry;
END $$;

CREATE FUNCTION eval_hosted.finish_ingestion_job(p_tenant uuid, p_project uuid, p_job uuid, p_token uuid,
  p_action text, p_quality text DEFAULT NULL, p_error text DEFAULT NULL, p_delay_seconds integer DEFAULT 0)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  previous_tenant text := current_setting('eval_hosted.tenant_id', true);
  previous_project text := current_setting('eval_hosted.project_id', true);
  job eval_hosted.ingestion_jobs%ROWTYPE;
  lease_now timestamptz;
  applied boolean := false;
BEGIN
  IF p_tenant IS NULL OR p_project IS NULL OR p_action IS NULL OR p_action NOT IN ('complete','retry','fail')
    OR p_delay_seconds IS NULL OR p_delay_seconds NOT BETWEEN 0 AND 3600
    OR (p_action<>'retry' AND p_delay_seconds<>0)
    OR (p_action='complete' AND (p_quality IS NULL OR p_quality NOT IN ('passed','failed','inconclusive','not-evaluated') OR p_error IS NOT NULL))
    OR (p_action<>'complete' AND (p_quality IS NOT NULL OR p_error IS NULL OR p_error !~ '^[A-Z][A-Z0-9_]{0,63}$')) THEN
    RAISE EXCEPTION 'Invalid worker outcome' USING ERRCODE='22023';
  END IF;
  PERFORM set_config('eval_hosted.tenant_id', p_tenant::text, true);
  PERFORM set_config('eval_hosted.project_id', p_project::text, true);
  SELECT j.* INTO job FROM eval_hosted.ingestion_jobs j
    WHERE j.tenant_id=p_tenant AND j.project_id=p_project AND j.id=p_job FOR UPDATE;
  lease_now := clock_timestamp();
  IF FOUND AND job.state='running' AND job.lease_token=p_token AND job.lease_expires_at>lease_now THEN
    IF p_action='complete' THEN
      UPDATE eval_hosted.ingestion_jobs j SET state='completed', quality_status=p_quality, error_code=NULL,
        lease_token=NULL, lease_expires_at=NULL, finished_at=lease_now
        WHERE j.tenant_id=p_tenant AND j.project_id=p_project AND j.id=p_job;
    ELSIF p_action='retry' AND job.attempts<job.max_attempts THEN
      UPDATE eval_hosted.ingestion_jobs j SET state='queued', quality_status=NULL, error_code=NULL,
        lease_token=NULL, lease_expires_at=NULL, finished_at=NULL, last_error_code=p_error,
        next_attempt_at=lease_now+make_interval(secs=>p_delay_seconds)
        WHERE j.tenant_id=p_tenant AND j.project_id=p_project AND j.id=p_job;
    ELSE
      UPDATE eval_hosted.ingestion_jobs j SET state='failed', quality_status=NULL,
        error_code=CASE WHEN p_action='retry' THEN 'RETRY_EXHAUSTED' ELSE p_error END, last_error_code=p_error,
        lease_token=NULL, lease_expires_at=NULL, finished_at=lease_now
        WHERE j.tenant_id=p_tenant AND j.project_id=p_project AND j.id=p_job;
    END IF;
    applied := true;
  END IF;
  PERFORM set_config('eval_hosted.tenant_id', coalesce(previous_tenant,''), true);
  PERFORM set_config('eval_hosted.project_id', coalesce(previous_project,''), true);
  RETURN applied;
END $$;
REVOKE ALL ON FUNCTION eval_hosted.claim_ingestion_job(uuid,uuid,integer),
  eval_hosted.renew_ingestion_lease(uuid,uuid,uuid,uuid,integer),
  eval_hosted.finish_ingestion_job(uuid,uuid,uuid,uuid,text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION eval_hosted.claim_ingestion_job(uuid,uuid,integer),
  eval_hosted.renew_ingestion_lease(uuid,uuid,uuid,uuid,integer),
  eval_hosted.finish_ingestion_job(uuid,uuid,uuid,uuid,text,text,text,integer) TO eval_hosted_app;
INSERT INTO eval_hosted.schema_migrations (version) VALUES (4);
COMMIT;
