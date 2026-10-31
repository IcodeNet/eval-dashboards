import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeEvalReportArtifact, type RunnerEvalCaseResult } from '../adapters/runner.js';
import type { EvalRow } from '../model/eval-report-v1.js';

export type ImportSource =
  | 'promptfoo'
  | 'deepeval'
  | 'agentevals'
  | 'langsmith'
  | 'ragas'
  | 'langfuse'
  | 'phoenix'
  | 'braintrust'
  | 'openai-evals'
  | 'eval-ai-library'
  | 'inspect-ai'
  | 'otel-genai';

export const importUsage = `eval-dashboards import --from=<source> --input=<path> [options]

Options:
  --from=<source>          Import source: promptfoo|deepeval|agentevals|langsmith|ragas|langfuse|phoenix|braintrust|openai-evals|eval-ai-library|inspect-ai|otel-genai|openevals|oaievals.
                           openevals is accepted as an alias for agentevals.
                           inspect is accepted as an alias for inspect-ai.
                           oaievals, oaieval, and openai-eval are accepted aliases for openai-evals.
  --input=<path>           Source JSON/JSONL path to convert.
  --out=<path>             Output eval-report/v1 file path.
                           Default: .evals_output/import-<source>.json
  --suite=<name>           Fallback suite name when source data has no suite.
                           Default: <source>-import
  --case-id-attribute=<key>
                           otel-genai only. Attribute holding a stable case id
                           (read from the event or log record, then the span
                           for span events, then the resource).
                           Row ids become <caseId>:<metric> and stay stable
                           across runs. Every event must carry it.
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
  latencyMs?: number;
  response?: { output?: string; text?: string; latencyMs?: number; error?: unknown };
  gradingResult?: {
    pass?: boolean;
    score?: number;
    reason?: string;
    comment?: string;
    verdict?: string;
    componentResults?: Array<{
      pass?: boolean;
      score?: number;
      reason?: string;
      assertion?: {
        type?: string;
        value?: unknown;
        threshold?: number;
        weight?: number;
      };
    }>;
  };
  vars?: Record<string, unknown>;
  testCase?: {
    id?: string;
    vars?: Record<string, unknown>;
    assert?: Array<{ value?: unknown; metric?: string }>;
    metadata?: (Record<string, unknown> & { suite?: string; category?: string; severity?: ImportableSeverity });
  };
  metadata?: (Record<string, unknown> & { suite?: string; category?: string; severity?: ImportableSeverity });
  providerResponse?: { error?: unknown };
  error?: unknown;
  failureReason?: number | string;
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

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
};

const promptfooGeneratedId = (row: PromptfooResult, suite: string): string => {
  const fingerprint = stableSerialize({
    suite,
    description: row.description ?? null,
    vars: row.vars ?? row.testCase?.vars ?? null,
    prompt: row.prompt ?? null,
    expected: row.expected ?? row.testCase?.assert?.[0]?.value ?? null,
  });

  const digest = createHash('sha1').update(fingerprint).digest('hex').slice(0, 12);
  return `promptfoo-${digest}`;
};

const promptfooErrorText = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'object' && value !== null) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim().length > 0) return message.trim();
  }
  return stringifyIfObject(value);
};


const promptfooChecks = (row: PromptfooResult): RunnerEvalCaseResult['checks'] | undefined => {
  const componentResults = row.gradingResult?.componentResults;
  if (!Array.isArray(componentResults) || componentResults.length === 0) {
    return undefined;
  }

  const checks: NonNullable<RunnerEvalCaseResult['checks']> = [];
  componentResults.forEach((component, index) => {
    if (typeof component?.pass !== 'boolean') return;
    const assertion = component.assertion;
    const type = typeof assertion?.type === 'string' && assertion.type.trim().length > 0
      ? assertion.type.trim()
      : `promptfoo-assertion-${index + 1}`;
    checks.push({
      type,
      pass: component.pass,
      ...(assertion && Object.prototype.hasOwnProperty.call(assertion, 'value')
        ? { expected: assertion.value }
        : {}),
      ...(typeof component.score === 'number' && Number.isFinite(component.score) ? { actual: component.score } : {}),
      ...(typeof assertion?.threshold === 'number' && Number.isFinite(assertion.threshold) ? { threshold: assertion.threshold } : {}),
      ...(typeof assertion?.weight === 'number' && Number.isFinite(assertion.weight) ? { weight: assertion.weight } : {}),
    });
  });

  return checks.length > 0 ? checks : undefined;
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
  score_metadata?: unknown;
  scoreMetadata?: unknown;
  score_provenance?: unknown;
  scoreProvenance?: unknown;
  author_user_id?: string;
  config_id?: string;
  queue_id?: string;
  evaluator_id?: string;
  evaluation_rule_id?: string;
  execution_trace_id?: string;
};

type LangsmithFeedback = {
  key?: string;
  score?: number;
  value?: boolean | number | string;
  comment?: string;
};

type LangsmithRun = {
  id?: string;
  address?: unknown;
  name?: string;
  pass?: boolean;
  passed?: boolean;
  success?: boolean;
  status?: string;
  error?: unknown;
  score?: number;
  inputs?: unknown;
  input?: unknown;
  outputs?: unknown;
  output?: unknown;
  reference_output?: unknown;
  expected?: unknown;
  latency_ms?: number;
  latencyMs?: number;
  session_name?: string;
  project_name?: string;
  revision_id?: string;
  revisionId?: string;
  feedback?: LangsmithFeedback[];
  feedback_stats?: Record<string, number | { avg?: number; mean?: number; score?: number }>;
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


const resolvePromptfooRows = (source: unknown): unknown[] => {
  if (Array.isArray(source)) {
    return source;
  }

  if (typeof source === 'object' && source !== null) {
    const root = source as Record<string, unknown>;
    if (Array.isArray(root.results)) {
      return root.results;
    }
    const nestedResults = root.results;
    if (typeof nestedResults === 'object' && nestedResults !== null) {
      const outputs = (nestedResults as Record<string, unknown>).outputs;
      if (Array.isArray(outputs)) {
        return outputs;
      }
    }
    if (Array.isArray(root.outputs)) {
      return root.outputs;
    }
  }

  throw Object.assign(
    new Error(
      'No promptfoo result rows found. Expected a JSON array, object with results[], or object with results.outputs[].',
    ),
    { exitCode: 2 },
  );
};

const promptfooRows = (source: unknown, fallbackSuite: string): RunnerEvalCaseResult[] => {
  const list = resolvePromptfooRows(source);

  const usedIds = new Set<string>();
  for (const entry of list) {
    const row = entry as PromptfooResult;
    const explicitId = row.id ?? row.testCase?.id;
    if (explicitId !== undefined) usedIds.add(explicitId);
  }

  return list.map((entry, index) => {
    const row = entry as PromptfooResult;
    const suite = row.testCase?.metadata?.suite ?? row.metadata?.suite ?? fallbackSuite;
    const explicitId = row.id ?? row.testCase?.id;
    const baseId = explicitId ?? promptfooGeneratedId(row, suite);
    let id = baseId;
    if (explicitId === undefined) {
      let suffix = 2;
      while (usedIds.has(id)) id = `${baseId}#${suffix++}`;
      usedIds.add(id);
    }
    const rowLabel = explicitId ?? id;
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

    let passed = inferPassFromSignals(rowLabel, signals);

    const promptfooError =
      promptfooErrorText(row.error) ??
      promptfooErrorText(row.response?.error) ??
      promptfooErrorText(row.providerResponse?.error);
    const hasProviderError =
      promptfooError !== undefined || row.failureReason === 2 || row.failureReason === 'error' || row.failureReason === 'provider-error';

    if (hasProviderError) {
      passed = false;
    }

    if (passed === undefined) {
      throw Object.assign(
        new Error(`Unable to infer pass/fail for promptfoo row ${rowLabel} (suite: ${suite}).`),
        { exitCode: 2 },
      );
    }

    const expectedFromAssert = row.testCase?.assert?.[0]?.value;

    const sessionId =
      (typeof row.testCase?.metadata?.sessionId === 'string'
        ? row.testCase.metadata.sessionId
        : undefined) ??
      (typeof row.metadata?.sessionId === 'string' ? row.metadata.sessionId : undefined);

    return {
      id,
      suite,
      passed,
      name: row.description,
      question: row.description,
      input: stringifyIfObject(row.vars ?? row.testCase?.vars ?? row.prompt),
      output: row.output ?? row.response?.output ?? row.response?.text,
      expected: stringifyIfObject(row.expected ?? expectedFromAssert),
      score:
        typeof row.score === 'number'
          ? row.score
          : typeof row.gradingResult?.score === 'number'
            ? row.gradingResult.score
            : hasProviderError
              ? 0
              : undefined,
      severity: row.testCase?.metadata?.severity ?? row.metadata?.severity,
      category: row.testCase?.metadata?.category ?? row.metadata?.category,
      reason:
        (row.gradingResult?.reason?.trim() ? row.gradingResult.reason : undefined) ??
        (row.gradingResult?.comment?.trim() ? row.gradingResult.comment : undefined) ??
        promptfooError ??
        (row.failureReason !== undefined ? `promptfoo failureReason=${String(row.failureReason)}` : undefined),
      durationMs: row.latencyMs ?? row.response?.latencyMs,
      checks: promptfooChecks(row),
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from promptfoo',
          sourceRef: 'promptfoo',
        },
        lifecycle: { status: 'active' },
        ...(sessionId ? { sourceSessionId: sessionId } : {}),
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

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
};

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

