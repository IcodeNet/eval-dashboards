import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeRun } from '../src/analytics/run-analytics.js';
import { analyzeComparisonCohort, buildMatchedCohort } from '../src/analytics/cohort.js';
import { summarizeTelemetry } from '../src/analytics/telemetry.js';
import { compareRuns } from '../src/history/history.js';
import { validateEvalReport } from '../src/model/validate.js';
import { SCORE_DIRECTIONS, type EvalReportV1, type EvalRow, type SuiteManifest } from '../src/model/eval-report-v1.js';
import { renderReports } from '../src/reporters/render.js';

const manifest = (): SuiteManifest => ({ name: 'quality', target: 'agent', datasetSource: 'synthetic', datasetVersion: 'dataset-1',
  rubricVersion: 'rubric-1', graderVersion: 'grader-1', graders: ['deterministic-assertions'], riskArea: 'response-quality',
  scoreScale: { min: 0, max: 1 }, scoreDirection: 'higher-is-better', gate: { mode: 'report-only', thresholds: {} } });
const report = (rows: EvalRow[], id = 'current'): EvalReportV1 => ({ schemaVersion: 'eval-report/v1',
  run: { id, project: 'example-project', generatedAt: '2026-10-31T00:00:00Z' }, rows,
  suites: [{ id: 'quality', total: rows.length, passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length }], suiteManifests: [manifest()] });
const row = (id: string, passed = true, score = 1): EvalRow => ({ id, suite: 'quality', kind: 'deterministic', passed, score });
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });

