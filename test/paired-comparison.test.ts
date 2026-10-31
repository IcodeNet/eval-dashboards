import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { comparePairedOutcomes, validatePairedComparisonOptions, type PairedComparisonOptions } from '../src/analytics/paired-comparison.js';
import { checkGates } from '../src/gates/check-gates.js';
import { gateDecisionFromResult } from '../src/gates/decision.js';
import { detectGateConfigLoosening } from '../src/gates/threshold-change.js';
import { compareRuns } from '../src/history/history.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';

const execute = promisify(execFile);
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const report = (passed: boolean, id = 'current', count = 100): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1', run: { id, project: 'paired-example', generatedAt: id === 'previous' ? '2026-10-30T00:00:00Z' : '2026-10-31T00:00:00Z' },
  suites: [{ id: 'quality', total: count, passed: passed ? count : 0, failed: passed ? 0 : count }],
  rows: Array.from({ length: count }, (_, i) => ({ id: `case-${i}`, suite: 'quality', passed, kind: 'deterministic' as const })),
  suiteManifests: [{ name: 'quality', target: 'agent', datasetSource: 'synthetic', datasetVersion: 'dataset-1', rubricVersion: 'rubric-1', graderVersion: 'grader-1',
    graders: ['deterministic-assertions'], riskArea: 'response-quality', gate: { mode: 'report-only', thresholds: {} } }],
});
const options: PairedComparisonOptions = { independentClusters: true };

describe('paired comparison bounds', () => {
  it('uses the bounded paired differences and the declared number of independent groups', () => {
    const result = comparePairedOutcomes(report(true), report(false, 'previous'), options);
    expect(result).toMatchObject({ status: 'passed', clusters: 100, matchedCases: 100, observedDelta: 1 });
    expect(result.interval?.lower).toBeCloseTo(1 - Math.sqrt(2 * Math.log(40) / 100), 12);
    expect(result.interval?.upper).toBe(1);
    expect(comparePairedOutcomes(report(false), report(true, 'previous'), options).status).toBe('failed');
  });
  it('does not manufacture a zero-width confidence interval for identical observed outcomes', () => {
    const result = comparePairedOutcomes(report(true), report(true, 'previous'), options);
    expect(result).toMatchObject({ status: 'inconclusive', observedDelta: 0, reasons: ['interval-overlaps-required-delta'] });
    expect(result.interval!.lower).toBeLessThan(0); expect(result.interval!.upper).toBeGreaterThan(0);
    expect(comparePairedOutcomes(report(true), report(true, 'previous'), { ...options, minDelta: -0.4 }).status).toBe('passed');
  });
  it('requires an explicit independence declaration and enough groups', () => {
    expect(comparePairedOutcomes(report(true), report(false, 'previous'))).toMatchObject({ status: 'inconclusive', reasons: ['cluster-independence-not-declared'] });
    expect(comparePairedOutcomes(report(true), report(false, 'previous')).interval).toBeUndefined();
    expect(comparePairedOutcomes(report(true), report(false, 'previous'), { ...options, minClusters: 200 }).reasons).toContain('too-few-independent-clusters');
  });
  it('groups mirrored axis rows into one scenario and gives each scenario equal weight', () => {
    const current = report(true), previous = report(false, 'previous');
    for (const candidate of [current, previous]) for (const row of candidate.rows) { row.scenarioId = 'same-scenario'; row.datasetId = 'dataset'; }
    const single = comparePairedOutcomes(current, previous, options);
    expect(single).toMatchObject({ clusters: 1, status: 'inconclusive' });
    for (const candidate of [current, previous]) candidate.rows.push({ ...candidate.rows[0], id: 'other', scenarioId: 'another-scenario', passed: candidate === previous });
    const weighted = comparePairedOutcomes(current, previous, options);
    expect(weighted.clusters).toBe(2); expect(weighted.observedDelta).toBeCloseTo(0);
  });
  it('does not expand repeated totals into independent observations', () => {
    const current = report(true, 'current', 1), previous = report(false, 'previous', 1);
    current.rows[0].repeated = { runs: 10000, passes: 10000, aggregation: 'all' };
    previous.rows[0].repeated = { runs: 10000, passes: 0, aggregation: 'all' };
    expect(comparePairedOutcomes(current, previous, options)).toMatchObject({ status: 'inconclusive', clusters: 1, matchedCases: 1, repeatedCases: 1 });
  });
  it('uses matching expected outcomes so intentional negatives are not mistaken for regressions', () => {
    const current = report(false), previous = report(true, 'previous');
    for (const candidate of [current, previous]) for (const row of candidate.rows) row.expectedOutcome = 'fail';
    expect(comparePairedOutcomes(current, previous, options)).toMatchObject({ status: 'passed', observedDelta: 1 });
  });
  it('refuses mismatched versions, missing metadata, duplicate identities and changed grouping', () => {
    const current = report(true), previous = report(false, 'previous');
    current.suiteManifests![0].graderVersion = 'changed';
    expect(comparePairedOutcomes(current, previous, options).reasons).toContain('comparison-incompatible');
    delete current.suiteManifests![0].graderVersion;
    expect(comparePairedOutcomes(current, previous, options).reasons).toContain('comparison-unknown');
    current.suiteManifests![0].graderVersion = 'grader-1'; current.rows.push(current.rows[0]);
    expect(comparePairedOutcomes(current, previous, options).reasons).toContain('comparison-ambiguous');
    current.rows.pop(); current.rows[0].scenarioId = 'new-group';
    expect(comparePairedOutcomes(current, previous, options).reasons).toContain('scenarioId-grouping-changed');
    expect(comparePairedOutcomes(current, undefined, options).reasons).toContain('baseline-unavailable');
  });
  it('limits inference to matching cases and is stable under input reordering', () => {
    const current = report(true), previous = report(false, 'previous');
    current.rows.push({ id: 'introduced', suite: 'quality', passed: false });
    previous.rows.push({ id: 'removed', suite: 'quality', passed: true });
    const result = comparePairedOutcomes(current, previous, options);
    expect(result).toMatchObject({ status: 'passed', matchedCases: 100, clusters: 100 });
    expect(comparePairedOutcomes({ ...current, rows: [...current.rows].reverse() }, previous, options)).toEqual(result);
    const conservative = comparePairedOutcomes(current, previous, { ...options, confidenceLevel: 0.99 });
    expect(conservative.interval!.lower).toBeLessThan(result.interval!.lower);
  });
  it.each([
    { confidenceLevel: NaN }, { confidenceLevel: 0 }, { confidenceLevel: 1 },
    { minDelta: Infinity }, { minDelta: 2 }, { minClusters: 1 }, { minClusters: 2.5 },
    { independentClusters: 'yes' }, null, [],
  ])('rejects invalid comparison settings: %j', invalid => {
    const config = invalid as PairedComparisonOptions;
    expect(validatePairedComparisonOptions(config).length).toBeGreaterThan(0);
    expect(() => comparePairedOutcomes(report(true), report(false, 'previous'), config)).toThrow(RangeError);
  });
});

