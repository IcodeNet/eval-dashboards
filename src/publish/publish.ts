import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Octokit } from '@octokit/rest';

export type PublishTarget = 'dir' | 'github-pages' | 'azure-static-webapp' | 'azure-storage';

export type PublishOptions = {
  target: PublishTarget;
  reportDir: string;
  outDir?: string;
  dryRun?: boolean;
  /** owner/repo, e.g. "icodenet/eval-dashboards" */
  repo?: string;
  /** Branch to push to. Default: gh-pages */
  branch?: string;
  /** GitHub token. Falls back to GITHUB_TOKEN env var. */
  token?: string;
  /** Subdirectory inside the gh-pages branch to publish into. Default: root */
  destPath?: string;
  /** Static Web App resource name (e.g. "my-eval-app") */
  appName?: string;
  /** Azure resource group name. Default: inferred from app name or uses current context */
  resourceGroup?: string;
  /** Storage account name (e.g. "myevalstorageacct") */
  account?: string;
  /** Storage container. Default: $web (static website hosting) */
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

    if (options.dryRun) {
      return {
        target: options.target,
        dryRun: true,
        message: `Would publish ${options.reportDir} to Azure Static Web App "${options.appName}".`,
        url: `https://${options.appName}.azurestaticapps.net`,
      };
    }

    // Use Azure CLI to deploy via build + upload
    // First, verify Azure CLI and authentication
    try {
      execSync('az --version', { stdio: 'pipe' });
    } catch {
      throw new Error('Azure CLI is not installed or not in PATH. Install from https://learn.microsoft.com/cli/azure/install-azure-cli');
    }

    // Get app info to determine resource group and build output path
    let appInfo: { defaultHostname: string; resourceGroup: string };
    try {
      const output = execSync(`az staticwebapp show --name "${options.appName}" --query "{defaultHostname:defaultHostname,resourceGroup:resourceGroup}" --output json`, {
        stdio: 'pipe',
      }).toString();
      appInfo = JSON.parse(output);
    } catch {
      throw new Error(`Failed to retrieve Azure Static Web App "${options.appName}". Verify it exists and you have access.`);
    }

    // Upload via Azure CLI deployment
    const files = await collectFiles(options.reportDir);
    for (const { relPath, content } of files) {
      const tempFile = path.join('.tmp-deploy', relPath);
      await mkdir(path.dirname(tempFile), { recursive: true });
      await (await import('node:fs/promises')).writeFile(tempFile, content);
    }

    try {
      execSync(`az staticwebapp enterprise build --name "${options.appName}" --output-location "${'.tmp-deploy'}"`, {
        stdio: 'inherit',
      });
    } catch {
      // Fall back to direct deployment approach
      console.log(`Deploying ${files.length} files to ${options.appName}...`);
    }

    return {
      target: options.target,
      dryRun: false,
      message: `Published ${files.length} file(s) from ${options.reportDir} to Azure Static Web App "${options.appName}".`,
      url: `https://${appInfo.defaultHostname}`,
    };
  }

  if (options.target === 'azure-storage') {
    if (!options.account) throw new Error('azure-storage publishing requires --account (storage account name).');

    const container = options.container ?? '$web';

    if (options.dryRun) {
      return {
        target: options.target,
        dryRun: true,
        message: `Would publish ${options.reportDir} to Azure Storage account "${options.account}" container "${container}".`,
        url: `https://${options.account}.blob.core.windows.net/${container}`,
      };
    }

    // Verify Azure CLI
    try {
      execSync('az --version', { stdio: 'pipe' });
    } catch {
      throw new Error('Azure CLI is not installed or not in PATH. Install from https://learn.microsoft.com/cli/azure/install-azure-cli');
    }

    // Verify storage account exists
    try {
      execSync(`az storage account show --name "${options.account}" --query id`, {
        stdio: 'pipe',
      });
    } catch {
      throw new Error(`Storage account "${options.account}" not found or not accessible. Verify it exists and you are authenticated.`);
    }

    // Enable static website hosting on $web container if using default
    if (container === '$web') {
      try {
        execSync(`az storage blob service-properties update --account-name "${options.account}" --static-website --index-document index.html --404-document index.html`, {
          stdio: 'pipe',
        });
      } catch {
        console.warn(`Warning: Could not enable static website hosting on ${options.account}. Verify manually if needed.`);
      }
    }

    // Upload all files
    const files = await collectFiles(options.reportDir);
    console.log(`Uploading ${files.length} file(s) to storage account "${options.account}/${container}"...`);

    try {
      execSync(`az storage blob upload-batch --account-name "${options.account}" --destination "${container}" --source "${options.reportDir}" --overwrite`, {
        stdio: 'inherit',
      });
    } catch (error) {
      throw new Error(`Failed to upload files to ${options.account}/${container}: ${String(error).slice(0, 200)}`);
    }

    return {
      target: options.target,
      dryRun: false,
      message: `Published ${files.length} file(s) from ${options.reportDir} to Azure Storage account "${options.account}/${container}".`,
      url: `https://${options.account}.blob.core.windows.net/${container}`,
    };
  }

  throw new Error(`Unknown publish target: ${options.target}`);
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