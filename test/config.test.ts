import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mergeConfig } from '../src/config/load-config.js';

// loadConfig does dynamic import of real fs files — test mergeConfig and defaults only
describe('mergeConfig', () => {
    it('returns base config when no overrides are provided', () => {
        const base = { reportDir: 'my-reports', reporters: ['html' as const] };
        expect(mergeConfig(base, {})).toEqual(base);
    });

    it('CLI overrides win over file config', () => {
        const base = { reportDir: 'base-dir', gates: { minPassRate: 0.8 } };
        const result = mergeConfig(base, { reportDir: 'cli-dir' });
        expect(result.reportDir).toBe('cli-dir');
        expect(result.gates?.minPassRate).toBe(0.8);
    });

    it('undefined override values do not overwrite base', () => {
        const base = { reportDir: 'base-dir' };
        const result = mergeConfig(base, { reportDir: undefined as unknown as string });
        expect(result.reportDir).toBe('base-dir');
    });

    it('returns an empty object when both base and overrides are empty', () => {
        expect(mergeConfig({}, {})).toEqual({});
    });
});
