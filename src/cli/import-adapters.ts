import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeEvalReportArtifact, type RunnerEvalCaseResult } from '../adapters/runner.js';
import type { EvalRow } from '../model/eval-report-v1.js';

export type ImportSource =
  | 'promptfoo'
  | 'deepeval'
  | 'agentevals'
  | 'ragas'
  | 'langfuse'
  | 'phoenix'
  | 'braintrust'
  | 'openai-evals';

export const importUsage = `eval-dashboards import --from=<source> --input=<path> [options]

Options:
  --from=<source>          Import source: promptfoo|deepeval|agentevals|ragas|langfuse|phoenix|braintrust|openai-evals|openevals.
                           openevals is accepted as an alias for agentevals.
  --input=<path>           Source JSON/JSONL path to convert.
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

  try {
    return JSON.parse(content) as unknown;
  } catch (jsonError) {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0) {
      throw Object.assign(new Error(`Import input ${filePath} is empty.`), { exitCode: 2 });
    }

    const parsedRows: unknown[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      try {
        parsedRows.push(JSON.parse(line) as unknown);
      } catch {
        throw Object.assign(
          new Error(
            `Import input ${filePath} is not valid JSON or JSONL (line ${index + 1} failed JSON.parse).`,
          ),
          { exitCode: 2, cause: jsonError },
        );
      }
    }

    return parsedRows;
  }
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

type RagasResult = {
  id?: string;
  suite?: string;
  question?: string;
  user_input?: string;
  answer?: string;
  response?: string;
  contexts?: unknown;
  ground_truth?: string;
  reference?: string;
  // Common Ragas metric columns (all optional; a given evaluation run typically
  // only populates the metrics that were actually requested).
  faithfulness?: number;
  answer_relevancy?: number;
  answer_correctness?: number;
  context_precision?: number;
  context_recall?: number;
  metadata?: { suite?: string; category?: string; severity?: ImportableSeverity };
};

type LangfuseScoreResult = {
  id?: string;
  name?: string;
  value?: number | boolean | string;
  stringValue?: string;
  dataType?: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL' | 'TEXT' | string;
  comment?: string;
  traceId?: string;
  trace_id?: string;
  observationId?: string;
  observation_id?: string;
  // Some exports flatten trace-level input/output alongside the score.
  input?: unknown;
  output?: unknown;
  trace?: { input?: unknown; output?: unknown; name?: string };
  suite?: string;
  metadata?: { suite?: string; category?: string; severity?: ImportableSeverity };
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

const RAGAS_METRIC_PASS_THRESHOLD = 0.5;

const ragasRows = (source: unknown, fallbackSuite: string): RunnerEvalCaseResult[] => {
  const list = resolveRowsContainer(source, {
    arrayLabel: 'a JSON array',
    objectLabel: 'Ragas result',
    keys: ['scores', 'results', 'rows'],
  });

  return list.map((entry, index) => {
    const row = entry as RagasResult;
    const suite = row.suite ?? row.metadata?.suite ?? fallbackSuite;
    const rowLabel = row.id ?? `${suite}-${index + 1}`;

    const metrics: Array<{ name: string; score: number }> = [];
    if (typeof row.faithfulness === 'number') metrics.push({ name: 'faithfulness', score: row.faithfulness });
    if (typeof row.answer_relevancy === 'number') {
      metrics.push({ name: 'answer_relevancy', score: row.answer_relevancy });
    }
    if (typeof row.answer_correctness === 'number') {
      metrics.push({ name: 'answer_correctness', score: row.answer_correctness });
    }
    if (typeof row.context_precision === 'number') {
      metrics.push({ name: 'context_precision', score: row.context_precision });
    }
    if (typeof row.context_recall === 'number') {
      metrics.push({ name: 'context_recall', score: row.context_recall });
    }

    if (metrics.length === 0) {
      throw Object.assign(
        new Error(`Unable to infer pass/fail for ragas row ${rowLabel} (suite: ${suite}): no known metric columns found.`),
        { exitCode: 2 },
      );
    }

    // Ragas does not emit an explicit pass/fail boolean for score-based metrics;
    // treat the row as passed only if every reported metric clears a 0.5 threshold.
    // This is a documented assumption, not a Ragas-defined convention.
    const passed = metrics.every((metric) => metric.score >= RAGAS_METRIC_PASS_THRESHOLD);
    const averageScore = metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length;
    const reason = metrics.map((metric) => `${metric.name}=${metric.score.toFixed(3)}`).join(', ');

    return {
      id: rowLabel,
      suite,
      passed,
      question: row.question ?? row.user_input,
      input: stringifyIfObject(row.question ?? row.user_input ?? row.contexts),
      output: row.answer ?? row.response,
      expected: stringifyIfObject(row.ground_truth ?? row.reference),
      score: averageScore,
      severity: row.metadata?.severity,
      category: row.metadata?.category,
      reason: `Ragas metrics (threshold ${RAGAS_METRIC_PASS_THRESHOLD}): ${reason}`,
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from ragas',
          sourceRef: 'ragas',
        },
        lifecycle: { status: 'active' },
      },
    };
  });
};

const langfuseRows = (source: unknown, fallbackSuite: string): RunnerEvalCaseResult[] => {
  const list = resolveRowsContainer(source, {
    arrayLabel: 'a JSON array',
    objectLabel: 'Langfuse result',
    keys: ['data', 'scores', 'results'],
  });

  return list.map((entry, index) => {
    const row = entry as LangfuseScoreResult;
    const suite = row.suite ?? row.metadata?.suite ?? fallbackSuite;
    const traceId = row.traceId ?? row.trace_id;
    const rowLabel = row.id ?? traceId ?? `${suite}-${index + 1}`;

    let passed: boolean | undefined;
    let score: number | undefined;

    if (typeof row.value === 'boolean') {
      passed = row.value;
      score = row.value ? 1 : 0;
    } else if (row.dataType === 'BOOLEAN' && typeof row.value === 'number') {
      passed = row.value === 1;
      score = row.value;
    } else if (typeof row.value === 'number') {
      score = row.value;
      passed = row.value >= RAGAS_METRIC_PASS_THRESHOLD;
    } else if (typeof row.value === 'string' || typeof row.stringValue === 'string') {
      // Prefer the explicit value/stringValue for categorical scores when present.
      const categorical = (row.value as string | undefined) ?? row.stringValue;
      const normalized = categorical?.toLowerCase();
      if (normalized === 'true' || normalized === 'pass' || normalized === 'correct') passed = true;
      if (normalized === 'false' || normalized === 'fail' || normalized === 'incorrect') passed = false;
    }

    if (passed === undefined) {
      throw Object.assign(
        new Error(`Unable to infer pass/fail for langfuse row ${rowLabel} (suite: ${suite}).`),
        { exitCode: 2 },
      );
    }

    return {
      id: rowLabel,
      suite,
      passed,
      name: row.name,
      question: row.trace?.name,
      input: stringifyIfObject(row.input ?? row.trace?.input),
      output: stringifyIfObject(row.output ?? row.trace?.output),
      score,
      severity: row.metadata?.severity,
      category: row.metadata?.category ?? row.name,
      reason: row.comment,
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from langfuse',
          sourceRef: 'langfuse',
        },
        lifecycle: { status: 'active' },
      },
    };
  });
};

type PhoenixResult = {
  id?: string;
  suite?: string;
  name?: string;
  question?: string;
  input?: unknown;
  output?: unknown;
  reference_output?: unknown;
  expected?: unknown;
  label?: string;
  score?: number;
  explanation?: string;
  reason?: string;
  traceId?: string;
  trace_id?: string;
  spanId?: string;
  span_id?: string;
  metadata?: { suite?: string; category?: string; severity?: ImportableSeverity };
};

type BraintrustResult = {
  id?: string;
  span_id?: string;
  suite?: string;
  input?: unknown;
  output?: unknown;
  expected?: unknown;
  scores?: Record<string, number>;
  metadata?: { suite?: string; category?: string; severity?: ImportableSeverity };
  tags?: string[];
};

const PHOENIX_PASS_LABELS = new Set(['correct', 'pass', 'passed', 'true', 'relevant']);
const PHOENIX_FAIL_LABELS = new Set(['incorrect', 'fail', 'failed', 'false', 'irrelevant']);

const phoenixRows = (source: unknown, fallbackSuite: string): RunnerEvalCaseResult[] => {
  const list = resolveRowsContainer(source, {
    arrayLabel: 'a JSON array',
    objectLabel: 'Phoenix result',
    keys: ['results', 'rows', 'evaluations'],
  });

  return list.map((entry, index) => {
    const row = entry as PhoenixResult;
    const suite = row.suite ?? row.metadata?.suite ?? fallbackSuite;
    const rowLabel = row.id ?? row.traceId ?? row.trace_id ?? `${suite}-${index + 1}`;

    let passed: boolean | undefined;
    if (typeof row.label === 'string') {
      const normalized = row.label.trim().toLowerCase();
      if (PHOENIX_PASS_LABELS.has(normalized)) passed = true;
      if (PHOENIX_FAIL_LABELS.has(normalized)) passed = false;
    }
    if (passed === undefined && typeof row.score === 'number') {
      passed = row.score >= RAGAS_METRIC_PASS_THRESHOLD;
    }

    if (passed === undefined) {
      throw Object.assign(
        new Error(`Unable to infer pass/fail for phoenix row ${rowLabel} (suite: ${suite}).`),
        { exitCode: 2 },
      );
    }

    return {
      id: rowLabel,
      suite,
      passed,
      name: row.name,
      question: row.question,
      input: stringifyIfObject(row.input ?? row.question),
      output: stringifyIfObject(row.output),
      expected: stringifyIfObject(row.reference_output ?? row.expected),
      score: row.score,
      severity: row.metadata?.severity,
      category: row.metadata?.category,
      reason: row.explanation ?? row.reason,
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from Arize Phoenix',
          sourceRef: 'phoenix',
        },
        lifecycle: { status: 'active' },
      },
    };
  });
};

const braintrustRows = (source: unknown, fallbackSuite: string): RunnerEvalCaseResult[] => {
  const list = resolveRowsContainer(source, {
    arrayLabel: 'a JSON array',
    objectLabel: 'Braintrust result',
    keys: ['results', 'rows', 'data'],
  });

  return list.map((entry, index) => {
    const row = entry as BraintrustResult;
    const suite = row.suite ?? row.metadata?.suite ?? fallbackSuite;
    const rowLabel = row.id ?? row.span_id ?? `${suite}-${index + 1}`;

    const scoreEntries = Object.entries(row.scores ?? {}).filter(
      (pair): pair is [string, number] => typeof pair[1] === 'number',
    );

    if (scoreEntries.length === 0) {
      throw Object.assign(
        new Error(
          `Unable to infer pass/fail for braintrust row ${rowLabel} (suite: ${suite}): no scores found.`,
        ),
        { exitCode: 2 },
      );
    }

    // Braintrust scorers report 0..1 scores per named scorer with no built-in
    // pass/fail boolean; treat the row as passed only if every scorer clears
    // a 0.5 threshold. This is a documented assumption, not a Braintrust convention.
    const passed = scoreEntries.every(([, value]) => value >= RAGAS_METRIC_PASS_THRESHOLD);
    const averageScore =
      scoreEntries.reduce((sum, [, value]) => sum + value, 0) / scoreEntries.length;
    const reason = scoreEntries.map(([name, value]) => `${name}=${value.toFixed(3)}`).join(', ');

    return {
      id: rowLabel,
      suite,
      passed,
      input: stringifyIfObject(row.input),
      output: stringifyIfObject(row.output),
      expected: stringifyIfObject(row.expected),
      score: averageScore,
      severity: row.metadata?.severity,
      category: row.metadata?.category ?? row.tags?.[0],
      reason: `Braintrust scores (threshold ${RAGAS_METRIC_PASS_THRESHOLD}): ${reason}`,
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from Braintrust',
          sourceRef: 'braintrust',
        },
        lifecycle: { status: 'active' },
      },
    };
  });
};

// OpenAI evals (`oaieval`) writes a JSONL "events" log: one `{"spec": ...}`
// header event, per-sample result events (commonly `type: "match"` from the
// basic Match eval, but other eval classes emit other type names such as
// "metrics" or "sampling"), and a trailing `{"final_report": {...}}` summary
// event. See https://github.com/openai/evals — evals/record.py RecorderBase.
type OpenAiEvalsEvent = {
  run_id?: string;
  event_id?: number;
  sample_id?: string;
  type?: string;
  data?: {
    correct?: boolean;
    expected?: unknown;
    picked?: unknown;
    sampled?: unknown;
    prompt?: unknown;
    score?: number;
    reason?: string;
  };
  spec?: { eval_name?: string; base_eval?: string };
  final_report?: Record<string, number>;
};

const OPENAI_EVALS_RESULT_EVENT_TYPES = new Set(['match', 'metrics', 'sampling']);

const openAiEvalsRows = (source: unknown, fallbackSuite: string): RunnerEvalCaseResult[] => {
  const events = resolveRowsContainer(source, {
    arrayLabel: 'a JSONL array of oaieval events',
    objectLabel: 'OpenAI evals result',
    keys: ['events'],
  }) as OpenAiEvalsEvent[];

  let suite = fallbackSuite;
  const specEvent = events.find((event) => typeof event?.spec?.eval_name === 'string');
  if (specEvent?.spec?.eval_name) {
    suite = specEvent.spec.eval_name;
  }

  const resultEvents = events.filter(
    (event) =>
      event &&
      typeof event === 'object' &&
      typeof event.type === 'string' &&
      OPENAI_EVALS_RESULT_EVENT_TYPES.has(event.type) &&
      event.data !== undefined,
  );

  if (resultEvents.length === 0) {
    throw Object.assign(
      new Error(
        `No OpenAI evals sample result events found (expected events with type in ${[...OPENAI_EVALS_RESULT_EVENT_TYPES].join('|')} and a data payload).`,
      ),
      { exitCode: 2 },
    );
  }

  return resultEvents.map((event, index) => {
    const data = event.data ?? {};
    const rowLabel = event.sample_id ?? `${suite}-${index + 1}`;

    let passed: boolean | undefined;
    if (typeof data.correct === 'boolean') {
      passed = data.correct;
    } else if (typeof data.score === 'number') {
      passed = data.score >= RAGAS_METRIC_PASS_THRESHOLD;
    }

    if (passed === undefined) {
      throw Object.assign(
        new Error(`Unable to infer pass/fail for openai-evals row ${rowLabel} (suite: ${suite}).`),
        { exitCode: 2 },
      );
    }

    return {
      id: rowLabel,
      suite,
      passed,
      input: stringifyIfObject(data.prompt),
      output: stringifyIfObject(data.sampled ?? data.picked),
      expected: stringifyIfObject(data.expected),
      score: typeof data.score === 'number' ? data.score : passed ? 1 : 0,
      reason: data.reason,
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from OpenAI evals (oaieval)',
          sourceRef: 'openai-evals',
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
  if (
    normalized === 'promptfoo' ||
    normalized === 'deepeval' ||
    normalized === 'agentevals' ||
    normalized === 'ragas' ||
    normalized === 'langfuse' ||
    normalized === 'phoenix' ||
    normalized === 'braintrust' ||
    normalized === 'openai-evals'
  ) {
    return normalized;
  }

  throw Object.assign(
    new Error(
      `Unknown import source ${rawSource}. Allowed values: promptfoo, deepeval, agentevals, ragas, langfuse, phoenix, braintrust, openai-evals, openevals.`,
    ),
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
        : options.source === 'agentevals'
          ? agentEvalsRows(parsed, fallbackSuite)
          : options.source === 'ragas'
            ? ragasRows(parsed, fallbackSuite)
            : options.source === 'langfuse'
              ? langfuseRows(parsed, fallbackSuite)
              : options.source === 'phoenix'
                ? phoenixRows(parsed, fallbackSuite)
                : options.source === 'braintrust'
                  ? braintrustRows(parsed, fallbackSuite)
                  : openAiEvalsRows(parsed, fallbackSuite);

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
