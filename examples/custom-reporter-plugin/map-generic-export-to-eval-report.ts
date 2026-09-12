import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeEvalReportArtifact } from '../../src/adapters/runner.js';

type RawRow = Record<string, unknown>;

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.split('=');
    return [key?.replace(/^--/, '') ?? '', rest.join('=')];
  }),
);

const inputPath = args.input;
const outPath = args.out;
const source = args.source ?? 'custom';
const suiteName = args.suite ?? `${source}-import`;

if (!inputPath || !outPath) {
  console.error('Usage: pnpm tsx examples/custom-reporter-plugin/map-generic-export-to-eval-report.ts --input=<source.json> --out=<artifact.json> [--source=<label>] [--suite=<name>]');
  process.exitCode = 2;
} else {
  const parsed = JSON.parse(await readFile(inputPath, 'utf8')) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null
      ? ((parsed as Record<string, unknown>).rows as unknown[]) ??
        ((parsed as Record<string, unknown>).results as unknown[]) ??
        []
      : [];

  if (!Array.isArray(rows) || rows.length === 0) {
    throw Object.assign(new Error('No rows found. Expected a JSON array or object with rows[]/results[].'), {
      exitCode: 2,
    });
  }

  await writeEvalReportArtifact(outPath, {
    run: {
      id: `import-${source}-${new Date().toISOString()}`,
      project: path.basename(process.cwd()),
    },
    cases: rows.map((entry, index) => {
      const row = entry as RawRow;
      const id = (typeof row.id === 'string' && row.id) || `${suiteName}-${index + 1}`;
      const passed =
        typeof row.passed === 'boolean'
          ? row.passed
          : typeof row.pass === 'boolean'
            ? row.pass
            : typeof row.success === 'boolean'
              ? row.success
              : false;

      return {
        id,
        suite: (typeof row.suite === 'string' && row.suite) || suiteName,
        passed,
        question: typeof row.question === 'string' ? row.question : undefined,
        input:
          row.input === undefined || row.input === null
            ? undefined
            : typeof row.input === 'string'
              ? row.input
              : JSON.stringify(row.input),
        output:
          row.output === undefined || row.output === null
            ? undefined
            : typeof row.output === 'string'
              ? row.output
              : JSON.stringify(row.output),
        expected:
          row.expected === undefined || row.expected === null
            ? undefined
            : typeof row.expected === 'string'
              ? row.expected
              : JSON.stringify(row.expected),
        score: typeof row.score === 'number' ? row.score : undefined,
        severity: typeof row.severity === 'string' ? row.severity : undefined,
        category: typeof row.category === 'string' ? row.category : undefined,
        reason: typeof row.reason === 'string' ? row.reason : undefined,
      };
    }),
    metadata: {
      importSource: source,
      importInputPath: inputPath,
    },
  });

  console.log(`Wrote ${rows.length} row(s) to ${outPath}`);
}
