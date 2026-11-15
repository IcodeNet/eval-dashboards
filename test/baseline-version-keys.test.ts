import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeRun, assessBaselineCompatibility, compareRuns, evaluateReportPolicy, renderReports,
  validateEvalReport, type EvalReportV1, type SuiteManifest } from '../src/index.js';

const keys = ['modelDigest', 'promptHash', 'toolContract', 'instanceConfig'] as const;
const manifest = (): SuiteManifest => ({ name: 'answers', target: 'agent', datasetSource: 'synthetic', datasetVersion: '1',
  rubricVersion: '1', graderVersion: '1', riskArea: 'response-quality', graders: ['deterministic-assertions'],
  gate: { mode: 'blocking', thresholds: {} }, comparisonKeys: { modelDigest: 'model-a', promptHash: 'prompt-a',
    toolContract: 'tools-a', instanceConfig: 'config-a' } } as SuiteManifest);
const report = (id: string): EvalReportV1 => ({ schemaVersion: 'eval-report/v1',
  run: { id, project: 'synthetic-project', generatedAt: id === 'before' ? '2026-11-15T10:00:00Z' : '2026-11-15T11:00:00Z' },
  suites: [{ id: 'answers', total: 1, passed: 1, failed: 0 }],
  suiteManifests: [manifest()], rows: [{ id: 'same-question', suite: 'answers', passed: true }] });
const assess = (current: EvalReportV1, previous: EvalReportV1) =>
  assessBaselineCompatibility(current.suiteManifests, previous.suiteManifests, true)!;
const checks = (value: ReturnType<typeof assess>) => (value as unknown as {
  versionKeys: Array<{ key: string; status: string; reason?: string }>
}).versionKeys;

