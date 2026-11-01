import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { buildEvidenceBundle, sha256HexOf, verifyEvidenceBundle } from '../src/evidence/bundle.js';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'eval-evidence-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('buildEvidenceBundle / verifyEvidenceBundle (unit)', () => {
  it('embeds each input file verbatim with a matching digest', async () => {
    const dir = await createTempDir();
    const reportPath = path.join(dir, 'report.json');
    const checkResultPath = path.join(dir, 'check-result.json');
    await writeFile(reportPath, JSON.stringify({ schemaVersion: 'eval-report/v1' }), 'utf8');
    await writeFile(checkResultPath, JSON.stringify({ schemaVersion: 'eval-check-result/v1', passed: true }), 'utf8');

    const bundle = await buildEvidenceBundle(
      [
        { role: 'report', path: reportPath },
        { role: 'checkResult', path: checkResultPath },
      ],
      { runId: 'run-1' },
    );

    expect(bundle.schemaVersion).toBe('eval-evidence-bundle/v1');
    expect(bundle.runId).toBe('run-1');
    expect(bundle.entries).toHaveLength(2);
    for (const entry of bundle.entries) {
      expect(/^[0-9a-f]{64}$/.test(entry.digest.hex)).toBe(true);
    }

    const result = verifyEvidenceBundle(bundle);
    expect(result.ok).toBe(true);
    expect(result.roles.sort()).toEqual(['checkResult', 'report']);
  });

  it('fails verification when an entry is tampered with after export', async () => {
    const dir = await createTempDir();
    const reportPath = path.join(dir, 'report.json');
    await writeFile(reportPath, JSON.stringify({ a: 1 }), 'utf8');
    const bundle = await buildEvidenceBundle([{ role: 'report', path: reportPath }]);

    const tampered = JSON.parse(JSON.stringify(bundle));
    tampered.entries[0].contents = JSON.stringify({ a: 2 });

    const result = verifyEvidenceBundle(tampered);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r: string) => r.includes('does not match its recorded digest'))).toBe(true);
  });

  it('fails verification when the entry list itself is tampered (bundleDigest mismatch)', async () => {
    const dir = await createTempDir();
    const reportPath = path.join(dir, 'report.json');
    const checkResultPath = path.join(dir, 'check-result.json');
    await writeFile(reportPath, JSON.stringify({ a: 1 }), 'utf8');
    await writeFile(checkResultPath, JSON.stringify({ b: 2 }), 'utf8');
    const bundle = await buildEvidenceBundle([
      { role: 'report', path: reportPath },
      { role: 'checkResult', path: checkResultPath },
    ]);

    const tampered = JSON.parse(JSON.stringify(bundle));
    // Remove an entry but leave its own digest self-consistent; the bundleDigest
    // over the (now-shorter) entry list should no longer match.
    tampered.entries = [tampered.entries[0]];

    const result = verifyEvidenceBundle(tampered);
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r: string) => r.includes('Bundle digest mismatch'))).toBe(true);
  });

  it('rejects a bundle with the wrong schemaVersion', () => {
    const result = verifyEvidenceBundle({ schemaVersion: 'something-else', entries: [] });
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r: string) => r.includes('Unexpected schemaVersion'))).toBe(true);
  });

  it('throws a clear error when an input file does not exist', async () => {
    await expect(
      buildEvidenceBundle([{ role: 'report', path: '/nonexistent/report.json' }]),
    ).rejects.toThrow(/Could not read evidence file for role "report"/);
  });
});

