import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tsxBin = path.join(process.cwd(), 'node_modules/.bin/tsx');
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-reports-lint-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const governanceFixture = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'run-governance', generatedAt: '2026-09-14T00:00:00.000Z' },
  suites: [
    { id: 'quality', total: 2, passed: 2, failed: 0 },
    { id: 'safety', total: 1, passed: 1, failed: 0 },
  ],
  rows: [
    {
      id: 'case-001',
      suite: 'quality',
      passed: true,
      kind: 'agent',
      severity: 'none',
      category: 'answer-quality',
      datasetId: 'dataset-v1',
      toolCalls: [{ name: 'lookup' }],
      agentVersion: 'agent-v1',
      promptVersion: 'prompt-v1',
    },
    {
      id: 'case-001',
      suite: 'safety',
      passed: true,
      kind: 'agent',
      severity: 'none',
      category: 'policy',
      datasetId: 'dataset-v1',
      scenarioId: 'returns',
      toolCalls: [{ name: 'lookup' }],
      agentVersion: 'agent-v1',
      promptVersion: 'prompt-v1',
    },
    {
      id: 'case-002',
      suite: 'quality',
      passed: true,
      kind: 'agent',
      severity: 'none',
      category: 'answer-quality',
      scenarioId: 'account-help',
      toolCalls: [{ name: 'lookup' }],
      agentVersion: 'agent-v1',
      promptVersion: 'prompt-v1',
    },
  ],
};

describe('cli lint dataset governance warnings', () => {
  it('warns but passes by default for duplicate dataset case ids and orphan scenario references', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    const artifactPath = path.join(artifactDir, 'run-governance.json');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(artifactPath, JSON.stringify(governanceFixture, null, 2));

    const { stdout } = await execFileAsync('pnpm', ['cli:dev', 'lint', `--input=${artifactDir}`], {
      cwd: process.cwd(),
    });

    expect(stdout).toContain('Eval taxonomy lint passed with warnings');
    expect(stdout).toContain('duplicate-dataset-case-id');
    expect(stdout).toContain('orphan-scenario-reference');
  });

  it('fails in strict mode for the same fixture', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    const artifactPath = path.join(artifactDir, 'run-governance.json');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(artifactPath, JSON.stringify(governanceFixture, null, 2));

    try {
      await execFileAsync('pnpm', ['cli:dev', 'lint', `--input=${artifactDir}`, '--strict'], {
        cwd: process.cwd(),
      });
      throw new Error('expected strict lint to fail');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(1);
      expect(failure.stderr ?? '').toContain('duplicate-dataset-case-id');
      expect(failure.stderr ?? '').toContain('orphan-scenario-reference');
    }
  });

  it('fails when fail-on-warning-code matches a governance warning', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    const artifactPath = path.join(artifactDir, 'run-governance.json');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(artifactPath, JSON.stringify(governanceFixture, null, 2));

    try {
      await execFileAsync(
        'pnpm',
        ['cli:dev', 'lint', `--input=${artifactDir}`, '--fail-on-warning-code=orphan-scenario-reference'],
        {
          cwd: process.cwd(),
        },
      );
      throw new Error('expected lint fail-on-warning-code to fail');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(1);
      expect(failure.stderr ?? '').toContain('Fail-on-warning codes triggered');
      expect(failure.stderr ?? '').toContain('orphan-scenario-reference');
    }
  });

  it('supports repeated --fail-on-warning-code flags', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    const artifactPath = path.join(artifactDir, 'run-governance.json');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(artifactPath, JSON.stringify(governanceFixture, null, 2));

    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'lint',
          `--input=${artifactDir}`,
          '--fail-on-warning-code=missing-kind',
          '--fail-on-warning-code=orphan-scenario-reference',
        ],
        {
          cwd: process.cwd(),
        },
      );
      throw new Error('expected lint fail-on-warning-code to fail');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(1);
      expect(failure.stderr ?? '').toContain('Fail-on-warning codes triggered');
      expect(failure.stderr ?? '').toContain('orphan-scenario-reference');
    }
  });

  it('warns on low-category-coverage for dataset-governed suites', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    const artifactPath = path.join(artifactDir, 'run-governance-suite-manifest.json');
    await mkdir(artifactDir, { recursive: true });

    const fixture = {
      ...governanceFixture,
      suiteManifests: [
        {
          name: 'quality',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'response-quality',
          graders: ['deterministic-assertions'],
          gate: { mode: 'report-only', thresholds: { passRate: 0.9 } },
        },
        {
          name: 'safety',
          target: 'agent',
          datasetSource: 'synthetic',
          datasetVersion: '1.0.0',
          rubricVersion: '1.0.0',
          riskArea: 'prompt-safety',
          graders: ['deterministic-assertions'],
          gate: { mode: 'report-only', thresholds: { passRate: 0.9 } },
        },
      ],
      rows: governanceFixture.rows.map((row) => {
        if (row.suite === 'quality' && row.id === 'case-002') {
          return {
            ...row,
            category: 'tool-routing',
            datasetId: 'dataset-v1',
            metadata: {
              lifecycle: { status: 'active' },
              provenance: { source: 'synthetic' },
            },
          };
        }
        return {
          ...row,
          metadata: {
            lifecycle: { status: 'active' },
            provenance: { source: 'synthetic' },
          },
        };
      }),
    };

    await writeFile(artifactPath, JSON.stringify(fixture, null, 2));

    const { stdout } = await execFileAsync('pnpm', ['cli:dev', 'lint', `--input=${artifactDir}`], {
      cwd: process.cwd(),
    });

    expect(stdout).toContain('Eval taxonomy lint passed with warnings');
    expect(stdout).toContain('low-category-coverage');
  });

  it('does not inherit check-only failOnWarningCodes from config for lint', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    const artifactPath = path.join(artifactDir, 'run-governance.json');
    await mkdir(artifactDir, { recursive: true });
    await writeFile(artifactPath, JSON.stringify(governanceFixture, null, 2));

    await writeFile(
      path.join(dir, 'eval-dashboards.config.mjs'),
      `export default { gates: { failOnWarningCodes: ['orphan-scenario-reference'] } };\n`,
    );

    const { stdout } = await execFileAsync(
      tsxBin,
      [path.join(process.cwd(), 'src/cli/index.ts'), 'lint', `--input=${artifactDir}`],
      { cwd: dir },
    );

    expect(stdout).toContain('Eval taxonomy lint passed with warnings');
    expect(stdout).toContain('orphan-scenario-reference');
    expect(stdout).not.toContain('lint-fail-on-warning-code');
  });
});
