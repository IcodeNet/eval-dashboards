import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import type { ApiPrincipal } from '../auth/api-credentials.js';

/** POSIX private durable filesystem; root/parents must be owned by the service. */
export function privateArtifactFiles(root: string) {
  if (!isAbsolute(root)) throw new Error('Private artifact root must be absolute');
  return async (principal: ApiPrincipal, bytes: Buffer): Promise<string> => {
    const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
    if (!uuid.test(principal.tenantId) || !uuid.test(principal.projectId)) throw new Error('Invalid storage identity');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const directory = join(root, 'artifacts', principal.tenantId, principal.projectId);
    // The operator provisions a durable root. Verify each path component rather
    // than following pre-existing symlinks or widening existing permissions.
    const checkDirectory = async (path: string) => {
      const stat = await lstat(path);
      if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0
        || stat.uid !== process.geteuid?.()) throw new Error('Artifact directory must be private and service-owned');
    };
    await checkDirectory(root);
    let parent = root;
    for (const name of ['artifacts', principal.tenantId, principal.projectId]) {
      const child = join(parent, name);
      try { await mkdir(child, { mode: 0o700 }); }
      catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error;
      }
      await checkDirectory(child);
      const dir = await open(parent, 'r');
      try { await dir.sync(); } finally { await dir.close(); }
      parent = child;
    }
    const target = join(directory, sha256);
    const temporary = join(directory, `.${randomUUID()}.pending`);
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(bytes);
      await file.sync();
      await file.close();
      try {
        // A hard link publishes a fully written file atomically without replacing a retry's target.
        await link(temporary, target);
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error;
        const existing = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
          const stat = await existing.stat();
          if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.geteuid?.() || stat.size !== bytes.length) throw new Error('Stored artifact mismatch');
          const stored = await existing.readFile();
          if (!stored.equals(bytes)) throw new Error('Stored artifact mismatch');
          await existing.sync();
        } finally { await existing.close(); }
      }
      const dir = await open(directory, 'r');
      try { await dir.sync(); } finally { await dir.close(); }
      return sha256;
    } finally {
      await file.close();
      await unlink(temporary).catch(() => undefined);
    }
  };
}
