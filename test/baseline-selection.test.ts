import { describe, expect, it } from 'vitest';
import { selectBaseline } from '../src/history/history.js';
import type { EvalReportV1 } from '../src/model/eval-report-v1.js';

const makeReport = (runId: string, generatedAt: string): EvalReportV1 => ({
    schemaVersion: 'eval-report/v1',
    run: {
        id: runId,
        generatedAt,
    },
    suites: [],
    rows: [],
    suiteManifests: [],
    rubricContracts: [],
    baselineCompatibility: undefined,
    metadata: {},
});

describe('selectBaseline', () => {
    it('returns the report matching the baseline run ID', () => {
        const run1 = makeReport('run-001', '2026-08-01T00:00:00Z');
        const run2 = makeReport('run-002', '2026-08-02T00:00:00Z');
        const run3 = makeReport('run-003', '2026-08-03T00:00:00Z');

        const result = selectBaseline([run1, run2, run3], 'run-002');

        expect(result).toBe(run2);
    });

    it('returns undefined if no matching baseline run ID found', () => {
        const run1 = makeReport('run-001', '2026-08-01T00:00:00Z');
        const run2 = makeReport('run-002', '2026-08-02T00:00:00Z');

        const result = selectBaseline([run1, run2], 'run-999');

        expect(result).toBeUndefined();
    });

    it('returns undefined from an empty reports array', () => {
        const result = selectBaseline([], 'run-001');

        expect(result).toBeUndefined();
    });
});
