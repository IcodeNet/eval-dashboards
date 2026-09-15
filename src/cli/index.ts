import path from 'node:path';
import { readFile } from 'node:fs/promises';
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
import type { EvalReportV1, SuiteManifest } from '../model/eval-report-v1.js';
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
import type { NotificationChannel, NotificationsConfig } from '../config/config.js';
import {
  assertKnownFlags,
  optionBoolean,
  optionNumber,
  optionString,
  optionStrings,
  parseArgs,
} from './args.js';
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
import {
  exportUnresolvedRowsBundle,
  mergeAdjudicationBundle,
  validateAdjudicationBundle,
  type AdjudicationBundleV1,
} from '../adjudication/bundles.js';
import type { NewFailureKeyMode } from '../gates/check-gates.js';
import {
  defaultReportLink,
  sendGateNotifications,
  type NotificationDispatchResult,
} from '../notifications/notify.js';

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
  adjudicate  Export unresolved rows for human review and merge reviewed verdicts back.
`;

const adjudicationUsage = `eval-dashboards adjudicate <action> [options]

Actions:
  export   Export unresolved rows from a run into an adjudication bundle.
  import   Merge reviewer verdicts from an adjudication bundle into a run artifact.

Options (export):
  --input=<dir>         Artifact directory to read. Default: .evals_output
  --run-id=<id>         Optional run id to export from (default: latest run)
  --out=<path>          Output bundle path. Default: eval-report/adjudication-bundle.json
  --include-passed      Include unresolved rows even when passed=true.

Options (import):
  --input=<dir>              Artifact directory to read. Default: .evals_output
  --run-id=<id>              Optional run id to merge into (default: bundle source run)
  --bundle=<path>            Path to adjudication bundle JSON (required)
  --out=<path>               Output artifact path. Default: eval-report/adjudicated-<run-id>.json
  --allow-single-reviewer    Escape hatch: accept a single reviewer verdict per row instead of requiring >=2 (reduced rigor)
`;

const reportUsage = `eval-dashboards report [options]

Options:
  --input=<path>                Artifact directory to read. Default: .evals_output
  --reporter=<name>             Reporter(s): html|markdown-summary|json-summary|text|none (repeatable; markdown alias supported)
  --report-dir=<path>           Output directory. Default: eval-report
  --run-id=<id>                 Run id to render. Default: latest run
  --baseline-run-id=<id>        Fixed baseline run id for comparisons
  --baseline-strategy=<mode>    rolling|champion baseline selection
  --baseline-lookback=<number>  Candidate lookback depth for rolling/champion baseline
  --profile=<name>              default|guardrail report profile
  --theme=<name>                HTML theme override
  --locale=<tag>                Locale override for date/number formatting
`;

const checkUsage = `eval-dashboards check [options]

Options:
  --input=<path>                   Artifact directory to read. Default: .evals_output
  --run-id=<id>                    Run id to gate. Default: latest run
  --baseline-run-id=<id>           Fixed baseline run id for new-failure checks
  --baseline-strategy=<mode>       rolling|champion baseline selection
  --baseline-lookback=<number>     Candidate lookback depth for rolling/champion baseline
  --allow-blocked-baseline         Do not fail when baseline compatibility is blocked
  --min-pass-rate=<number>         Minimum overall pass rate (0-1)
  --min-matched-expectation-rate=<number>  Minimum expectation-match rate (0-1)
  --max-new-failures=<number>      Maximum newly failing rows vs baseline
  --new-failure-key=<mode>         row|scenario|scenario-category|id-category
  --require-suite-pass=<suite>     Require suite-level pass for named suite(s) (repeatable)
  --max-warnings=<number>          Maximum warning count from lint checks
  --max-warning-code=<code:count>  Per-warning-code budget (repeatable)
  --fail-on-warning-code=<code>    Fail immediately when warning code appears (repeatable)
  --zero-critical                  Fail if any severity=critical row failed
  --statistical-mode=<mode>        off|bootstrap statistical gate mode
  --confidence-level=<number>      Bootstrap confidence level (0-1)
  --bootstrap-samples=<number>     Bootstrap sample count
  --min-pass-rate-delta=<number>   Required baseline-to-current pass-rate delta
  --json-out=<path>                Write machine-readable gate result JSON
  --junit-out=<path>               Write JUnit XML for CI test-report ingestion
  --sarif-out=<path>               Write SARIF JSON for code-scanning style ingestion
  --github-annotations-out=<path>  Write GitHub-annotation JSON payload for workflow adapters
  --heartbeat-out=<path>           Write gate-run heartbeat JSON (ran|skipped|errored)
  --notify=<channel>               Notify on gate failure/baseline blocked: slack|teams|email (repeatable/csv)
  --notify-webhook=<url>           Shared webhook URL fallback for Slack or Teams
  --notify-slack-webhook=<url>     Slack webhook URL override
  --notify-teams-webhook=<url>     Teams webhook URL override
  --notify-email-smtp=<url>        SMTP connection URL for email notifications
  --notify-email-from=<address>    Sender address for email notifications
  --notify-email-to=<address>      Recipient address (repeatable/csv)
  --notify-report-link=<url/path>  Report URL/path included in notification payloads
  --calibration-suite=<id>           Calibration suite id to require for blocking judge-scored suites
  --calibration-max-age-hours=<n>    Maximum calibration run age in hours (default: 168; must be > 0)
  --calibration-preflight            Force-enable calibration preflight checks
  --allow-stale-calibration          Escape hatch: warn instead of fail when calibration evidence is missing/stale
  --no-calibration-preflight         Disable calibration preflight checks
