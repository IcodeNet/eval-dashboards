import path from 'node:path';
import { assessBaselineCompatibility } from '../history/baseline-compatibility.js';
import {
  buildHistory,
  compareRuns,
  selectBaseline,
  selectBaselineByStrategy,
  selectRun,
  type BaselineStrategy,
} from '../history/history.js';
import { readEvalReports, writeJsonFile, writeTextFile } from '../io/reports.js';
import { lintReportsTaxonomy } from '../gates/lint-taxonomy.js';
import { checkGates, type GateConfig } from '../gates/check-gates.js';
import {
  type StatisticalGateMode,
  validateStatisticalGateConfig,
} from '../gates/statistical.js';
import { publishReport, type PublishTarget } from '../publish/publish.js';
import {
  renderGroupedIndexHtml,
  renderReports,
  type ReportProfile,
  type ReporterName,
} from '../reporters/render.js';
import { loadConfig, mergeConfig } from '../config/load-config.js';
import { optionBoolean, optionNumber, optionString, optionStrings, parseArgs } from './args.js';
import {
  buildAgentQualitySetupPlaybook,
  buildAgentQualityScaffoldFiles,
  initUsage,
  renderAgentQualityDryRunMode,
  renderAgentQualityInitConfig,
  renderAgentQualityTeachMode,
  renderDefaultInitConfig,
  resolveAgentQualityInitProfile,
  writeScaffoldFiles,
} from './init-scaffold.js';
import {
  completionUsage,
  installCompletion,
  renderCompletionScript,
  resolveCompletionShell,
} from './completion.js';
import { importFromSource, importUsage, resolveImportSource } from './import-adapters.js';
import type { NewFailureKeyMode } from '../gates/check-gates.js';

const usage = `eval-dashboards <command>

Commands:
  report   Generate HTML dashboards from eval-report/v1 artifacts (use --profile=guardrail for attack-focused triage).
  report-index  Generate grouped multi-report HTML index from discovered artifacts.
  lint     Run fast semantic/taxonomy preflight checks on artifacts.
  check    Enforce eval quality gates.
  merge    Merge discovered reports into one JSON file.
  history  Build history JSON from discovered reports.
  publish  Publish or dry-run publish for a static dashboard.
  teach    Guided eval onboarding walkthrough (alias of init --preset=agent-quality --teach).
  init     Print starter config or scaffold preset files.
  completion  Print shell completion script for bash/zsh/fish.
  import   Convert third-party eval output JSON into eval-report/v1.
`;

type LoadContextOptions = {
  runId?: string;
  baselineRunId?: string;
  baselineStrategy?: BaselineStrategy;
  baselineLookback?: number;
};

