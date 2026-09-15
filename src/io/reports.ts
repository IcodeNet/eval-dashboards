import { mkdir, readFile, readdir, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvalReportV1 } from '../model/eval-report-v1.js';
import { validateEvalReport } from '../model/validate.js';

export const findJsonReports = async (input: string): Promise<string[]> => {
  const results: string[] = [];

  const visit = async (target: string): Promise<void> => {
    const entries = await readdir(target, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        results.push(entryPath);
      }
    }
  };

  try {
    await visit(input);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      throw Object.assign(
        new Error(
          [
            `No eval artifacts directory found at ${input}.`,
            'What to do next:',
            '  1) Bootstrap eval scaffolding: eval-dashboards init --write (alias: evd init --write)',
            '  2) Or point to your existing artifacts: --input=<path-to-evals_output>',
            '  3) Then run one of:',
            '     eval-dashboards lint --input=.evals_output',
            '     eval-dashboards check --input=.evals_output',
            '     eval-dashboards report --input=.evals_output --reporter=html',
          ].join('\n'),
        ),
        { exitCode: 3 },
      );
    }

    throw error;
  }

  return results.sort();
};

/**
 * Recursively find files under `input` whose basename matches `fileName`
 * (e.g. "history.json" published by each repo alongside its own report).
 * Used by `org-rollup` (4F.8), which reads already-published static
 * artifacts rather than raw eval-report/v1 files.
 */
export const findFilesByName = async (input: string, fileName: string): Promise<string[]> => {
  const results: string[] = [];

  const visit = async (target: string): Promise<void> => {
    const entries = await readdir(target, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name === fileName) {
        results.push(entryPath);
      }
    }
  };

  try {
    await visit(input);
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return [];
    }
    throw error;
  }

  return results.sort();
};

export const readEvalReport = async (filePath: string): Promise<EvalReportV1> => {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const result = validateEvalReport(parsed);

  if (!result.ok) {
    const firstIssue = result.issues[0];
    const issuePrefix = firstIssue ? `[${firstIssue.path}] ` : '';
    throw new Error(`Invalid eval report ${filePath}: ${issuePrefix}${result.errors.join(' ')}`);
  }

  return result.report;
};

export const readEvalReports = async (input: string): Promise<EvalReportV1[]> => {
  const files = await findJsonReports(input);

  if (files.length === 0) {
    throw Object.assign(
      new Error(
        [
          `No eval report JSON files found under ${input}.`,
          'What to do next:',
          '  1) Emit at least one eval-report/v1 artifact into that directory.',
          '  2) If you need starter files, run: eval-dashboards init --write (alias: evd init --write)',
          '  3) Then run one of:',
          '     eval-dashboards lint --input=.evals_output',
          '     eval-dashboards check --input=.evals_output',
          '     eval-dashboards report --input=.evals_output --reporter=html',
        ].join('\n'),
      ),
      { exitCode: 3 },
    );
  }

  const reports = await Promise.all(files.map((file) => readEvalReport(file)));

  return reports.sort(
    (left, right) => Date.parse(left.run.generatedAt) - Date.parse(right.run.generatedAt),
  );
};

export const writeJsonFile = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

export const writeTextFile = async (filePath: string, value: string): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, 'utf8');
};

/** Append text to a file, creating it (and parent dirs) if it doesn't exist yet. */
export const appendTextFile = async (filePath: string, value: string): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, value, 'utf8');
};