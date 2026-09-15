import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compareRuns } from '../src/history/history.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';
import { renderReports } from '../src/reporters/render.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-reports-compare-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// 4F.13: client-side compare control for the static HTML report.
describe('4F.13 client-side compare control', () => {
  const current: EvalReportV1 = {
    schemaVersion: 'eval-report/v1',
    run: {
      id: 'run-current',
      generatedAt: '2026-09-15T12:00:00.000Z',
    },
    suites: [
      { id: 'quality', name: 'Quality', total: 4, passed: 3, failed: 1 },
      { id: 'safety', name: 'Safety', total: 2, passed: 2, failed: 0 },
    ],
    rows: [
      { id: 'row-1', suite: 'quality', passed: true },
      { id: 'row-2', suite: 'quality', passed: false },
      { id: 'row-3', suite: 'quality', passed: true },
      { id: 'row-4', suite: 'quality', passed: true },
      { id: 'row-5', suite: 'safety', passed: true },
      { id: 'row-6', suite: 'safety', passed: true },
    ],
  };

  it('renders the file-picker control, its script id, and FileReader logic', async () => {
    const reportDir = await createTempDir();

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['html'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');

    // File picker control is present and wired to the client-side handler.
    expect(html).toContain('id="compare-file-input"');
    expect(html).toContain('type="file"');
    expect(html).toContain('onchange="handleCompareFile(this.files && this.files[0])"');

    // Inline script (no external deps) implements the offline FileReader flow.
    expect(html).toContain('new FileReader()');
    expect(html).toContain('reader.readAsText(file)');
    expect(html).toContain('function handleCompareFile(file)');
    expect(html).toContain('function renderCompareResult(current, other)');

    // Current report's suite/pass-rate data is baked in for the client script
    // to diff against — no server call, no CLI regeneration required.
    expect(html).toContain('id="eval-report-current-summary"');
    expect(html).toContain('"runId":"run-current"');

    // No external script/module imports — must work from file:// with no server.
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/type="module"/);
  });

  it('still renders existing report content unchanged with the compare feature present', async () => {
    const reportDir = await createTempDir();

    await renderReports(
      {
        current,
        previous: undefined,
        history: [],
        comparison: compareRuns(current, undefined),
        reportDir,
      },
      ['html'],
    );

    const html = await readFile(path.join(reportDir, 'index.html'), 'utf8');

    expect(html).toContain('run-current');
    expect(html).toContain('Quality');
    expect(html).toContain('Safety');
    expect(html).toContain('Suite summary');
    expect(html).toContain('Failing rows');
    expect(html).toContain('All rows');
    expect(html).toContain('How to read this report');
  });
});