const loadContext = async (
  input: string,
  reportDir: string,
  options?: LoadContextOptions,
) => {
  const reports = await readEvalReports(input);

  if (reports.length === 0) {
    throw Object.assign(new Error(`No eval reports found under ${input}.`), { exitCode: 3 });
  }

  let current = options?.runId ? selectRun(reports, options.runId) : reports.at(-1);

  if (options?.runId && !current) {
    throw Object.assign(new Error(`Run ID ${options.runId} was not found under ${input}.`), {
      exitCode: 2,
    });
  }

  current = current ?? reports.at(-1);

  if (!current) {
    throw Object.assign(new Error(`No eval reports found under ${input}.`), { exitCode: 3 });
  }

  // If baselineRunId is specified, find and use that report as baseline
  let previous = options?.baselineRunId ? selectBaseline(reports, options.baselineRunId) : undefined;

  if (options?.baselineRunId && !previous) {
    throw Object.assign(
      new Error(`Baseline run ID ${options.baselineRunId} was not found under ${input}.`),
      { exitCode: 2 },
    );
  }

  if (!previous) {
    previous = selectBaselineByStrategy(reports, current.run.id, {
      strategy: options?.baselineStrategy ?? 'rolling',
      lookback: options?.baselineLookback,
    });
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
): GateConfig => {
  const newFailureKey = optionString(options, 'new-failure-key', '');
  const warningBudgets = optionStrings(options, 'max-warning-code', []);
  const maxWarningsByCode: Record<string, number> = {};

  for (const budget of warningBudgets) {
    const [code, rawCount] = budget.split(':', 2);
    const count = Number(rawCount);
    if (!code || !Number.isFinite(count)) continue;
    maxWarningsByCode[code] = count;
  }

  const allowedNewFailureKeys: NewFailureKeyMode[] = [
    'row',
    'scenario',
    'scenario-category',
    'id-category',
  ];

  const parsedNewFailureKey = allowedNewFailureKeys.includes(newFailureKey as NewFailureKeyMode)
    ? (newFailureKey as NewFailureKeyMode)
    : undefined;
  const statisticalMode = statisticalModeFromOptions(options);
  const confidenceLevel = optionNumber(options, 'confidence-level');
  const bootstrapSamples = optionNumber(options, 'bootstrap-samples');
  const minPassRateDelta = optionNumber(options, 'min-pass-rate-delta');
  const statisticalFields = {
    mode: statisticalMode,
    confidenceLevel,
    bootstrapSamples,
    minPassRateDelta,
  };
  const statistical =
    statisticalMode !== undefined ||
    confidenceLevel !== undefined ||
    bootstrapSamples !== undefined ||
    minPassRateDelta !== undefined
      ? (Object.fromEntries(
        Object.entries(statisticalFields).filter(([, value]) => value !== undefined),
      ) as NonNullable<GateConfig['statistical']>)
      : undefined;

  return {
    minPassRate: optionNumber(options, 'min-pass-rate'),
    minMatchedExpectationRate: optionNumber(options, 'min-matched-expectation-rate'),
    maxNewFailures: optionNumber(options, 'max-new-failures'),
    zeroCritical: optionBoolean(options, 'zero-critical'),
    maxWarnings: optionNumber(options, 'max-warnings'),
    maxWarningsByCode: Object.keys(maxWarningsByCode).length > 0 ? maxWarningsByCode : undefined,
    failOnWarningCodes: optionStrings(options, 'fail-on-warning-code', []),
    newFailureKey: parsedNewFailureKey,
    requiredPassingSuites: optionStrings(options, 'require-suite-pass', []),
    ...(statistical ? { statistical } : {}),
  };
};

const baselineStrategyFromOptions = (
  options: Record<string, string | boolean | string[]>,
): BaselineStrategy | undefined => {
  const strategy = optionString(options, 'baseline-strategy', '');
  if (!strategy) return undefined;
  if (strategy === 'rolling' || strategy === 'champion') return strategy;
  throw Object.assign(new Error(`Unknown baseline strategy ${strategy}. Use rolling or champion.`), {
    exitCode: 2,
  });
};

const reportProfileFromOptions = (
  options: Record<string, string | boolean | string[]>,
): ReportProfile | undefined => {
  const profile = optionString(options, 'profile', '').trim().toLowerCase();
  if (!profile || profile === 'default') return undefined;
  if (profile === 'guardrail') return 'guardrail';
  throw Object.assign(new Error(`Unknown report profile ${profile}. Use default or guardrail.`), {
    exitCode: 2,
  });
};

const statisticalModeFromOptions = (
  options: Record<string, string | boolean | string[]>,
): StatisticalGateMode | undefined => {
  const mode = optionString(options, 'statistical-mode', '').trim().toLowerCase();
  if (!mode) return undefined;
  if (mode === 'off' || mode === 'bootstrap') return mode;
  throw Object.assign(new Error(`Unknown statistical mode ${mode}. Use off or bootstrap.`), {
    exitCode: 2,
  });
};

const assertValidStatisticalGateConfig = (gateConfig: GateConfig): void => {
  const errors = validateStatisticalGateConfig(gateConfig.statistical);
  if (errors.length > 0) {
    throw Object.assign(new Error(`Invalid statistical gate config: ${errors[0]}`), {
      exitCode: 2,
    });
  }
};

const main = async (): Promise<void> => {
  const rawArgs = process.argv.slice(2);
  const { command, options } = parseArgs(rawArgs);

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
      minMatchedExpectationRate:
        optionNumber(options, 'min-matched-expectation-rate') ?? fileConfig.gates?.minMatchedExpectationRate,
      maxNewFailures: optionNumber(options, 'max-new-failures') ?? fileConfig.gates?.maxNewFailures,
      zeroCritical: optionBoolean(options, 'zero-critical') ?? fileConfig.gates?.zeroCritical,
      maxWarnings: optionNumber(options, 'max-warnings') ?? fileConfig.gates?.maxWarnings,
      maxWarningsByCode: fileConfig.gates?.maxWarningsByCode,
      failOnWarningCodes: fileConfig.gates?.failOnWarningCodes,
      newFailureKey: fileConfig.gates?.newFailureKey,
      requiredPassingSuites: fileConfig.gates?.requiredPassingSuites,
      statistical: {
        mode: statisticalModeFromOptions(options) ?? fileConfig.gates?.statistical?.mode,
        confidenceLevel:
          optionNumber(options, 'confidence-level') ?? fileConfig.gates?.statistical?.confidenceLevel,
        bootstrapSamples:
          optionNumber(options, 'bootstrap-samples') ?? fileConfig.gates?.statistical?.bootstrapSamples,
        minPassRateDelta:
          optionNumber(options, 'min-pass-rate-delta') ??
          fileConfig.gates?.statistical?.minPassRateDelta,
      },
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

  if (command === 'init' || command === 'teach') {
    const teachCommandMode = command === 'teach';

    if (optionBoolean(options, 'help')) {
      console.log(initUsage);
      return;
    }

    const preset = optionString(options, 'preset', '');
    const shouldWrite = optionBoolean(options, 'write');
    const dryRun = optionBoolean(options, 'dry-run');
    const teach = teachCommandMode || optionBoolean(options, 'teach');
    const outDir = optionString(options, 'out-dir', '.');
    const force = optionBoolean(options, 'force');
    const includePlaybook = optionBoolean(options, 'playbook');

    const setup = optionString(options, 'setup', '');
    const runner = optionString(options, 'runner', '');
    const ci = optionString(options, 'ci', '');

    const usingScaffoldOptions =
      shouldWrite || dryRun || teach || Boolean(setup) || Boolean(runner) || Boolean(ci) || force;
    const effectivePreset = preset || (usingScaffoldOptions ? 'agent-quality' : '');

    if (effectivePreset === 'agent-quality') {
      const profile = resolveAgentQualityInitProfile({
        setup: setup || undefined,
        runner: runner || undefined,
        ci: ci || undefined,
      });
      const files = buildAgentQualityScaffoldFiles(profile);
      const filesWithPlaybook = includePlaybook
        ? [...files, buildAgentQualitySetupPlaybook(profile)]
        : files;

      if (teach) {
        console.log(renderAgentQualityTeachMode(outDir, filesWithPlaybook));
        return;
      }

      if (dryRun) {
        console.log(renderAgentQualityDryRunMode(outDir, filesWithPlaybook));
        return;
      }

      if (!shouldWrite) {
        console.log(
          `${renderAgentQualityInitConfig()}\n\nTip: add --write to scaffold files, or --dry-run to preview file writes.`,
        );
        return;
      }

      const written = await writeScaffoldFiles(outDir, filesWithPlaybook, force);
      console.log(`Wrote ${written.length} file(s):\n${written.join('\n')}`);
      return;
    }

    if (effectivePreset) {
      throw Object.assign(new Error(`Unknown init preset ${effectivePreset}.`), { exitCode: 2 });
    }

    console.log(renderDefaultInitConfig());
    return;
  }

  if (command === 'completion') {
    const completionAction = rawArgs[1] && !rawArgs[1].startsWith('--') ? rawArgs[1] : '';

    if (completionAction && completionAction !== 'install') {
      throw Object.assign(new Error(`Unknown completion action ${completionAction}.`), { exitCode: 2 });
    }

    if (optionBoolean(options, 'help')) {
      console.log(completionUsage);
      return;
    }

    const shell = resolveCompletionShell(optionString(options, 'shell', ''));

    if (completionAction === 'install') {
      const result = await installCompletion(shell);
      const profileNote = result.profileFile
        ? result.updatedProfile
          ? `Updated shell profile: ${result.profileFile}`
          : `Shell profile already configured: ${result.profileFile}`
        : 'No shell profile update required for this shell.';

      console.log(
        [
          `Installed ${result.shell} completion for eval-dashboards and evd.`,
          `Completion file: ${result.completionFile}`,
          profileNote,
          'Open a new shell session (or source your profile) to enable completion.',
        ].join('\n'),
      );
      return;
    }

    console.log(renderCompletionScript(shell));
    return;
  }

  if (command === 'import') {
    if (optionBoolean(options, 'help')) {
      console.log(importUsage);
      return;
    }

    const rawSource = optionString(options, 'from', '');
    const inputPath = optionString(options, 'input', '');

    if (!rawSource) {
      throw Object.assign(new Error('Missing required --from option.'), { exitCode: 2 });
    }

    if (!inputPath) {
      throw Object.assign(new Error('Missing required --input option.'), { exitCode: 2 });
    }

    const source = resolveImportSource(rawSource);
    const outPath = optionString(options, 'out', path.join('.evals_output', `import-${source}.json`));
    const suiteName = optionString(options, 'suite', '');
    const imported = await importFromSource({
      source,
      inputPath,
      outPath,
      suiteName: suiteName || undefined,
    });

    console.log(`Imported ${imported.rowCount} row(s) from ${source} to ${imported.outPath}`);
    return;
  }

  if (command === 'report') {
    const profile = reportProfileFromOptions(options);
    const runId = optionString(options, 'run-id', '');
    const baselineRunId = optionString(options, 'baseline-run-id', '');
    const baselineStrategy = baselineStrategyFromOptions(options) ?? config.baseline?.strategy;
    const baselineLookback = optionNumber(options, 'baseline-lookback') ?? config.baseline?.lookback;
    const context = await loadContext(input, reportDir, {
      runId: runId || undefined,
      baselineRunId: baselineRunId || undefined,
      baselineStrategy,
      baselineLookback,
    });
    const reporters = (config.reporters ?? ['html', 'text']) as ReporterName[];
    const theme = optionString(options, 'theme', '') || config.theme as string | undefined;
    const locale = optionString(options, 'locale', '') || config.locale;
    assertValidStatisticalGateConfig({ statistical: config.gates?.statistical });
    const outputs = await renderReports({
      ...context,
      theme,
      locale,
      profile,
      statistical: config.gates?.statistical,
    }, reporters);
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
    const baselineStrategy = baselineStrategyFromOptions(options) ?? config.baseline?.strategy;
    const baselineLookback = optionNumber(options, 'baseline-lookback') ?? config.baseline?.lookback;
    const context = await loadContext(input, reportDir, {
      baselineRunId: baselineRunId || undefined,
      baselineStrategy,
      baselineLookback,
    });
    const allowBlockedBaseline = optionBoolean(options, 'allow-blocked-baseline');
    const cliGateOverrides = gateConfigFromOptions(options);
    const gateConfig: GateConfig = {
      ...(config.gates ?? {}),
      ...cliGateOverrides,
      ...(allowBlockedBaseline ? { failOnBaselineBlocked: false } : {}),
    };

    if ((config.gates?.statistical ?? cliGateOverrides.statistical) !== undefined) {
      gateConfig.statistical = {
        ...(config.gates?.statistical ?? {}),
        ...(cliGateOverrides.statistical ?? {}),
      };
    }
    assertValidStatisticalGateConfig(gateConfig);
    const result = checkGates(
      context.current,
      context.comparison,
      gateConfig,
      context.baselineCompatibility,
      context.previous,
    );

    if (result.passed) {
      if (result.diagnostics.length > 0) {
        console.log(`Gate diagnostics:\n${result.diagnostics.join('\n')}`);
      }
      console.log('Eval gates passed.');
      return;
    }

    const diagnostics = result.diagnostics.length > 0 ? `\nDiagnostics:\n${result.diagnostics.join('\n')}` : '';
    console.error(`Eval gates failed:\n${result.failures.join('\n')}${diagnostics}`);
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