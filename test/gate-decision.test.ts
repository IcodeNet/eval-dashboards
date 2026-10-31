import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { EvalReportsConfig } from '../src/config/config.js';
import { gateDecisionFromResult } from '../src/gates/decision.js';
import { compareRuns } from '../src/history/history.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';
import { renderReports } from '../src/reporters/render.js';

const exec = promisify(execFile);
const dirs: string[] = [];
const scratch = async () => { const dir = await mkdtemp(path.join(tmpdir(), 'gate-decision-')); dirs.push(dir); return dir; };
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const fixture = (negative = false): EvalReportV1 => ({
  schemaVersion: 'eval-report/v1', run: { id: 'decision-run', generatedAt: '2026-10-31T00:00:00Z' },
  suites: [{ id: 'quality', total: 20, passed: 19, failed: 1 }],
  rows: Array.from({ length: 20 }, (_, i) => ({ id: `case-${i}`, suite: 'quality', passed: i !== 0,
    ...(i === 0 ? { severity: 'critical' as const, ...(negative ? { expectedOutcome: 'fail' as const } : {}) } : {}) })),
});

describe('shared gate decision', () => {
  it('keeps missing evaluation neutral and fails closed on inconsistent results', () => {
    expect(gateDecisionFromResult().status).toBe('not-evaluated');
    expect(gateDecisionFromResult({ passed: true, failures: ['blocked'], diagnostics: [] }).status).toBe('failed');
    expect(gateDecisionFromResult({ passed: false, failures: [], diagnostics: [] }).status).toBe('failed');
  });

  it('renders absent evaluation neutrally even for a high pass rate and unknown baseline', async () => {
    const dir = await scratch(); const current = fixture();
    await renderReports({ current, history: [], comparison: compareRuns(current), reportDir: dir }, ['html', 'text', 'markdown-summary']);
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    expect(html).toContain('class="muted">not-evaluated');
    expect(html).not.toContain('metric-value pass">95');
    expect(html).toContain('compat-muted">not compared');
    expect(JSON.parse(await readFile(path.join(dir, 'summary.json'), 'utf8')).gateDecision.status).toBe('not-evaluated');
  });

  it('escapes policy failure evidence in HTML and shares it across outputs', async () => {
    const dir = await scratch(); const current = fixture();
    const failure = '<script>alert("policy")</script>';
    const decision = gateDecisionFromResult({ passed: false, failures: [failure], diagnostics: ['<img src=x>'] });
    const outputs = await renderReports({ current, history: [], comparison: compareRuns(current), reportDir: dir, gateDecision: decision }, ['html', 'text', 'markdown-summary']);
    const html = await readFile(path.join(dir, 'index.html'), 'utf8');
    expect(html).toContain('&lt;script&gt;'); expect(html).not.toContain(failure);
    expect(html).toContain('&lt;img src=x&gt;');
    expect(outputs.join('\n')).toContain('Gate decision:    failed');
    expect(await readFile(path.join(dir, 'summary.md'), 'utf8')).toContain('| Gate decision | failed |');
    expect(JSON.parse(await readFile(path.join(dir, 'summary.json'), 'utf8')).gateDecision).toEqual(decision);
  });

  it.each([
    ['critical failure despite 95% passes', { zeroCritical: true }, false, 'failed'],
    ['strict suite threshold despite 95% passes', { suites: { quality: { minPassRate: 1 } } }, false, 'failed'],
    ['configured passing threshold', { minPassRate: 0.9 }, false, 'passed'],
    ['expected negative case', { minMatchedExpectationRate: 1 }, true, 'passed'],
  ] as const)('agrees between check and all reporters: %s', async (_name, gates, negative, status) => {
    const dir = await scratch(); await mkdir(path.join(dir, 'in'));
    await writeFile(path.join(dir, 'in/run.json'), JSON.stringify(fixture(negative)));
    await writeFile(path.join(dir, 'eval-dashboards.config.mjs'), `export default ${JSON.stringify({ gates })};`);
    const entry = path.resolve('src/cli/index.ts');
    let exit = 0;
    try { await exec('pnpm', ['exec', 'tsx', entry, 'check', '--input=in', '--json-out=check.json'], { cwd: dir }); }
    catch (error) { exit = (error as { code: number }).code; }
    expect(exit).toBe(status === 'failed' ? 1 : 0);
    const checked = JSON.parse(await readFile(path.join(dir, 'check.json'), 'utf8'));
    const reported = await exec('pnpm', ['exec', 'tsx', entry, 'report', '--input=in', '--report-dir=out', '--reporter=html', '--reporter=text', '--reporter=markdown-summary'], { cwd: dir });
    // Producing a failed report succeeds; check retains the CI gate exit code.
    const summary = JSON.parse(await readFile(path.join(dir, 'out/summary.json'), 'utf8'));
    expect(summary.gateDecision).toEqual(checked.gateDecision);
    expect(summary.gateDecision.status).toBe(status);
    expect(reported.stdout).toContain(`Gate decision:    ${status}`);
    expect(await readFile(path.join(dir, 'out/summary.md'), 'utf8')).toContain(`| Gate decision | ${status} |`);
    expect(await readFile(path.join(dir, 'out/index.html'), 'utf8')).toContain(`>${status}</span>`);
  });
  it.each(['waiver', 'threshold change', 'calibration', 'blocked baseline'] as const)(
    'includes %s policy evidence in both check and report', async scenario => {
      const dir = await scratch(); await mkdir(path.join(dir, 'in'));
      const current = fixture();
      const config: EvalReportsConfig = { gates: { minPassRate: 0.9 } };
      if (scenario === 'waiver') {
        config.gates = { minPassRate: 1 }; config.waiverFile = 'waivers.json';
        await writeFile(path.join(dir, 'waivers.json'), JSON.stringify({
          schemaVersion: 'eval-waiver-register/v1', waivers: [{ id: 'known-case', suite: 'quality', rowId: 'case-0',
            reason: 'Known false negative', riskOwner: 'reviewer', ticket: 'TEST-1', expiresAt: '2099-01-01T00:00:00Z' }],
        }));
      }
      if (scenario === 'threshold change') {
        config.baselineGateConfigFile = 'policy.json';
        await writeFile(path.join(dir, 'policy.json'), JSON.stringify({ minPassRate: 1 }));
      }
      if (scenario === 'calibration' || scenario === 'blocked baseline') {
        current.suiteManifests = [{ name: 'quality', target: 'agent', datasetSource: 'synthetic', datasetVersion: '2',
          rubricVersion: '1', riskArea: 'response-quality', graders: ['llm-judge'], gate: { mode: 'blocking', thresholds: { overallPassRate: 0.9 } } }];
        if (scenario === 'calibration') config.gates = { calibration: { enabled: true } };
        else {
          const previous = structuredClone(current); previous.run.id = 'previous'; previous.run.generatedAt = '2026-10-30T00:00:00Z';
          previous.suiteManifests![0].datasetVersion = '1';
          await writeFile(path.join(dir, 'in/previous.json'), JSON.stringify(previous));
        }
      }
      await writeFile(path.join(dir, 'in/run.json'), JSON.stringify(current));
      await writeFile(path.join(dir, 'eval-dashboards.config.mjs'), `export default ${JSON.stringify(config)};`);
      const entry = path.resolve('src/cli/index.ts');
      let exit = 0;
      try { await exec('pnpm', ['exec', 'tsx', entry, 'check', '--input=in', '--json-out=check.json'], { cwd: dir }); }
      catch (error) { exit = (error as { code: number }).code; }
      expect(exit).toBe(scenario === 'waiver' ? 0 : 1);
      await exec('pnpm', ['exec', 'tsx', entry, 'report', '--input=in', '--report-dir=out', '--reporter=html'], { cwd: dir });
      const checked = JSON.parse(await readFile(path.join(dir, 'check.json'), 'utf8'));
      const summary = JSON.parse(await readFile(path.join(dir, 'out/summary.json'), 'utf8'));
      expect(summary.gateDecision).toEqual(checked.gateDecision);
      const evidence = [...summary.gateDecision.failures, ...summary.gateDecision.diagnostics].join(' ');
      expect(evidence).toContain({ waiver: 'ACTIVE WAIVER', 'threshold change': 'minPassRate', calibration: 'Calibration preflight', 'blocked baseline': 'Baseline compatibility is blocked' }[scenario]);
    },
  );

});