describe('paired policy decisions', () => {
  it('fails closed with a distinct inconclusive status and gives hard failures priority', () => {
    const current = report(true), previous = report(true, 'previous');
    const result = checkGates(current, compareRuns(current, previous), { paired: options }, undefined, previous);
    expect(result).toMatchObject({ passed: false, status: 'inconclusive' });
    expect(gateDecisionFromResult(result).status).toBe('inconclusive');
    current.rows[0].passed = false; current.rows[0].severity = 'critical';
    const failed = checkGates(current, compareRuns(current, previous), { paired: options, zeroCritical: true }, undefined, previous);
    expect(failed.status).toBe('failed');
    expect(gateDecisionFromResult({ ...result, passed: true, failures: [] }).status).toBe('failed');
  });
  it('does not allow waivers to manufacture an observed improvement', () => {
    const observed = report(false), previous = report(true, 'previous'), waived = report(true);
    const result = checkGates(waived, compareRuns(waived, previous), { minPassRate: 1, paired: options }, undefined, previous, observed);
    expect(result).toMatchObject({ passed: false, status: 'failed' });
    expect(result.pairedComparison?.observedDelta).toBe(-1);
    const other = { ...observed, run: { ...observed.run, id: 'wrong-run' } };
    expect(checkGates(waived, compareRuns(waived, previous), { paired: options }, undefined, previous, other).failures).toContain('Raw paired evidence must refer to the same current run.');
  });
  it('audits removal and loosening of paired policies, including effective defaults', () => {
    expect(detectGateConfigLoosening({ paired: options }, {}).loosened).toBe(true);
    expect(detectGateConfigLoosening({}, { paired: options }).loosened).toBe(false);
    expect(detectGateConfigLoosening({ paired: { minDelta: 0.2 } }, { paired: {} }).loosened).toBe(true);
    expect(detectGateConfigLoosening({ paired: { minClusters: 20 } }, { paired: { minClusters: 10 } }).loosened).toBe(true);
    expect(detectGateConfigLoosening({ paired: { confidenceLevel: 0.99 } }, { paired: { confidenceLevel: 0.9 } }).loosened).toBe(true);
    expect(detectGateConfigLoosening({ paired: {} }, { paired: options }).loosened).toBe(true);
  });
});

const prepare = async (current: EvalReportV1, previous: EvalReportV1, configSource: string) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'paired-cli-')); dirs.push(dir); await mkdir(path.join(dir, 'in'));
  await writeFile(path.join(dir, 'in/current.json'), JSON.stringify(current));
  await writeFile(path.join(dir, 'in/previous.json'), JSON.stringify(previous));
  await writeFile(path.join(dir, 'eval-dashboards.config.mjs'), configSource);
  return dir;
};
const cli = async (dir: string, args: string[]) => {
  try { const result = await execute('pnpm', ['exec', 'tsx', path.resolve('src/cli/index.ts'), ...args], { cwd: dir }); return { code: 0, output: result.stdout + result.stderr }; }
  catch (error) { const result = error as { code: number; stdout?: string; stderr?: string }; return { code: result.code, output: (result.stdout ?? '') + (result.stderr ?? '') }; }
};

