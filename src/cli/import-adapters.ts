import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeEvalReportArtifact, type RunnerEvalCaseResult } from '../adapters/runner.js';
import type { EvalRow } from '../model/eval-report-v1.js';

export type ImportSource = 'promptfoo' | 'deepeval' | 'agentevals';

export const importUsage = `eval-dashboards import --from=<source> --input=<path> [options]

Options:
  --from=<source>          Import source: promptfoo|deepeval|agentevals|openevals.
                           openevals is accepted as an alias for agentevals.
  --input=<path>           Source JSON path to convert.
  --out=<path>             Output eval-report/v1 file path.
                           Default: .evals_output/import-<source>.json
  --suite=<name>           Fallback suite name when source data has no suite.
                           Default: <source>-import
`;

type ImportableSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

type PromptfooResult = {
  id?: string;
  pass?: boolean;
  passed?: boolean;
  success?: boolean;
  score?: number;
  description?: string;
  prompt?: string;
  expected?: string;
  output?: string;
  response?: { output?: string; text?: string };
  gradingResult?: { pass?: boolean; score?: number; reason?: string; verdict?: string };
  vars?: Record<string, unknown>;
  testCase?: {
    id?: string;
    vars?: Record<string, unknown>;
    assert?: Array<{ value?: unknown; metric?: string }>;
    metadata?: { suite?: string; category?: string; severity?: ImportableSeverity };
  };
  metadata?: { suite?: string; category?: string; severity?: ImportableSeverity };
};

type DeepEvalResult = {
  id?: string;
  name?: string;
  input?: unknown;
  question?: string;
  actual_output?: string;
  output?: string;
  expected_output?: unknown;
  expected?: unknown;
  success?: boolean;
  pass?: boolean;
  passed?: boolean;
  verdict?: string;
  score?: number;
  reason?: string;
  metadata?: { suite?: string; category?: string; severity?: ImportableSeverity };
};

type AgentEvalsResult = {
  id?: string;
  suite?: string;
  name?: string;
  question?: string;
  input?: unknown;
  output?: unknown;
  expected?: unknown;
  passed?: boolean;
  pass?: boolean;
  success?: boolean;
  verdict?: string;
  score?: number;
  reason?: string;
  severity?: ImportableSeverity;
  category?: string;
  metadata?: {
    suite?: string;
    category?: string;
    severity?: ImportableSeverity;
    provenance?: EvalRow['metadata'] extends infer M ? M : never;
  };
};

const parseJsonFile = async (filePath: string): Promise<unknown> => {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as unknown;
};

const stringifyIfObject = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const inferPassFromSignals = (
  rowLabel: string,
  signals: Array<{ source: string; value: boolean }>,
): boolean | undefined => {
  if (signals.length === 0) {
    return undefined;
  }

  const hasTrue = signals.some((signal) => signal.value);
  const hasFalse = signals.some((signal) => !signal.value);

  if (hasTrue && hasFalse) {
    const signalSummary = signals.map((signal) => `${signal.source}=${signal.value ? 'pass' : 'fail'}`).join(', ');
    throw Object.assign(
      new Error(`Conflicting pass/fail signals for imported row ${rowLabel}: ${signalSummary}`),
      { exitCode: 2 },
    );
  }

  return signals[0]?.value;
};