`;

const publishUsage = `eval-dashboards publish [options]

Options:
  --input=<path>           Artifact directory to read. Default: .evals_output
  --report-dir=<path>      Generated report directory. Default: eval-report
  --target=<name>          Publish target: dir|github-pages|azure-static-webapp|azure-storage
  --out-dir=<path>         Output directory for --target=dir. Default: published-eval-report
  --dry-run                Preview target actions without writing remote state

GitHub Pages target options:
  --repo=<owner/repo>      Required for --target=github-pages
  --branch=<name>          Target branch. Default: gh-pages
  --token=<token>          Optional GitHub token override (else uses GITHUB_TOKEN)

Azure Static Web App target options:
  --app-name=<name>        Required for --target=azure-static-webapp

Azure Storage target options:
  --account=<name>         Required for --target=azure-storage
  --container=<name>       Blob container. Default: $web
`;

const reportIndexUsage = `eval-dashboards report-index [options]

Options:
  --input=<path>           Artifact directory to read. Default: .evals_output
  --out=<path>             Output HTML path. Default: eval-report/overview.html
  --locale=<tag>           Locale override for date/number formatting
`;

const lintUsage = `eval-dashboards lint [options]

Options:
  --input=<path>           Artifact directory to read. Default: .evals_output
  --strict                 Fail on warnings as well as errors
  --fail-on-warning-code=<code>  Fail when warning code appears (repeatable)
`;

const mergeUsage = `eval-dashboards merge [options]

Options:
  --input=<path>           Artifact directory to read. Default: .evals_output
  --out=<path>             Output merged JSON path. Default: eval-report/merged.json
`;

const historyUsage = `eval-dashboards history [options]

Options:
  --input=<path>           Artifact directory to read. Default: .evals_output
  --out=<path>             Output history JSON path. Default: eval-report/history.json
`;

type CheckOutputRow = {
  id: string;
  suite: string;
  category?: string;
  severity?: string;
  reportAnchor: string;
};

type CheckOutputPayload = {
  schemaVersion: 'eval-check-result/v1';
  gateRunStatus: 'ran';
  runId: string;
  baselineRunId?: string;
  passed: boolean;
  failures: string[];
  diagnostics: string[];
  baselineCompatibility?: unknown;
  newlyFailingRows: CheckOutputRow[];
  notifications?: NotificationDispatchResult[];
};

type CheckHeartbeatPayload = {
  schemaVersion: 'eval-check-heartbeat/v1';
  gateRunStatus: 'ran' | 'skipped' | 'errored';
  generatedAt: string;
  exitCode: number;
  runId?: string;
  baselineRunId?: string;
  message?: string;
};

const gateRunStatusFromExitCode = (exitCode: number): CheckHeartbeatPayload['gateRunStatus'] => {
  if (exitCode === 0 || exitCode === 1) {
    return 'ran';
  }
  if (exitCode === 3) {
    return 'skipped';
  }
  return 'errored';
};

const NOTIFICATION_CHANNELS: NotificationChannel[] = ['slack', 'teams', 'email'];

const normalizeChannels = (values: string[]): NotificationChannel[] => {
  const tokens = values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  const invalid = tokens.filter((token) => !NOTIFICATION_CHANNELS.includes(token as NotificationChannel));
  if (invalid.length > 0) {
    throw Object.assign(
      new Error(
        `Unknown --notify channel ${invalid[0]}. Allowed values: ${NOTIFICATION_CHANNELS.join(', ')}.`,
      ),
      { exitCode: 2 },
    );
  }

  return [...new Set(tokens)] as NotificationChannel[];
};

const notificationChannelsFromOptions = (
  options: Record<string, string | boolean | string[]>,
  config?: NotificationsConfig,
): NotificationChannel[] => {
  if (options.notify === true) {
    throw Object.assign(
      new Error(`--notify requires a value. Allowed values: ${NOTIFICATION_CHANNELS.join(', ')}.`),
      { exitCode: 2 },
    );
  }

  const cliChannels = normalizeChannels(optionStrings(options, 'notify', []));
  if (cliChannels.length > 0) {
    return cliChannels;
  }

  const envChannels = process.env.EVAL_NOTIFY_CHANNELS;
  if (envChannels) {
    return normalizeChannels([envChannels]);
  }

  const configChannels = (config?.channels ?? []).map((channel) => channel.toLowerCase());
  return normalizeChannels(configChannels);
};

const normalizeEmailTargets = (values: string[]): string[] =>
  values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

const emailTargetsFromOptions = (
  options: Record<string, string | boolean | string[]>,
  config?: NotificationsConfig,
): string[] => {
  const cliTargets = normalizeEmailTargets(optionStrings(options, 'notify-email-to', []));
  if (cliTargets.length > 0) {
    return cliTargets;
  }

  const envTargets = process.env.EVAL_NOTIFY_EMAIL_TO;
  if (envTargets) {
    return normalizeEmailTargets([envTargets]);
  }

  const configured = config?.email?.to;
  if (typeof configured === 'string') {
    return normalizeEmailTargets([configured]);
  }
  if (Array.isArray(configured)) {
    return normalizeEmailTargets(configured);
  }
  return [];
};

const xmlEscape = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const rowAnchorId = (suite: string, id: string): string => `row-${encodeURIComponent(`${suite}:${id}`)}`;

const reportIndexUri = (reportDir: string): string => path.posix.join(reportDir.replaceAll('\\', '/'), 'index.html');

const toJunitXml = (payload: CheckOutputPayload): string => {
  const failures = payload.failures;
  const diagnostics = payload.diagnostics;
  const newlyFailingRows = payload.newlyFailingRows;

  const testCases: string[] = [];
  if (failures.length === 0) {
    testCases.push('    <testcase classname="eval-dashboards.check" name="gates"/>');
  } else {
    failures.forEach((failure, index) => {
      testCases.push(
        `    <testcase classname="eval-dashboards.check" name="gate-failure-${index + 1}">\n` +
          `      <failure message="${xmlEscape(failure)}">${xmlEscape(failure)}</failure>\n` +
          '    </testcase>',
      );
    });
  }

  diagnostics.forEach((diagnostic, index) => {
    testCases.push(
      `    <testcase classname="eval-dashboards.check" name="diagnostic-${index + 1}">\n` +
        `      <skipped message="${xmlEscape(diagnostic)}"/>\n` +
        '    </testcase>',
    );
  });

  newlyFailingRows.forEach((row) => {
    const rowLabel = `${row.suite}:${row.id}${row.category ? ` (${row.category})` : ''} -> ${row.reportAnchor}`;
    testCases.push(
      `    <testcase classname="eval-dashboards.rows" name="${xmlEscape(`${row.suite}:${row.id}`)}">\n` +
        `      <failure message="${xmlEscape(rowLabel)}">${xmlEscape(rowLabel)}</failure>\n` +
        '    </testcase>',
    );
  });

  const tests = testCases.length;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="eval-dashboards-check" tests="${tests}" failures="${failures.length + newlyFailingRows.length}" errors="0" skipped="${diagnostics.length}">`,
    ...testCases,
    '</testsuite>',
    '',
  ].join('\n');
};

