// Source example: pnpm exec tsx examples/policy-evaluation/run.ts
import { checkGates, compareRuns, evaluateReportPolicy, validateEvalReport, type EvalReportV1 } from '../../src/index.js';

const current: EvalReportV1 = {
  schemaVersion: 'eval-report/v1',
  run: { id: 'policy-demo', project: 'synthetic-policy', generatedAt: '2026-11-01T00:00:00Z' },
  suites: [{ id: 'quality', total: 1, passed: 1, failed: 0 }],
  rows: [{ id: 'answer-1', suite: 'quality', passed: true, kind: 'llm-judge', severity: 'none', category: 'answer-quality',
    input: 'Synthetic question', output: 'Synthetic answer', judgeModel: 'synthetic-judge', judgeVerdict: true, judgeReasoning: 'Synthetic passing verdict' }],
  suiteManifests: [{ name: 'quality', target: 'agent', datasetSource: 'synthetic', datasetVersion: '1', rubricVersion: '1', graderVersion: '1',
    graders: ['llm-judge'], riskArea: 'response-quality', gate: { mode: 'blocking', thresholds: {} } }],
};
if (!validateEvalReport(current).ok) throw new Error('Policy example must remain a valid eval-report/v1 artifact');
const gateConfig = { calibration: { enabled: true } };
const ordinary = checkGates(current, compareRuns(current), gateConfig);
const policy = evaluateReportPolicy({ current, gateConfig, now: new Date('2026-11-01T00:00:00Z') });
console.log(JSON.stringify({ ordinaryGatePassed: ordinary.passed, gateDecision: policy.gateDecision }, null, 2));