describe('evidence-export / evidence-verify CLI commands', () => {
  it('exports a bundle with report + check-result + waivers + signature and verifies it', async () => {
    const dir = await createTempDir();
    const reportPath = path.join(dir, 'report.json');
    const checkResultPath = path.join(dir, 'check-result.json');
    const waiverPath = path.join(dir, 'waivers.json');
    const sigPath = path.join(dir, 'check-result.json.sig.json');
    const bundlePath = path.join(dir, 'evidence-bundle.json');

    await writeFile(reportPath, JSON.stringify({ schemaVersion: 'eval-report/v1' }), 'utf8');
    await writeFile(
      checkResultPath,
      JSON.stringify({ schemaVersion: 'eval-check-result/v1', passed: true }),
      'utf8',
    );
    await writeFile(
      waiverPath,
      JSON.stringify({ schemaVersion: 'eval-waiver-register/v1', waivers: [] }),
      'utf8',
    );
    await execFileAsync('pnpm', ['cli:dev', 'sign', `--artifact=${checkResultPath}`, `--out=${sigPath}`], {
      cwd: process.cwd(),
    });

    const { stdout } = await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'evidence-export',
        `--report=${reportPath}`,
        `--check-result=${checkResultPath}`,
        `--waiver-file=${waiverPath}`,
        `--signature=${sigPath}`,
        `--run-id=run-42`,
        `--out=${bundlePath}`,
      ],
      { cwd: process.cwd() },
    );
    expect(stdout).toContain('Wrote');
    expect(stdout).toContain('bundleDigest sha256:');

    const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as {
      schemaVersion: string;
      runId: string;
      entries: Array<{ role: string }>;
    };
    expect(bundle.schemaVersion).toBe('eval-evidence-bundle/v1');
    expect(bundle.runId).toBe('run-42');
    expect(bundle.entries.map((e) => e.role).sort()).toEqual(
      ['checkResult', 'report', 'signature', 'waiverRegister'].sort(),
    );

    const verifyResult = await execFileAsync(
      'pnpm',
      ['cli:dev', 'evidence-verify', `--bundle=${bundlePath}`],
      { cwd: process.cwd() },
    );
    expect(verifyResult.stdout).toContain('Verified');
  });

  it('evidence-export requires --report and --check-result', async () => {
    await expect(
      execFileAsync('pnpm', ['cli:dev', 'evidence-export'], { cwd: process.cwd() }),
    ).rejects.toMatchObject({ code: 2 });
  });

  it('evidence-verify fails on a hand-edited bundle', async () => {
    const dir = await createTempDir();
    const reportPath = path.join(dir, 'report.json');
    const checkResultPath = path.join(dir, 'check-result.json');
    const bundlePath = path.join(dir, 'evidence-bundle.json');
    await writeFile(reportPath, JSON.stringify({ a: 1 }), 'utf8');
    await writeFile(checkResultPath, JSON.stringify({ b: 2 }), 'utf8');

    await execFileAsync(
      'pnpm',
      [
        'cli:dev',
        'evidence-export',
        `--report=${reportPath}`,
        `--check-result=${checkResultPath}`,
        `--out=${bundlePath}`,
      ],
      { cwd: process.cwd() },
    );

    const bundle = JSON.parse(await readFile(bundlePath, 'utf8')) as { entries: Array<{ contents: string }> };
    bundle.entries[0].contents = JSON.stringify({ a: 999 });
    await writeFile(bundlePath, JSON.stringify(bundle), 'utf8');

    await expect(
      execFileAsync('pnpm', ['cli:dev', 'evidence-verify', `--bundle=${bundlePath}`], { cwd: process.cwd() }),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('does not match its recorded digest'),
    });
  });

  it('evidence-verify returns exit 1 and entry diagnostics for structurally malformed JSON bundles', async () => {
    const dir = await createTempDir();
    const bundlePath = path.join(dir, 'malformed.json');
    await writeFile(bundlePath, JSON.stringify({ schemaVersion: 'eval-evidence-bundle/v1', entries: [null] }));
    await expect(execFileAsync('pnpm', ['cli:dev', 'evidence-verify', `--bundle=${bundlePath}`], { cwd: process.cwd() }))
      .rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('Entry 0 is not an object.') });
  });

  it('evidence-verify fails when --bundle is missing', async () => {
    await expect(
      execFileAsync('pnpm', ['cli:dev', 'evidence-verify'], { cwd: process.cwd() }),
    ).rejects.toMatchObject({ code: 2 });
  });
});

