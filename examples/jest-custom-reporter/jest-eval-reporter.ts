/**
 * Jest custom reporter that emits an eval-report/v1 artifact after each test run.
 *
 * Usage — jest.config.ts:
 *   import EvalReporter from './jest-eval-reporter';
 *   export default { reporters: [['./jest-eval-reporter', { outDir: '.evals_output' }]] };
 *
 * Each Jest test becomes one EvalRow. Suites map to Jest describe() blocks.
 * After the run, call: npx @icodenet/eval-dashboards report --input=.evals_output
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Jest reporter interface (subset needed for artifact generation)
type JestTestResult = {
  testFilePath: string;
  testResults: Array<{
    ancestorTitles: string[];
    title: string;
    status: 'passed' | 'failed' | 'pending' | 'skipped';
    failureMessages: string[];
    duration?: number;
  }>;
};

type EvalReporterOptions = {
  outDir?: string;
  project?: string;
};

// Inline eval-report/v1 schema types — no runtime import needed
type EvalReportV1 = {
  schemaVersion: 'eval-report/v1';
  run: { id: string; generatedAt: string; project?: string };
  suites: Array<{ id: string; total: number; passed: number; failed: number }>;
  rows: Array<{
    id: string;
    suite: string;
    kind: 'deterministic';
    name?: string;
    passed: boolean;
    severity?: 'none' | 'medium';
    reason?: string;
    durationMs?: number;
  }>;
};

class JestEvalReporter {
  private readonly options: EvalReporterOptions;

  constructor(_globalConfig: unknown, options: EvalReporterOptions = {}) {
    this.options = options;
  }

  async onRunComplete(_contexts: unknown, results: { testResults: JestTestResult[] }): Promise<void> {
    const outDir = this.options.outDir ?? '.evals_output';
    const runId = randomUUID();

    const rows: EvalReportV1['rows'] = [];
    const suiteCounts = new Map<string, { total: number; passed: number; failed: number }>();

    for (const file of results.testResults) {
      const suite = path.basename(file.testFilePath, path.extname(file.testFilePath));

      for (const test of file.testResults) {
        if (test.status === 'pending' || test.status === 'skipped') continue;

        const passed = test.status === 'passed';
        const counts = suiteCounts.get(suite) ?? { total: 0, passed: 0, failed: 0 };
        counts.total += 1;
        if (passed) counts.passed += 1;
        else counts.failed += 1;
        suiteCounts.set(suite, counts);

        rows.push({
          id: `${suite}:${test.ancestorTitles.join('>')}:${test.title}`.replace(/\s+/g, '-'),
          suite,
          kind: 'deterministic',
          name: [...test.ancestorTitles, test.title].join(' › '),
          passed,
          severity: passed ? undefined : 'medium',
          reason: test.failureMessages[0]?.slice(0, 500),
          durationMs: test.duration,
        });
      }
    }

    const report: EvalReportV1 = {
      schemaVersion: 'eval-report/v1',
      run: { id: runId, generatedAt: new Date().toISOString(), project: this.options.project },
      suites: Array.from(suiteCounts.entries()).map(([id, counts]) => ({ id, ...counts })),
      rows,
    };

    await mkdir(outDir, { recursive: true });
    const filePath = path.join(outDir, `${runId}.json`);
    await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[eval-dashboards] artifact written to ${filePath}`);
  }
}

module.exports = JestEvalReporter;
