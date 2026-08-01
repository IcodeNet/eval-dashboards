// Example eval tests — deterministic assertions on agent outputs.
// Run with: npx jest --config jest.config.ts
// Then: npx @icodenet/eval-dashboards report --input=.evals_output

describe('response quality', () => {
  it('response must reference a pass rate', () => {
    const response = 'Pass rate improved from 72% to 89% after the prompt change.';
    expect(response).toMatch(/\d+%/);
  });

  it('response must not hallucinate a guarantee', () => {
    const response = 'Results may vary depending on dataset changes.';
    expect(response.toLowerCase()).not.toContain('guaranteed');
  });
});

describe('tool use', () => {
  it('agent used expected tool', () => {
    const toolCalls = ['knowledge-base'];
    expect(toolCalls).toContain('knowledge-base');
  });
});
