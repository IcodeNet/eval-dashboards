import type { ApiPrincipal } from '../auth/api-credentials.js';

export interface ArtifactMetadata {
  runId: string;
  revision: number;
  sha256: string;
  contentBytes: number;
  idempotencyKey: string;
}
export interface IntakeReceipt {
  artifactId: string;
  jobId: string;
  processingStatus: 'queued' | 'running' | 'completed' | 'failed';
  replayed: boolean;
}
export type AcceptArtifact = (principal: ApiPrincipal, artifact: ArtifactMetadata) => Promise<IntakeReceipt | 'conflict'>;
/** Compatible with a bound-parameter PostgreSQL client's autocommit query method. */
export type IntakeQuery = (text: string, values: unknown[]) => Promise<{ rows: unknown[] }>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

/** Bind this to a restricted application login, never the migration/lookup owner. */
export function postgresArtifactAcceptance(query: IntakeQuery): AcceptArtifact {
  return async (principal, artifact) => {
    try {
      const { rows } = await query('SELECT * FROM eval_hosted.accept_artifact($1::uuid, $2::uuid, $3::text, $4::integer, $5::bytea, $6::bigint, $7::text)',
        [principal.tenantId, principal.projectId, artifact.runId, artifact.revision,
          Buffer.from(artifact.sha256, 'hex'), artifact.contentBytes, artifact.idempotencyKey]);
      const row = rows[0] as Record<string, unknown> | undefined;
      if (rows.length !== 1 || !row || typeof row.artifact_id !== 'string' || !uuid.test(row.artifact_id)
        || typeof row.job_id !== 'string' || !uuid.test(row.job_id)
        || typeof row.processing_state !== 'string' || !['queued', 'running', 'completed', 'failed'].includes(row.processing_state)
        || typeof row.replayed !== 'boolean') throw new Error('Invalid ingestion receipt');
      return { artifactId: row.artifact_id, jobId: row.job_id,
        processingStatus: row.processing_state as IntakeReceipt['processingStatus'], replayed: row.replayed };
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EVD01') return 'conflict';
      // The HTTP boundary turns all other errors into a secret-free unavailable response.
      throw error;
    }
  };
}
