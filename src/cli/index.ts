import path from 'node:path';
import { assessBaselineCompatibility } from '../history/baseline-compatibility.js';
import { buildHistory, compareRuns, selectBaseline } from '../history/history.js';
import { readEvalReports, writeJsonFile, writeTextFile } from '../io/reports.js';
import { lintReportsTaxonomy } from '../gates/lint-taxonomy.js';
import { checkGates, type GateConfig } from '../gates/check-gates.js';
import { publishReport, type PublishTarget } from '../publish/publish.js';
import { renderGroupedIndexHtml, renderReports, type ReporterName } from '../reporters/render.js';
import { loadConfig, mergeConfig } from '../config/load-config.js';
import { optionBoolean, optionNumber, optionString, optionStrings, parseArgs } from './args.js';

const usage = `eval-dashboards <command>

Commands:
  report   Generate HTML dashboards from eval-report/v1 artifacts.
  report-index  Generate grouped multi-report HTML index from discovered artifacts.
  lint     Run fast semantic/taxonomy preflight checks on artifacts.
  check    Enforce eval quality gates.
  merge    Merge discovered reports into one JSON file.
  history  Build history JSON from discovered reports.
  publish  Publish or dry-run publish for a static dashboard.
  init     Print starter config.
`;

const loadContext = async (input: string, reportDir: string, baselineRunId?: string) => {
  const reports = await readEvalReports(input);

  if (reports.length === 0) {
    throw Object.assign(new Error(`No eval reports found under ${input}.`), { exitCode: 3 });
  }

  const current = reports.at(-1);

  if (!current) {
    throw Object.assign(new Error(`No eval reports found under ${input}.`), { exitCode: 3 });
  }

  // If baselineRunId is specified, find and use that report as baseline
  let previous = baselineRunId ? selectBaseline(reports, baselineRunId) : undefined;

  // If explicit baseline not provided or not found, use previous run
  if (!previous && reports.length > 1) {
    previous = reports.at(-2);
  }

  return {
    current,
    previous,
    history: buildHistory(reports),
    comparison: compareRuns(current, previous),
    baselineCompatibility: assessBaselineCompatibility(
      current.suiteManifests,
      previous?.suiteManifests,
      previous !== undefined,
    ),
    reportDir,
  };
};

const gateConfigFromOptions = (
  options: Record<string, string | boolean | string[]>,
): GateConfig => ({
  minPassRate: optionNumber(options, 'min-pass-rate'),
  maxNewFailures: optionNumber(options, 'max-new-failures'),
  zeroCritical: optionBoolean(options, 'zero-critical'),
});

