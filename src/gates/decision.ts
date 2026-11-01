import type { GateResult } from './check-gates.js';

/** A report without completed evaluation must never imply policy approval. */
export type GateDecision = {
  status: 'passed' | 'failed' | 'not-evaluated';
  failures: string[];
  diagnostics: string[];
};

export const gateDecisionFromResult = (result?: GateResult): GateDecision => {
  if (!result) return { status: 'not-evaluated', failures: [], diagnostics: [] };
  // Fail closed if a programmatic caller supplies an inconsistent result.
  const passed = result.passed && result.failures.length === 0;
  return {
    status: passed ? 'passed' : 'failed',
    failures: [...result.failures],
    diagnostics: [...result.diagnostics],
  };
};