const toSarif = (payload: CheckOutputPayload, reportDir = 'eval-report'): Record<string, unknown> => ({
  $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
  version: '2.1.0',
  runs: [
    {
      tool: {
        driver: {
          name: 'eval-dashboards',
          informationUri: 'https://github.com/IcodeNet/eval-dashboards',
          rules: [
            {
              id: 'eval-gate-failure',
              name: 'Eval gate failure',
              shortDescription: { text: 'Eval gate failure' },
              defaultConfiguration: { level: 'error' },
            },
            {
              id: 'eval-newly-failing-row',
              name: 'Newly failing eval row',
              shortDescription: { text: 'Newly failing eval row' },
              defaultConfiguration: { level: 'warning' },
            },
          ],
        },
      },
      results: [
        ...payload.failures.map((failure) => ({
          ruleId: 'eval-gate-failure',
          level: 'error',
          message: { text: failure },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: reportIndexUri(reportDir),
                },
              },
            },
          ],
        })),
        ...payload.newlyFailingRows.map((row) => ({
          ruleId: 'eval-newly-failing-row',
          level: 'warning',
          message: { text: `${row.suite}:${row.id}${row.category ? ` (${row.category})` : ''}` },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: reportIndexUri(reportDir),
                },
              },
            },
          ],
          properties: {
            reportAnchor: row.reportAnchor,
            suite: row.suite,
            rowId: row.id,
            severity: row.severity ?? null,
          },
        })),
      ],
    },
  ],
});

const toGithubAnnotations = (payload: CheckOutputPayload): Array<Record<string, string>> => [
  ...payload.failures.map((failure) => ({
    level: 'error',
    title: 'eval-dashboards gate failure',
    message: failure,
  })),
  ...payload.newlyFailingRows.map((row) => ({
    level: 'warning',
    title: 'eval-dashboards newly failing row',
    message: `${row.suite}:${row.id}${row.category ? ` (${row.category})` : ''} -> ${row.reportAnchor}`,
  })),
];

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

  const nonCalibrationReports = reports.filter((report) => report.run.kind !== 'calibration');
  const defaultCurrent = nonCalibrationReports.at(-1) ?? reports.at(-1);
  let current = options?.runId ? selectRun(reports, options.runId) : defaultCurrent;

  if (options?.runId && !current) {
    throw Object.assign(new Error(`Run ID ${options.runId} was not found under ${input}.`), {
      exitCode: 2,
    });
  }

  current = current ?? defaultCurrent;

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
    reports,
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

const CALIBRATION_DEFAULT_SUITE = 'judge-calibration';
const CALIBRATION_DEFAULT_MAX_AGE_HOURS = 168;

const parseCalibrationMaxAgeHours = (
  options: Record<string, string | boolean | string[]>,
): number | undefined => {
  const raw = options['calibration-max-age-hours'];
  if (raw === undefined) {
    return undefined;
  }

  if (Array.isArray(raw)) {
    throw Object.assign(new Error('--calibration-max-age-hours may only be set once.'), {
      exitCode: 2,
    });
  }

  if (typeof raw !== 'string') {
    throw Object.assign(new Error('--calibration-max-age-hours requires a numeric value greater than 0.'), {
      exitCode: 2,
    });
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw Object.assign(new Error('--calibration-max-age-hours must be a finite number greater than 0.'), {
      exitCode: 2,
    });
  }

  return parsed;
};

type CalibrationCheckResult = {
  failures: string[];
  diagnostics: string[];
};

const isJudgeScoredSuite = (manifest: SuiteManifest): boolean =>
  manifest.graders.includes('llm-judge') || manifest.graders.includes('human-labelled-calibration');