const resolveRowsContainer = (
  source: unknown,
  options: { arrayLabel: string; objectLabel: string; keys: string[] },
): unknown[] => {
  if (Array.isArray(source)) {
    return source;
  }

  if (typeof source === 'object' && source !== null) {
    for (const key of options.keys) {
      const value = (source as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  throw Object.assign(
    new Error(
      `No ${options.objectLabel} rows found. Expected ${options.arrayLabel} or object with ${options.keys.join('|')}[].`,
    ),
    { exitCode: 2 },
  );
};

const promptfooRows = (source: unknown, fallbackSuite: string): RunnerEvalCaseResult[] => {
  const list = resolveRowsContainer(source, {
    arrayLabel: 'a JSON array',
    objectLabel: 'promptfoo result',
    keys: ['results'],
  });

  return list.map((entry, index) => {
    const row = entry as PromptfooResult;
    const rowLabel = row.id ?? row.testCase?.id ?? `index ${index}`;
    const signals: Array<{ source: string; value: boolean }> = [];

    if (typeof row.pass === 'boolean') signals.push({ source: 'pass', value: row.pass });
    if (typeof row.passed === 'boolean') signals.push({ source: 'passed', value: row.passed });
    if (typeof row.success === 'boolean') signals.push({ source: 'success', value: row.success });
    if (typeof row.gradingResult?.pass === 'boolean') {
      signals.push({ source: 'gradingResult.pass', value: row.gradingResult.pass });
    }
    if (typeof row.gradingResult?.verdict === 'string') {
      const verdict = row.gradingResult.verdict.toLowerCase();
      if (verdict === 'pass') signals.push({ source: 'gradingResult.verdict', value: true });
      if (verdict === 'fail') signals.push({ source: 'gradingResult.verdict', value: false });
    }

    const passed = inferPassFromSignals(rowLabel, signals);
    const suite = row.testCase?.metadata?.suite ?? row.metadata?.suite ?? fallbackSuite;

    if (passed === undefined) {
      throw Object.assign(
        new Error(`Unable to infer pass/fail for promptfoo row ${rowLabel} (suite: ${suite}).`),
        { exitCode: 2 },
      );
    }

    const expectedFromAssert = row.testCase?.assert?.[0]?.value;

    return {
      id: rowLabel,
      suite,
      passed,
      name: row.description,
      question: row.description,
      input: stringifyIfObject(row.vars ?? row.testCase?.vars ?? row.prompt),
      output: row.output ?? row.response?.output ?? row.response?.text,
      expected: stringifyIfObject(row.expected ?? expectedFromAssert),
      score: typeof row.score === 'number' ? row.score : row.gradingResult?.score,
      severity: row.testCase?.metadata?.severity ?? row.metadata?.severity,
      category: row.testCase?.metadata?.category ?? row.metadata?.category,
      reason: row.gradingResult?.reason,
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from promptfoo',
          sourceRef: 'promptfoo',
        },
        lifecycle: { status: 'active' },
      },
    };
  });
};

const deepEvalRows = (source: unknown, fallbackSuite: string): RunnerEvalCaseResult[] => {
  const list = resolveRowsContainer(source, {
    arrayLabel: 'a JSON array',
    objectLabel: 'DeepEval result',
    keys: ['test_results', 'results'],
  });

  return list.map((entry, index) => {
    const row = entry as DeepEvalResult;
    const rowLabel = row.id ?? row.name ?? `index ${index}`;
    const signals: Array<{ source: string; value: boolean }> = [];

    if (typeof row.pass === 'boolean') signals.push({ source: 'pass', value: row.pass });
    if (typeof row.passed === 'boolean') signals.push({ source: 'passed', value: row.passed });
    if (typeof row.success === 'boolean') signals.push({ source: 'success', value: row.success });
    if (typeof row.verdict === 'string') {
      const verdict = row.verdict.toLowerCase();
      if (verdict === 'pass') signals.push({ source: 'verdict', value: true });
      if (verdict === 'fail') signals.push({ source: 'verdict', value: false });
    }

    const passed = inferPassFromSignals(rowLabel, signals);
    const suite = row.metadata?.suite ?? fallbackSuite;

    if (passed === undefined) {
      throw Object.assign(
        new Error(`Unable to infer pass/fail for deepeval row ${rowLabel} (suite: ${suite}).`),
        { exitCode: 2 },
      );
    }

    return {
      id: row.id ?? `${suite}-${index + 1}`,
      suite,
      passed,
      name: row.name,
      question: row.question ?? row.name,
      input: stringifyIfObject(row.input ?? row.question),
      output: row.actual_output ?? row.output,
      expected: stringifyIfObject(row.expected_output ?? row.expected),
      score: row.score,
      severity: row.metadata?.severity,
      category: row.metadata?.category,
      reason: row.reason,
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from deepeval',
          sourceRef: 'deepeval',
        },
        lifecycle: { status: 'active' },
      },
    };
  });
};

