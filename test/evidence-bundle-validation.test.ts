import { describe, expect, it } from 'vitest';
import { sha256HexOf, verifyEvidenceBundle } from '../src/evidence/bundle.js';

const entry = {
  role: 'report', sourcePath: 'report.json', contents: '{}',
  digest: { algorithm: 'sha256', hex: sha256HexOf('{}') },
};
const bundle = {
  schemaVersion: 'eval-evidence-bundle/v1', generatedAt: '2026-10-31T00:00:00Z', entries: [entry],
  bundleDigest: { algorithm: 'sha256', hex: sha256HexOf(`report:${entry.digest.hex}`) },
};

describe('evidence bundle input validation', () => {
  it.each([
    null, [], 'invalid',
    { ...entry, contents: null }, { ...entry, contents: {} }, { ...entry, contents: 0 },
    { ...entry, contents: undefined }, { ...entry, digest: null }, { ...entry, digest: {} },
    { ...entry, digest: { algorithm: 'md5', hex: entry.digest.hex } },
    { ...entry, role: {} }, { ...entry, role: 'unknown' }, { ...entry, sourcePath: 123 },
  ].map((invalid) => [invalid]))('returns diagnostics without throwing for invalid entry %j', (invalid) => {
    const result = verifyEvidenceBundle({ ...bundle, entries: [invalid] });
    expect(result.ok).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it.each([null, {}, { algorithm: 'md5', hex: bundle.bundleDigest.hex }, { algorithm: 'sha256', hex: 1 }])(
    'rejects malformed top-level digest %j', (bundleDigest) => {
      expect(verifyEvidenceBundle({ ...bundle, bundleDigest }).ok).toBe(false);
    },
  );

  it('treats entry order as immaterial to the sorted manifest digest', () => {
    const other = { ...entry, role: 'checkResult' };
    const hex = sha256HexOf([`report:${entry.digest.hex}`, `checkResult:${entry.digest.hex}`].sort().join('\n'));
    expect(verifyEvidenceBundle({ ...bundle, entries: [other, entry], bundleDigest: { algorithm: 'sha256', hex } }).ok).toBe(true);
  });

  it('ignores additive unknown properties on well-formed bundles', () => {
    expect(verifyEvidenceBundle({ ...bundle, future: true, entries: [{ ...entry, future: true }] }).ok).toBe(true);
  });
});
