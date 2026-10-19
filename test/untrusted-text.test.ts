import { describe, expect, it } from 'vitest';
import { stripControlCharacters } from '../src/utils/untrusted-text.js';

describe('stripControlCharacters', () => {
  it('should keep plain text, tabs and newlines when there is nothing to strip', () => {
    expect(stripControlCharacters('a\tb\nc')).toBe('a\tb\nc');
  });

  it('should remove colour codes when text contains CSI sequences', () => {
    expect(stripControlCharacters('cat\u001b[31mred\u001b[0m')).toBe('catred');
  });

  it('should remove window-title codes when text contains OSC sequences', () => {
    expect(stripControlCharacters('x\u001b]0;pwned\u0007y')).toBe('xy');
  });

  it('should remove carriage returns and bells when text tries to overwrite a line', () => {
    expect(stripControlCharacters('ok\rFAKE PASS\u0007')).toBe('okFAKE PASS');
  });
});
