import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FAULT_MODES, SECRET_MARKER, startFaultServer } from './helpers/fault-server.js';

const execFileAsync = promisify(execFile);

type CliResult = { exitCode: number; output: string };

/** Runs the CLI and returns its exit code and combined output, whether it passes or fails. */
const runCli = async (args: string[], cwd: string): Promise<CliResult> => {
  const cliEntry = path.resolve(process.cwd(), 'src/cli/index.ts');
  try {
    const result = await execFileAsync('pnpm', ['exec', 'tsx', cliEntry, ...args], { cwd });
    return { exitCode: 0, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: failure.code ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
};

const failingReport = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'run-a', generatedAt: '2026-09-15T00:00:00.000Z' },
  suites: [{ id: 's', total: 1, passed: 0, failed: 1 }],
  rows: [{ id: 'r1', suite: 's', passed: false }],
};
const passingReport = {
  ...failingReport,
  suites: [{ id: 's', total: 1, passed: 1, failed: 0 }],
  rows: [{ id: 'r1', suite: 's', passed: true }],
};

const NO_PARSER_LEAK = /SyntaxError|at .*\.(?:ts|js):\d+|\n\s+at /;

let workDir: string;
let faultServer: Awaited<ReturnType<typeof startFaultServer>>;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'eval-faults-'));
  faultServer = await startFaultServer();
});

afterAll(async () => {
  await faultServer.close();
  await rm(workDir, { recursive: true, force: true });
});

const writeInput = async (name: string, contents: string): Promise<string> => {
  const dir = path.join(workDir, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'run.json'), contents, 'utf8');
  return dir;
};

describe('check when the notification webhook misbehaves', () => {
  it.each(FAULT_MODES)(
    'should still fail the gate with exit 1 and leak nothing when the webhook fault is %s',
    async (mode) => {
      const input = await writeInput(`webhook-${mode}`, JSON.stringify(failingReport));

      const result = await runCli(
        [
          'check',
          `--input=${input}`,
          '--min-pass-rate=1',
          '--notify=slack',
          `--notify-slack-webhook=${faultServer.baseUrl}/${mode}`,
          `--report-dir=${path.join(workDir, `out-${mode}`)}`,
        ],
        process.cwd(),
      );

      expect(result.exitCode).toBe(1);
      expect(result.output).toContain('Eval gates failed');
      expect(result.output).not.toContain(SECRET_MARKER);
      expect(result.output).not.toMatch(NO_PARSER_LEAK);
    },
    30_000,
  );

  it('should name the status code and not the body when the webhook answers 500', async () => {
    const input = await writeInput('webhook-500', JSON.stringify(failingReport));

    const result = await runCli(
      [
        'check',
        `--input=${input}`,
        '--min-pass-rate=1',
        '--notify=slack',
        `--notify-slack-webhook=${faultServer.baseUrl}/server-error-with-secret-body`,
        `--report-dir=${path.join(workDir, 'out-500')}`,
      ],
      process.cwd(),
    );

    expect(result.output).toContain('Notification slack failed (webhook responded 500).');
  });
});

describe('commands given a broken file', () => {
  it('should exit 2 and name the file and the fix when the artifact is an html page', async () => {
    const input = await writeInput('artifact-html', `<html>login ${SECRET_MARKER}</html>`);

    const result = await runCli(['check', `--input=${input}`], process.cwd());

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('is not valid JSON');
    expect(result.output).toContain('Fix the file, or regenerate or remove it.');
    expect(result.output).toContain('run.json');
    expect(result.output).not.toMatch(NO_PARSER_LEAK);
  });

  it('should exit 2 and name the file when the artifact is empty', async () => {
    const input = await writeInput('artifact-empty', '');

    const result = await runCli(['check', `--input=${input}`], process.cwd());

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('is not valid JSON');
  });

  it('should exit 3 with next steps when the input directory holds only a directory named like a report', async () => {
    const input = path.join(workDir, 'artifact-dir');
    await mkdir(path.join(input, 'run.json'), { recursive: true });

    const result = await runCli(['check', `--input=${input}`], process.cwd());

    expect(result.exitCode).toBe(3);
    expect(result.output).toContain('No eval report JSON files found');
  });

  it('should exit 3 with next steps when the input directory does not exist', async () => {
    const result = await runCli(['check', `--input=${path.join(workDir, 'missing')}`], process.cwd());

    expect(result.exitCode).toBe(3);
    expect(result.output).toContain('What to do next');
  });

  it('should exit 2 and name the history file when history.json is truncated', async () => {
    const historyPath = path.join(workDir, 'truncated-history.json');
    await writeFile(historyPath, '{"bad', 'utf8');

    const result = await runCli(['history-report', `--input=${historyPath}`, `--out=${path.join(workDir, 'h.html')}`], process.cwd());

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain(`History file ${historyPath} is not valid JSON`);
    expect(result.output).not.toMatch(NO_PARSER_LEAK);
  });

  it('should exit 2 and say how to create it when the history file is missing', async () => {
    const historyPath = path.join(workDir, 'no-such-history.json');

    const result = await runCli(['history-report', `--input=${historyPath}`, `--out=${path.join(workDir, 'h2.html')}`], process.cwd());

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain(`History file ${historyPath} was not found`);
    expect(result.output).toContain('eval-dashboards history --out=');
  });

  it('should exit 2 and name the field when the history file holds an object, not an array', async () => {
    const historyPath = path.join(workDir, 'object-history.json');
    await writeFile(historyPath, '{"a":1}', 'utf8');

    const result = await runCli(['history-report', `--input=${historyPath}`, `--out=${path.join(workDir, 'h3.html')}`], process.cwd());

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('must contain a JSON array');
  });

  it('should exit 2 and name the setting when the config file has a misspelled gate key', async () => {
    const input = await writeInput('config-typo', JSON.stringify(passingReport));
    const configDir = path.join(workDir, 'config-typo-cwd');
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, 'eval-dashboards.config.mjs'), 'export default { gates: { minPassRat: 1 } };\n', 'utf8');

    const result = await runCli(['check', `--input=${input}`], configDir);

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('gates.minPassRat: not a setting. Did you mean "minPassRate"?');
  });

  it('should exit 2 and suggest the flag when a flag is misspelled', async () => {
    const result = await runCli(['check', '--min-pass-rat=0.9'], process.cwd());

    expect(result.exitCode).toBe(2);
    expect(result.output).toContain('Did you mean --min-pass-rate?');
  });
});
