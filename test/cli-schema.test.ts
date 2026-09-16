import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('schema CLI command', () => {
  it('prints the bundled eval-report/v1 JSON Schema to stdout', async () => {
    const { stdout } = await execFileAsync('pnpm', ['cli:dev', 'schema'], { cwd: process.cwd() });

    const parsed = JSON.parse(stdout) as { title?: string; $schema?: string };
    expect(parsed.title).toBe('EvalReportV1');
    expect(parsed.$schema).toBe('http://json-schema.org/draft-07/schema#');
  });

  it('prints usage with --help instead of the schema body', async () => {
    const { stdout } = await execFileAsync('pnpm', ['cli:dev', 'schema', '--help'], {
      cwd: process.cwd(),
    });

    expect(stdout).toContain('Usage: eval-dashboards schema');
    expect(() => JSON.parse(stdout)).toThrow();
  });
});
