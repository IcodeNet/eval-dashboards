import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type AgentQualityInitProfile,
  buildAgentQualityScaffoldFiles,
  buildAgentQualitySetupPlaybook,
  initUsage,
  planScaffoldWrites,
  renderAgentQualityDryRunMode,
  renderAgentQualityTeachMode,
  resolveAgentQualityInitProfile,
  writeScaffoldFiles,
} from '../src/cli/init-scaffold.js';
import { validateEvalReport } from '../src/model/validate.js';
import { lintReportTaxonomy } from '../src/gates/lint-taxonomy.js';

const tempDirs: string[] = [];

const createTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'eval-dashboards-init-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('init scaffold', () => {
  const defaultProfile: AgentQualityInitProfile = {
    setupModules: ['guardrails', 'evals', 'judges', 'multiturn'],
    runner: 'node',
    ci: 'github',
  };

  it('builds scaffold files for agent-quality preset', () => {
    const files = buildAgentQualityScaffoldFiles(defaultProfile);
    const paths = files.map((file) => file.relativePath);

    expect(paths).toContain('eval-dashboards.config.ts');
    expect(paths).toContain('eval/datasets/agent-quality-cases.jsonl');
    expect(paths).toContain('eval/rubrics/agent-quality-rubrics.json');
    expect(paths).toContain('.evals_output/run-agent-quality-template.json');
    expect(paths).toContain('.github/workflows/eval-quality.yml.snippet');
  });

  it('writes scaffold files into output directory', async () => {
    const outDir = await createTempDir();
    const files = buildAgentQualityScaffoldFiles(defaultProfile);

    const written = await writeScaffoldFiles(outDir, files);
    const planned = planScaffoldWrites(outDir, files);

    expect(written).toEqual(planned);

    const config = await readFile(path.join(outDir, 'eval-dashboards.config.ts'), 'utf8');
    const dataset = await readFile(path.join(outDir, 'eval/datasets/agent-quality-cases.jsonl'), 'utf8');

    expect(config).toContain("input: ['.evals_output']");
    expect(dataset).toContain('"suite":"retrieval-recall"');
  });

  it('emits a scaffold artifact that validates as eval-report/v1', async () => {
    const outDir = await createTempDir();
    const files = buildAgentQualityScaffoldFiles(defaultProfile);

    await writeScaffoldFiles(outDir, files);

    const artifactRaw = await readFile(
      path.join(outDir, '.evals_output', 'run-agent-quality-template.json'),
      'utf8',
    );
    const artifact = JSON.parse(artifactRaw) as unknown;
    const result = validateEvalReport(artifact);

    expect(result.ok).toBe(true);
  });

  it('preserves existing non-scaffold artifacts when writing scaffold files', async () => {
    const outDir = await createTempDir();
    const files = buildAgentQualityScaffoldFiles(defaultProfile);
    const staleArtifactPath = path.join(outDir, '.evals_output', 'stale-run.json');

    await mkdir(path.dirname(staleArtifactPath), { recursive: true });
    await writeFile(staleArtifactPath, '{"stale":true}', 'utf8');
    await writeScaffoldFiles(outDir, files);

    await expect(readFile(staleArtifactPath, 'utf8')).resolves.toContain('"stale":true');
    await expect(readFile(path.join(outDir, '.evals_output', 'run-agent-quality-template.json'), 'utf8')).resolves.toContain(
      'agent-quality-template-run',
    );
  });

  it('fails on conflicts unless force is enabled', async () => {
    const outDir = await createTempDir();
    const files = buildAgentQualityScaffoldFiles(defaultProfile);

    await writeScaffoldFiles(outDir, files);
    await expect(writeScaffoldFiles(outDir, files)).rejects.toThrow('Refusing to overwrite existing files');

    await writeFile(path.join(outDir, 'eval-dashboards.config.ts'), 'custom-config', 'utf8');
    await writeScaffoldFiles(outDir, files, true);

    const config = await readFile(path.join(outDir, 'eval-dashboards.config.ts'), 'utf8');
    expect(config).toContain("reportDir: 'eval-dashboard'");
  });

  it('renders teach mode as a dry-run walkthrough', async () => {
    const outDir = await createTempDir();
    const files = buildAgentQualityScaffoldFiles(defaultProfile);
    const walkthrough = renderAgentQualityTeachMode(outDir, files);

    expect(walkthrough).toContain('Teach mode (dry-run): no files were written.');
    expect(walkthrough).toContain('Beginner curriculum (what to learn first):');
    expect(walkthrough).toContain('Schema and taxonomy essentials:');
    expect(walkthrough).toContain('When to extend taxonomy/schema:');
    expect(walkthrough).toContain('How eval-dashboards works:');
    expect(walkthrough).toContain('Suggested setup steps:');
    expect(walkthrough).toContain('Deep-dive doc: docs/teach-curriculum.md');
    expect(walkthrough).toContain(path.join(outDir, 'eval-dashboards.config.ts'));
  });

  it('renders dry-run mode with actionable next steps', async () => {
    const outDir = await createTempDir();
    const files = buildAgentQualityScaffoldFiles(defaultProfile);
    const preview = renderAgentQualityDryRunMode(outDir, files);

    expect(preview).toContain('Would write 5 file(s):');
    expect(preview).toContain(path.join(outDir, 'eval-dashboards.config.ts'));
    expect(preview).toContain('Run again with --write to scaffold these files.');
    expect(preview).toContain('eval-dashboards init --preset=agent-quality --write');
  });

  it('builds a setup playbook file with verify-before-merge commands', () => {
    const playbook = buildAgentQualitySetupPlaybook(defaultProfile);

    expect(playbook.relativePath).toBe('docs/evals-setup-playbook.md');
    expect(playbook.content).toContain('## Local-agent prompts (copy/paste)');
    expect(playbook.content).toContain('## Verify-before-merge commands (must pass)');
    expect(playbook.content).toContain('eval-dashboards lint --input=.evals_output');
  });

  it('includes init usage details for help mode', () => {
    expect(initUsage).toContain('eval-dashboards init [options]');
    expect(initUsage).toContain('--teach');
    expect(initUsage).toContain('--dry-run');
    expect(initUsage).toContain('--setup=<csv>');
    expect(initUsage).toContain('--runner=<name>');
    expect(initUsage).toContain('--ci=<target>');
    expect(initUsage).toContain('--playbook');
  });

  it('resolves profile defaults and validates invalid options', () => {
    expect(resolveAgentQualityInitProfile({})).toEqual(defaultProfile);

    expect(() => resolveAgentQualityInitProfile({ setup: 'guardrails,unknown' })).toThrow(
      'Unknown setup module(s): unknown',
    );
    expect(() => resolveAgentQualityInitProfile({ runner: 'go-test' })).toThrow(
      'Unknown runner go-test',
    );
    expect(() => resolveAgentQualityInitProfile({ ci: 'gitlab' })).toThrow(
      'Unknown ci target gitlab',
    );
  });

  it('includes new guardrail presets with dataset/rubric/gate/scaffold parity', () => {
    const files = buildAgentQualityScaffoldFiles(defaultProfile);

    const dataset = files.find((file) => file.relativePath === 'eval/datasets/agent-quality-cases.jsonl');
    expect(dataset?.content).toContain('"suite":"output-handling-safety"');
    expect(dataset?.content).toContain('"suite":"prompt-leakage-resilience"');

    const rubric = files.find((file) => file.relativePath === 'eval/rubrics/agent-quality-rubrics.json');
    const rubricParsed = JSON.parse(rubric?.content ?? '{}') as { suites: Record<string, unknown> };
    expect(rubricParsed.suites).toHaveProperty('output-handling-safety');
    expect(rubricParsed.suites).toHaveProperty('prompt-leakage-resilience');

    const artifact = files.find((file) => file.relativePath === '.evals_output/run-agent-quality-template.json');
    const artifactParsed = JSON.parse(artifact?.content ?? '{}') as {
      suites?: Array<{ id: string }>;
      rows?: Array<{ id: string; suite: string }>;
    };
    const suiteIds = (artifactParsed.suites ?? []).map((suite) => suite.id);
    expect(suiteIds).toContain('output-handling-safety');
    expect(suiteIds).toContain('prompt-leakage-resilience');
    const rowIds = (artifactParsed.rows ?? []).map((row) => row.id);
    expect(rowIds).toContain('output-handling-safety-001');
    expect(rowIds).toContain('prompt-leakage-resilience-001');
  });

  it('scaffold template artifact passes taxonomy lint and validation', async () => {
    const outDir = await createTempDir();
    const files = buildAgentQualityScaffoldFiles(defaultProfile);

    await writeScaffoldFiles(outDir, files);

    const artifactRaw = await readFile(
      path.join(outDir, '.evals_output', 'run-agent-quality-template.json'),
      'utf8',
    );
    const artifact = JSON.parse(artifactRaw) as unknown;

    const validation = validateEvalReport(artifact);
    expect(validation.ok).toBe(true);

    const lint = lintReportTaxonomy(artifact as Parameters<typeof lintReportTaxonomy>[0]);
    const errors = lint.issues.filter((issue) => issue.level === 'error');
    expect(errors).toHaveLength(0);
  });

  it('splits content-safety into category-specific values', () => {
    const files = buildAgentQualityScaffoldFiles(defaultProfile);
    const dataset = files.find((file) => file.relativePath === 'eval/datasets/agent-quality-cases.jsonl');

    expect(dataset?.content).not.toContain('"category":"content-safety"');
    expect(dataset?.content).toContain('"category":"hate-harassment"');
  });

  it('supports setup filtering and ci target selection', () => {
    const profile = resolveAgentQualityInitProfile({
      setup: 'guardrails,multiturn',
      runner: 'vitest',
      ci: 'azure',
    });
    const files = buildAgentQualityScaffoldFiles(profile);
    const paths = files.map((file) => file.relativePath);

    expect(paths).toContain('azure-pipelines/eval-quality.yml.snippet');
    expect(paths).not.toContain('.github/workflows/eval-quality.yml.snippet');

    const dataset = files.find((file) => file.relativePath === 'eval/datasets/agent-quality-cases.jsonl');
    expect(dataset?.content).toContain('"suite":"refusal-safety"');
    expect(dataset?.content).toContain('"suite":"multiturn-trajectory"');
    expect(dataset?.content).not.toContain('"suite":"retrieval-recall"');

    const artifact = files.find((file) => file.relativePath === '.evals_output/run-agent-quality-template.json');
    expect(artifact?.content).toContain('"suite": "refusal-safety"');
    expect(artifact?.content).toContain('"suite": "multiturn-trajectory"');
    expect(artifact?.content).not.toContain('"suite": "mcp-routing"');

    const artifactParsed = JSON.parse(artifact?.content ?? '{}') as {
      suites?: Array<{ id: string }>;
      rows?: Array<{ suite: string }>;
    };
    const suiteIds = (artifactParsed.suites ?? []).map((suite) => suite.id);
    expect(suiteIds).toContain('refusal-safety');
    expect(suiteIds).toContain('multiturn-trajectory');
    expect(suiteIds).not.toContain('mcp-routing');

    const lint = lintReportTaxonomy(artifactParsed as Parameters<typeof lintReportTaxonomy>[0]);
    const unknownSuiteErrors = lint.issues.filter((issue) => issue.code === 'unknown-suite');
    expect(unknownSuiteErrors).toHaveLength(0);

    const ciSnippet = files.find((file) => file.relativePath === 'azure-pipelines/eval-quality.yml.snippet');
    expect(ciSnippet?.content).toContain('pnpm vitest run');
  });

  it('supports disabling ci scaffold output', () => {
    const profile = resolveAgentQualityInitProfile({ ci: 'none' });
    const files = buildAgentQualityScaffoldFiles(profile);
    const paths = files.map((file) => file.relativePath);

    expect(paths).not.toContain('.github/workflows/eval-quality.yml.snippet');
    expect(paths).not.toContain('azure-pipelines/eval-quality.yml.snippet');
  });
});
