import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const tsxBin = path.join(process.cwd(), 'node_modules/.bin/tsx');
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

  it('sends Slack webhook notification on gate failure when notify flags are set', async () => {
    const webhookPayloads: string[] = [];
    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        webhookPayloads.push(body);
        response.statusCode = 200;
        response.end('ok');
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const webhookUrl = `http://127.0.0.1:${port}/slack`;

    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          '--input=examples/basic-json',
          '--min-pass-rate=0.9',
          '--notify=slack',
          `--notify-webhook=${webhookUrl}`,
          '--notify-report-link=https://ci.example.test/eval-report/index.html',
        ],
        { cwd: process.cwd() },
      );
      throw new Error('expected gate failure');
    } catch (error) {
      const failure = error as { code?: number };
      expect(failure.code).toBe(1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((closeError) => {
          if (closeError) {
            reject(closeError);
            return;
          }
          resolve();
        });
      });
    }

    expect(webhookPayloads.length).toBe(1);
    const payload = JSON.parse(webhookPayloads[0] ?? '{}') as { text?: string };
    expect(payload.text).toContain('run-002');
    expect(payload.text).toContain('answer-quality');
    expect(payload.text).toContain('https://ci.example.test/eval-report/index.html');
  });

  it('captures skipped notification delivery in json-out diagnostics', async () => {
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
          '--notify=slack',
          `--json-out=${outPath}`,
        ],
        { cwd: process.cwd() },
      );
      throw new Error('expected gate failure');
    } catch (error) {
      const failure = error as { code?: number };
      expect(failure.code).toBe(1);
    }

    const payload = JSON.parse(await readFile(outPath, 'utf8')) as {
      notifications?: Array<{ channel: string; status: string; reason?: string }>;
      diagnostics: string[];
    };

    expect(payload.notifications).toEqual([
      {
        channel: 'slack',
        status: 'skipped',
        reason: 'missing Slack webhook URL',
      },
    ]);
    expect(payload.diagnostics.some((item) => item.includes('Notification slack skipped'))).toBe(true);
  });

  it('fails fast when --notify is provided without a value', async () => {
    try {
      await execFileAsync(
        'pnpm',
        ['cli:dev', 'check', '--input=examples/basic-json', '--notify'],
        { cwd: process.cwd() },
      );
      throw new Error('expected invalid notify option');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(2);
      expect(failure.stderr).toContain('--notify requires a value');
    }
  });

  it('rejects shared --notify-webhook when both slack and teams channels are selected', async () => {
    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          '--input=examples/basic-json',
          '--notify=slack',
          '--notify=teams',
          '--notify-webhook=https://hooks.slack.com/services/test/test/test',
        ],
        { cwd: process.cwd() },
      );
      throw new Error('expected invalid shared webhook configuration');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(2);
      expect(failure.stderr).toContain('--notify-webhook cannot be shared when both slack and teams channels are enabled');
    }
  });

  it('sends notification when baseline becomes newly blocked even if gate is allowed to pass', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });

    const [baseRaw, currentRaw] = await Promise.all([
      readFile(path.join(process.cwd(), 'examples/basic-json/run-001.json'), 'utf8'),
      readFile(path.join(process.cwd(), 'examples/basic-json/run-002.json'), 'utf8'),
    ]);

    const baselineRun = JSON.parse(baseRaw) as any;
    const previousRun = JSON.parse(baseRaw) as any;
    const currentRun = JSON.parse(currentRaw) as any;

    const normalizePassing = (report: any, id: string, generatedAt: string) => {
      report.run.id = id;
      report.run.generatedAt = generatedAt;
      report.rows = report.rows.map((row: any) => ({ ...row, passed: true }));
      report.suites = report.suites.map((suite: any) => ({
        ...suite,
        passed: suite.total,
        failed: 0,
        passRate: 1,
      }));
      report.suiteManifests = (report.suiteManifests ?? []).map((manifest: any) => ({
        ...manifest,
        gate: { ...manifest.gate, mode: 'blocking' },
      }));
      return report;
    };

    normalizePassing(baselineRun, 'run-000', '2026-01-01T00:00:00.000Z');
    normalizePassing(previousRun, 'run-001', '2026-01-02T00:00:00.000Z');
    normalizePassing(currentRun, 'run-002', '2026-01-03T00:00:00.000Z');
    currentRun.suiteManifests = (currentRun.suiteManifests ?? []).map((manifest: any) => ({
      ...manifest,
      datasetVersion: '2.0.0',
    }));

    await Promise.all([
      writeFile(path.join(artifactDir, 'run-000.json'), JSON.stringify(baselineRun, null, 2)),
      writeFile(path.join(artifactDir, 'run-001.json'), JSON.stringify(previousRun, null, 2)),
      writeFile(path.join(artifactDir, 'run-002.json'), JSON.stringify(currentRun, null, 2)),
    ]);

    const webhookPayloads: string[] = [];
    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        webhookPayloads.push(body);
        response.statusCode = 200;
        response.end('ok');
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const webhookUrl = `http://127.0.0.1:${port}/slack`;

    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          `--input=${artifactDir}`,
          '--allow-blocked-baseline',
          '--notify=slack',
          `--notify-webhook=${webhookUrl}`,
        ],
        { cwd: process.cwd() },
      );
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((closeError) => {
          if (closeError) {
            reject(closeError);
            return;
          }
          resolve();
        });
      });
    }

    expect(webhookPayloads.length).toBe(1);
    const payload = JSON.parse(webhookPayloads[0] ?? '{}') as { text?: string };
    expect(payload.text).toContain('run-002');
    expect(payload.text).toContain('Baseline compatibility: blocked');
  });

  it('fails blocking judge-scored suite when no recent matching calibration evidence exists', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });

    const templateRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-template.json'),
      'utf8',
    );

    const staleReport = JSON.parse(templateRaw) as any;
    const currentReport = JSON.parse(templateRaw) as any;

    const normalize = (report: any, id: string, generatedAt: string) => {
      report.run.id = id;
      report.run.generatedAt = generatedAt;
      report.rows = report.rows.map((row: any) => ({
        ...row,
        passed: true,
        judgeModel: row.suite === 'answer-quality' ? 'judge-model-v1' : row.judgeModel,
      }));
      report.suites = report.suites.map((suite: any) => ({
        ...suite,
        passed: suite.total,
        failed: 0,
        passRate: 1,
      }));
      report.suiteManifests = (report.suiteManifests ?? []).map((manifest: any) => ({
        ...manifest,
        gate: manifest.name === 'answer-quality' ? { ...manifest.gate, mode: 'blocking' } : manifest.gate,
      }));
      return report;
    };

    normalize(staleReport, 'run-stale', '2026-01-01T00:00:00.000Z');
    normalize(currentReport, 'run-current', '2026-01-10T00:00:00.000Z');
    currentReport.rows = currentReport.rows.filter((row: any) => row.suite !== 'judge-calibration');

    await Promise.all([
      writeFile(path.join(artifactDir, 'run-stale.json'), JSON.stringify(staleReport, null, 2)),
      writeFile(path.join(artifactDir, 'run-current.json'), JSON.stringify(currentReport, null, 2)),
    ]);

    try {
      await execFileAsync(
        'pnpm',
        ['cli:dev', 'check', `--input=${artifactDir}`, '--calibration-max-age-hours=24'],
        { cwd: process.cwd() },
      );
      throw new Error('expected calibration preflight failure');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain('Calibration preflight');
      expect(failure.stderr).toContain('answer-quality');
      expect(failure.stderr).toContain('judge-model-v1');
    }
  });

  it('fails blocking suites missing judgeModel and warns for report-only suites', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    const outPath = path.join(dir, 'check-result.json');
    await mkdir(artifactDir, { recursive: true });

    const templateRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-template.json'),
      'utf8',
    );
    const report = JSON.parse(templateRaw) as any;
    report.run.id = 'run-current';
    report.run.generatedAt = '2026-01-10T00:00:00.000Z';
    report.rows = report.rows
      .map((row: any) => ({
        ...row,
        judgeModel:
          row.suite === 'answer-quality' || row.suite === 'goal-success'
            ? undefined
            : row.judgeModel,
      }))
      .filter((row: any) => row.suite !== 'judge-calibration');
    report.suiteManifests = (report.suiteManifests ?? []).map((manifest: any) => {
      if (manifest.name === 'answer-quality') {
        return { ...manifest, gate: { ...manifest.gate, mode: 'blocking' } };
      }
      if (manifest.name === 'goal-success') {
        return { ...manifest, gate: { ...manifest.gate, mode: 'report-only' } };
      }
      return manifest;
    });

    await writeFile(path.join(artifactDir, 'run-current.json'), JSON.stringify(report, null, 2));

    try {
      await execFileAsync(
        'pnpm',
        ['cli:dev', 'check', `--input=${artifactDir}`, '--calibration-max-age-hours=24', `--json-out=${outPath}`],
        { cwd: process.cwd() },
      );
      throw new Error('expected missing judgeModel blocking failure');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain('suite "answer-quality" has no judgeModel values');
    }

    const payload = JSON.parse(await readFile(outPath, 'utf8')) as {
      diagnostics: string[];
    };
    expect(payload.diagnostics.some((entry) => entry.includes('suite "goal-success" has no judgeModel values'))).toBe(true);
  });

  it('skips calibration preflight when --no-calibration-preflight is set', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });

    const templateRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-template.json'),
      'utf8',
    );

    const staleReport = JSON.parse(templateRaw) as any;
    const currentReport = JSON.parse(templateRaw) as any;

    const normalize = (report: any, id: string, generatedAt: string) => {
      report.run.id = id;
      report.run.generatedAt = generatedAt;
      report.rows = report.rows
        .map((row: any) => ({
          ...row,
          passed: true,
          judgeModel: row.suite === 'answer-quality' ? 'judge-model-v1' : row.judgeModel,
        }))
        .filter((row: any) => row.suite !== 'judge-calibration');
      report.suites = report.suites.map((suite: any) => ({
        ...suite,
        passed: suite.total,
        failed: 0,
        passRate: 1,
      }));
      report.suiteManifests = (report.suiteManifests ?? []).map((manifest: any) => ({
        ...manifest,
        gate: manifest.name === 'answer-quality' ? { ...manifest.gate, mode: 'blocking' } : manifest.gate,
      }));
    };

    normalize(staleReport, 'run-stale', '2026-01-01T00:00:00.000Z');
    normalize(currentReport, 'run-current', '2026-01-10T00:00:00.000Z');

    await Promise.all([
      writeFile(path.join(artifactDir, 'run-stale.json'), JSON.stringify(staleReport, null, 2)),
      writeFile(path.join(artifactDir, 'run-current.json'), JSON.stringify(currentReport, null, 2)),
    ]);

    try {
      await execFileAsync(
        'pnpm',
        ['cli:dev', 'check', `--input=${artifactDir}`, '--calibration-max-age-hours=24'],
        { cwd: process.cwd() },
      );
      throw new Error('expected calibration preflight failure without opt-out flag');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain('Calibration preflight');
    }

    await execFileAsync(
      'pnpm',
      ['cli:dev', 'check', `--input=${artifactDir}`, '--calibration-max-age-hours=24', '--no-calibration-preflight'],
      { cwd: process.cwd() },
    );
  });

  it('downgrades missing calibration evidence to diagnostics when allow-stale-calibration is set', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    const outPath = path.join(dir, 'check-result.json');
    await mkdir(artifactDir, { recursive: true });

    const templateRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-template.json'),
      'utf8',
    );
    const currentReport = JSON.parse(templateRaw) as any;

    currentReport.run.id = 'run-current';
    currentReport.run.generatedAt = '2026-01-10T00:00:00.000Z';
    currentReport.rows = currentReport.rows
      .map((row: any) => ({
        ...row,
        passed: true,
        judgeModel: row.suite === 'answer-quality' ? 'judge-model-v1' : row.judgeModel,
      }))
      .filter((row: any) => row.suite !== 'judge-calibration');
    currentReport.suites = currentReport.suites.map((suite: any) => ({
      ...suite,
      passed: suite.total,
      failed: 0,
      passRate: 1,
    }));
    currentReport.suiteManifests = (currentReport.suiteManifests ?? []).map((manifest: any) => ({
      ...manifest,
      gate: manifest.name === 'answer-quality' ? { ...manifest.gate, mode: 'blocking' } : manifest.gate,
    }));

    await writeFile(path.join(artifactDir, 'run-current.json'), JSON.stringify(currentReport, null, 2));

    await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'check',
        `--input=${artifactDir}`,
        '--allow-stale-calibration',
        '--calibration-max-age-hours=24',
        `--json-out=${outPath}`,
      ],
      { cwd: process.cwd() },
    );

    const payload = JSON.parse(await readFile(outPath, 'utf8')) as {
      passed: boolean;
      diagnostics: string[];
      failures: string[];
    };
    expect(payload.passed).toBe(true);
    expect(payload.failures).toHaveLength(0);
    expect(payload.diagnostics.some((entry) => entry.includes('Calibration preflight'))).toBe(true);
    expect(payload.diagnostics.some((entry) => entry.includes('warning-only'))).toBe(true);
  });

  it('requires independent calibration evidence for blocking suites', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });

    const templateRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-template.json'),
      'utf8',
    );
    const currentReport = JSON.parse(templateRaw) as any;

    currentReport.run.id = 'run-current';
    currentReport.run.generatedAt = '2026-01-10T00:00:00.000Z';
    currentReport.rows = currentReport.rows.map((row: any) => ({
      ...row,
      passed: true,
      judgeModel: typeof row.judgeModel === 'string' ? 'judge-model-v1' : row.judgeModel,
    }));
    currentReport.suites = currentReport.suites.map((suite: any) => ({
      ...suite,
      passed: suite.total,
      failed: 0,
      passRate: 1,
    }));
    currentReport.suiteManifests = (currentReport.suiteManifests ?? []).map((manifest: any) => ({
      ...manifest,
      gate: manifest.name === 'answer-quality' ? { ...manifest.gate, mode: 'blocking' } : manifest.gate,
    }));

    await writeFile(path.join(artifactDir, 'run-current.json'), JSON.stringify(currentReport, null, 2));

    try {
      await execFileAsync(
        'pnpm',
        ['cli:dev', 'check', `--input=${artifactDir}`, '--calibration-max-age-hours=24'],
        { cwd: process.cwd() },
      );
      throw new Error('expected independent-evidence failure for blocking suite');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain('Calibration preflight');
    }
  });

  it('accepts a separate calibration-only evidence artifact', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });

    const templateRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-template.json'),
      'utf8',
    );
    const calibrationReport = JSON.parse(templateRaw) as any;
    const currentReport = JSON.parse(templateRaw) as any;

    calibrationReport.run.id = 'run-calibration';
    calibrationReport.run.generatedAt = '2026-01-09T00:00:00.000Z';
    calibrationReport.rows = calibrationReport.rows.filter((row: any) => row.suite === 'judge-calibration');
    calibrationReport.suites = calibrationReport.suites.filter((suite: any) => suite.id === 'judge-calibration');
    calibrationReport.suiteManifests = (calibrationReport.suiteManifests ?? []).filter(
      (manifest: any) => manifest.name === 'judge-calibration',
    );
    calibrationReport.rubricContracts = (calibrationReport.rubricContracts ?? []).filter(
      (contract: any) => contract.suiteName === 'judge-calibration',
    );

    currentReport.run.id = 'run-current';
    currentReport.run.generatedAt = '2026-01-10T00:00:00.000Z';
    currentReport.rows = currentReport.rows
      .map((row: any) => ({
        ...row,
        passed: true,
        judgeModel: row.suite === 'answer-quality' ? 'example-judge' : row.judgeModel,
      }))
      .filter((row: any) => row.suite !== 'judge-calibration');
    currentReport.suites = currentReport.suites
      .map((suite: any) => ({
        ...suite,
        passed: suite.total,
        failed: 0,
        passRate: 1,
      }))
      .filter((suite: any) => suite.id !== 'judge-calibration');
    currentReport.suiteManifests = (currentReport.suiteManifests ?? [])
      .map((manifest: any) => ({
        ...manifest,
        gate: manifest.name === 'answer-quality' ? { ...manifest.gate, mode: 'blocking' } : manifest.gate,
      }))
      .filter((manifest: any) => manifest.name !== 'judge-calibration');

    await Promise.all([
      writeFile(path.join(artifactDir, 'run-calibration.json'), JSON.stringify(calibrationReport, null, 2)),
      writeFile(path.join(artifactDir, 'run-current.json'), JSON.stringify(currentReport, null, 2)),
    ]);

    await execFileAsync(
      'pnpm',
      ['cli:dev', 'check', `--input=${artifactDir}`, '--calibration-max-age-hours=24'],
      { cwd: process.cwd() },
    );
  });

  it('treats missing calibration evidence rubric version as non-match', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });

    const templateRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-template.json'),
      'utf8',
    );
    const evidenceReport = JSON.parse(templateRaw) as any;
    const currentReport = JSON.parse(templateRaw) as any;

    evidenceReport.run.id = 'run-evidence';
    evidenceReport.run.generatedAt = '2026-01-09T00:00:00.000Z';
    evidenceReport.rows = evidenceReport.rows.map((row: any) => ({
      ...row,
      passed: true,
      judgeModel: row.suite === 'answer-quality' ? 'judge-model-v1' : row.judgeModel,
    }));
    evidenceReport.suiteManifests = (evidenceReport.suiteManifests ?? []).map((manifest: any) =>
      manifest.name === 'judge-calibration' ? { ...manifest, rubricVersion: undefined } : manifest,
    );
    evidenceReport.rubricContracts = (evidenceReport.rubricContracts ?? []).filter(
      (contract: any) => contract.suiteName !== 'judge-calibration',
    );

    currentReport.run.id = 'run-current';
    currentReport.run.generatedAt = '2026-01-10T00:00:00.000Z';
    currentReport.rows = currentReport.rows
      .map((row: any) => ({
        ...row,
        passed: true,
        judgeModel: row.suite === 'answer-quality' ? 'judge-model-v1' : row.judgeModel,
      }))
      .filter((row: any) => row.suite !== 'judge-calibration');

    await Promise.all([
      writeFile(path.join(artifactDir, 'run-evidence.json'), JSON.stringify(evidenceReport, null, 2)),
      writeFile(path.join(artifactDir, 'run-current.json'), JSON.stringify(currentReport, null, 2)),
    ]);

    try {
      await execFileAsync(
        'pnpm',
        ['cli:dev', 'check', `--input=${artifactDir}`, '--calibration-max-age-hours=24'],
        { cwd: process.cwd() },
      );
      throw new Error('expected calibration preflight failure');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain('suite "answer-quality" requires recent "judge-calibration" evidence');
    }
  });

  it('ignores stale target-suite rubric metadata in evidence runs when calibration rubric matches', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });

    const templateRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-template.json'),
      'utf8',
    );
    const evidenceReport = JSON.parse(templateRaw) as any;
    const currentReport = JSON.parse(templateRaw) as any;

    evidenceReport.run.id = 'run-evidence';
    evidenceReport.run.generatedAt = '2026-01-09T00:00:00.000Z';
    evidenceReport.rows = evidenceReport.rows.map((row: any) => ({
      ...row,
      passed: true,
      judgeModel: row.suite === 'answer-quality' ? 'judge-model-v1' : row.judgeModel,
    }));
    evidenceReport.suiteManifests = (evidenceReport.suiteManifests ?? []).map((manifest: any) =>
      manifest.name === 'answer-quality' ? { ...manifest, rubricVersion: 'agent-quality-v0' } : manifest,
    );

    currentReport.run.id = 'run-current';
    currentReport.run.generatedAt = '2026-01-10T00:00:00.000Z';
    currentReport.rows = currentReport.rows
      .map((row: any) => ({
        ...row,
        passed: true,
        judgeModel: row.suite === 'answer-quality' ? 'judge-model-v1' : row.judgeModel,
      }))
      .filter((row: any) => row.suite !== 'judge-calibration');

    await Promise.all([
      writeFile(path.join(artifactDir, 'run-evidence.json'), JSON.stringify(evidenceReport, null, 2)),
      writeFile(path.join(artifactDir, 'run-current.json'), JSON.stringify(currentReport, null, 2)),
    ]);

    await execFileAsync(
      'pnpm',
      ['cli:dev', 'check', `--input=${artifactDir}`, '--calibration-max-age-hours=24'],
      { cwd: process.cwd() },
    );
  });

  it('applies config-file minPassRate when no matching CLI gate flag is passed', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });

    const templateRaw = await readFile(
      path.join(process.cwd(), 'examples/taxonomy-complete-fixture/run-complete.json'),
      'utf8',
    );
    await writeFile(path.join(artifactDir, 'report.json'), templateRaw);
    await writeFile(
      path.join(dir, 'eval-dashboards.config.mjs'),
      'export default { gates: { minPassRate: 0.9 } };\n',
    );

    await expect(
      execFileAsync(tsxBin, [path.join(process.cwd(), 'src/cli/index.ts'), 'check', '--input=artifacts'], {
        cwd: dir,
      }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('is below required 0.900'),
    });
  });

  it('respects config disable unless explicitly re-enabled on CLI', async () => {
    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });

    const templateRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-template.json'),
      'utf8',
    );
    const staleReport = JSON.parse(templateRaw) as any;
    const currentReport = JSON.parse(templateRaw) as any;

    const normalize = (report: any, id: string, generatedAt: string) => {
      report.run.id = id;
      report.run.generatedAt = generatedAt;
      report.rows = report.rows
        .map((row: any) => ({
          ...row,
          passed: true,
          judgeModel: row.suite === 'answer-quality' ? 'judge-model-v1' : row.judgeModel,
        }))
        .filter((row: any) => row.suite !== 'judge-calibration');
      report.suites = report.suites.map((suite: any) => ({
        ...suite,
        passed: suite.total,
        failed: 0,
        passRate: 1,
      }));
      report.suiteManifests = (report.suiteManifests ?? []).map((manifest: any) => ({
        ...manifest,
        gate: manifest.name === 'answer-quality' ? { ...manifest.gate, mode: 'blocking' } : manifest.gate,
      }));
    };

    normalize(staleReport, 'run-stale', '2026-01-01T00:00:00.000Z');
    normalize(currentReport, 'run-current', '2026-01-10T00:00:00.000Z');

    await Promise.all([
      writeFile(path.join(artifactDir, 'run-stale.json'), JSON.stringify(staleReport, null, 2)),
      writeFile(path.join(artifactDir, 'run-current.json'), JSON.stringify(currentReport, null, 2)),
      writeFile(
        path.join(dir, 'eval-dashboards.config.mjs'),
        "export default { gates: { calibration: { enabled: false } } };\n",
      ),
    ]);

    await execFileAsync(
      tsxBin,
      [path.join(process.cwd(), 'src/cli/index.ts'), 'check', '--input=artifacts', '--calibration-max-age-hours=24'],
      { cwd: dir },
    );

    try {
      await execFileAsync(
        tsxBin,
        [
          path.join(process.cwd(), 'src/cli/index.ts'),
          'check',
          '--input=artifacts',
          '--calibration-max-age-hours=24',
          '--calibration-preflight',
        ],
        { cwd: dir },
      );
      throw new Error('expected calibration preflight failure');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain('suite "answer-quality" requires recent "judge-calibration" evidence');
    }
  });

  it('validates calibration max-age and conflicting enable/disable flags', async () => {
    try {
      await execFileAsync(
        'pnpm',
        ['cli:dev', 'check', '--input=examples/basic-json', '--calibration-max-age-hours=abc'],
        { cwd: process.cwd() },
      );
      throw new Error('expected invalid max age error');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(2);
      expect(failure.stderr).toContain('--calibration-max-age-hours must be a finite number greater than 0');
    }

    try {
      await execFileAsync(
        'pnpm',
        [
          'cli:dev',
          'check',
          '--input=examples/basic-json',
          '--calibration-preflight',
          '--no-calibration-preflight',
        ],
        { cwd: process.cwd() },
      );
      throw new Error('expected conflicting calibration flag error');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(2);
      expect(failure.stderr).toContain('Cannot combine --calibration-preflight and --no-calibration-preflight');
    }

    const dir = await createTempDir();
    const artifactDir = path.join(dir, 'artifacts');
    await mkdir(artifactDir, { recursive: true });

    const templateRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-template.json'),
      'utf8',
    );
    const report = JSON.parse(templateRaw) as any;
    report.run.id = 'run-current';
    report.run.generatedAt = '2026-01-10T00:00:00.000Z';

    await Promise.all([
      writeFile(path.join(artifactDir, 'run-current.json'), JSON.stringify(report, null, 2)),
      writeFile(
        path.join(dir, 'eval-dashboards.config.mjs'),
        "export default { gates: { calibration: { enabled: true, maxAgeHours: 0 } } };\n",
      ),
    ]);

    try {
      await execFileAsync(tsxBin, [path.join(process.cwd(), 'src/cli/index.ts'), 'check', '--input=artifacts'], {
        cwd: dir,
      });
      throw new Error('expected invalid config calibration maxAgeHours error');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(2);
      expect(failure.stderr).toContain('Invalid calibration gate config: maxAgeHours must be a finite number greater than 0');
    }

    const forceDir = await createTempDir();
    const forceArtifactDir = path.join(forceDir, 'artifacts');
    await mkdir(forceArtifactDir, { recursive: true });

    const forceTemplateRaw = await readFile(
      path.join(process.cwd(), 'examples/agent-quality-preset/artifacts/run-agent-quality-template.json'),
      'utf8',
    );
    const forceReport = JSON.parse(forceTemplateRaw) as any;
    forceReport.run.id = 'run-force-enabled';
    forceReport.run.generatedAt = '2026-01-10T00:00:00.000Z';
    forceReport.rows = forceReport.rows.map((row: any) => ({
      ...row,
      judgeModel: row.suite === 'answer-quality' ? 'judge-model-v1' : row.judgeModel,
    }));
    forceReport.suiteManifests = (forceReport.suiteManifests ?? []).filter(
      (manifest: any) => manifest.name !== 'judge-calibration',
    );
    forceReport.rubricContracts = (forceReport.rubricContracts ?? []).filter(
      (contract: any) => contract.suiteName !== 'judge-calibration',
    );

    await writeFile(
      path.join(forceArtifactDir, 'run-force-enabled.json'),
      JSON.stringify(forceReport, null, 2),
    );

    try {
      await execFileAsync(
        'pnpm',
        ['cli:dev', 'check', `--input=${forceArtifactDir}`, '--calibration-preflight'],
        { cwd: process.cwd() },
      );
      throw new Error('expected force-enabled rubric metadata failure');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(1);
      expect(failure.stderr).toContain('requires recent "judge-calibration" evidence');
    }
  });
});
