import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-check-json-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('check machine outputs', () => {
  it('writes machine-readable check output on pass', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, 'check-result.json');

    await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'check',
        '--input=examples/agent-quality-preset/artifacts',
        '--min-pass-rate=0.1',
        `--json-out=${outPath}`,
      ],
      { cwd: process.cwd() },
    );

    const parsed = JSON.parse(await readFile(outPath, 'utf8')) as {
      schemaVersion: string;
      gateRunStatus: string;
      passed: boolean;
      runId: string;
      failures: string[];
      newlyFailingRows: Array<{ id: string; suite: string; reportAnchor: string }>;
    };

    expect(parsed.schemaVersion).toBe('eval-check-result/v1');
    expect(parsed.gateRunStatus).toBe('ran');
    expect(parsed.passed).toBe(true);
    expect(parsed.runId).toBe('agent-quality-template-001');
    expect(Array.isArray(parsed.failures)).toBe(true);
    expect(Array.isArray(parsed.newlyFailingRows)).toBe(true);
  });

  it('writes machine-readable check output on failure', async () => {
    const dir = await createTempDir();
    const outPath = path.join(dir, 'check-result.json');

    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          '--input=examples/basic-json',
          '--min-pass-rate=0.9',
          `--json-out=${outPath}`,
        ],
        { cwd: process.cwd() },
      );
      throw new Error('expected gate failure');
    } catch (error) {
      const failure = error as { code?: number };
      expect(failure.code).toBe(1);
    }

    const parsed = JSON.parse(await readFile(outPath, 'utf8')) as {
      gateRunStatus: string;
      passed: boolean;
      failures: string[];
      newlyFailingRows: Array<{ reportAnchor: string }>;
    };

    expect(parsed.gateRunStatus).toBe('ran');
    expect(parsed.passed).toBe(false);
    expect(parsed.failures.length).toBeGreaterThan(0);
    expect(parsed.newlyFailingRows.every((row) => row.reportAnchor.startsWith('#row-'))).toBe(true);
  });

  it('writes JUnit, SARIF, and GitHub annotation outputs', async () => {
    const dir = await createTempDir();
    const junitPath = path.join(dir, 'check-result.junit.xml');
    const sarifPath = path.join(dir, 'check-result.sarif.json');
    const annotationsPath = path.join(dir, 'check-result.github-annotations.json');
    const customReportDir = 'eval-report-custom';

    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          '--input=examples/basic-json',
          `--report-dir=${customReportDir}`,
          '--min-pass-rate=0.9',
          `--junit-out=${junitPath}`,
          `--sarif-out=${sarifPath}`,
          `--github-annotations-out=${annotationsPath}`,
        ],
        { cwd: process.cwd() },
      );
      throw new Error('expected gate failure');
    } catch (error) {
      const failure = error as { code?: number };
      expect(failure.code).toBe(1);
    }

    const junitXml = await readFile(junitPath, 'utf8');
    expect(junitXml).toContain('<testsuite name="eval-dashboards-check"');
    expect(junitXml).toContain('<failure message=');
    expect(junitXml).toContain('classname="eval-dashboards.rows"');
    const testCases = (junitXml.match(/<testcase /g) ?? []).length;
    const testsAttrMatch = junitXml.match(/tests="(\d+)"/);
    expect(testsAttrMatch).not.toBeNull();
    expect(Number(testsAttrMatch?.[1] ?? -1)).toBe(testCases);

    const sarif = JSON.parse(await readFile(sarifPath, 'utf8')) as any;
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0]?.results.some((result: any) => result.ruleId === 'eval-gate-failure')).toBe(true);
    expect(
      sarif.runs[0]?.results.every(
        (result: any) =>
          Array.isArray(result.locations) &&
          result.locations.length > 0 &&
          typeof result.locations[0]?.physicalLocation?.artifactLocation?.uri === 'string',
      ),
    ).toBe(true);
    expect(
      sarif.runs[0]?.results.every(
        (result: any) => result.locations?.[0]?.physicalLocation?.artifactLocation?.uri === `${customReportDir}/index.html`,
      ),
    ).toBe(true);
    const rowResult = sarif.runs[0]?.results.find((result: any) => result.ruleId === 'eval-newly-failing-row');
    expect(rowResult).toBeDefined();
    expect(rowResult?.properties?.reportAnchor).toMatch(/^#row-[A-Za-z0-9_.!~*'()%:-]+$/);
    const reportDir = path.join(dir, 'report');
    await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'report',
        '--input=examples/basic-json',
        '--reporter=html',
        `--report-dir=${reportDir}`,
      ],
      { cwd: process.cwd() },
    );
    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');
    expect(html).toContain(`id="${rowResult.properties.reportAnchor.slice(1)}"`);
    expect(html).toContain('window.addEventListener(\'hashchange\', revealAnchorTarget)');
    expect(html).toContain('toggleRow(target)');

    const annotations = JSON.parse(await readFile(annotationsPath, 'utf8')) as Array<{
      level: string;
      title: string;
      message: string;
    }>;
    expect(Array.isArray(annotations)).toBe(true);
    expect(annotations.some((annotation) => annotation.level === 'error')).toBe(true);
    const rowAnnotation = annotations.find((annotation) => annotation.level === 'warning');
    expect(rowAnnotation).toBeDefined();
    if (rowResult?.properties?.reportAnchor && rowAnnotation) {
      expect(rowAnnotation.message).toContain(rowResult.properties.reportAnchor);
      expect(rowAnnotation.message).not.toContain('%253A');
    }
  });

  it('writes heartbeat status for skipped and errored check runs', async () => {
    const dir = await createTempDir();
    const skippedHeartbeatPath = path.join(dir, 'check-heartbeat-skipped.json');
    const erroredHeartbeatPath = path.join(dir, 'check-heartbeat-errored.json');

    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          '--input=examples/does-not-exist',
          `--heartbeat-out=${skippedHeartbeatPath}`,
        ],
        { cwd: process.cwd() },
      );
      throw new Error('expected skipped check failure');
    } catch (error) {
      const failure = error as { code?: number };
      expect(failure.code).toBe(3);
    }

    const skippedHeartbeat = JSON.parse(await readFile(skippedHeartbeatPath, 'utf8')) as {
      schemaVersion: string;
      gateRunStatus: string;
      exitCode: number;
      message?: string;
    };
    expect(skippedHeartbeat.schemaVersion).toBe('eval-check-heartbeat/v1');
    expect(skippedHeartbeat.gateRunStatus).toBe('skipped');
    expect(skippedHeartbeat.exitCode).toBe(3);
    expect(skippedHeartbeat.message).toContain('No eval artifacts directory found');

    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          '--input=examples/basic-json',
          '--statistical-mode=bogus',
          `--heartbeat-out=${erroredHeartbeatPath}`,
        ],
        { cwd: process.cwd() },
      );
      throw new Error('expected errored check failure');
    } catch (error) {
      const failure = error as { code?: number };
      expect(failure.code).toBe(2);
    }

    const erroredHeartbeat = JSON.parse(await readFile(erroredHeartbeatPath, 'utf8')) as {
      schemaVersion: string;
      gateRunStatus: string;
      exitCode: number;
      message?: string;
    };
    expect(erroredHeartbeat.schemaVersion).toBe('eval-check-heartbeat/v1');
    expect(erroredHeartbeat.gateRunStatus).toBe('errored');
    expect(erroredHeartbeat.exitCode).toBe(2);
    expect(erroredHeartbeat.message).toContain('Unknown statistical mode bogus');
  });

  it('does not change gate exit code when heartbeat write fails', async () => {
    const dir = await createTempDir();

    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          '--input=examples/basic-json',
          '--min-pass-rate=0.9',
          `--heartbeat-out=${dir}`,
        ],
        { cwd: process.cwd() },
      );
      throw new Error('expected gate failure');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain('Warning: could not write heartbeat output');
      expect(failure.stderr).toContain('Eval gates failed:');
    }
  });

  it('preserves run identity on errored heartbeat after context loads', async () => {
    const dir = await createTempDir();
    const jsonOutAsDirectory = path.join(dir, 'bad-json-out');
    const heartbeatPath = path.join(dir, 'check-heartbeat.json');

    await rm(jsonOutAsDirectory, { recursive: true, force: true });
    await mkdir(jsonOutAsDirectory, { recursive: true });

    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          '--input=examples/basic-json',
          `--json-out=${jsonOutAsDirectory}`,
          `--heartbeat-out=${heartbeatPath}`,
        ],
        { cwd: process.cwd() },
      );
      throw new Error('expected check output write failure');
    } catch (error) {
      const failure = error as { code?: number };
      expect(failure.code).toBe(2);
    }

    const heartbeat = JSON.parse(await readFile(heartbeatPath, 'utf8')) as {
      schemaVersion: string;
      gateRunStatus: string;
      exitCode: number;
      runId?: string;
      baselineRunId?: string;
      message?: string;
    };

    expect(heartbeat.schemaVersion).toBe('eval-check-heartbeat/v1');
    expect(heartbeat.gateRunStatus).toBe('errored');
    expect(heartbeat.exitCode).toBe(2);
    expect(heartbeat.runId).toBe('run-002');
    expect(heartbeat.baselineRunId).toBe('run-001');
    expect(heartbeat.message).toContain('EISDIR');
  });
});
