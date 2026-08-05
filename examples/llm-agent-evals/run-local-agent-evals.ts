import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvalReportV1, EvalRow, EvalSeverity } from '../../src/index.js';

type Scenario = {
  id: string;
  question: string;
  requiredPhrases: string[];
  forbiddenPhrases: string[];
  expectedTool: 'knowledge-base' | 'none';
  category: string;
  groundTruthVerdict: boolean;
  groundTruthAxisScores: Record<string, number>;
};

type AgentRun = {
  response: string;
  toolCalls: string[];
  durationMs: number;
};

const scenarios: Scenario[] = [
  {
    id: 'grounded-answer',
    question: 'Can I use the dashboard to see whether my evals improved?',
    requiredPhrases: ['baseline', 'trend'],
    forbiddenPhrases: ['guaranteed improvement'],
    expectedTool: 'knowledge-base',
    category: 'groundedness',
    groundTruthVerdict: true,
    groundTruthAxisScores: { groundedness: 0.95, response_quality: 0.9 },
  },
  {
    id: 'tool-use',
    question: 'Which report command should I run after my eval runner writes JSON?',
    requiredPhrases: ['eval-dashboards report', '--input'],
    forbiddenPhrases: ['upload your token'],
    expectedTool: 'knowledge-base',
    category: 'tool-use',
    groundTruthVerdict: true,
    groundTruthAxisScores: { tool_use: 0.96, response_quality: 0.88 },
  },
  {
    id: 'concise-answer',
    question: 'Summarise the eval result in one sentence.',
    requiredPhrases: ['pass rate'],
    forbiddenPhrases: ['firstly', 'secondly', 'thirdly'],
    expectedTool: 'none',
    category: 'response-quality',
    groundTruthVerdict: false,
    groundTruthAxisScores: { response_quality: 0.42, groundedness: 0.35 },
  },
];

const generatedAtByVersion = {
  'demo-agent-v1': '2026-07-30T10:00:00.000Z',
  'demo-agent-v2': '2026-07-31T10:00:00.000Z',
} as const;

const main = async (): Promise<void> => {
  const outDir = path.join('examples', 'llm-agent-evals', '.evals_output');
  await mkdir(outDir, { recursive: true });

  const reports = [buildReport('demo-agent-v1'), buildReport('demo-agent-v2')];

  for (const report of reports) {
    const filePath = path.join(outDir, `${report.run.id}.json`);
    await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(filePath);
  }
};

const buildReport = (agentVersion: keyof typeof generatedAtByVersion): EvalReportV1 => {
  const rows = scenarios.flatMap((scenario) => buildRows(agentVersion, scenario));
  const passed = rows.filter((row) => row.passed).length;
  const failed = rows.length - passed;

  return {
    schemaVersion: 'eval-report/v1',
    run: {
      id: agentVersion,
      generatedAt: generatedAtByVersion[agentVersion],
      project: 'local-chat-playground',
      kind: 'agent-eval',
      branch: 'main',
      commit: agentVersion === 'demo-agent-v1' ? 'local001' : 'local002',
    },
    suites: [
      {
        id: 'local-chat-quality',
        name: 'Local chat quality',
        total: rows.length,
        passed,
        failed,
        passRate: passed / rows.length,
      },
    ],
    suiteManifests: [
      {
        name: 'local-chat-quality',
        target: 'agent',
        datasetSource: 'synthetic',
        datasetVersion: '1.0.0',
        rubricVersion: '1.0.0',
        riskArea: 'response-quality',
        graders: ['deterministic-assertions', 'llm-judge'],
        gate: {
          mode: 'blocking',
          thresholds: {
            overallPassRate: 0.8,
            maxNewFailures: 0,
          },
        },
        description: 'Provider-free local chat evals for prompt, tool, and answer quality changes.',
      },
      {
        name: 'judge-calibration',
        target: 'judge',
        datasetSource: 'labelled-synthetic',
        datasetVersion: '1.0.0',
        rubricVersion: '1.0.0',
        riskArea: 'custom',
        graders: ['human-labelled-calibration'],
        gate: {
          mode: 'blocking',
          thresholds: {
            minJudgeAgreementRate: 0.9,
            maxAxisScoreDelta: 0.15,
          },
        },
        description: 'Labelled judge calibration rows for agreement and axis-score tolerance checks.',
      },
    ],
    rubricContracts: [
      {
        suiteName: 'local-chat-quality',
        rubricVersion: '1.0.0',
        rubrics: [
          { axis: 'groundedness', version: '1.0.0', summary: 'Answers stay inside retrieved evidence.' },
          { axis: 'tool-use', version: '1.0.0', summary: 'The agent calls tools only when needed.' },
          { axis: 'response-quality', version: '1.0.0', summary: 'Answers are direct and concise.' },
        ],
      },
      {
        suiteName: 'judge-calibration',
        rubricVersion: '1.0.0',
        rubrics: [
          { axis: 'groundedness', version: '1.0.0', summary: 'Judge labels match labelled examples.' },
          { axis: 'tool-use', version: '1.0.0', summary: 'Judge labels preserve tool-use expectations.' },
          { axis: 'response-quality', version: '1.0.0', summary: 'Judge labels stay within axis tolerances.' },
        ],
      },
    ],
    rows: [...rows, ...buildCalibrationRows(agentVersion)],
  };
};