describe('matched comparison cohorts', () => {
  it('separates introduced failures from matched regressions and removed cases', () => {
    const result = analyzeComparisonCohort(report([row('old', false), row('new', false)]), report([row('old'), row('removed')], 'before'));
    expect(result).toMatchObject({ status: 'compatible', matchedCases: 1, eligibleCases: 1, matchedRegressions: 1, introducedCases: 1, introducedFailures: 1, removedCases: 1,
      currentMatchCoverage: 0.5, previousMatchCoverage: 0.5 });
  });
  it('respects intentional negative outcomes when counting failures and transitions', () => {
    const before = { ...row('negative', false), expectedOutcome: 'fail' as const };
    const current = { ...before, passed: true };
    expect(analyzeComparisonCohort(report([current, { ...before, id: 'introduced' }]), report([before], 'before'))).toMatchObject({ matchedRegressions: 1, introducedFailures: 0 });
  });
  it('detects score regressions within the same pass band', () => {
    const result = analyzeComparisonCohort(report([row('same', true, 0.7)]), report([row('same', true, 0.9)], 'before'));
    expect(result.matchedRegressions).toBe(0);
    expect(result.scores).toMatchObject({ measuredPairs: 1, regressions: 1, improvements: 0, changeCount: 1 });
    expect(result.scores.changes[0].delta).toBeCloseTo(-0.2);
  });
  it('honors lower-is-better direction and excludes missing score direction', () => {
    const current = report([row('same', true, 0.2)]), before = report([row('same', true, 0.7)], 'before');
    current.suiteManifests![0].scoreDirection = before.suiteManifests![0].scoreDirection = 'lower-is-better';
    expect(analyzeComparisonCohort(current, before).scores.improvements).toBe(1);
    delete current.suiteManifests![0].scoreDirection;
    expect(analyzeComparisonCohort(current, before).scores).toMatchObject({ measuredPairs: 0, unavailablePairs: 1 });
  });
  it.each(['datasetVersion', 'rubricVersion', 'graderVersion'] as const)('refuses inference when %s changes or is missing', field => {
    const current = report([row('same')]), before = report([row('same')], 'before');
    current.suiteManifests![0][field] = 'changed';
    expect(analyzeComparisonCohort(current, before)).toMatchObject({ status: 'incompatible', eligibleCases: 0 });
    delete (current.suiteManifests![0] as unknown as Record<string, unknown>)[field];
    expect(analyzeComparisonCohort(current, before)).toMatchObject({ status: 'unknown', eligibleCases: 0 });
  });
  it('requires matching judge models while allowing the application model/prompt to vary', () => {
    const current = report([{ ...row('same'), kind: 'llm-judge', judgeModel: 'judge-v2', promptVersion: 'prompt-v2', usage: { model: 'target-v2' } }]);
    const before = report([{ ...row('same'), kind: 'llm-judge', judgeModel: 'judge-v1', promptVersion: 'prompt-v1', usage: { model: 'target-v1' } }], 'before');
    current.suiteManifests![0].graders = before.suiteManifests![0].graders = ['llm-judge'];
    expect(analyzeComparisonCohort(current, before).status).toBe('incompatible');
    current.rows[0].judgeModel = 'judge-v1';
    expect(analyzeComparisonCohort(current, before).status).toBe('compatible');
    delete current.rows[0].judgeModel;
    expect(analyzeComparisonCohort(current, before).status).toBe('unknown');
  });
  it('does not confuse delimiter-colliding identities or count duplicates as independent cases', () => {
    const current = report([{ ...row('c'), suite: 'a:b' }]), before = report([{ ...row('b:c'), suite: 'a' }], 'before');
    expect(analyzeComparisonCohort(current, before)).toMatchObject({ matchedCases: 0, introducedCases: 1, removedCases: 1 });
    const duplicate = report([row('same'), row('same')]);
    expect(analyzeComparisonCohort(duplicate, report([row('same')], 'before'))).toMatchObject({ status: 'ambiguous', duplicateIdentities: 1, eligibleCases: 0 });
  });
  it('does not infer compatibility from absent project or manifests', () => {
    const current = report([row('same')]), before = report([row('same')], 'before');
    delete current.run.project;
    expect(analyzeComparisonCohort(current, before).eligibleCases).toBe(0);
    current.run.project = 'another-project';
    expect(analyzeComparisonCohort(current, before).status).toBe('incompatible');
    current.run.project = before.run.project; delete current.suiteManifests;
    expect(analyzeComparisonCohort(current, before).status).toBe('unknown');
  });
  it('rejects input changes, changed expectations, and duplicate manifests', () => {
    const current = report([{ ...row('same'), input: 'new' }]), before = report([{ ...row('same'), input: 'old' }], 'before');
    expect(analyzeComparisonCohort(current, before).status).toBe('incompatible');
    current.rows[0].input = 'old'; current.rows[0].expectedOutcome = 'fail';
    expect(analyzeComparisonCohort(current, before).status).toBe('incompatible');
    delete current.rows[0].expectedOutcome; current.suiteManifests!.push(manifest());
    expect(analyzeComparisonCohort(current, before).status).toBe('ambiguous');
  });
  it('keeps repeat aggregates as one case instead of inventing independent trials', () => {
    const current = report([{ ...row('same'), repeated: { runs: 100, passes: 99, aggregation: 'majority' } }]);
    const before = report([{ ...row('same'), repeated: { runs: 20, passes: 18, aggregation: 'majority' } }], 'before');
    const result = buildMatchedCohort(current, before);
    expect(result.summary).toMatchObject({ matchedCases: 1, eligibleCases: 1, repeatedCases: 1 });
    expect(result.pairs).toHaveLength(1);
    delete before.rows[0].repeated;
    expect(analyzeComparisonCohort(current, before).status).toBe('unknown');
  });
  it('bounds evidence samples and is deterministic under row reordering', () => {
    const current = report(Array.from({ length: 50 }, (_, i) => row(String(i), true, 0.5)));
    const before = report(Array.from({ length: 50 }, (_, i) => row(String(i), true, 1)), 'before');
    const result = analyzeComparisonCohort(current, before);
    expect(result.scores).toMatchObject({ regressions: 50, changeCount: 50 });
    expect(result.scores.changes).toHaveLength(20);
    expect(analyzeComparisonCohort({ ...current, rows: [...current.rows].reverse() }, before)).toEqual(result);
    delete current.run.project; current.suiteManifests = undefined;
    const unknown = analyzeComparisonCohort(current, before);
    expect(unknown.issueCount).toBeGreaterThan(20); expect(unknown.issues).toHaveLength(20);
  });
  it('prioritizes known incompatibility over unknown metadata in bounded evidence samples', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ ...row(`case-${String(i).padStart(2, '0')}`), kind: 'llm-judge' as const }));
    const current = report(structuredClone(rows)), before = report(structuredClone(rows), 'before');
    current.suiteManifests![0].graders = before.suiteManifests![0].graders = ['llm-judge'];
    current.rows[29].judgeModel = 'new-judge'; before.rows[29].judgeModel = 'old-judge';
    const result = analyzeComparisonCohort(current, before);
    expect(result.status).toBe('incompatible');
    expect(result.issues).toHaveLength(20);
    expect(result.issues[0]).toMatchObject({ code: 'judge-model-changed', status: 'incompatible' });
  });
  it('reports absent baseline and zero denominators without fake rates', () => {
    expect(analyzeComparisonCohort(report([]))).toMatchObject({ status: 'not-compared', matchedCases: 0 });
    expect(analyzeComparisonCohort(report([]), report([], 'before')).currentMatchCoverage).toBeUndefined();
  });
});

