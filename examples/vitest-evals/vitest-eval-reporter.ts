/**
 * Vitest custom reporter that emits an eval-report/v1 artifact after each run.
 *
 * Usage — vitest.config.ts:
 *   import VitestEvalReporter from './vitest-eval-reporter.js';
 *   export default defineConfig({ test: { reporters: [new VitestEvalReporter()] } });
 *
 * Each test becomes one EvalRow. Annotate tests with eval metadata by calling
 * setEvalMeta(meta) anywhere in the test body; the reporter picks it up via
 * the task's meta object.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Reporter, File, Task } from 'vitest';
import type {
  EvalReportV1,
  EvalRow,
  EvalRowKind,
  EvalSeverity,
  EvalSuiteSummary,
} from '../../src/index.js';
import { EVAL_REPORT_SCHEMA_VERSION } from '../../src/index.js';

export type EvalRowMeta = {
  kind?: EvalRowKind;
  question?: string;
  input?: string;
  output?: string;
  expected?: string;
  severity?: EvalSeverity;
  category?: string;
  reason?: string;
  judgeModel?: string;
  judgeVerdict?: boolean;
  judgeReasoning?: string;
  agentVersion?: string;
  datasetId?: string;
  scenarioId?: string;
  metadata?: Record<string, unknown>;
};

/** Call inside a test body to attach eval metadata to the row. */
export const setEvalMeta = (task: Task, meta: EvalRowMeta): void => {
  // vitest exposes task.meta as a mutable object; we store our namespace there
  (task.meta as Record<string, unknown>)['eval'] = meta;
};

export type VitestEvalReporterOptions = {
  /** Output directory for the artifact. Default: .evals_output */
  outDir?: string;
  /** Suite name to use when a test file has no explicit suite annotation. Default: file basename */
  defaultSuite?: string;
  /** Project/team labels recorded in run.project / run.team */
  project?: string;
  team?: string;
};

export default class VitestEvalReporter implements Reporter {
  private readonly options: VitestEvalReporterOptions;

  constructor(options: VitestEvalReporterOptions = {}) {
    this.options = options;
  }

  async onFinished(files: File[] = []): Promise<void> {
    const outDir = this.options.outDir ?? '.evals_output';
    const runId = randomUUID();
    const generatedAt = new Date().toISOString();

    const rows: EvalRow[] = [];
    const suiteCounts = new Map<string, { total: number; passed: number; failed: number }>();

    for (const file of files) {
      const suite = this.options.defaultSuite ?? path.basename(file.name, path.extname(file.name));
      this.collectTasks(file.tasks ?? [], suite, rows, suiteCounts);
    }

    const suites: EvalSuiteSummary[] = Array.from(suiteCounts.entries()).map(
      ([id, counts]) => ({
        id,
        name: id,
        total: counts.total,
        passed: counts.passed,
        failed: counts.failed,
        passRate: counts.total > 0 ? counts.passed / counts.total : 0,
      }),
    );

    const report: EvalReportV1 = {
      schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
      run: {
        id: runId,
        generatedAt,
        project: this.options.project,
        team: this.options.team,
      },
      suites,
      rows,
    };

    await mkdir(outDir, { recursive: true });
    const filePath = path.join(outDir, `${runId}.json`);
    await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[eval-dashboards] artifact written to ${filePath}`);
  }

  private collectTasks(
    tasks: Task[],
    suite: string,
    rows: EvalRow[],
    suiteCounts: Map<string, { total: number; passed: number; failed: number }>,
  ): void {
    for (const task of tasks) {
      if (task.type === 'suite') {
        const childSuite = task.name ?? suite;
        this.collectTasks(task.tasks ?? [], childSuite, rows, suiteCounts);
        continue;
      }

      if (task.type !== 'test') continue;

      const passed = task.result?.state === 'pass';
      const evalMeta = (task.meta as Record<string, unknown>)?.['eval'] as EvalRowMeta | undefined;

      const counts = suiteCounts.get(suite) ?? { total: 0, passed: 0, failed: 0 };
      counts.total += 1;
      if (passed) counts.passed += 1;
      else counts.failed += 1;
      suiteCounts.set(suite, counts);

      const errorReason = task.result?.errors?.[0]?.message;

      rows.push({
        id: task.id ?? randomUUID(),
        suite,
        kind: evalMeta?.kind ?? 'deterministic',
        name: task.name,
        question: evalMeta?.question,
        input: evalMeta?.input,
        output: evalMeta?.output,
        expected: evalMeta?.expected,
        severity: evalMeta?.severity,
        category: evalMeta?.category,
        reason: evalMeta?.reason ?? (passed ? undefined : errorReason),
        judgeModel: evalMeta?.judgeModel,
        judgeVerdict: evalMeta?.judgeVerdict,
        judgeReasoning: evalMeta?.judgeReasoning,
        agentVersion: evalMeta?.agentVersion,
        datasetId: evalMeta?.datasetId,
        scenarioId: evalMeta?.scenarioId,
        durationMs: task.result?.duration,
        passed,
        metadata: evalMeta?.metadata,
      });
    }
  }
}