const buildRows = (agentVersion: 'demo-agent-v1' | 'demo-agent-v2', scenario: Scenario): EvalRow[] => {
  const agentRun = runLocalAgent(agentVersion, scenario);
  const toolPassed = scenario.expectedTool === 'none'
    ? agentRun.toolCalls.length === 0
    : agentRun.toolCalls.includes(scenario.expectedTool);
  const judgeResult = judgeAnswer(scenario, agentRun.response);

  return [
    {
      id: `${scenario.id}:agent`,
      suite: 'local-chat-quality',
      kind: 'agent',
      name: `${scenario.id} agent behaviour`,
      datasetId: 'local-chat-smoke',
      scenarioId: scenario.id,
      agentChannel: 'local-playground',
      agentVersion,
      promptVersion: agentVersion === 'demo-agent-v1' ? 'prompt-v1' : 'prompt-v2',
      input: scenario.question,
      output: agentRun.response,
      passed: toolPassed,
      severity: toolPassed ? 'none' : 'high',
      category: 'tool-use',
      reason: toolPassed ? undefined : `Expected ${scenario.expectedTool} tool use.`,
      durationMs: agentRun.durationMs,
      metadata: { toolCalls: agentRun.toolCalls },
    },
    {
      id: `${scenario.id}:judge`,
      suite: 'local-chat-quality',
      kind: 'llm-judge',
      name: `${scenario.id} judge score`,
      question: scenario.question,
      datasetId: 'local-chat-smoke',
      scenarioId: scenario.id,
      rubricId: scenario.category,
      judgeModel: 'rule-based-example-judge',
      judgeVerdict: judgeResult.passed,
      judgeCategory: judgeResult.category,
      judgeReasoning: judgeResult.reasoning,
      promptVersion: agentVersion === 'demo-agent-v1' ? 'prompt-v1' : 'prompt-v2',
      input: scenario.question,
      output: agentRun.response,
      passed: judgeResult.passed,
      severity: judgeResult.severity,
      category: scenario.category,
      reason: judgeResult.passed ? undefined : judgeResult.reasoning,
      durationMs: 4,
    },
  ];
};