describe('measured telemetry semantics', () => {
  it('distinguishes real zero from missing, reports separate denominators, and keeps populations unknown', () => {
    const result = summarizeTelemetry(report([{ ...row('zero'), usage: { costUsd: 0, totalTokens: 0 }, durationMs: 0 }, row('missing')]));
    expect(result.cost).toMatchObject({ sum: 0, measured: 1, total: 2, missing: 1, coverage: 0.5, unit: 'USD' });
    expect(result.duration).toMatchObject({ p50: 0, p95: 0, measured: 1, missing: 1 });
    expect(result.tokens).toMatchObject({ sum: 0, direction: 'unknown' });
    expect(result.populationCoverage).toEqual({ dataset: 'unknown', production: 'unknown' });
    const absent = summarizeTelemetry(report([row('missing')]));
    expect(absent.cost.sum).toBeUndefined(); expect(absent.cost.mean).toBeUndefined();
    expect(summarizeTelemetry(report([])).cost.coverage).toBeUndefined();
  });
  it('keeps raw scores per suite and excludes invalid/out-of-range observations', () => {
    const current = report([row('normal', true, 0.5), row('out-of-range', true, 7), { ...row('invalid'), score: NaN }, { ...row('other', true, 5), suite: 'likert' }]);
    current.suiteManifests!.push({ ...manifest(), name: 'likert', scoreScale: { min: 1, max: 5 } });
    const result = summarizeTelemetry(current);
    expect(result.suites.find(s => s.suite === 'quality')?.score).toMatchObject({ measured: 1, total: 3, mean: 0.5, missing: 2 });
    expect(result.suites.find(s => s.suite === 'likert')?.score.mean).toBe(5);
    expect(result.suites[0].score.sum).toBeUndefined();
  });
  it('does not turn missing canonical usage into zero or silently mix legacy cost aliases', () => {
    const current = report([{ ...row('legacy'), metadata: { costUsd: 99 }, usage: { totalTokens: 12 }, durationMs: -1 }]);
    expect(summarizeTelemetry(current).cost).toMatchObject({ measured: 0, missing: 1 });
    expect(summarizeTelemetry(current).duration.measured).toBe(0);
  });
  it('does not emit Infinity when a sum overflows', () => {
    const result = summarizeTelemetry(report([1, 2].map(i => ({ ...row(String(i)), usage: { costUsd: 1e308 } }))));
    expect(result.cost.sum).toBeUndefined(); expect(Number.isFinite(result.cost.mean)).toBe(true);
  });
});

describe('cohort metadata contract and reporter parity', () => {
  it('keeps older artifacts valid and validates the optional score/scorer declarations', async () => {
    const current = report([row('case')]); expect(validateEvalReport(current).ok).toBe(true);
    const legacy = structuredClone(current); delete legacy.suiteManifests![0].scoreDirection; delete legacy.suiteManifests![0].graderVersion;
    expect(validateEvalReport(legacy).ok).toBe(true);
    for (const bad of ['up', '', 1]) expect(validateEvalReport({ ...current, suiteManifests: [{ ...manifest(), scoreDirection: bad }] }).ok).toBe(false);
    for (const bad of ['', ' ', 4]) expect(validateEvalReport({ ...current, suiteManifests: [{ ...manifest(), graderVersion: bad }] }).ok).toBe(false);
    const schema = JSON.parse(await readFile('schemas/eval-report-v1.schema.json', 'utf8'));
    expect(schema.definitions.SuiteManifest.properties.scoreDirection.enum).toEqual([...SCORE_DIRECTIONS]);
    expect(schema.definitions.SuiteManifest.required).not.toContain('scoreDirection');
    expect(schema.definitions.SuiteManifest.required).not.toContain('graderVersion');
    expect(validateEvalReport(JSON.parse(await readFile('examples/taxonomy-complete-fixture/run-complete.json', 'utf8'))).ok).toBe(true);
  });
  it('uses the shared analysis in JSON and renders the same eligibility and coverage safely', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'run-analytics-')); dirs.push(dir);
    const current = report([row('<script>bad</script>', true, 0.4)]), before = report([row('<script>bad</script>', true, 0.9)], 'before');
    await renderReports({ current, previous: before, comparison: compareRuns(current, before), history: [], reportDir: dir }, ['html', 'markdown-summary', 'text']);
    const summary = JSON.parse(await readFile(path.join(dir, 'summary.json'), 'utf8'));
    expect(summary.analytics).toEqual(JSON.parse(JSON.stringify(analyzeRun(current, before))));
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    expect(html).toContain('1/1 eligible matched cases'); expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
    expect(html).not.toContain('<script>bad</script>'); expect(html).toContain('Cost: unknown; measured 0/1, missing 1');
    expect(await readFile(path.join(dir, 'summary.md'), 'utf8')).toContain('eligible cases: 1');
  });
});