const langfuseScoreProvenance = (row: LangfuseScoreResult): Record<string, unknown> | undefined => {
  const nested = asRecord(row.score_provenance) ?? asRecord(row.scoreProvenance);
  const flattened = {
    ...(typeof row.author_user_id === 'string' ? { author_user_id: row.author_user_id } : {}),
    ...(typeof row.config_id === 'string' ? { config_id: row.config_id } : {}),
    ...(typeof row.queue_id === 'string' ? { queue_id: row.queue_id } : {}),
    ...(typeof row.evaluator_id === 'string' ? { evaluator_id: row.evaluator_id } : {}),
    ...(typeof row.evaluation_rule_id === 'string' ? { evaluation_rule_id: row.evaluation_rule_id } : {}),
    ...(typeof row.execution_trace_id === 'string' ? { execution_trace_id: row.execution_trace_id } : {}),
  };

  if (nested && Object.keys(flattened).length > 0) {
    return { ...nested, ...flattened };
  }
  if (nested) return nested;
  return Object.keys(flattened).length > 0 ? flattened : undefined;
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

    // Scheduled blob exports call this field group score_metadata, but emit its
    // values under a metadata column. Also accept explicitly grouped exports.
    const scoreMetadata = asRecord(row.score_metadata) ?? asRecord(row.scoreMetadata) ?? asRecord(row.metadata);
    const scoreProvenance = langfuseScoreProvenance(row);

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
        ...(scoreMetadata ? { langfuseScoreMetadata: scoreMetadata } : {}),
        ...(scoreProvenance ? { langfuseScoreProvenance: scoreProvenance } : {}),
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

type InspectAiScore = {
  value?: boolean | number | string;
  answer?: string;
  explanation?: string;
  text?: string;
};

type InspectAiSample = {
  id?: string | number;
  sample_id?: string | number;
  epoch?: number;
  input?: unknown;
  target?: unknown;
  output?: unknown;
  scores?: Record<string, InspectAiScore | number | boolean | string>;
  error?: { message?: string } | string;
  description?: string;
};

type InspectAiEvalLog = {
  eval?: {
    eval_id?: string;
    task?: string;
    task_id?: string;
    task_file?: string;
    task_display_name?: string;
    description?: string;
  };
  samples?: InspectAiSample[];
};


const LANGSMITH_PASS_STATUS = new Set(['success', 'succeeded', 'completed', 'ok']);
const LANGSMITH_FAIL_STATUS = new Set(['error', 'failed', 'failure']);

const langsmithRows = (source: unknown, fallbackSuite: string): RunnerEvalCaseResult[] => {
  const list = resolveRowsContainer(source, {
    arrayLabel: 'a JSON array',
    objectLabel: 'LangSmith result',
    keys: ['runs', 'data', 'results'],
  });

  return list.map((entry, index) => {
    const row = entry as LangsmithRun;
    const suite = row.session_name ?? row.project_name ?? row.metadata?.suite ?? fallbackSuite;
    const rowIdentity = row.id;
    const rowLabel = rowIdentity ?? `${suite}-${index + 1}`;

    const signals: Array<{ source: string; value: boolean }> = [];
    let successfulStatus = false;
    if (typeof row.pass === 'boolean') signals.push({ source: 'pass', value: row.pass });
    if (typeof row.passed === 'boolean') signals.push({ source: 'passed', value: row.passed });
    if (typeof row.success === 'boolean') signals.push({ source: 'success', value: row.success });
    if (typeof row.status === 'string') {
      const status = row.status.trim().toLowerCase();
      if (LANGSMITH_PASS_STATUS.has(status)) successfulStatus = true;
      if (LANGSMITH_FAIL_STATUS.has(status)) signals.push({ source: 'status', value: false });
    }
    if (row.error !== undefined && row.error !== null) {
      signals.push({ source: 'error', value: false });
    }

    let score = typeof row.score === 'number' ? row.score : undefined;
    let category = row.metadata?.category;
    let reason: string | undefined;
    const numericFeedbackScores: Array<{ key?: string; score: number }> = [];
    let fallbackFeedbackCategory: string | undefined;

    if (Array.isArray(row.feedback) && row.feedback.length > 0) {
      const firstFeedback = row.feedback.find((feedback) => typeof feedback?.key === 'string');
      fallbackFeedbackCategory = firstFeedback?.key;

      for (const feedback of row.feedback) {
        if (typeof feedback?.score === 'number') {
          numericFeedbackScores.push({ key: feedback.key, score: feedback.score });
        } else if (typeof feedback?.value === 'number') {
          numericFeedbackScores.push({ key: feedback.key, score: feedback.value });
        }
      }

      const feedbackReason = row.feedback.find((feedback) => typeof feedback?.comment === 'string')?.comment;
      if (typeof feedbackReason === 'string') {
        reason = feedbackReason;
      }

      for (const feedback of row.feedback) {
        if (typeof feedback?.value === 'boolean') {
          signals.push({ source: `feedback:${feedback.key ?? 'value'}`, value: feedback.value });
        }
        if (typeof feedback?.value === 'string') {
          const normalized = feedback.value.trim().toLowerCase();
          if (normalized === 'pass' || normalized === 'passed' || normalized === 'true') {
            signals.push({ source: `feedback:${feedback.key ?? 'value'}`, value: true });
          }
          if (normalized === 'fail' || normalized === 'failed' || normalized === 'false') {
            signals.push({ source: `feedback:${feedback.key ?? 'value'}`, value: false });
          }
        }
      }
    }

    if (score === undefined && row.feedback_stats && typeof row.feedback_stats === 'object') {
      for (const [feedbackKey, metric] of Object.entries(row.feedback_stats)) {
        if (typeof metric === 'number') {
          numericFeedbackScores.push({ key: feedbackKey, score: metric });
          continue;
        }
        if (metric && typeof metric === 'object') {
          const feedbackScore =
            typeof metric.avg === 'number'
              ? metric.avg
              : typeof metric.mean === 'number'
                ? metric.mean
                : metric.score;
          if (typeof feedbackScore === 'number') {
            numericFeedbackScores.push({ key: feedbackKey, score: feedbackScore });
          }
        }
      }
    }

    if (score === undefined && numericFeedbackScores.length > 0) {
      const lowestFeedback = numericFeedbackScores.reduce((lowest, candidate) =>
        candidate.score < lowest.score ? candidate : lowest,
      );
      score = lowestFeedback.score;
      if (category === undefined && lowestFeedback.key) category = lowestFeedback.key;
    }
    if (category === undefined && fallbackFeedbackCategory) category = fallbackFeedbackCategory;

    let passed = inferPassFromSignals(rowLabel, signals);
    if (passed === undefined && typeof score === 'number') {
      passed = score >= RAGAS_METRIC_PASS_THRESHOLD;
    }

    if (passed === undefined && successfulStatus) passed = true;

    if (passed === undefined) {
      throw Object.assign(
        new Error(`Unable to infer pass/fail for langsmith row ${rowLabel} (suite: ${suite}).`),
        { exitCode: 2 },
      );
    }

    if (reason === undefined && row.error !== undefined && row.error !== null) {
      reason = typeof row.error === 'string' ? row.error : stringifyIfObject(row.error);
    }

    return {
      id: rowIdentity ?? rowLabel,
      suite,
      passed,
      name: row.name,
      input: stringifyIfObject(row.inputs ?? row.input),
      output: stringifyIfObject(row.outputs ?? row.output),
      expected: stringifyIfObject(row.reference_output ?? row.expected),
      score,
      severity: row.metadata?.severity,
      category,
      reason,
      durationMs: row.latency_ms ?? row.latencyMs,
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from LangSmith runs export',
          sourceRef: 'langsmith',
        },
        lifecycle: { status: 'active' },
        ...(row.address !== undefined && row.address !== null
          ? { langsmithAddress: row.address }
          : {}),
        ...(row.revision_id || row.revisionId
          ? { langsmithRevisionId: row.revision_id || row.revisionId }
          : {}),
      },
    };
  });
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



