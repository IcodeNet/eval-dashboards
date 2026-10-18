import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const lintExample = async (directory: string) => {
  try {
    await execFileAsync('pnpm', ['cli:dev', 'lint', `--input=${directory}`], { cwd: process.cwd() });
    return 0;
  } catch (error) {
    return (error as { code?: number }).code ?? 1;
  }
};

describe('shipped example fixtures', () => {
  it('should pass lint with no errors when the basic-json example is linted', async () => {
    expect(await lintExample('examples/basic-json')).toBe(0);
  }, 60_000);

  it('should pass lint with no errors when the taxonomy-complete fixture is linted', async () => {
    expect(await lintExample('examples/taxonomy-complete-fixture')).toBe(0);
  }, 60_000);
});
