#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-package-consumer-'));
const run = (bin, args, cwd = temp) => execFileSync(bin, args, { cwd, stdio: 'inherit' });
try {
  // npm pack runs the actual prepack build; the consumer cannot import source.
  run('npm', ['pack', '--pack-destination', temp], root);
  const tarballs = fs.readdirSync(temp).filter((file) => file.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error('Expected exactly one package tarball');
  fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({
    name: 'eval-dashboards-package-consumer', private: true, type: 'module',
    dependencies: { '@icodenet/eval-dashboards': `file:./${tarballs[0]}` },
    devDependencies: {
      typescript: require('typescript/package.json').version,
      '@types/node': require('@types/node/package.json').version,
    },
  }, null, 2));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline', '--engine-strict']);
  run('npm', ['ls', '@octokit/rest', '@octokit/request', 'content-type', '--all']);
  fs.writeFileSync(path.join(temp, 'consumer.ts'), `
import type { EvalReportV1, EvalRow, RepeatedTrialSummary } from '@icodenet/eval-dashboards';
import { EVAL_REPORT_SCHEMA_VERSION, validateEvalReport, rowKey, createHistoryStoreForPath, createSqliteHistoryStore, createEvalReportArtifact, summarizeRepeatedTrials, REPEATED_SAMPLING_DESIGNS, type HistoryStore, evaluateReportPolicy, type ReportPolicyResult, type WaiverRegisterV1, publishReport } from '@icodenet/eval-dashboards';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const row: EvalRow = { id: 'consumer', suite: 'smoke', passed: true };
const report: EvalReportV1 = {
  schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
  run: { id: 'consumer-smoke', generatedAt: '2026-10-07T00:00:00.000Z' },
  suites: [{ id: 'smoke', total: 1, passed: 1, failed: 0, passRate: 1 }], rows: [row],
};
if (!validateEvalReport(report).ok || !rowKey(row)) throw new Error('Public runtime exports failed');
const store: HistoryStore = createSqliteHistoryStore('unused.sqlite');
if (typeof store.read !== 'function' || typeof createHistoryStoreForPath !== 'function') throw new Error('History store exports failed');
const schema = JSON.parse(readFileSync(new URL(import.meta.resolve('@icodenet/eval-dashboards/schemas/eval-report-v1.schema.json')), 'utf8'));
if (!schema.properties?.schemaVersion) throw new Error('Schema subpath export failed');
const repeatedArtifact = createEvalReportArtifact({ cases: [{ id: 'repeat', suite: 'smoke', passed: false,
  expectedOutcome: 'fail', repeated: { runs: 10, passes: 1, aggregation: 'majority', samplingDesign: REPEATED_SAMPLING_DESIGNS[0] } }] });
const repeated: RepeatedTrialSummary = summarizeRepeatedTrials(repeatedArtifact);
if (repeated.estimatedCases !== 1 || repeated.cases[0]?.current.observedRate !== 0.9) throw new Error('Repeated-trial public API or emitter lost evidence');
if (!schema.definitions?.EvalRow?.properties?.repeated?.properties?.samplingDesign?.enum.includes('fixed-independent')) throw new Error('Repeated sampling schema export failed');

const register: WaiverRegisterV1 = { schemaVersion: 'eval-waiver-register/v1', waivers: [] };
const policy: ReportPolicyResult = evaluateReportPolicy({ current: report, waiverRegister: register, gateConfig: { minPassRate: 1 } });
if (policy.gateDecision.status !== 'passed') throw new Error('Complete policy public API failed');
const blocked = evaluateReportPolicy({ current: report, gateConfig: { minPassRate: 0.9 }, baselineGateConfig: { minPassRate: 1 } });
if (blocked.gateDecision.status !== 'failed' || !blocked.thresholdChangeResult?.loosened) throw new Error('Complete policy lost threshold change checks');
// Exercise the installed Octokit client, not a mocked module. No request leaves this process.
const originalFetch = globalThis.fetch;
const requests: string[] = [];
let commentExists = false;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const method = init?.method ?? 'GET';
  requests.push(method + ' ' + url.pathname);
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  if (url.hostname !== 'api.github.com') throw new Error('Unexpected publisher destination');
  if (method === 'GET' && url.pathname.endsWith('/issues/1/comments')) return json(commentExists ? [{ id: 99, body: '<!-- eval-dashboards:pr-comment -->' }] : []);
  if (method === 'POST' && url.pathname.endsWith('/issues/1/comments')) { commentExists = true; return json({ id: 99, html_url: 'https://github.com/synthetic/project/pull/1#issuecomment-99' }, 201); }
  if (method === 'PATCH' && url.pathname.endsWith('/issues/comments/99')) return json({ id: 99 });
  if (method === 'GET' && url.pathname.includes('/contents/')) return json({ type: 'file', sha: 'synthetic-sha' });
  if (method === 'PUT' && url.pathname.includes('/contents/')) {
    const body = JSON.parse(String(init?.body));
    if (body.sha !== 'synthetic-sha' || Buffer.from(body.content, 'base64').toString() !== 'offline report') throw new Error('Publisher lost file content or update SHA');
    return json({ content: { html_url: 'https://github.com/synthetic/project' } }, 201);
  }
  throw new Error('Unexpected publisher request: ' + method + ' ' + url.pathname);
};
try {
  const options = { target: 'github-pr-comment' as const, reportDir: '.', repo: 'synthetic/project', token: 'synthetic-test-token', prNumber: 1, commentBody: 'synthetic report', dryRun: false };
  const created = await publishReport(options);
  const updated = await publishReport(options);
  if (!created.message.includes('Created PR comment') || !updated.message.includes('Updated existing PR comment')) throw new Error('Installed comment publisher failed');
  mkdirSync('publisher-input'); writeFileSync('publisher-input/index.html', 'offline report');
  await publishReport({ target: 'github-pages', reportDir: 'publisher-input', repo: 'synthetic/project', token: 'synthetic-test-token', dryRun: false });
  if (requests.length !== 6) throw new Error('Expected comment list/create/list/update and Pages read/write');
} finally { globalThis.fetch = originalFetch; }
console.log('Packed consumer: installed GitHub comment create/update and Pages file update work with simulated fetch; zero external requests.');
console.log('Packed consumer: public types compile; runtime, complete policy and schema exports work.');
`);
  fs.writeFileSync(path.join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
    skipLibCheck: false, outDir: 'out',
  }, include: ['consumer.ts'] }));
  run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json']);
  run(process.execPath, ['out/consumer.js']);
  fs.writeFileSync(path.join(temp, 'consumer.cjs'), "const m = require('@icodenet/eval-dashboards');\nif (typeof m.validateEvalReport !== 'function') throw new Error('CommonJS require failed');\nconsole.log('Packed consumer: CommonJS require works.');\n");
  run(process.execPath, ['consumer.cjs']);
  run(process.execPath, ['--input-type=module', '-e', "import nodemailer from 'nodemailer'; const info = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail({ from: 'sender@example.invalid', to: 'recipient@example.invalid', subject: 'Synthetic compatibility check', text: 'Offline mail smoke' }); if (!Buffer.isBuffer(info.message) || !info.message.toString().includes('Offline mail smoke')) throw new Error('Optional mail transport failed'); console.log('Packed optional dependency: mail stream generation works without SMTP or external delivery.');"]);
  run(process.execPath, ['node_modules/@icodenet/eval-dashboards/dist/cli/index.js', '--help']);
  const expectedVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const installedVersion = execFileSync(process.execPath, ['node_modules/@icodenet/eval-dashboards/dist/cli/index.js', '--version'], { cwd: temp, encoding: 'utf8' }).trim();
  if (installedVersion !== expectedVersion) throw new Error('Installed CLI version differs from package candidate');
  console.log('Packed CLI: version matches candidate ' + installedVersion + '.');
  fs.mkdirSync(path.join(temp, 'file-runs'));
  fs.writeFileSync(path.join(temp, 'file-runs/run.json'), JSON.stringify({
    schemaVersion: 'eval-report/v1', run: { id: 'file-smoke', generatedAt: '2026-11-01T00:00:00Z' },
    suites: [{ id: 'smoke', total: 1, passed: 1, failed: 0 }], rows: [{ id: 'a', suite: 'smoke', passed: true }],
  }));
  const installedCli = 'node_modules/@icodenet/eval-dashboards/dist/cli/index.js';
  run(process.execPath, [installedCli, 'check', '--input=node_modules/@icodenet/eval-dashboards/examples/calibration-minimum-sample']);
  console.log('Packed CLI: shipped minimum calibration sample meets its paired-label floor.');
  run(process.execPath, [installedCli, 'history', '--input=file-runs', '--out=file-history.json']);
  run(process.execPath, [installedCli, 'report', '--input=file-runs', '--report-dir=offline-report', '--reporter=html']);
  const history = JSON.parse(fs.readFileSync(path.join(temp, 'file-history.json'), 'utf8'));
  if (history.length !== 1 || !fs.existsSync(path.join(temp, 'offline-report/index.html'))) throw new Error('Packed file history/report failed');
  console.log('Packed CLI: file history and offline HTML work on Node ' + process.versions.node + '.');
  // The SQLite store loads node:sqlite lazily; a bundler that strips the node: prefix breaks it only in the built CLI.
  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
  if (nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 5)) {
    const cli = 'node_modules/@icodenet/eval-dashboards/dist/cli/index.js';
    fs.mkdirSync(path.join(temp, 'runs'));
    fs.writeFileSync(path.join(temp, 'runs', 'run-1.json'), JSON.stringify({
      schemaVersion: 'eval-report/v1',
      run: { id: 'run-1', generatedAt: '2026-10-01T00:00:00.000Z', branch: 'main' },
      suites: [{ id: 'smoke', total: 1, passed: 1, failed: 0 }],
      rows: [{ id: 'a', suite: 'smoke', passed: true }],
    }));
    run(process.execPath, [cli, 'history', '--input=runs', '--out=history.sqlite']);
    run(process.execPath, [cli, 'history-convert', '--input=history.sqlite', '--out=history.json']);
    const exported = JSON.parse(fs.readFileSync(path.join(temp, 'history.json'), 'utf8'));
    if (exported.length !== 1 || exported[0].run.id !== 'run-1') throw new Error('SQLite history did not round-trip through the packed CLI');
    console.log('Packed CLI: SQLite history round-trips.');
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
