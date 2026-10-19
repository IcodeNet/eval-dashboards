import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string): Promise<string> => readFile(path.resolve(process.cwd(), file), 'utf8');

describe('workflow cost controls', () => {
  it.each(['ci.yml', 'action-smoke-test.yml', 'pr-title-lint.yml'])(
    'should cancel an older pull request run when a newer one starts on the same pull request in %s',
    async (file) => {
      const workflow = await read(`.github/workflows/${file}`);

      expect(workflow).toContain('group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}');
      expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
    },
  );

  it('should never cancel a run on main when a newer push arrives so every merge is still tested', async () => {
    const workflow = await read('.github/workflows/ci.yml');

    expect(workflow).not.toContain('cancel-in-progress: true');
  });
});

describe('renovate config', () => {
  it('should batch non-major updates into one weekly pull request when dependencies are bumped', async () => {
    const config = JSON.parse(await read('renovate.json')) as {
      schedule: string[];
      prConcurrentLimit: number;
      packageRules: Array<{ matchUpdateTypes?: string[]; groupName?: string }>;
    };

    expect(config.schedule).toEqual(['before 6am on monday']);
    expect(config.prConcurrentLimit).toBe(3);
    expect(config.packageRules[0]).toMatchObject({
      matchUpdateTypes: ['minor', 'patch'],
      groupName: 'all non-major dependencies',
    });
  });
});

describe('adoption metrics workflow', () => {
  it('should turn off git hooks when the scheduled job commits so the commit-evidence hook cannot block it', async () => {
    const workflow = await read('.github/workflows/adoption-metrics.yml');

    expect(workflow).toMatch(/name: Commit snapshot updates\n\s+env:\n(?:\s+#.*\n)?\s+LEFTHOOK: "0"/);
  });
});