const evaluateCalibrationChecks = (
  reports: EvalReportV1[],
  current: EvalReportV1,
  gateConfig: GateConfig,
): CalibrationCheckResult => {
  const failures: string[] = [];
  const diagnostics: string[] = [];

  const calibrationConfig = gateConfig.calibration ?? {};
  if (calibrationConfig.enabled === false) {
    return { failures, diagnostics };
  }

  const suiteId = calibrationConfig.suite ?? CALIBRATION_DEFAULT_SUITE;
  const maxAgeHours = calibrationConfig.maxAgeHours ?? CALIBRATION_DEFAULT_MAX_AGE_HOURS;
  const allowBlockingWithoutRecentMatch = calibrationConfig.allowBlockingWithoutRecentMatch === true;
  if (!current.suiteManifests?.length) {
    return { failures, diagnostics };
  }

  const targetSuites = current.suiteManifests.filter(
    (manifest) => manifest.name !== suiteId && isJudgeScoredSuite(manifest),
  );
  if (targetSuites.length === 0) {
    return { failures, diagnostics };
  }

  const calibrationConfigured = current.suiteManifests.some((manifest) => manifest.name === suiteId);
  const forceEnabled = calibrationConfig.enabled === true;
  if (!calibrationConfigured && !forceEnabled) {
    return { failures, diagnostics };
  }

  const expectedCalibrationRubricVersion =
    current.suiteManifests.find((manifest) => manifest.name === suiteId)?.rubricVersion ??
    current.rubricContracts?.find((contract) => contract.suiteName === suiteId)?.rubricVersion;

  if (calibrationConfigured && expectedCalibrationRubricVersion === undefined) {
    throw Object.assign(
      new Error(
        `Invalid calibration gate config: calibration suite "${suiteId}" requires rubric metadata ` +
          '(suite manifest or rubric contract) in the current artifact.',
      ),
      { exitCode: 2 },
    );
  }

  const nowMs = Number.isFinite(Date.parse(current.run.generatedAt))
    ? Date.parse(current.run.generatedAt)
    : Date.now();
  const cutoffMs = nowMs - maxAgeHours * 60 * 60 * 1000;

  const evidenceRuns = reports.filter((report) => {
    const generatedAtMs = Date.parse(report.run.generatedAt);
    if (!Number.isFinite(generatedAtMs)) {
      return false;
    }
    return generatedAtMs >= cutoffMs && generatedAtMs <= nowMs;
  });

  for (const manifest of targetSuites) {
    const suiteRows = current.rows.filter((row) => row.suite === manifest.name);
    const judgeModels = [...new Set(suiteRows.map((row) => row.judgeModel).filter((value): value is string => typeof value === 'string' && value.length > 0))];

    if (judgeModels.length === 0) {
      const issue =
        `Calibration preflight: suite "${manifest.name}" has no judgeModel values in current rows; ` +
        'calibration evidence cannot be matched.';
      if (manifest.gate.mode === 'blocking' && !allowBlockingWithoutRecentMatch) {
        failures.push(issue);
      } else {
        diagnostics.push(`${issue} (warning-only)`);
      }
      continue;
    }

    for (const judgeModel of judgeModels) {
      const evidenceCandidates =
        manifest.gate.mode === 'blocking'
          ? evidenceRuns.filter((report) => report.run.id !== current.run.id)
          : evidenceRuns;

      const hasRecentMatch = evidenceCandidates.some((report) => {
        const calibrationManifest = report.suiteManifests?.find((candidate) => candidate.name === suiteId);
        if (!calibrationManifest) {
          return false;
        }

        const calibrationRubricVersion =
          calibrationManifest.rubricVersion ??
          report.rubricContracts?.find((contract) => contract.suiteName === suiteId)?.rubricVersion;
        if (
          expectedCalibrationRubricVersion !== undefined &&
          calibrationRubricVersion !== expectedCalibrationRubricVersion
        ) {
          return false;
        }

        return report.rows.some(
          (row) =>
            row.suite === suiteId &&
            row.judgeModel === judgeModel &&
            row.groundTruthVerdict !== undefined,
        );
      });

      if (hasRecentMatch) {
        continue;
      }

      const issue =
        `Calibration preflight: suite "${manifest.name}" requires recent "${suiteId}" evidence ` +
        `(judgeModel="${judgeModel}", calibrationRubricVersion="${expectedCalibrationRubricVersion ?? 'n/a'}", maxAgeHours=${maxAgeHours}) ` +
        'but no matching calibration run was found.';

      if (manifest.gate.mode === 'blocking' && !allowBlockingWithoutRecentMatch) {
        failures.push(issue);
      } else {
        diagnostics.push(`${issue} (warning-only)`);
      }
    }
  }

  return { failures, diagnostics };
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
  const calibrationSuite = optionString(options, 'calibration-suite', '');
  const calibrationMaxAgeHours = parseCalibrationMaxAgeHours(options);
  const enableCalibrationPreflight = optionBoolean(options, 'calibration-preflight');
  const allowStaleCalibration = optionBoolean(options, 'allow-stale-calibration');
  const disableCalibrationPreflight = optionBoolean(options, 'no-calibration-preflight');
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

  const calibration =
    calibrationSuite !== '' ||
    calibrationMaxAgeHours !== undefined ||
    enableCalibrationPreflight ||
    allowStaleCalibration ||
    disableCalibrationPreflight
      ? {
        ...(enableCalibrationPreflight ? { enabled: true } : {}),
        ...(disableCalibrationPreflight ? { enabled: false } : {}),
        ...(calibrationSuite !== '' ? { suite: calibrationSuite } : {}),
        ...(calibrationMaxAgeHours !== undefined ? { maxAgeHours: calibrationMaxAgeHours } : {}),
        ...(allowStaleCalibration ? { allowBlockingWithoutRecentMatch: true } : {}),
      }
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
    ...(calibration ? { calibration } : {}),
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

const normalizeReporters = (reporters: string[]): ReporterName[] => {
  const normalized: ReporterName[] = [];

  for (const reporter of reporters) {
    const value = reporter.trim().toLowerCase();
    const mapped = value === 'markdown' ? 'markdown-summary' : value;

    if (
      mapped === 'html' ||
      mapped === 'markdown-summary' ||
      mapped === 'json-summary' ||
      mapped === 'text'
    ) {
      normalized.push(mapped);
      continue;
    }

    if (mapped === 'none') continue;

    throw Object.assign(
      new Error(`Unknown reporter ${reporter}. Use html, markdown-summary, json-summary, text, or none.`),
      { exitCode: 2 },
    );
  }

  return normalized;
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

const assertValidCalibrationGateConfig = (gateConfig: GateConfig): void => {
  const calibration = gateConfig.calibration;
  if (!calibration) {
    return;
  }

  if (calibration.maxAgeHours !== undefined) {
    const maxAgeHours = Number(calibration.maxAgeHours);
    if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
      throw Object.assign(
        new Error('Invalid calibration gate config: maxAgeHours must be a finite number greater than 0.'),
        { exitCode: 2 },
      );
    }
  }
};

const main = async (): Promise<void> => {
  const rawArgs = process.argv.slice(2);
  const parsed = parseArgs(rawArgs);
  const { command, options } = parsed;

  assertKnownFlags(parsed);
  const isCheckCommand = command === 'check';
  const cliCalibrationSuite = isCheckCommand ? optionString(options, 'calibration-suite', '') : '';
  const cliCalibrationMaxAgeHours = isCheckCommand ? parseCalibrationMaxAgeHours(options) : undefined;
  const cliEnableCalibrationPreflight = isCheckCommand
    ? optionBoolean(options, 'calibration-preflight')
    : false;
  const cliDisableCalibrationPreflight = isCheckCommand
    ? optionBoolean(options, 'no-calibration-preflight')
    : false;
  const cliAllowStaleCalibration = isCheckCommand ? optionBoolean(options, 'allow-stale-calibration') : false;

  if (isCheckCommand && cliEnableCalibrationPreflight && cliDisableCalibrationPreflight) {
    throw Object.assign(
      new Error('Cannot combine --calibration-preflight and --no-calibration-preflight.'),
      { exitCode: 2 },
    );
  }

  // Load file-based config, then merge CLI flags on top (CLI wins)
  const fileConfig = await loadConfig();
  assertValidCalibrationGateConfig({ calibration: fileConfig.gates?.calibration });
  const mergedCalibration = (() => {
    const enabled = cliDisableCalibrationPreflight
      ? false
      : cliEnableCalibrationPreflight
        ? true
        : fileConfig.gates?.calibration?.enabled;
    const suite = cliCalibrationSuite || fileConfig.gates?.calibration?.suite;
    const maxAgeHours = cliCalibrationMaxAgeHours ?? fileConfig.gates?.calibration?.maxAgeHours;
    const allowBlockingWithoutRecentMatch =
      cliAllowStaleCalibration || fileConfig.gates?.calibration?.allowBlockingWithoutRecentMatch;

    if (
      enabled === undefined &&
      suite === undefined &&
      maxAgeHours === undefined &&
      allowBlockingWithoutRecentMatch === undefined
    ) {
      return undefined;
    }

    return {
      enabled,
      suite,
      maxAgeHours,
      allowBlockingWithoutRecentMatch,
    };
  })();

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
      calibration: mergedCalibration,
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

  if (command === 'adjudicate') {
    const adjudicationAction = rawArgs[1] && !rawArgs[1].startsWith('--') ? rawArgs[1] : '';

    if (optionBoolean(options, 'help') || !adjudicationAction) {
      console.log(adjudicationUsage);
      return;
    }

    if (adjudicationAction !== 'export' && adjudicationAction !== 'import') {
      throw Object.assign(new Error(`Unknown adjudicate action ${adjudicationAction}. Use export or import.`), {
        exitCode: 2,
      });
    }

    if (adjudicationAction === 'export') {
      const runId = optionString(options, 'run-id', '');
      const context = await loadContext(input, reportDir, {
        runId: runId || undefined,
      });
      const out = optionString(options, 'out', path.join(reportDir, 'adjudication-bundle.json'));
      const includePassedRows = optionBoolean(options, 'include-passed');
      const bundle = exportUnresolvedRowsBundle(context.current, { includePassedRows });
      await writeJsonFile(out, bundle);
      console.log(`Exported ${bundle.rows.length} unresolved row(s) from ${context.current.run.id} to ${out}`);
      return;
    }

    const bundlePath = optionString(options, 'bundle', '');
    if (!bundlePath) {
      throw Object.assign(new Error('Missing required --bundle option for adjudicate import.'), {
        exitCode: 2,
      });
    }

    let bundleRaw = '';
    try {
      bundleRaw = await readFile(bundlePath, 'utf8');
    } catch {
      throw Object.assign(
        new Error(
          `Could not read adjudication bundle at ${bundlePath}. Confirm --bundle points to an existing JSON file.`,
        ),
        { exitCode: 2 },
      );
    }

    let parsedBundle: unknown;
    try {
      parsedBundle = JSON.parse(bundleRaw) as unknown;
    } catch {
      throw Object.assign(
        new Error(
          `Invalid JSON in adjudication bundle ${bundlePath}. Fix the file or re-export with 'eval-dashboards adjudicate export'.`,
        ),
        { exitCode: 2 },
      );
    }

    const bundleErrors = validateAdjudicationBundle(parsedBundle);
    if (bundleErrors.length > 0) {
      throw Object.assign(new Error(`Invalid adjudication bundle: ${bundleErrors[0]}`), {
        exitCode: 2,
      });
    }

    const bundle = parsedBundle as AdjudicationBundleV1;
    const runId = optionString(options, 'run-id', '') || bundle.source.runId;
    if (!runId) {
      throw Object.assign(
        new Error('Could not determine target run for adjudicate import. Provide --run-id.'),
        { exitCode: 2 },
      );
    }

    const reports = await readEvalReports(input);
    const target = selectRun(reports, runId);
    if (!target) {
      throw Object.assign(new Error(`Run ID ${runId} was not found under ${input}.`), {
        exitCode: 2,
      });
    }

    const allowSingleReviewer = optionBoolean(options, 'allow-single-reviewer');
    const merged = mergeAdjudicationBundle(target, bundle, {
      sourceBundlePath: bundlePath,
      allowSingleReviewer,
    });
    const out = optionString(options, 'out', path.join(reportDir, `adjudicated-${runId}.json`));
    await writeJsonFile(out, merged.report);
    const unmatchedNote =
      merged.unmatchedRows.length > 0
        ? `; unmatched rows: ${merged.unmatchedRows.slice(0, 5).join(', ')}${
          merged.unmatchedRows.length > 5 ? '…' : ''
        }`
        : '';
    const disagreementNote =
      merged.disagreementRate !== undefined
        ? `, disagreementRate=${merged.disagreementRate.toFixed(3)}`
        : '';
    console.log(
      `Merged adjudication bundle ${bundle.bundleId} into ${runId}: applied=${merged.applied}, skippedMissingReview=${merged.skippedMissingReview}, skippedInvalidVerdict=${merged.skippedInvalidVerdict}, skippedInsufficientReviewers=${merged.skippedInsufficientReviewers}, skippedDisagreement=${merged.skippedDisagreement}, unmatched=${merged.unmatchedRows.length}${unmatchedNote}${disagreementNote}. Wrote ${out}`,
    );
    return;
  }

  if (command === 'report') {
    if (optionBoolean(options, 'help')) {
      console.log(reportUsage);
      return;
    }

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
    const reporters = normalizeReporters((config.reporters as string[] | undefined) ?? ['html', 'text']);
    const theme = optionString(options, 'theme', '') || config.theme as string | undefined;
    const locale = optionString(options, 'locale', '') || config.locale;
    assertValidStatisticalGateConfig({ statistical: config.gates?.statistical });
    assertValidCalibrationGateConfig({ calibration: config.gates?.calibration });
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
    if (optionBoolean(options, 'help')) {
      console.log(reportIndexUsage);
      return;
    }

    const reports = await readEvalReports(input);
    const locale = optionString(options, 'locale', '') || config.locale;
    const out = optionString(options, 'out', path.join(reportDir, 'overview.html'));
    await writeTextFile(out, renderGroupedIndexHtml(reports, locale));
    console.log(out);
    return;
  }

  if (command === 'check') {
    if (optionBoolean(options, 'help')) {
      console.log(checkUsage);
      return;
    }

    const jsonOut = optionString(options, 'json-out', '');
    const junitOut = optionString(options, 'junit-out', '');
    const sarifOut = optionString(options, 'sarif-out', '');
    const githubAnnotationsOut = optionString(options, 'github-annotations-out', '');
    const heartbeatOut = optionString(options, 'heartbeat-out', '');
    const notificationChannels = notificationChannelsFromOptions(options, config.notifications);
    const sharedWebhookUrl = optionString(options, 'notify-webhook', '') || process.env.EVAL_NOTIFY_WEBHOOK || '';
    const hasSlackChannel = notificationChannels.includes('slack');
    const hasTeamsChannel = notificationChannels.includes('teams');
    const sharedSlackWebhookUrl = hasSlackChannel && !hasTeamsChannel ? sharedWebhookUrl : '';
    const sharedTeamsWebhookUrl = hasTeamsChannel && !hasSlackChannel ? sharedWebhookUrl : '';
    const slackWebhookUrl =
      optionString(options, 'notify-slack-webhook', '') ||
      process.env.EVAL_NOTIFY_SLACK_WEBHOOK ||
      config.notifications?.slack?.webhookUrl ||
      sharedSlackWebhookUrl;
    const teamsWebhookUrl =
      optionString(options, 'notify-teams-webhook', '') ||
      process.env.EVAL_NOTIFY_TEAMS_WEBHOOK ||
      config.notifications?.teams?.webhookUrl ||
      sharedTeamsWebhookUrl;
    const emailSmtpUrl =
      optionString(options, 'notify-email-smtp', '') ||
      process.env.EVAL_NOTIFY_SMTP_URL ||
      config.notifications?.email?.smtpUrl;
    const emailFrom =
      optionString(options, 'notify-email-from', '') ||
      process.env.EVAL_NOTIFY_EMAIL_FROM ||
      config.notifications?.email?.from;
    const emailTo = emailTargetsFromOptions(options, config.notifications);
    const notifyReportLink =
      optionString(options, 'notify-report-link', '') ||
      process.env.EVAL_NOTIFY_REPORT_LINK ||
      config.notifications?.reportUrl ||
      defaultReportLink(reportDir);

    if (hasSlackChannel && hasTeamsChannel && sharedWebhookUrl) {
      throw Object.assign(
        new Error(
          '--notify-webhook cannot be shared when both slack and teams channels are enabled; set --notify-slack-webhook and --notify-teams-webhook separately.',
        ),
        { exitCode: 2 },
      );
    }

    let heartbeatRunId: string | undefined;
    let heartbeatBaselineRunId: string | undefined;
    const writeHeartbeat = async (payload: CheckHeartbeatPayload): Promise<void> => {
      if (!heartbeatOut) {
        return;
      }
      try {
        await writeJsonFile(heartbeatOut, payload);
      } catch (heartbeatError) {
        const heartbeatMessage =
          heartbeatError instanceof Error ? heartbeatError.message : String(heartbeatError);
        console.error(`Warning: could not write heartbeat output ${heartbeatOut}: ${heartbeatMessage}`);
      }
    };

    try {
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
      if ((config.gates?.calibration ?? cliGateOverrides.calibration) !== undefined) {
        gateConfig.calibration = {
          ...(config.gates?.calibration ?? {}),
          ...(cliGateOverrides.calibration ?? {}),
        };
      }
      assertValidStatisticalGateConfig(gateConfig);
      assertValidCalibrationGateConfig(gateConfig);
      const gateResult = checkGates(
        context.current,
        context.comparison,
        gateConfig,
        context.baselineCompatibility,
        context.previous,
      );
      const calibrationChecks = evaluateCalibrationChecks(context.reports, context.current, gateConfig);
      const combinedFailures = [...gateResult.failures, ...calibrationChecks.failures];
      const combinedDiagnostics = [...gateResult.diagnostics, ...calibrationChecks.diagnostics];
      const gatePassed = combinedFailures.length === 0;

      heartbeatRunId = context.current.run.id;
      heartbeatBaselineRunId = context.previous?.run.id;

      const checkPayload: CheckOutputPayload = {
        schemaVersion: 'eval-check-result/v1',
        gateRunStatus: 'ran',
        runId: context.current.run.id,
        baselineRunId: context.previous?.run.id,
        passed: gatePassed,
        failures: combinedFailures,
        diagnostics: combinedDiagnostics,
        baselineCompatibility: context.baselineCompatibility,
        newlyFailingRows: context.comparison.newlyFailing.map((row) => ({
          id: row.id,
          suite: row.suite,
          category: row.category,
          severity: row.severity,
          reportAnchor: `#${rowAnchorId(row.suite, row.id)}`,
        })),
      };

      const baselineBlocked = context.baselineCompatibility?.status === 'blocked';
      const previousBaselineCompatibility = (() => {
        if (!context.previous) {
          return undefined;
        }
        const previousBaseline = selectBaselineByStrategy(context.reports, context.previous.run.id, {
          strategy: baselineStrategy ?? 'rolling',
          lookback: baselineLookback,
        });
        return assessBaselineCompatibility(
          context.previous.suiteManifests,
          previousBaseline?.suiteManifests,
          previousBaseline !== undefined,
        );
      })();
      const newlyBlockedBaseline =
        baselineBlocked && !baselineRunId && previousBaselineCompatibility?.status !== 'blocked';

      const shouldNotify = notificationChannels.length > 0 && (!gatePassed || newlyBlockedBaseline);
      if (shouldNotify) {
        const failingSuites = [
          ...new Set(context.current.rows.filter((row) => !row.passed).map((row) => row.suite)),
        ].sort();
        const eventFailures =
          combinedFailures.length > 0
            ? combinedFailures
            : baselineBlocked
              ? ['Baseline compatibility is blocked due to dataset/rubric version drift.']
              : [];

        const notificationResults = await sendGateNotifications(
          notificationChannels,
          {
            slackWebhookUrl,
            teamsWebhookUrl,
            emailSmtpUrl,
            emailFrom,
            emailTo,
          },
          {
            runId: context.current.run.id,
            baselineRunId: context.previous?.run.id,
            reportLink: notifyReportLink,
            failingSuites,
            failures: eventFailures,
            baselineCompatibility: context.baselineCompatibility,
          },
        );

        checkPayload.notifications = notificationResults;
        for (const status of notificationResults) {
          if (status.status === 'sent') {
            continue;
          }
          const reason = status.reason ? ` (${status.reason})` : '';
          checkPayload.diagnostics.push(`Notification ${status.channel} ${status.status}${reason}.`);
        }
      }

      if (jsonOut) {
        await writeJsonFile(jsonOut, checkPayload);
      }
      if (junitOut) {
        await writeTextFile(junitOut, toJunitXml(checkPayload));
      }
      if (sarifOut) {
        await writeJsonFile(sarifOut, toSarif(checkPayload, reportDir));
      }
      if (githubAnnotationsOut) {
        await writeJsonFile(githubAnnotationsOut, toGithubAnnotations(checkPayload));
      }

      await writeHeartbeat({
        schemaVersion: 'eval-check-heartbeat/v1',
        gateRunStatus: 'ran',
        generatedAt: new Date().toISOString(),
        exitCode: gatePassed ? 0 : 1,
        runId: heartbeatRunId,
        baselineRunId: heartbeatBaselineRunId,
      });

      if (gatePassed) {
        if (combinedDiagnostics.length > 0) {
          console.log(`Gate diagnostics:\n${combinedDiagnostics.join('\n')}`);
        }
        console.log('Eval gates passed.');
        return;
      }

      const diagnostics = combinedDiagnostics.length > 0 ? `\nDiagnostics:\n${combinedDiagnostics.join('\n')}` : '';
      console.error(`Eval gates failed:\n${combinedFailures.join('\n')}${diagnostics}`);
      process.exitCode = 1;
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exitCode =
        typeof error === 'object' && error !== null && 'exitCode' in error
          ? Number(error.exitCode)
          : 2;
      const normalizedExitCode = Number.isFinite(exitCode) ? exitCode : 2;
      await writeHeartbeat({
        schemaVersion: 'eval-check-heartbeat/v1',
        gateRunStatus: gateRunStatusFromExitCode(normalizedExitCode),
        generatedAt: new Date().toISOString(),
        exitCode: normalizedExitCode,
        runId: heartbeatRunId,
        baselineRunId: heartbeatBaselineRunId,
        message,
      });
      console.error(message);
      process.exitCode = normalizedExitCode;
      return;
    }
  }

  if (command === 'lint') {
    if (optionBoolean(options, 'help')) {
      console.log(lintUsage);
      return;
    }

    const reports = await readEvalReports(input);
    const result = lintReportsTaxonomy(reports);
    const strict = optionBoolean(options, 'strict');
    const lintFailOnWarningCodes = new Set(optionStrings(options, 'fail-on-warning-code', []));
    const triggeredFailOnWarningCodes = result.issues
      .filter((issue) => issue.level === 'warning' && lintFailOnWarningCodes.has(issue.code))
      .map((issue) => issue.code);

    const shouldFail =
      !result.passed ||
      (strict && result.issues.some((issue) => issue.level === 'warning')) ||
      triggeredFailOnWarningCodes.length > 0;

    if (result.issues.length === 0) {
      console.log('Eval taxonomy lint passed with no issues.');
      return;
    }

    const errorCount = result.issues.filter((issue) => issue.level === 'error').length;
    const warningCount = result.issues.length - errorCount;

    const issueLines = result.issues.map(
      (issue) => `${issue.level.toUpperCase()} [${issue.code}] ${issue.message}`,
    );

    const failOnWarningSummary =
      triggeredFailOnWarningCodes.length > 0
        ? `\nFail-on-warning codes triggered: ${[...new Set(triggeredFailOnWarningCodes)].join(', ')}.`
        : '';

    if (shouldFail) {
      console.error(
        `Eval taxonomy lint failed with ${errorCount} error(s) and ${warningCount} warning(s):\n${issueLines.join('\n')}${failOnWarningSummary}`,
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
    if (optionBoolean(options, 'help')) {
      console.log(mergeUsage);
      return;
    }

    const reports = await readEvalReports(input);
    const out = optionString(options, 'out', 'eval-report/merged.json');
    await writeJsonFile(out, { schemaVersion: 'eval-report-merged/v1', reports });
    console.log(out);
    return;
  }

  if (command === 'history') {
    if (optionBoolean(options, 'help')) {
      console.log(historyUsage);
      return;
    }

    const reports = await readEvalReports(input);
    const out = optionString(options, 'out', 'eval-report/history.json');
    await writeJsonFile(out, buildHistory(reports));
    console.log(out);
    return;
  }

  if (command === 'publish') {
    if (optionBoolean(options, 'help')) {
      console.log(publishUsage);
      return;
    }

    const context = await loadContext(input, reportDir);
    await renderReports(context, ['html', 'json-summary']);
    const result = await publishReport({
      target: optionString(options, 'target', 'dir') as PublishTarget,
      reportDir,
      outDir: optionString(options, 'out-dir', 'published-eval-report'),
      dryRun: optionBoolean(options, 'dry-run'),
      repo: typeof options.repo === 'string' ? options.repo : undefined,
      branch: typeof options.branch === 'string' ? options.branch : undefined,
      token: typeof options.token === 'string' ? options.token : undefined,
      appName: typeof options['app-name'] === 'string' ? options['app-name'] : undefined,
      account: typeof options.account === 'string' ? options.account : undefined,
      container: typeof options.container === 'string' ? options.container : undefined,
    });
    console.log(result.url ? `${result.message}\n${result.url}` : result.message);
    return;
  }

  throw Object.assign(new Error(`Unknown command ${command}.`), { exitCode: 2 });
};

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const exitCode =
    typeof error === 'object' && error !== null && 'exitCode' in error
      ? Number(error.exitCode)
      : 2;
  const normalizedExitCode = Number.isFinite(exitCode) ? exitCode : 2;

  const maybeWriteHeartbeat = async (): Promise<void> => {
    const { command, options } = parseArgs(process.argv.slice(2));
    if (command !== 'check') {
      return;
    }

    const heartbeatOut = optionString(options, 'heartbeat-out', '');
    if (!heartbeatOut) {
      return;
    }

    const payload: CheckHeartbeatPayload = {
      schemaVersion: 'eval-check-heartbeat/v1',
      gateRunStatus: gateRunStatusFromExitCode(normalizedExitCode),
      generatedAt: new Date().toISOString(),
      exitCode: normalizedExitCode,
      message,
    };

    try {
      await writeJsonFile(heartbeatOut, payload);
    } catch (heartbeatError) {
      const heartbeatMessage =
        heartbeatError instanceof Error ? heartbeatError.message : String(heartbeatError);
      console.error(`Warning: could not write heartbeat output ${heartbeatOut}: ${heartbeatMessage}`);
    }
  };

  await maybeWriteHeartbeat();
  console.error(message);
  process.exitCode = normalizedExitCode;
});