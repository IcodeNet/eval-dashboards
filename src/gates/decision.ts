import type { PairedOutcomeComparison } from '../analytics/paired-comparison.js';
import type { GateResult } from './check-gates.js';

/** A report without completed evaluation must never imply policy approval. */
export type GateDecision = {
  status: 'passed' | 'failed' | 'inconclusive' | 'not-evaluated';
  uncertainty?: PairedOutcomeComparison;
  failures: string[];
  diagnostics: string[];
};

export const gateDecisionFromResult = (result?: GateResult): GateDecision => {
  if (!result) return { status: 'not-evaluated', failures: [], diagnostics: [] };
  // Fail closed if a programmatic caller supplies an inconsistent result.
  const passed = result.passed && result.failures.length === 0 && (!result.pairedComparison || result.pairedComparison.status === 'passed');
  return {
    status: result.status === 'inconclusive' ? result.passed ? 'failed' : 'inconclusive' : passed && result.status !== 'failed' ? 'passed' : 'failed',
    ...(result.pairedComparison ? { uncertainty: { ...result.pairedComparison, reasons: [...result.pairedComparison.reasons], ...(result.pairedComparison.interval ? { interval: { ...result.pairedComparison.interval } } : {}) } } : {}),
    failures: [...result.failures],
    diagnostics: [...result.diagnostics],
  };
};