const main = async (): Promise<void> => {
  const { command, options } = parseArgs(process.argv.slice(2));

  // Load file-based config, then merge CLI flags on top (CLI wins)
  const fileConfig = await loadConfig();
  const config = mergeConfig(fileConfig, {
    input: optionString(options, 'input', undefined as unknown as string) || undefined,
    reportDir: optionString(options, 'report-dir', undefined as unknown as string) || undefined,
    reporters: options['reporter']
      ? (optionStrings(options, 'reporter', []) as ReporterName[])
      : undefined,
    gates: {
      minPassRate: optionNumber(options, 'min-pass-rate') ?? fileConfig.gates?.minPassRate,
      maxNewFailures: optionNumber(options, 'max-new-failures') ?? fileConfig.gates?.maxNewFailures,
      zeroCritical: optionBoolean(options, 'zero-critical') ?? fileConfig.gates?.zeroCritical,
    },
  });

  const input = config.input
    ? Array.isArray(config.input)
      ? config.input[0] ?? '.evals_output'
      : config.input
    : '.evals_output';
  const reportDir = config.reportDir ?? 'eval-report';

  if (!command || command === '--help' || command === 'help') {
    console.log(usage);
    return;
  }

  if (command === 'init') {
    console.log(`export default {
  input: ['.evals_output/**/*.json'],
  reportDir: 'eval-dashboard',
  reporters: ['html', 'json-summary', 'markdown-summary', 'text'],
  gates: { minPassRate: 0.9, maxNewFailures: 0, zeroCritical: true },
};`);
    return;
  }

  if (command === 'report') {
    const context = await loadContext(input, reportDir);
    const reporters = (config.reporters ?? ['html', 'text']) as ReporterName[];
    const theme = optionString(options, 'theme', '') || config.theme as string | undefined;
    const locale = optionString(options, 'locale', '') || config.locale;
    const outputs = await renderReports({ ...context, theme, locale }, reporters);
    console.log(outputs.join('\n'));
    return;
  }

  if (command === 'report-index') {
    const reports = await readEvalReports(input);
    const locale = optionString(options, 'locale', '') || config.locale;
    const out = optionString(options, 'out', path.join(reportDir, 'overview.html'));
    await writeTextFile(out, renderGroupedIndexHtml(reports, locale));
    console.log(out);
    return;
  }

  if (command === 'check') {
    const baselineRunId = optionString(options, 'baseline-run-id', '');
    const context = await loadContext(input, reportDir, baselineRunId || undefined);
    const allowBlockedBaseline = optionBoolean(options, 'allow-blocked-baseline');
    const gateConfig = {
      ...(config.gates ?? {}),
      ...(allowBlockedBaseline ? { failOnBaselineBlocked: false } : {}),
    };
    const result = checkGates(
      context.current,
      context.comparison,
      gateConfig,
      context.baselineCompatibility,
    );

    if (result.passed) {
      console.log('Eval gates passed.');
      return;
    }

    console.error(`Eval gates failed:\n${result.failures.join('\n')}`);
    process.exitCode = 1;
    return;
  }

  if (command === 'lint') {
    const reports = await readEvalReports(input);
    const result = lintReportsTaxonomy(reports);
    const strict = optionBoolean(options, 'strict');
    const shouldFail = !result.passed || (strict && result.issues.some((issue) => issue.level === 'warning'));

    if (result.issues.length === 0) {
      console.log('Eval taxonomy lint passed with no issues.');
      return;
    }

    const errorCount = result.issues.filter((issue) => issue.level === 'error').length;
    const warningCount = result.issues.length - errorCount;

    const issueLines = result.issues.map(
      (issue) => `${issue.level.toUpperCase()} [${issue.code}] ${issue.message}`,
    );

    if (shouldFail) {
      console.error(
        `Eval taxonomy lint failed with ${errorCount} error(s) and ${warningCount} warning(s):\n${issueLines.join('\n')}`,
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      `Eval taxonomy lint passed with warnings (${warningCount} warning(s), ${errorCount} error(s)):\n${issueLines.join('\n')}`,
    );
    return;
  }

  if (command === 'merge') {
    const reports = await readEvalReports(input);
    const out = optionString(options, 'out', 'eval-report/merged.json');
    await writeJsonFile(out, { schemaVersion: 'eval-report-merged/v1', reports });
    console.log(out);
    return;
  }

  if (command === 'history') {
    const reports = await readEvalReports(input);
    const out = optionString(options, 'out', 'eval-report/history.json');
    await writeJsonFile(out, buildHistory(reports));
    console.log(out);
    return;
  }

  if (command === 'publish') {
    const context = await loadContext(input, reportDir);
    await renderReports(context, ['html', 'json-summary']);
    const result = await publishReport({
      target: optionString(options, 'target', 'dir') as PublishTarget,
      reportDir,
      outDir: optionString(options, 'out-dir', 'published-eval-report'),
      dryRun: optionBoolean(options, 'dry-run'),
      repo: typeof options.repo === 'string' ? options.repo : undefined,
      branch: typeof options.branch === 'string' ? options.branch : undefined,
      appName: typeof options['app-name'] === 'string' ? options['app-name'] : undefined,
      account: typeof options.account === 'string' ? options.account : undefined,
      container: typeof options.container === 'string' ? options.container : undefined,
    });
    console.log(result.url ? `${result.message}\n${result.url}` : result.message);
    return;
  }

  throw Object.assign(new Error(`Unknown command ${command}.`), { exitCode: 2 });
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const exitCode =
    typeof error === 'object' && error !== null && 'exitCode' in error
      ? Number(error.exitCode)
      : 2;
  console.error(message);
  process.exitCode = Number.isFinite(exitCode) ? exitCode : 2;
});