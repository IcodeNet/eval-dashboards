import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
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

  await visit(input);
  return results.sort();
};

export const readEvalReport = async (filePath: string): Promise<EvalReportV1> => {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const result = validateEvalReport(parsed);

  if (!result.ok) {
    throw new Error(`Invalid eval report ${filePath}: ${result.errors.join(' ')}`);
  }

  return result.report;
};

export const readEvalReports = async (input: string): Promise<EvalReportV1[]> => {
  const files = await findJsonReports(input);
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