describe('paired CLI and report consistency', () => {
  it.each(['passed', 'failed', 'inconclusive'] as const)('shows the same %s result in the check and all report formats', async status => {
    const current = report(status !== 'failed'), previous = report(status !== 'passed', 'previous');
    const dir = await prepare(current, previous, 'export default { gates: { paired: { independentClusters: true } } };');
    const checked = await cli(dir, ['check', '--input=in', '--json-out=check.json']);
    expect(checked.code).toBe(status === 'passed' ? 0 : 1);
    const rendered = await cli(dir, ['report', '--input=in', '--report-dir=out', '--reporter=html', '--reporter=markdown-summary', '--reporter=text']);
    expect(rendered.code).toBe(0);
    const check = JSON.parse(await readFile(path.join(dir, 'check.json'), 'utf8'));
    const summary = JSON.parse(await readFile(path.join(dir, 'out/summary.json'), 'utf8'));
    expect(check.gateDecision.status).toBe(status);
    expect(summary.gateDecision).toEqual(check.gateDecision);
    expect(summary.analytics.pairedComparison).toEqual(check.gateDecision.uncertainty);
    expect(await readFile(path.join(dir, 'out/index.html'), 'utf8')).toContain(`>${status}</span>`);
    expect(await readFile(path.join(dir, 'out/summary.md'), 'utf8')).toContain(`| Gate decision | ${status} |`);
    expect(rendered.output).toContain(`Gate decision:    ${status}`);
  });
  it('preserves configured assumptions when overriding one paired CLI setting', async () => {
    const dir = await prepare(report(true), report(true, 'previous'), 'export default { gates: { paired: { minDelta: 1, independentClusters: true } } };');
    const result = await cli(dir, ['check', '--input=in', '--paired-min-delta=-0.4', '--paired-confidence-level=0.95', '--paired-min-clusters=2', '--json-out=check.json']);
    expect(result.code).toBe(0);
    const checked = JSON.parse(await readFile(path.join(dir, 'check.json'), 'utf8'));
    expect(checked.gateDecision.uncertainty).toMatchObject({ minDelta: -0.4, confidenceLevel: 0.95, minClusters: 2, independentClusters: true });
  });
  it.each(['null', '"disabled"', '{ confidenceLevel: NaN }', '{ minClusters: 1 }'])('rejects malformed paired config before merging: %s', async invalid => {
    const dir = await prepare(report(true), report(false, 'previous'), `export default { gates: { paired: ${invalid} } };`);
    expect((await cli(dir, ['check', '--input=in'])).code).toBe(2);
    expect((await cli(dir, ['report', '--input=in'])).code).toBe(2);
  });
  it('rejects malformed paired policy baseline records before checking for loosening', async () => {
    const dir = await prepare(report(true), report(true, 'previous'), 'export default { gates: { paired: { independentClusters: true } }, baselineGateConfigFile: "baseline.json" };');
    await writeFile(path.join(dir, 'baseline.json'), JSON.stringify({ paired: { minDelta: 'invalid' } }));
    expect((await cli(dir, ['check', '--input=in'])).code).toBe(2);
    expect((await cli(dir, ['report', '--input=in'])).code).toBe(2);
  });
  it('uses raw observations for the paired gate even when an active waiver changes ordinary gates', async () => {
    const dir = await prepare(report(false), report(true, 'previous'), 'export default { gates: { minPassRate: 1, paired: { independentClusters: true } }, waiverFile: "waivers.json" };');
    await writeFile(path.join(dir, 'waivers.json'), JSON.stringify({ schemaVersion: 'eval-waiver-register/v1', waivers: [{ id: 'known', suite: 'quality', reason: 'Known failure', riskOwner: 'reviewer', ticket: 'TEST-1', expiresAt: '2099-01-01T00:00:00Z' }] }));
    const result = await cli(dir, ['check', '--input=in', '--json-out=check.json']);
    expect(result.code).toBe(1);
    const checked = JSON.parse(await readFile(path.join(dir, 'check.json'), 'utf8'));
    expect(checked.gateDecision).toMatchObject({ status: 'failed', uncertainty: { observedDelta: -1 } });
    expect(checked.diagnostics.join(' ')).toContain('ACTIVE WAIVER');
    expect((await cli(dir, ['report', '--input=in', '--report-dir=out', '--reporter=html'])).code).toBe(0);
    const summary = JSON.parse(await readFile(path.join(dir, 'out/summary.json'), 'utf8'));
    expect(summary.gateDecision).toEqual(checked.gateDecision);
    expect(summary.analytics.pairedComparison).toEqual(checked.gateDecision.uncertainty);
  });
});
