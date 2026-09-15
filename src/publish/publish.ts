import { cp, mkdir, readdir, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Octokit } from '@octokit/rest';

export type PublishTarget = 'dir' | 'github-pages' | 'azure-static-webapp' | 'azure-storage' | 'github-pr-comment';

export type PublishOptions = {
  target: PublishTarget;
  reportDir: string;
  outDir?: string;
  dryRun?: boolean;
  /** When true, the caller has already redacted sensitive evidence text
   * from the rendered report before invoking publish (4F.1 two-tier split).
   * Recorded in the publish result message for auditability. */
  redact?: boolean;
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
  /** Pull request number for --target=github-pr-comment. Falls back to
   * parsing GITHUB_EVENT_PATH (pull_request/pull_request_target events) or
   * PR_NUMBER env var when omitted. */
  prNumber?: number;
  /** Markdown body to post as the PR comment (e.g. markdown-summary reporter
   * output) for --target=github-pr-comment. */
  commentBody?: string;
  /** Hidden marker used to find-and-update the same comment across runs
   * instead of creating a new one each time. Default: a stable per-package marker. */
  commentMarker?: string;
};

export type PublishResult = {
  target: PublishTarget;
  dryRun: boolean;
  message: string;
  url?: string;
};

export const publishReport = async (options: PublishOptions): Promise<PublishResult> => {
  const result = await publishReportInternal(options);
  if (options.redact) {
    return { ...result, message: `${result.message} (public tier only; sensitive evidence redacted)` };
  }
  return result;
};

const publishReportInternal = async (options: PublishOptions): Promise<PublishResult> => {
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

    throw new Error(
      'azure-static-webapp non-dry-run publish is not implemented yet. Use --dry-run for validation, or publish with --target=azure-storage/--target=github-pages.',
    );
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

  if (options.target === 'github-pr-comment') {
    if (!options.repo) throw new Error('github-pr-comment publishing requires --repo (owner/repo).');

    const [owner, repo] = options.repo.split('/');
    if (!owner || !repo) throw new Error('--repo must be in owner/repo format.');

    const prNumber = options.prNumber ?? detectPullRequestNumber();
    const marker = options.commentMarker ?? DEFAULT_PR_COMMENT_MARKER;
    const body = options.commentBody ?? (await tryReadSummaryMarkdown(options.reportDir));

    if (!prNumber) {
      throw new Error(
        'github-pr-comment publishing requires a pull request number. Pass --pr-number, ' +
          'set PR_NUMBER, or run inside a GitHub Actions pull_request(_target) event.',
      );
    }
    if (!body) {
      throw new Error(
        'github-pr-comment publishing requires --comment-body or a summary.md file produced by the ' +
          'markdown-summary reporter in --report-dir.',
      );
    }

    // Dry-run by default outside CI; explicit true/false always wins.
    const inCi = process.env['CI'] === 'true' || process.env['GITHUB_ACTIONS'] === 'true';
    const dryRun = options.dryRun ?? !inCi;

    const commentBodyWithMarker = `${marker}\n${body}`;

    if (dryRun) {
      return {
        target: options.target,
        dryRun: true,
        message:
          `Would post/update a PR comment on ${options.repo}#${prNumber} ` +
          `(${commentBodyWithMarker.length} char body, marker ${marker}).`,
      };
    }

    const token = options.token ?? process.env['GITHUB_TOKEN'];
    if (!token) throw new Error('github-pr-comment publishing requires GITHUB_TOKEN env var or --token.');

    const octokit = new Octokit({ auth: token });

    // Find an existing comment carrying our hidden marker so repeat runs
    // update in place instead of creating a new comment each time.
    let existingCommentId: number | undefined;
    for await (const { data: comments } of octokit.paginate.iterator(octokit.rest.issues.listComments, {
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    })) {
      const found = comments.find((comment) => typeof comment.body === 'string' && comment.body.includes(marker));
      if (found) {
        existingCommentId = found.id;
        break;
      }
    }

    if (existingCommentId) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingCommentId,
        body: commentBodyWithMarker,
      });
      return {
        target: options.target,
        dryRun: false,
        message: `Updated existing PR comment ${existingCommentId} on ${options.repo}#${prNumber}.`,
        url: `https://github.com/${owner}/${repo}/pull/${prNumber}#issuecomment-${existingCommentId}`,
      };
    }

    const { data: created } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBodyWithMarker,
    });

    return {
      target: options.target,
      dryRun: false,
      message: `Created PR comment ${created.id} on ${options.repo}#${prNumber}.`,
      url: created.html_url,
    };
  }

  throw new Error(`Unknown publish target: ${options.target}`);
};

/** Stable marker used to find-and-update the same PR comment across runs. */
const DEFAULT_PR_COMMENT_MARKER = '<!-- eval-dashboards:pr-comment -->';

/** Best-effort PR number detection from CI env, never throws. */
function detectPullRequestNumber(): number | undefined {
  const envNumber = process.env['PR_NUMBER'];
  if (envNumber && /^\d+$/.test(envNumber)) return Number(envNumber);

  const eventPath = process.env['GITHUB_EVENT_PATH'];
  if (!eventPath) return undefined;

  try {
    const event = JSON.parse(readFileSync(eventPath, 'utf8')) as {
      pull_request?: { number?: number };
      number?: number;
    };
    return event.pull_request?.number ?? event.number;
  } catch {
    return undefined;
  }
}

async function tryReadSummaryMarkdown(reportDir: string): Promise<string | undefined> {
  try {
    return await readFile(path.join(reportDir, 'summary.md'), 'utf8');
  } catch {
    return undefined;
  }
}

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