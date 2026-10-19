/** Markdown job summary for a `check` run, written to `$GITHUB_STEP_SUMMARY` or any file. */

export type StepSummaryInput = {
  runId: string;
  baselineRunId?: string;
  passed: boolean;
  failures: string[];
  diagnostics: string[];
  newlyFailingRows: Array<{ suite: string; id: string; category?: string; severity?: string }>;
};

/** Failure text can echo model output, so neutralise HTML, table pipes and line breaks. */
const escapeCell = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '\\|')
    .replaceAll('`', "'")
    .replaceAll(/\r?\n/g, ' ');

const bullets = (items: string[]): string => items.map((item) => `- ${escapeCell(item)}`).join('\n');

export const renderStepSummary = (input: StepSummaryInput): string => {
  const lines: string[] = [
    `## Eval gate: ${input.passed ? 'passed' : 'FAILED'}`,
    '',
    `Run \`${escapeCell(input.runId)}\`${
      input.baselineRunId ? ` compared with baseline \`${escapeCell(input.baselineRunId)}\`` : ' (no baseline)'
    }.`,
    '',
  ];

  if (input.failures.length > 0) {
    lines.push('### Gate failures', '', bullets(input.failures), '');
  }

  if (input.newlyFailingRows.length > 0) {
    lines.push('### Newly failing rows', '', '| Suite | Row | Category | Severity |', '| --- | --- | --- | --- |');
    for (const row of input.newlyFailingRows) {
      lines.push(
        `| ${escapeCell(row.suite)} | ${escapeCell(row.id)} | ${escapeCell(row.category ?? '-')} | ${escapeCell(row.severity ?? '-')} |`,
      );
    }
    lines.push('');
  }

  if (input.diagnostics.length > 0) {
    lines.push('### Diagnostics', '', bullets(input.diagnostics), '');
  }

  return `${lines.join('\n')}\n`;
};