const inspectAiRows = (source: unknown, fallbackSuite: string): RunnerEvalCaseResult[] => {
  const flattened: Array<{ sample: InspectAiSample; suite: string; evalId?: string; taskDescription?: string }> = [];

  const appendLog = (log: InspectAiEvalLog): void => {
    const samples = log.samples;
    if (!Array.isArray(samples)) return;

    const suite = log.eval?.task ?? log.eval?.task_display_name ?? log.eval?.task_id ?? log.eval?.task_file ?? fallbackSuite;
    for (const sample of samples) {
      flattened.push({
        sample,
        suite,
        evalId: log.eval?.eval_id,
        taskDescription: log.eval?.description,
      });
    }
  };

  if (Array.isArray(source)) {
    const asLogs = source as InspectAiEvalLog[];
    if (asLogs.some((entry) => Array.isArray(entry?.samples))) {
      for (const log of asLogs) appendLog(log);
    } else {
      for (const sample of source as InspectAiSample[]) {
        flattened.push({ sample, suite: fallbackSuite });
      }
    }
  } else if (source && typeof source === 'object') {
    const objectSource = source as Record<string, unknown>;
    if (Array.isArray(objectSource.samples)) {
      appendLog(source as InspectAiEvalLog);
    } else if (Array.isArray(objectSource.logs)) {
      for (const log of objectSource.logs as InspectAiEvalLog[]) appendLog(log);
    } else if (Array.isArray(objectSource.results)) {
      for (const sample of objectSource.results as InspectAiSample[]) {
        flattened.push({ sample, suite: fallbackSuite });
      }
    }
  }

  if (flattened.length === 0) {
    throw Object.assign(
      new Error('No inspect-ai sample rows found. Expected samples[] on a log object, logs[], or a sample array.'),
      { exitCode: 2 },
    );
  }

  return flattened.map(({ sample, suite, evalId, taskDescription }, index) => {
    const rowLabel = String(sample.id ?? sample.sample_id ?? `${suite}-${index + 1}`);

    const scoreEntries = Object.entries(sample.scores ?? {});
    const scoreValues: number[] = [];

    for (const [, rawScore] of scoreEntries) {
      if (typeof rawScore === 'number') {
        scoreValues.push(rawScore);
        continue;
      }
      if (typeof rawScore === 'boolean') {
        scoreValues.push(rawScore ? 1 : 0);
        continue;
      }
      if (typeof rawScore === 'object' && rawScore !== null) {
        const value = (rawScore as InspectAiScore).value;
        if (typeof value === 'number') scoreValues.push(value);
        if (typeof value === 'boolean') {
          scoreValues.push(value ? 1 : 0);
        }
      }
    }

    let passed: boolean | undefined;
    if (sample.error !== undefined && sample.error !== null) {
      passed = false;
    } else if (scoreValues.length > 0) {
      passed = scoreValues.every((value) => value >= RAGAS_METRIC_PASS_THRESHOLD);
    }

    if (passed === undefined) {
      throw Object.assign(
        new Error(
          `Unable to infer pass/fail for inspect-ai row ${rowLabel} (suite: ${suite}): no error and no numeric/boolean scores found.`,
        ),
        { exitCode: 2 },
      );
    }

    const averageScore =
      scoreValues.length > 0 ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length : passed ? 1 : 0;

    const scoreReason = scoreEntries
      .map(([name, rawScore]) => {
        if (typeof rawScore === 'number' || typeof rawScore === 'boolean') return `${name}=${String(rawScore)}`;
        if (typeof rawScore === 'object' && rawScore !== null && 'value' in rawScore) {
          return `${name}=${String((rawScore as InspectAiScore).value)}`;
        }
        return undefined;
      })
      .filter((value): value is string => value !== undefined)
      .join(', ');

    const errorReason =
      typeof sample.error === 'string'
        ? sample.error
        : sample.error && typeof sample.error === 'object' && typeof sample.error.message === 'string'
          ? sample.error.message
          : undefined;

    return {
      id: rowLabel,
      suite,
      passed,
      question: sample.description ?? taskDescription,
      input: stringifyIfObject(sample.input),
      output: stringifyIfObject(sample.output),
      expected: stringifyIfObject(sample.target),
      score: averageScore,
      reason: errorReason ?? (scoreReason ? `Inspect scores: ${scoreReason}` : undefined),
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from Inspect AI eval logs',
          sourceRef: 'inspect-ai',
        },
        lifecycle: { status: 'active' },
        ...(evalId ? { inspectEvalId: evalId } : {}),
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

// eval-ai-library (https://github.com/meshkovQA/eval-ai-library,
// docs https://library.eval-ai.com/) emits `TestCaseResult` objects with a
// `metrics_data: MetricResult[]` array. Each `MetricResult` has:
//   { name, score, threshold, success, reason, evaluation_model, evaluation_cost, evaluation_log }
// (see library.eval-ai.com/advanced/api-reference). We only convert this
// shape into eval-report/v1 rows/suites here — no scoring/harness logic.
type EvalAiLibraryMetricResult = {
  name?: string;
  score?: number;
  threshold?: number;
  success?: boolean;
  reason?: string;
  evaluation_model?: string;
  evaluation_cost?: number | null;
};

type EvalAiLibraryTestCaseResult = {
  id?: string;
  suite?: string;
  name?: string;
  input?: string;
  actual_output?: string;
  expected_output?: string | null;
  retrieval_context?: string[] | null;
  success?: boolean;
  metrics_data?: EvalAiLibraryMetricResult[];
  metadata?: { suite?: string; category?: string; severity?: ImportableSeverity };
};

// Maps eval-ai-library's named metrics onto this repo's `category`/`riskArea`
// taxonomy fields. See docs/taxonomy.md#eval-ai-library-metric-mapping for the
// documented reference table cross-linked from docs/taxonomy.md. `riskArea`
// values are drawn from the suite-manifest `riskArea` enum in docs/taxonomy.md
// section 2.1; `category` is free-text row-level taxonomy per section 1.2.
export const EVAL_AI_LIBRARY_METRIC_TAXONOMY: Record<
  string,
  { category: string; riskArea: string }
> = {
  answer_relevancy: { category: 'relevance', riskArea: 'relevance' },
  answer_precision: { category: 'relevance', riskArea: 'relevance' },
  faithfulness: { category: 'groundedness', riskArea: 'groundedness' },
  contextual_relevancy: { category: 'retrieval-quality', riskArea: 'relevance' },
  contextual_precision: { category: 'retrieval-quality', riskArea: 'relevance' },
  contextual_recall: { category: 'retrieval-quality', riskArea: 'groundedness' },
  bias: { category: 'bias', riskArea: 'content-safety' },
  toxicity: { category: 'toxicity', riskArea: 'content-safety' },
  restricted_refusal: { category: 'over-refusal', riskArea: 'response-quality' },
  tool_correctness: { category: 'tool-use', riskArea: 'tool-use' },
  task_success_rate: { category: 'task-completion', riskArea: 'response-quality' },
  goal_achievement_rate: { category: 'task-completion', riskArea: 'response-quality' },
  conversational_flow_rate: { category: 'conversation-quality', riskArea: 'response-quality' },
  repetitive_pattern_detection: { category: 'repetition', riskArea: 'response-quality' },
  failure_rate: { category: 'reliability', riskArea: 'response-quality' },
  role_adherence: { category: 'role-adherence', riskArea: 'tone-of-voice' },
  knowledge_retention: { category: 'knowledge-retention', riskArea: 'factuality' },
  tools_error: { category: 'tool-use', riskArea: 'tool-use' },
  prompt_injection_detection: { category: 'prompt-injection', riskArea: 'prompt-safety' },
  jailbreak_detection: { category: 'jailbreak', riskArea: 'prompt-safety' },
  pii_leakage: { category: 'pii-leakage', riskArea: 'pii' },
  harmful_content: { category: 'harmful-content', riskArea: 'content-safety' },
  prompt_injection_resistance: { category: 'prompt-injection', riskArea: 'prompt-safety' },
  jailbreak_resistance: { category: 'jailbreak', riskArea: 'prompt-safety' },
  policy_compliance: { category: 'policy-compliance', riskArea: 'compliance' },
  exact_match: { category: 'correctness', riskArea: 'factuality' },
  semantic_similarity: { category: 'correctness', riskArea: 'factuality' },
  reference_match: { category: 'correctness', riskArea: 'factuality' },
};

const evalAiLibraryRows = (source: unknown, fallbackSuite: string): RunnerEvalCaseResult[] => {
  const list = resolveRowsContainer(source, {
    arrayLabel: 'a JSON array',
    objectLabel: 'eval-ai-library result',
    keys: ['results', 'test_cases', 'rows'],
  });

  return list.map((entry, index) => {
    const row = entry as EvalAiLibraryTestCaseResult;
    const suite = row.suite ?? row.metadata?.suite ?? fallbackSuite;
    const rowLabel = row.id ?? `${suite}-${index + 1}`;

    const metrics = (row.metrics_data ?? []).filter(
      (metric): metric is EvalAiLibraryMetricResult & { name: string; score: number } =>
        typeof metric?.name === 'string' && typeof metric?.score === 'number',
    );

    let passed: boolean | undefined;
    if (typeof row.success === 'boolean') {
      passed = row.success;
    } else if (metrics.length > 0) {
      passed = metrics.every((metric) =>
        typeof metric.success === 'boolean'
          ? metric.success
          : metric.score >= (metric.threshold ?? RAGAS_METRIC_PASS_THRESHOLD),
      );
    }

    if (passed === undefined) {
      throw Object.assign(
        new Error(
          `Unable to infer pass/fail for eval-ai-library row ${rowLabel} (suite: ${suite}): no success flag or metrics_data found.`,
        ),
        { exitCode: 2 },
      );
    }

    const averageScore =
      metrics.length > 0
        ? metrics.reduce((sum, metric) => sum + metric.score, 0) / metrics.length
        : passed
          ? 1
          : 0;
    const reason =
      metrics.map((metric) => `${metric.name}=${metric.score.toFixed(3)}`).join(', ') ||
      row.metrics_data?.[0]?.reason;

    const firstMappedMetric = metrics.find((metric) => EVAL_AI_LIBRARY_METRIC_TAXONOMY[metric.name]);
    const taxonomy = firstMappedMetric
      ? EVAL_AI_LIBRARY_METRIC_TAXONOMY[firstMappedMetric.name]
      : undefined;

    return {
      id: rowLabel,
      suite,
      passed,
      name: row.name,
      input: stringifyIfObject(row.input),
      output: stringifyIfObject(row.actual_output),
      expected: stringifyIfObject(row.expected_output),
      score: averageScore,
      severity: row.metadata?.severity,
      category: row.metadata?.category ?? taxonomy?.category,
      reason,
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from eval-ai-library',
          sourceRef: 'eval-ai-library',
        },
        lifecycle: { status: 'active' },
      },
    };
  });
};

// OpenTelemetry GenAI semantic conventions (Development/unstable status).
// The `gen_ai.evaluation.result` event first shipped in semantic-conventions
// v1.38.0 (Oct 2025). It carries `gen_ai.evaluation.name`,
// `gen_ai.evaluation.score.value`, `gen_ai.evaluation.score.label`,
// `gen_ai.evaluation.explanation` and, on evaluator failure, `error.type`.
// This adapter reads both OTLP/JSON encodings of that event:
//   - span events: `resourceSpans[].scopeSpans[].spans[].events[]`
//   - log-record events: `resourceLogs[].scopeLogs[].logRecords[]` with
//     `eventName` (or the older `event.name` attribute)
// Input may be one export object or JSONL with one export per line (the OTel
// Collector file exporter format). See docs/integrations/otel-genai.md.
type OtelAttributeValue = {
  stringValue?: string;
  doubleValue?: number;
  // OTLP/JSON encodes int64 as a decimal string (proto3 JSON mapping).
  intValue?: number | string;
  boolValue?: boolean;
};

type OtelAttribute = { key?: string; value?: OtelAttributeValue };

type OtelSpanEvent = { name?: string; attributes?: OtelAttribute[] };

type OtelSpan = {
  traceId?: string;
  spanId?: string;
  name?: string;
  attributes?: OtelAttribute[];
  events?: OtelSpanEvent[];
};

type OtelResource = { attributes?: OtelAttribute[] };

type OtelLogRecord = {
  eventName?: string;
  traceId?: string;
  spanId?: string;
  attributes?: OtelAttribute[];
};

type OtelExport = {
  resourceSpans?: Array<{ resource?: OtelResource; scopeSpans?: Array<{ spans?: OtelSpan[] }> }>;
  resourceLogs?: Array<{ resource?: OtelResource; scopeLogs?: Array<{ logRecords?: OtelLogRecord[] }> }>;
};

const OTEL_GENAI_EVALUATION_EVENT = 'gen_ai.evaluation.result';

const otelAttributeValue = (
  attributes: OtelAttribute[] | undefined,
  key: string,
): string | number | boolean | undefined => {
  const attribute = attributes?.find((candidate) => candidate.key === key);
  const value = attribute?.value;
  if (!value) return undefined;
  if (typeof value.stringValue === 'string') return value.stringValue;
  if (typeof value.doubleValue === 'number') return value.doubleValue;
  if (typeof value.intValue === 'number') return value.intValue;
  if (typeof value.intValue === 'string' && value.intValue.trim() !== '' && Number.isFinite(Number(value.intValue))) {
    return Number(value.intValue);
  }
  if (typeof value.boolValue === 'boolean') return value.boolValue;
  return undefined;
};

// Spec example labels include pass/fail, correct/incorrect and
// relevant/not_relevant. Any other label falls back to the numeric score.
const OTEL_GENAI_PASS_LABELS = new Set(['pass', 'passed', 'correct', 'relevant', 'true']);
const OTEL_GENAI_FAIL_LABELS = new Set(['fail', 'failed', 'incorrect', 'not_relevant', 'irrelevant', 'false']);

type OtelEvaluationEvent = {
  attributes: OtelAttribute[];
  // Attribute sets searched, in order, for a caller-named case-id attribute:
  // the event or log record, then its span (span-event encoding only), then
  // the resource.
  caseIdScopes: OtelAttribute[][];
  encoding: 'span event' | 'log record';
  traceId?: string;
  spanId?: string;
  spanName?: string;
};

const collectOtelEvaluationEvents = (exportObject: OtelExport): OtelEvaluationEvent[] => {
  const events: OtelEvaluationEvent[] = [];

  for (const resourceSpan of exportObject.resourceSpans ?? []) {
    for (const scopeSpan of resourceSpan.scopeSpans ?? []) {
      for (const span of scopeSpan.spans ?? []) {
        for (const event of span.events ?? []) {
          if (event.name !== OTEL_GENAI_EVALUATION_EVENT) continue;
          events.push({
            attributes: event.attributes ?? [],
            caseIdScopes: [event.attributes ?? [], span.attributes ?? [], resourceSpan.resource?.attributes ?? []],
            encoding: 'span event',
            traceId: span.traceId,
            spanId: span.spanId,
            spanName: span.name,
          });
        }
      }
    }
  }

  for (const resourceLog of exportObject.resourceLogs ?? []) {
    for (const scopeLog of resourceLog.scopeLogs ?? []) {
      for (const record of scopeLog.logRecords ?? []) {
        const eventName = record.eventName ?? otelAttributeValue(record.attributes, 'event.name');
        if (eventName !== OTEL_GENAI_EVALUATION_EVENT) continue;
        events.push({
          attributes: record.attributes ?? [],
          caseIdScopes: [record.attributes ?? [], resourceLog.resource?.attributes ?? []],
          encoding: 'log record',
          traceId: record.traceId || undefined,
          spanId: record.spanId || undefined,
        });
      }
    }
  }

  return events;
};

export type OtelGenaiImportOptions = {
  // Attribute key holding a stable per-case id (e.g. a dataset case id the
  // eval harness sets on the span). When set, row ids are `<caseId>:<metric>`
  // and stay the same across runs; spanIds are random per execution.
  caseIdAttribute?: string;
};

// Case ids are read as text so int64 values keep every digit: OTLP/JSON
// sends them as decimal strings, and Number() would round ids above 2^53.
const otelAttributeText = (attributes: OtelAttribute[], key: string): string | undefined => {
  const value = attributes.find((candidate) => candidate.key === key)?.value;
  if (!value) return undefined;
  const raw =
    value.stringValue ?? value.intValue ?? value.doubleValue ?? (typeof value.boolValue === 'boolean' ? value.boolValue : undefined);
  if (raw === undefined) return undefined;
  const text = String(raw).trim();
  return text === '' ? undefined : text;
};

const otelCaseId = (event: OtelEvaluationEvent, key: string): string | undefined => {
  for (const scope of event.caseIdScopes) {
    const text = otelAttributeText(scope, key);
    if (text !== undefined) return text;
  }
  return undefined;
};

const otelGenaiRows = (
  source: unknown,
  fallbackSuite: string,
  options: OtelGenaiImportOptions = {},
): RunnerEvalCaseResult[] => {
  const exports = (Array.isArray(source) ? source : [source]).filter(
    (candidate): candidate is OtelExport => typeof candidate === 'object' && candidate !== null,
  );

  if (!exports.some((candidate) => Array.isArray(candidate.resourceSpans) || Array.isArray(candidate.resourceLogs))) {
    throw Object.assign(
      new Error(
        'No OTel GenAI data found. Expected an OTLP/JSON export (or JSONL of exports) with resourceSpans[] or resourceLogs[].',
      ),
      { exitCode: 2 },
    );
  }

  const events = exports.flatMap(collectOtelEvaluationEvents);
  if (events.length === 0) {
    throw Object.assign(
      new Error('No gen_ai.evaluation.result events found in any span or log record.'),
      { exitCode: 2 },
    );
  }

  const usedIds = new Map<string, number>();

  return events.map((event, index): RunnerEvalCaseResult => {
    const { attributes } = event;
    const evaluationName = otelAttributeValue(attributes, 'gen_ai.evaluation.name');
    const scoreValue = otelAttributeValue(attributes, 'gen_ai.evaluation.score.value');
    const scoreLabel = otelAttributeValue(attributes, 'gen_ai.evaluation.score.label');
    const explanation = otelAttributeValue(attributes, 'gen_ai.evaluation.explanation');
    const errorType = otelAttributeValue(attributes, 'error.type');
    const responseId = otelAttributeText(attributes, 'gen_ai.response.id');
    const requestId = otelAttributeText(attributes, 'gen_ai.request.id');
    const metricName = typeof evaluationName === 'string' ? evaluationName : undefined;

    // With --case-id-attribute the id is `<caseId>:<metric>` and is stable
    // across runs. Without it, `<spanId>:<metric>` is unique within one export
    // only, because spanIds are random per execution (see the adapter doc).
    // If spanId is missing (common for some log-record exports), fall back to
    // gen_ai.response.id before using a positional id.
    let idPrefix: string;
    if (options.caseIdAttribute) {
      const caseId = otelCaseId(event, options.caseIdAttribute);
      if (caseId === undefined) {
        throw Object.assign(
          new Error(
            `otel-genai ${event.encoding} ${index + 1} (span ${event.spanId ?? 'unknown'}, metric ${metricName ?? 'unknown'}) has no ${options.caseIdAttribute} attribute on the ${event.encoding === 'span event' ? 'event, span, or resource' : 'log record or resource'}. Every event needs a case id when --case-id-attribute is set.`,
          ),
          { exitCode: 2 },
        );
      }
      idPrefix = caseId;
    } else {
      idPrefix = event.spanId ?? responseId ?? `${fallbackSuite}-${index + 1}`;
    }
    const baseId = `${idPrefix}${metricName ? `:${metricName}` : ''}`;
    const seen = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, seen + 1);
    const id = seen === 0 ? baseId : `${baseId}#${seen + 1}`;

    let passed: boolean | undefined;
    let verdictSource: string | undefined;
    if (errorType !== undefined) {
      passed = false;
      verdictSource = `evaluator error: ${String(errorType)}`;
    }
    if (passed === undefined && typeof scoreLabel === 'string') {
      const normalized = scoreLabel.trim().toLowerCase();
      if (OTEL_GENAI_PASS_LABELS.has(normalized)) passed = true;
      if (OTEL_GENAI_FAIL_LABELS.has(normalized)) passed = false;
      if (passed !== undefined) verdictSource = `score.label=${scoreLabel}`;
    }
    if (passed === undefined && typeof scoreValue === 'number') {
      passed = scoreValue >= RAGAS_METRIC_PASS_THRESHOLD;
      verdictSource = `score.value=${scoreValue} ${passed ? '>=' : '<'} ${RAGAS_METRIC_PASS_THRESHOLD} threshold (higher is better assumed)`;
    }

    if (passed === undefined || verdictSource === undefined) {
      throw Object.assign(
        new Error(
          `Unable to infer pass/fail for otel-genai row ${id} (suite: ${fallbackSuite}): no error.type, recognised gen_ai.evaluation.score.label, or numeric score.value found.`,
        ),
        { exitCode: 2 },
      );
    }

    const reasoning = typeof explanation === 'string' ? explanation : undefined;
    const reason = reasoning ? `${reasoning} (${verdictSource})` : verdictSource;

    return {
      id,
      suite: fallbackSuite,
      passed,
      kind: 'llm-judge',
      name: event.spanName,
      score: typeof scoreValue === 'number' ? scoreValue : undefined,
      category: metricName,
      judgeCategory: metricName,
      // An evaluator error is not a judge verdict, so leave it unset.
      judgeVerdict: errorType === undefined ? passed : undefined,
      judgeReasoning: reasoning ?? verdictSource,
      reason,
      trace: event.traceId || event.spanId ? { traceId: event.traceId, spanId: event.spanId } : undefined,
      metadata: {
        provenance: {
          source: 'custom',
          reason: 'Imported from OpenTelemetry GenAI gen_ai.evaluation.result event',
          sourceRef: 'otel-genai',
        },
        lifecycle: { status: 'active' },
        ...(responseId ? { sourceResponseId: responseId } : {}),
        ...(requestId ? { sourceRequestId: requestId } : {}),
      },
    };
  });
};

