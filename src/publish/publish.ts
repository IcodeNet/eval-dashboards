import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Octokit } from '@octokit/rest';

export type PublishTarget = 'dir' | 'github-pages' | 'azure-static-webapp' | 'azure-storage';

export type PublishOptions = {
  target: PublishTarget;
  reportDir: string;
  outDir?: string;
  dryRun?: boolean;
  /** owner/repo, e.g. "icodenet/eval-reports" */
  repo?: string;
  /** Branch to push to. Default: gh-pages */
  branch?: string;
  /** GitHub token. Falls back to GITHUB_TOKEN env var. */
  token?: string;
  /** Subdirectory inside the gh-pages branch to publish into. Default: root */
  destPath?: string;
  appName?: string;
  account?: string;
  container?: string;
};

export type PublishResult = {
  target: PublishTarget;
  dryRun: boolean;
  message: string;
  url?: string;
};

export const publishReport = async (options: PublishOptions): Promise<PublishResult> => {
  if (options.target === 'dir') {
    const outDir = options.outDir ?? 'published-eval-report';

    if (!options.dryRun) {
      await mkdir(path.dirname(path.resolve(outDir)), { recursive: true });
      await cp(options.reportDir, outDir, { recursive: true });
    }

    return {
      target: options.target,
      dryRun: options.dryRun === true,
      message: `${options.dryRun ? 'Would copy' : 'Copied'} ${options.reportDir} to ${outDir}.`,
    };
  }

  if (options.target === 'github-pages') {
    if (!options.repo) throw new Error('github-pages publishing requires --repo (owner/repo).');

    const token = options.token ?? process.env['GITHUB_TOKEN'];
    if (!token) throw new Error('github-pages publishing requires GITHUB_TOKEN env var or --token.');

    const [owner, repo] = options.repo.split('/');
    if (!owner || !repo) throw new Error('--repo must be in owner/repo format.');

    const branch = options.branch ?? 'gh-pages';
    const destPath = options.destPath?.replace(/^\/+|\/+$/g, '') ?? '';

    if (options.dryRun) {
      return {
        target: options.target,
        dryRun: true,
        message: `Would publish ${options.reportDir} to ${options.repo} branch ${branch}${destPath ? `/${destPath}` : ''}.`,
        url: `https://${owner}.github.io/${repo}/${destPath}`,
      };
    }

    const octokit = new Octokit({ auth: token });

    // Collect all files in the report directory
    const files = await collectFiles(options.reportDir);

    for (const { relPath, content } of files) {
      const ghPath = destPath ? `${destPath}/${relPath}` : relPath;

      // Get current SHA if the file exists (required for update)
      let sha: string | undefined;
      try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path: ghPath, ref: branch });
        if (!Array.isArray(data) && data.type === 'file') sha = data.sha;
      } catch {
        // File doesn't exist yet; sha stays undefined
      }

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: ghPath,
        message: `chore: publish eval report [skip ci]`,
        content: content.toString('base64'),
        branch,
        ...(sha ? { sha } : {}),
      });
    }

    return {
      target: options.target,
      dryRun: false,
      message: `Published ${files.length} file(s) from ${options.reportDir} to ${options.repo}/${branch}.`,
      url: `https://${owner}.github.io/${repo}/${destPath}`,
    };
  }

  if (options.target === 'azure-static-webapp') {
    if (!options.appName) throw new Error('azure-static-webapp publishing requires --app-name.');

    return {
      target: options.target,
      dryRun: options.dryRun === true,
      message: `${options.dryRun ? 'Would publish' : 'Publishing not yet implemented for'} ${options.reportDir} to static web app ${options.appName}.`,
    };
  }

  if (!options.account) throw new Error('azure-storage publishing requires --account.');

  return {
    target: options.target,
    dryRun: options.dryRun === true,
    message: `${options.dryRun ? 'Would publish' : 'Publishing not yet implemented for'} ${options.reportDir} to storage account ${options.account}/${options.container ?? '$web'}.`,
  };
};

async function collectFiles(
  dir: string,
  base = dir,
): Promise<Array<{ relPath: string; content: Buffer }>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results: Array<{ relPath: string; content: Buffer }> = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(base, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      results.push(...(await collectFiles(fullPath, base)));
    } else {
      results.push({ relPath, content: await readFile(fullPath) });
    }
  }

  return results;
}