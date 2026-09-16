import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { publishReport } from '../src/publish/publish.js';

const octokitState: {
  listComments: ReturnType<typeof vi.fn>;
  createComment: ReturnType<typeof vi.fn>;
  updateComment: ReturnType<typeof vi.fn>;
} = {
  listComments: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
};

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    paginate: {
      iterator: (fn: unknown, opts: unknown) => octokitState.listComments(fn, opts),
    },
    rest: {
      issues: {
        listComments: octokitState.listComments,
        createComment: octokitState.createComment,
        updateComment: octokitState.updateComment,
      },
    },
  })),
}));

describe('publishReport', () => {
  it('supports azure-static-webapp dry-run validation', async () => {
    await expect(
      publishReport({
        target: 'azure-static-webapp',
        reportDir: 'eval-report',
        appName: 'demo-app',
        dryRun: true,
      }),
    ).resolves.toMatchObject({
      target: 'azure-static-webapp',
      dryRun: true,
      url: 'https://demo-app.azurestaticapps.net',
    });
  });

  it('rejects azure-static-webapp non-dry-run until execution path is implemented', async () => {
    await expect(
      publishReport({
        target: 'azure-static-webapp',
        reportDir: 'eval-report',
        appName: 'demo-app',
        dryRun: false,
      }),
    ).rejects.toThrow('azure-static-webapp non-dry-run publish is not implemented yet');
  });

  it('annotates the result message when redact is applied', async () => {
    const result = await publishReport({
      target: 'azure-static-webapp',
      reportDir: 'eval-report',
      appName: 'demo-app',
      dryRun: true,
      redact: true,
    });
    expect(result.message).toContain('public tier only; sensitive evidence redacted');
  });
});

describe('publishReport azure-storage', () => {
  it('invokes az via execFileSync argv (not a shell string), even with shell-metacharacter values', async () => {
    vi.resetModules();
    const execFileSyncMock = vi.fn().mockReturnValue(Buffer.from(''));
    vi.doMock('node:child_process', () => ({ execFileSync: execFileSyncMock }));
    const { publishReport: publishReportIsolated } = await import('../src/publish/publish.js');

    const maliciousAccount = 'x"; touch /tmp/should-not-run; echo "';

    await publishReportIsolated({
      target: 'azure-storage',
      reportDir: 'eval-report',
      account: maliciousAccount,
      container: '$web',
      dryRun: false,
    });

    // Every call must be execFileSync('az', [...argv]) — never a single
    // interpolated shell command string that a shell would re-parse.
    expect(execFileSyncMock).toHaveBeenCalled();
    for (const call of execFileSyncMock.mock.calls) {
      const [cmd, args] = call as [string, string[]];
      expect(cmd).toBe('az');
      expect(Array.isArray(args)).toBe(true);
      // The malicious value must appear as a single argv element (inert),
      // never concatenated into a shell command string.
      for (const arg of args) {
        expect(arg.includes('&&')).toBe(false);
      }
    }
    const accountCall = execFileSyncMock.mock.calls.find((c) => (c[1] as string[]).includes(maliciousAccount));
    expect(accountCall).toBeDefined();

    vi.doUnmock('node:child_process');
    vi.resetModules();
  });
});

describe('publishReport github-pr-comment', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env['GITHUB_ACTIONS'];
    delete process.env['CI'];
    delete process.env['GITHUB_TOKEN'];
    delete process.env['PR_NUMBER'];
    delete process.env['GITHUB_EVENT_PATH'];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to dry-run outside CI and never requires a token', async () => {
    const result = await publishReport({
      target: 'github-pr-comment',
      reportDir: 'eval-report',
      repo: 'icodenet/eval-dashboards',
      prNumber: 42,
      commentBody: '## Eval summary\n\nAll good.',
    });
    expect(result.dryRun).toBe(true);
    expect(result.message).toContain('icodenet/eval-dashboards#42');
    expect(result.message).not.toMatch(/ghp_|github_pat_/);
  });

  it('requires --repo', async () => {
    await expect(
      publishReport({
        target: 'github-pr-comment',
        reportDir: 'eval-report',
        prNumber: 1,
        commentBody: 'body',
      }),
    ).rejects.toThrow('requires --repo');
  });

  it('requires a resolvable PR number', async () => {
    await expect(
      publishReport({
        target: 'github-pr-comment',
        reportDir: 'eval-report',
        repo: 'icodenet/eval-dashboards',
        commentBody: 'body',
      }),
    ).rejects.toThrow('requires a pull request number');
  });

  it('requires a comment body or summary.md', async () => {
    await expect(
      publishReport({
        target: 'github-pr-comment',
        reportDir: '/tmp/nonexistent-eval-report-dir-xyz',
        repo: 'icodenet/eval-dashboards',
        prNumber: 7,
      }),
    ).rejects.toThrow('requires --comment-body or a summary.md file');
  });

  it('creates a comment when none exists, then updates it in place on a second run', async () => {
    process.env['GITHUB_ACTIONS'] = 'true';
    process.env['GITHUB_TOKEN'] = 'test-token';

    const { listComments, createComment, updateComment } = octokitState;
    listComments.mockReset();
    createComment.mockReset().mockResolvedValue({
      data: { id: 111, html_url: 'https://github.com/icodenet/eval-dashboards/pull/9#issuecomment-111' },
    });
    updateComment.mockReset().mockResolvedValue({ data: { id: 111 } });

    // First run: no existing comment -> create.
    listComments.mockImplementationOnce(async function* () {
      yield { data: [] };
    });

    const firstResult = await publishReport({
      target: 'github-pr-comment',
      reportDir: 'eval-report',
      repo: 'icodenet/eval-dashboards',
      prNumber: 9,
      commentBody: 'run 1',
    });
    expect(firstResult.dryRun).toBe(false);
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(updateComment).not.toHaveBeenCalled();
    expect(firstResult.message).toContain('Created PR comment');

    // Second run: existing comment carrying the marker -> update in place.
    listComments.mockImplementationOnce(async function* () {
      yield {
        data: [
          {
            id: 111,
            body: '<!-- eval-dashboards:pr-comment -->\nrun 1',
          },
        ],
      };
    });

    const secondResult = await publishReport({
      target: 'github-pr-comment',
      reportDir: 'eval-report',
      repo: 'icodenet/eval-dashboards',
      prNumber: 9,
      commentBody: 'run 2',
    });
    expect(secondResult.dryRun).toBe(false);
    expect(updateComment).toHaveBeenCalledTimes(1);
    expect(updateComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 111, body: expect.stringContaining('run 2') }),
    );
    expect(createComment).toHaveBeenCalledTimes(1);
    expect(secondResult.message).toContain('Updated existing PR comment');
  });
});
