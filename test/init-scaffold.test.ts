import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildAgentQualityScaffoldFiles,
  planScaffoldWrites,
  writeScaffoldFiles,
} from '../src/cli/init-scaffold.js';

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
  it('builds scaffold files for agent-quality preset', () => {
    const files = buildAgentQualityScaffoldFiles();
    const paths = files.map((file) => file.relativePath);

    expect(paths).toContain('eval-dashboards.config.ts');
    expect(paths).toContain('eval/datasets/agent-quality-cases.jsonl');
    expect(paths).toContain('eval/rubrics/agent-quality-rubrics.json');
    expect(paths).toContain('.evals_output/run-agent-quality-template.json');
    expect(paths).toContain('.github/workflows/eval-quality.yml.snippet');
  });

  it('writes scaffold files into output directory', async () => {
    const outDir = await createTempDir();
    const files = buildAgentQualityScaffoldFiles();

    const written = await writeScaffoldFiles(outDir, files);
    const planned = planScaffoldWrites(outDir, files);

    expect(written).toEqual(planned);

    const config = await readFile(path.join(outDir, 'eval-dashboards.config.ts'), 'utf8');
    const dataset = await readFile(path.join(outDir, 'eval/datasets/agent-quality-cases.jsonl'), 'utf8');

    expect(config).toContain("input: ['.evals_output']");
    expect(dataset).toContain('"suite":"retrieval-recall"');
  });

  it('fails on conflicts unless force is enabled', async () => {
    const outDir = await createTempDir();
    const files = buildAgentQualityScaffoldFiles();

    await writeScaffoldFiles(outDir, files);
    await expect(writeScaffoldFiles(outDir, files)).rejects.toThrow('Refusing to overwrite existing files');

    await writeFile(path.join(outDir, 'eval-dashboards.config.ts'), 'custom-config', 'utf8');
    await writeScaffoldFiles(outDir, files, true);

    const config = await readFile(path.join(outDir, 'eval-dashboards.config.ts'), 'utf8');
    expect(config).toContain("reportDir: 'eval-dashboard'");
  });
});
