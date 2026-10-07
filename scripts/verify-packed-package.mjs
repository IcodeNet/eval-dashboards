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
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline']);
  fs.writeFileSync(path.join(temp, 'consumer.ts'), `
import type { EvalReportV1, EvalRow } from '@icodenet/eval-dashboards';
import { EVAL_REPORT_SCHEMA_VERSION, validateEvalReport, rowKey } from '@icodenet/eval-dashboards';
import { readFileSync } from 'node:fs';
const row: EvalRow = { id: 'consumer', suite: 'smoke', passed: true };
const report: EvalReportV1 = {
  schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
  run: { id: 'consumer-smoke', generatedAt: '2026-10-07T00:00:00.000Z' },
  suites: [{ id: 'smoke', total: 1, passed: 1, failed: 0, passRate: 1 }], rows: [row],
};
if (!validateEvalReport(report).ok || !rowKey(row)) throw new Error('Public runtime exports failed');
const schema = JSON.parse(readFileSync(new URL(import.meta.resolve('@icodenet/eval-dashboards/schemas/eval-report-v1.schema.json')), 'utf8'));
if (!schema.properties?.schemaVersion) throw new Error('Schema subpath export failed');
console.log('Packed consumer: public types compile; runtime and schema exports work.');
`);
  fs.writeFileSync(path.join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true,
    skipLibCheck: false, outDir: 'out',
  }, include: ['consumer.ts'] }));
  run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json']);
  run(process.execPath, ['out/consumer.js']);
  run(process.execPath, ['node_modules/@icodenet/eval-dashboards/dist/cli/index.js', '--help']);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
