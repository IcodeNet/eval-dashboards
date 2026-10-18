import { describe, expect, it } from 'vitest';
import { toSafeFileSegment } from '../src/utils/safe-filename.js';

describe('toSafeFileSegment', () => {
  it('should keep a plain run id unchanged when it has only safe characters', () => {
    expect(toSafeFileSegment('agent-v4_2026.07.31')).toBe('agent-v4_2026.07.31');
  });

  it('should replace path separators when the id tries to climb directories', () => {
    expect(toSafeFileSegment('x/../../package')).toBe('x_.._.._package');
  });

  it('should replace backslashes when the id uses a Windows path', () => {
    expect(toSafeFileSegment('..\\..\\evil')).toBe('__.._evil');
  });

  it('should not start with a dot when the id is only dots', () => {
    expect(toSafeFileSegment('..')).toBe('_');
  });

  it('should return an underscore when the id is empty', () => {
    expect(toSafeFileSegment('')).toBe('_');
  });

  it('should cap the length when the id is very long', () => {
    expect(toSafeFileSegment('a'.repeat(500))).toHaveLength(120);
  });
});