export const resolveImportSource = (rawSource: string): ImportSource => {
  const normalized = rawSource.trim().toLowerCase();
  if (normalized === 'openevals') {
    return 'agentevals';
  }
  if (normalized === 'oaievals' || normalized === 'oaieval' || normalized === 'openai-eval') {
    return 'openai-evals';
  }
  if (normalized === 'inspect') {
    return 'inspect-ai';
  }
  if (
    normalized === 'promptfoo' ||
    normalized === 'deepeval' ||
    normalized === 'agentevals' ||
    normalized === 'langsmith' ||
    normalized === 'ragas' ||
    normalized === 'langfuse' ||
    normalized === 'phoenix' ||
    normalized === 'braintrust' ||
    normalized === 'openai-evals' ||
    normalized === 'eval-ai-library' ||
    normalized === 'inspect-ai' ||
    normalized === 'otel-genai'
  ) {
    return normalized;
  }

  throw Object.assign(
    new Error(
      `Unknown import source ${rawSource}. Allowed values: promptfoo, deepeval, agentevals, langsmith, ragas, langfuse, phoenix, braintrust, openai-evals, eval-ai-library, inspect-ai, otel-genai, openevals, oaievals (also inspect, oaieval, and openai-eval aliases).`,
    ),
    { exitCode: 2 },
  );
};