describe('optional baseline version keys', () => {
  it.each(keys)('blocks an unplanned %s change in a blocking suite', key => {
    const current = report('after'), previous = report('before');
    (current.suiteManifests![0] as SuiteManifest & { comparisonKeys: Record<string, string> }).comparisonKeys[key] = 'changed';
    expect(assess(current, previous).status).toBe('blocked');
    expect(evaluateReportPolicy({ current, previous }).gatePassed).toBe(false);
    expect(analyzeRun(current, previous).cohort.status).toBe('incompatible');
    expect(analyzeRun(current, previous).cohort.eligibleCases).toBe(0);
  });
  it('records matching values without inventing a changed version', () => {
    expect(checks(assess(report('after'), report('before'))).map(check => check.status)).toEqual(['match', 'match', 'match', 'match']);
  });
  it('keeps legacy gate behavior but explicitly records absent keys as unknown', () => {
    const current = report('after'), previous = report('before');
    delete (current.suiteManifests![0] as SuiteManifest & { comparisonKeys?: unknown }).comparisonKeys;
    delete (previous.suiteManifests![0] as SuiteManifest & { comparisonKeys?: unknown }).comparisonKeys;
    expect(assess(current, previous).status).toBe('compatible');
    expect(checks(assess(current, previous)).every(check => check.status === 'unknown')).toBe(true);
    expect(evaluateReportPolicy({ current, previous }).gatePassed).toBe(true);
    expect(analyzeRun(current, previous).cohort.eligibleCases).toBe(1);
  });
  it('keeps a missing value unknown rather than calling it a match', () => {
    const current = report('after'), previous = report('before');
    delete (previous.suiteManifests![0] as SuiteManifest & { comparisonKeys: Record<string, string> }).comparisonKeys.modelDigest;
    expect(assess(current, previous).status).toBe('warning');
    expect(checks(assess(current, previous))[0].status).toBe('unknown');
    expect(analyzeRun(current, previous).cohort.status).toBe('unknown');
  });
  it('keeps report-only differences visible without blocking', () => {
    const current = report('after'), previous = report('before');
    current.suiteManifests![0].gate.mode = 'report-only';
    (current.suiteManifests![0] as SuiteManifest & { comparisonKeys: Record<string, string> }).comparisonKeys.promptHash = 'changed';
    expect(assess(current, previous).status).toBe('warning');
    expect(evaluateReportPolicy({ current, previous }).gatePassed).toBe(true);
  });
  it('distinguishes an explicitly explained experiment change from uncontrolled drift', () => {
    const current = report('after'), previous = report('before');
    current.run.experimentId = 'compare-models'; previous.run.experimentId = 'compare-models';
    const changed = current.suiteManifests![0] as SuiteManifest & { comparisonKeys: Record<string, string>; comparisonTreatments?: Record<string, string> };
    changed.comparisonKeys.modelDigest = 'model-b';
    expect(assess(current, previous).status).toBe('blocked');
    changed.comparisonTreatments = { modelDigest: 'Compare the new model with the existing one.' };
    expect(assess(current, previous).status).toBe('compatible');
    expect(checks(assess(current, previous))[0]).toMatchObject({ status: 'treatment', reason: changed.comparisonTreatments.modelDigest });
    expect(analyzeRun(current, previous).cohort.eligibleCases).toBe(1);
    delete (previous.suiteManifests![0] as SuiteManifest & { comparisonKeys: Record<string, string> }).comparisonKeys.modelDigest;
    expect(checks(assess(current, previous))[0].status).toBe('unknown');
  });
  it.each([
    ['empty key', { comparisonKeys: { modelDigest: ' ' } }],
    ['non-string key', { comparisonKeys: { promptHash: 4 } }],
    ['misspelled key', { comparisonKeys: { modleDigest: 'model-a' } }],
    ['empty explanation', { comparisonTreatments: { modelDigest: '' } }],
    ['treatment without a value', { comparisonKeys: {}, comparisonTreatments: { modelDigest: 'Try another model.' } }],
  ])('rejects %s', (_name, change) => {
    const input = report('after'); Object.assign(input.suiteManifests![0], change);
    expect(validateEvalReport(input).ok).toBe(false);
  });
  it('does not let an explicit gate override make an unplanned comparison eligible', () => {
    const current = report('after'), previous = report('before');
    current.suiteManifests![0].comparisonKeys!.modelDigest = 'model-b';
    expect(evaluateReportPolicy({ current, previous, gateConfig: { failOnBaselineBlocked: false } }).gatePassed).toBe(true);
    expect(analyzeRun(current, previous).cohort.eligibleCases).toBe(0);
  });
  it('cannot waive dataset or rubric changes through an experiment explanation', () => {
    const current = report('after'), previous = report('before');
    current.suiteManifests![0].comparisonKeys!.modelDigest = 'model-b';
    current.suiteManifests![0].comparisonTreatments = { modelDigest: 'Compare models.' };
    current.suiteManifests![0].rubricVersion = '2';
    expect(assess(current, previous).status).toBe('blocked');
    expect(analyzeRun(current, previous).cohort.eligibleCases).toBe(0);
  });
  it('shows version evidence safely in HTML, Markdown and text', async () => {
    const current = report('after'), previous = report('before');
    const value = '<img src=x onerror=alert(1)>';
    (current.suiteManifests![0] as SuiteManifest & { comparisonKeys: Record<string, string> }).comparisonKeys.promptHash = value;
    const dir = await mkdtemp(path.join(tmpdir(), 'version-report-'));
    try {
      const compatibility = assess(current, previous);
      const outputs = await renderReports({ current, previous, history: [], comparison: compareRuns(current, previous),
        baselineCompatibility: compatibility, reportDir: dir }, ['html', 'text', 'markdown-summary']);
      const html = await readFile(path.join(dir, 'index.html'), 'utf8');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;'); expect(html).not.toContain(value);
      expect(outputs.join('\n')).toContain('Prompt version');
      expect(await readFile(path.join(dir, 'summary.md'), 'utf8')).toContain('Prompt version');
      expect(JSON.parse(await readFile(path.join(dir, 'summary.json'), 'utf8')).baselineCompatibility.versionKeys).toHaveLength(4);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('shows changed versions before truncating long report tables', async () => {
    const current = report('after');
    current.suiteManifests = Array.from({ length: 21 }, (_, index) => ({ ...manifest(), name: `group-${index}` }));
    current.suites = current.suiteManifests.map(item => ({ id: item.name, total: 1, passed: 1, failed: 0 }));
    current.rows = current.suiteManifests.map(item => ({ id: 'question', suite: item.name, passed: true }));
    const previous = structuredClone(current); previous.run.id = 'before';
    current.suiteManifests[20].comparisonKeys!.promptHash = 'important-changed-prompt';
    const dir = await mkdtemp(path.join(tmpdir(), 'version-limit-'));
    try {
      const outputs = await renderReports({ current, previous, history: [], comparison: compareRuns(current, previous),
        baselineCompatibility: assess(current, previous), reportDir: dir }, ['html', 'text', 'markdown-summary']);
      const html = await readFile(path.join(dir, 'index.html'), 'utf8');
      const table = html.match(/aria-label="Baseline version checks"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)![1];
      expect(table.match(/<tr>/g)).toHaveLength(20);
      expect(table).toContain('important-changed-prompt');
      expect(outputs.join('\n')).toContain('important-changed-prompt');
      const saved = JSON.parse(await readFile(path.join(dir, 'summary.json'), 'utf8'));
      expect(saved.baselineCompatibility.versionKeys).toHaveLength(84);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('fails the real CLI on a changed key with the saved comparison evidence', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'version-check-'));
    const current = report('after'), previous = report('before');
    (current.suiteManifests![0] as SuiteManifest & { comparisonKeys: Record<string, string> }).comparisonKeys.modelDigest = 'model-b';
    const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href;
    try {
      await writeFile(path.join(dir, 'before.json'), JSON.stringify(previous));
      await writeFile(path.join(dir, 'after.json'), JSON.stringify(current));
      const result = spawnSync(process.execPath, ['--import', loader, path.resolve('src/cli/index.ts'), 'check',
        `--input=${dir}`, `--json-out=${path.join(dir, 'result.json')}`], { encoding: 'utf8', timeout: 30_000 });
      expect(result.status, result.stderr).toBe(1);
      const saved = JSON.parse(await readFile(path.join(dir, 'result.json'), 'utf8'));
      expect(saved.passed).toBe(false); expect(saved.baselineCompatibility.versionKeys[0].status).toBe('changed');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