describe('evidence-export --redact', () => {
  const sensitiveReport = {
    schemaVersion: 'eval-report/v1',
    run: { id: 'r1', generatedAt: '2026-10-01T00:00:00.000Z', configSnapshot: { values: { OPENAI_API_KEY: 'SECRET_KEY' } } },
    suites: [{ id: 's', total: 1, passed: 0, failed: 1 }],
    rows: [
      {
        id: 'a',
        suite: 's',
        passed: false,
        input: 'SECRET_INPUT',
        output: 'SECRET_OUTPUT',
        judgeReasoning: 'SECRET_REASONING',
        metadata: { note: 'SECRET_NOTE' },
      },
    ],
  };

  const writeInputs = async () => {
    const dir = await createTempDir();
    const reportPath = path.join(dir, 'report.json');
    const checkResultPath = path.join(dir, 'check-result.json');
    await writeFile(reportPath, JSON.stringify(sensitiveReport), 'utf8');
    await writeFile(checkResultPath, JSON.stringify({ schemaVersion: 'eval-check-result/v1', passed: false }), 'utf8');
    return { reportPath, checkResultPath };
  };

  it('should embed no evidence text when the report is redacted', async () => {
    const { reportPath, checkResultPath } = await writeInputs();

    const bundle = await buildEvidenceBundle([
      { role: 'report', path: reportPath, redact: true },
      { role: 'checkResult', path: checkResultPath },
    ]);

    expect(JSON.stringify(bundle)).not.toContain('SECRET_');
  });

  it('should record the digest of the original file when the report is redacted', async () => {
    const { reportPath, checkResultPath } = await writeInputs();
    const original = await readFile(reportPath, 'utf8');

    const bundle = await buildEvidenceBundle([
      { role: 'report', path: reportPath, redact: true },
      { role: 'checkResult', path: checkResultPath },
    ]);

    expect(bundle.entries[0]?.redacted).toBe(true);
    expect(bundle.entries[0]?.sourceDigest?.hex).toBe(sha256HexOf(original));
  });

  it('should still verify when the report is redacted', async () => {
    const { reportPath, checkResultPath } = await writeInputs();

    const bundle = await buildEvidenceBundle([
      { role: 'report', path: reportPath, redact: true },
      { role: 'checkResult', path: checkResultPath },
    ]);

    expect(verifyEvidenceBundle(bundle).ok).toBe(true);
  });

  it('should embed the exact bytes when redaction is not requested', async () => {
    const { reportPath, checkResultPath } = await writeInputs();
    const original = await readFile(reportPath, 'utf8');

    const bundle = await buildEvidenceBundle([
      { role: 'report', path: reportPath },
      { role: 'checkResult', path: checkResultPath },
    ]);

    expect(bundle.entries[0]?.contents).toBe(original);
    expect(bundle.entries[0]?.redacted).toBeUndefined();
  });

  it('should refuse to redact a role other than the report', async () => {
    const { reportPath, checkResultPath } = await writeInputs();

    await expect(
      buildEvidenceBundle([
        { role: 'report', path: reportPath },
        { role: 'checkResult', path: checkResultPath, redact: true },
      ]),
    ).rejects.toThrow('only supported for the "report" role');
  });

  it('should fail with a clear message when the report to redact is not JSON', async () => {
    const dir = await createTempDir();
    const reportPath = path.join(dir, 'report.json');
    await writeFile(reportPath, 'not json', 'utf8');

    await expect(buildEvidenceBundle([{ role: 'report', path: reportPath, redact: true }])).rejects.toThrow('not valid JSON');
  });

  it('should drop the evidence text through the CLI when --redact is passed', async () => {
    const { reportPath, checkResultPath } = await writeInputs();
    const out = path.join(path.dirname(reportPath), 'bundle.json');

    await execFileAsync(
      path.join(process.cwd(), 'node_modules', '.bin', 'tsx'),
      ['src/cli/index.ts', 'evidence-export', `--report=${reportPath}`, `--check-result=${checkResultPath}`, '--redact', `--out=${out}`],
      { cwd: process.cwd() },
    );

    expect(await readFile(out, 'utf8')).not.toContain('SECRET_');
  }, 60_000);
});