export const importFromSource = async (options: {
  source: ImportSource;
  inputPath: string;
  outPath: string;
  suiteName?: string;
  caseIdAttribute?: string;
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
          : options.source === 'langsmith'
            ? langsmithRows(parsed, fallbackSuite)
            : options.source === 'ragas'
            ? ragasRows(parsed, fallbackSuite)
            : options.source === 'langfuse'
              ? langfuseRows(parsed, fallbackSuite)
              : options.source === 'phoenix'
                ? phoenixRows(parsed, fallbackSuite)
                : options.source === 'braintrust'
                  ? braintrustRows(parsed, fallbackSuite)
                  : options.source === 'openai-evals'
                    ? openAiEvalsRows(parsed, fallbackSuite)
                    : options.source === 'eval-ai-library'
                      ? evalAiLibraryRows(parsed, fallbackSuite)
                      : options.source === 'inspect-ai'
                        ? inspectAiRows(parsed, fallbackSuite)
                        : otelGenaiRows(parsed, fallbackSuite, { caseIdAttribute: options.caseIdAttribute });

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
        kind: caseResult.kind ?? 'deterministic',
        severity: caseResult.severity ?? 'none',
        name: caseResult.name,
        question: caseResult.question,
        input: caseResult.input,
        output: caseResult.output,
        expected: caseResult.expected,
        score: caseResult.score,
        category: caseResult.category,
        judgeCategory: caseResult.judgeCategory,
        judgeVerdict: caseResult.judgeVerdict,
        judgeReasoning: caseResult.judgeReasoning,
        reason: caseResult.reason,
        durationMs: caseResult.durationMs,
        checks: caseResult.checks,
        metadata: caseResult.metadata,
        trace: caseResult.trace,
      }),
    },
  );

  return {
    outPath: options.outPath,
    rowCount: cases.length,
  };
};
