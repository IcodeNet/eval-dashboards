/**
 * Example Vitest eval suite. Run with:
 *   pnpm vitest run --config examples/vitest-evals/vitest.config.ts
 *
 * After the run, VitestEvalReporter writes an eval-report/v1 artifact to
 * examples/vitest-evals/.evals_output/<uuid>.json.
 *
 * Then generate a report:
 *   pnpm dev report --input=examples/vitest-evals/.evals_output --report-dir=eval-report
 */

import { describe, it, expect } from 'vitest';
import { setEvalMeta } from './vitest-eval-reporter.js';

// ---------------------------------------------------------------------------
// Simple deterministic evals — no LLM, pure assertions
// ---------------------------------------------------------------------------

describe('response-quality', () => {
  it('answer must contain a pass-rate reference', ({ task }) => {
    const response = 'Your eval pass rate improved from 72% to 89% after the prompt change.';

    setEvalMeta(task, {
      kind: 'deterministic',
      question: 'Did the response reference a pass rate?',
      input: 'Summarise this eval result.',
      output: response,
      expected: 'Must contain a percentage reference.',
      category: 'response-quality',
    });

    expect(response).toMatch(/\d+%/);
  });

  it('answer must not hallucinate a guarantee', ({ task }) => {
    const response = 'Evals show improvement, though results may vary with dataset changes.';

    setEvalMeta(task, {
      kind: 'deterministic',
      question: 'Did the response avoid making a false guarantee?',
      input: 'Are my evals improving?',
      output: response,
      expected: 'Must not contain "guaranteed".',
      category: 'response-quality',
    });

    expect(response.toLowerCase()).not.toContain('guaranteed');
  });

  it('answer must be concise (under 30 words)', ({ task }) => {
    const response = 'Pass rate is 89%.';

    setEvalMeta(task, {
      kind: 'deterministic',
      question: 'Is the response concise?',
      input: 'Give me a one-sentence summary.',
      output: response,
      expected: 'Under 30 words.',
      category: 'conciseness',
    });

    expect(response.split(/\s+/).length).toBeLessThan(30);
  });
});

describe('tool-use', () => {
  it('agent used knowledge-base tool when asked for docs', ({ task }) => {
    // Simulates checking what tool an agent called
    const toolCallsRecorded = ['knowledge-base'];

    setEvalMeta(task, {
      kind: 'agent',
      question: 'Did the agent call the knowledge-base tool?',
      input: 'Which report command do I run?',
      output: 'eval-dashboards report --input=.evals_output',
      expected: 'Should call knowledge-base.',
      category: 'tool-use',
      metadata: { toolCalls: toolCallsRecorded },
    });

    expect(toolCallsRecorded).toContain('knowledge-base');
  });

  it('agent did not call a forbidden tool', ({ task }) => {
    const toolCallsRecorded: string[] = [];

    setEvalMeta(task, {
      kind: 'agent',
      question: 'Did the agent avoid calling the send-email tool?',
      input: 'Summarise the eval result.',
      output: 'Pass rate: 89%.',
      category: 'tool-use',
    });

    expect(toolCallsRecorded).not.toContain('send-email');
  });
});

// ---------------------------------------------------------------------------
// Simulated LLM-judge row (judge verdict provided externally)
// ---------------------------------------------------------------------------

describe('groundedness', () => {
  it('judge marked answer as grounded', ({ task }) => {
    const judgeVerdict = true; // in real usage: await callYourJudge(question, answer, rubric)
    const judgeReasoning = 'The answer cites a baseline comparison and does not invent facts.';

    setEvalMeta(task, {
      kind: 'llm-judge',
      question: 'Is the answer grounded in the provided context?',
      input: 'Can I use the dashboard to see whether my evals improved?',
      output: 'Yes — compare the baseline and current pass-rate trend on the HTML dashboard.',
      judgeModel: 'simulated-judge-v1',
      judgeVerdict,
      judgeReasoning,
      category: 'groundedness',
    });

    expect(judgeVerdict).toBe(true);
  });
});
