import { describe, expect, it } from 'vitest';
import { formatDate, formatPassRate, formatDuration, formatCount } from '../src/utils/format.js';

describe('formatDate', () => {
    it('formats ISO string in British locale by default', () => {
        const result = formatDate('2026-07-31T10:00:00.000Z');
        expect(result).toContain('31');
        expect(result).toContain('Jul');
        expect(result).toContain('2026');
        expect(result).toContain('UTC');
    });

    it('accepts an alternate locale', () => {
        const result = formatDate('2026-07-31T10:00:00.000Z', 'en-US');
        expect(result).toContain('2026');
    });

    it('returns the raw string when given an invalid ISO date', () => {
        expect(formatDate('not-a-date')).toBe('not-a-date');
    });
});

describe('formatPassRate', () => {
    it('formats a pass rate as a percentage', () => {
        expect(formatPassRate(9, 10)).toBe('90.0%');
    });

    it('returns em-dash when total is zero', () => {
        expect(formatPassRate(0, 0)).toBe('—');
    });
});

describe('formatDuration', () => {
    it('renders milliseconds for sub-second values', () => {
        expect(formatDuration(450)).toBe('450ms');
    });

    it('renders seconds for sub-minute values', () => {
        expect(formatDuration(3500)).toBe('3.5s');
    });

    it('renders minutes and seconds for longer runs', () => {
        expect(formatDuration(125_000)).toBe('2m 5s');
    });
});

describe('formatCount', () => {
    it('uses singular for count of 1', () => {
        expect(formatCount(1, 'row')).toBe('1 row');
    });

    it('uses plural for counts other than 1', () => {
        expect(formatCount(3, 'row')).toBe('3 rows');
        expect(formatCount(0, 'row')).toBe('0 rows');
    });

    it('accepts a custom plural', () => {
        expect(formatCount(2, 'matrix', 'matrices')).toBe('2 matrices');
    });
});