const buildCalibrationRows = (agentVersion: 'demo-agent-v1' | 'demo-agent-v2'): EvalRow[] =>
  scenarios.map((scenario) => {
    const judgeVerdict = agentVersion === 'demo-agent-v1' ? !scenario.groundTruthVerdict : scenario.groundTruthVerdict;
    const axisScores = agentVersion === 'demo-agent-v1'
      ? Object.fromEntries(
        Object.entries(scenario.groundTruthAxisScores).map(([axis, score]) => [axis, Math.max(0, Math.min(1, score - 0.2))]),
      )
      : scenario.groundTruthAxisScores;

    return {
      id: `${scenario.id}:calibration`,
      suite: 'judge-calibration',
      kind: 'llm-judge',
      name: `${scenario.id} calibration`,
      datasetId: 'judge-calibration-set',
      scenarioId: scenario.id,
      rubricId: scenario.category,
      judgeModel: 'rule-based-example-judge',
      judgeVerdict,
      judgeCategory: judgeVerdict ? 'passed' : 'missed-expected-label',
      judgeReasoning: judgeVerdict
        ? 'Judge label matches the labelled example.'
        : 'Judge label diverged from the labelled example.',
      groundTruthVerdict: scenario.groundTruthVerdict,
      groundTruthCategory: scenario.category,
      groundTruthAnnotation: `Labelled calibration case for ${scenario.id}.`,
      groundTruthAxisScores: scenario.groundTruthAxisScores,
      axisScores,
      promptVersion: agentVersion === 'demo-agent-v1' ? 'prompt-v1' : 'prompt-v2',
      input: scenario.question,
      output: agentVersion === 'demo-agent-v1' ? 'label mismatch example' : 'labelled calibration match',
      passed: judgeVerdict === scenario.groundTruthVerdict,
      severity: judgeVerdict === scenario.groundTruthVerdict ? 'none' : 'medium',
      category: scenario.category,
      reason: judgeVerdict === scenario.groundTruthVerdict ? undefined : 'Judge calibration disagreement.',
      durationMs: 2,
      metadata: {
        provenance: { source: 'labelled-synthetic', reason: 'Judge calibration example' },
        lifecycle: { status: 'active' },
      },
    };
  });

const runLocalAgent = (agentVersion: 'demo-agent-v1' | 'demo-agent-v2', scenario: Scenario): AgentRun => {
  const toolCalls = scenario.expectedTool === 'knowledge-base' ? ['knowledge-base'] : [];
  const evidence = toolCalls.length > 0 ? searchKnowledgeBase(scenario.question) : '';

  if (agentVersion === 'demo-agent-v1') {
    return {
      response: legacyPromptResponse(scenario, evidence),
      toolCalls,
      durationMs: 19,
    };
  }

  return {
    response: improvedPromptResponse(scenario, evidence),
    toolCalls,
    durationMs: 16,
  };
};

const searchKnowledgeBase = (question: string): string => {
  if (question.includes('dashboard')) {
    return 'Reports compare latest and previous runs using baseline compatibility and trend data.';
  }

  return 'After an eval runner writes JSON, run eval-dashboards report --input=<dir>.';
};

const legacyPromptResponse = (scenario: Scenario, evidence: string): string => {
  if (scenario.id === 'grounded-answer') {
    return `${evidence} This is guaranteed improvement once enabled.`;
  }

  if (scenario.id === 'tool-use') {
    return 'Run eval-dashboards report after writing JSON. You might need to upload your token first.';
  }

  return 'Firstly, the pass rate is 66%. Secondly, it has some failures. Thirdly, review the report.';
};

const improvedPromptResponse = (scenario: Scenario, evidence: string): string => {
  if (scenario.id === 'grounded-answer') {
    return `${evidence} Use the baseline status and trend to decide whether the eval improved.`;
  }

  if (scenario.id === 'tool-use') {
    return 'Run eval-dashboards report --input=.evals_output after your eval runner writes JSON.';
  }

  return 'The pass rate improved, but one concise-answer row still needs review.';
};

const judgeAnswer = (
  scenario: Scenario,
  response: string,
): { passed: boolean; category: string; reasoning: string; severity: EvalSeverity } => {
  const lowerResponse = response.toLowerCase();
  const missingRequired = scenario.requiredPhrases.filter(
    (phrase) => !lowerResponse.includes(phrase.toLowerCase()),
  );
  const forbiddenHits = scenario.forbiddenPhrases.filter((phrase) =>
    lowerResponse.includes(phrase.toLowerCase()),
  );

  if (forbiddenHits.length > 0) {
    return {
      passed: false,
      category: 'forbidden-phrase',
      reasoning: `Response included forbidden phrase: ${forbiddenHits.join(', ')}.`,
      severity: 'high',
    };
  }

  if (missingRequired.length > 0) {
    return {
      passed: false,
      category: 'missing-required-phrase',
      reasoning: `Response missed required phrase: ${missingRequired.join(', ')}.`,
      severity: 'medium',
    };
  }

  return {
    passed: true,
    category: 'passed',
    reasoning: 'Response satisfied the portable rubric for this scenario.',
    severity: 'none',
  };
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});