const agentEvalsRows = (source: unknown, fallbackSuite: string): RunnerEvalCaseResult[] => {
  const list = resolveRowsContainer(source, {
    arrayLabel: 'a JSON array',
    objectLabel: 'AgentEvals result',
    keys: ['rows', 'results'],
  });

  return list.map((entry, index) => {
    const row = entry as AgentEvalsResult;
    const suite = row.suite ?? row.metadata?.suite ?? fallbackSuite;
    const rowLabel = row.id ?? `${suite}-${index + 1}`;
    const signals: Array<{ source: string; value: boolean }> = [];

    if (typeof row.pass === 'boolean') signals.push({ source: 'pass', value: row.pass });
    if (typeof row.passed === 'boolean') signals.push({ source: 'passed', value: row.passed });
    if (typeof row.success === 'boolean') signals.push({ source: 'success', value: row.success });
    if (typeof row.verdict === 'string') {
      const verdict = row.verdict.toLowerCase();
      if (verdict === 'pass') signals.push({ source: 'verdict', value: true });
      if (verdict === 'fail') signals.push({ source: 'verdict', value: false });
    }

    const passed = inferPassFromSignals(rowLabel, signals);

    if (passed === undefined) {
      throw Object.assign(
        new Error(`Unable to infer pass/fail for agentevals row ${rowLabel} (suite: ${suite}).`),
        { exitCode: 2 },
      );
    }

    return {
      id: row.id ?? rowLabel,
      suite,
      passed,
      name: row.name,
      question: row.question,
      input: stringifyIfObject(row.input),
      output: stringifyIfObject(row.output),
      expected: stringifyIfObject(row.expected),
      score: row.score,
      severity: row.severity ?? row.metadata?.severity,
      category: row.category ?? row.metadata?.category,
      reason: row.reason,
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from agentevals',
          sourceRef: 'agentevals',
        },
        lifecycle: { status: 'active' },
      },
    };
  });
};

export const resolveImportSource = (rawSource: string): ImportSource => {
  const normalized = rawSource.trim().toLowerCase();
  if (normalized === 'openevals') {
    return 'agentevals';
  }
  if (normalized === 'promptfoo' || normalized === 'deepeval' || normalized === 'agentevals') {
    return normalized;
  }

  throw Object.assign(
    new Error(`Unknown import source ${rawSource}. Allowed values: promptfoo, deepeval, agentevals, openevals.`),
    { exitCode: 2 },
  );
};

export const importFromSource = async (options: {
  source: ImportSource;
  inputPath: string;
  outPath: string;
  suiteName?: string;
}): Promise<{ outPath: string; rowCount: number }> => {
  const parsed = await parseJsonFile(options.inputPath);
  const fallbackSuite = options.suiteName || `${options.source}-import`;

  const cases =
    options.source === 'promptfoo'
      ? promptfooRows(parsed, fallbackSuite)
      : options.source === 'deepeval'
        ? deepEvalRows(parsed, fallbackSuite)
        : agentEvalsRows(parsed, fallbackSuite);

  await writeEvalReportArtifact(
    options.outPath,
    {
      run: {
        id: `import-${options.source}-${new Date().toISOString()}`,
        project: path.basename(process.cwd()),
      },
      cases,
      metadata: {
        importSource: options.source,
        importInputPath: options.inputPath,
      },
    },
    {
      mapRow: (caseResult, index): EvalRow => ({
        id: caseResult.id ?? `${caseResult.suite}-${index + 1}`,
        suite: caseResult.suite,
        passed: caseResult.passed,
        kind: 'deterministic',
        severity: caseResult.severity ?? 'none',
        name: caseResult.name,
        question: caseResult.question,
        input: caseResult.input,
        output: caseResult.output,
        expected: caseResult.expected,
        score: caseResult.score,
        category: caseResult.category,
        reason: caseResult.reason,
        metadata: caseResult.metadata,
      }),
    },
  );

  return {
    outPath: options.outPath,
    rowCount: cases.length,
  };
};
