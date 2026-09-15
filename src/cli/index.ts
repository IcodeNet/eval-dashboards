import path from 'node:path';
import { createHash } from 'node:crypto';
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
import { buildOrgRollup, repoHistoryFromPayload, type RepoHistory } from '../history/org-rollup.js';
import { renderOrgRollupHtml } from '../reporters/org-rollup.js';
import { readEvalReports, findJsonReports, findFilesByName, writeJsonFile, writeTextFile, appendTextFile } from '../io/reports.js';
import type { EvalReportV1, SuiteManifest } from '../model/eval-report-v1.js';
import { lintReportsTaxonomy } from '../gates/lint-taxonomy.js';
import { checkGates, type GateConfig } from '../gates/check-gates.js';
import { applyWaivers, loadWaiverRegister } from '../gates/waivers.js';
import { detectGateConfigLoosening } from '../gates/threshold-change.js';
import { filterReportByTier, evaluatePrTierBudget, type TierCostSummary } from '../gates/pr-tiering.js';
import {
  buildBypassLogEntry,
  parseBypassLog,
  bypassUsageForRun,
  summarizeBypassUsage,
  serializeBypassLogEntry,
  type BypassLogEntryV1,
} from '../gates/bypass-accounting.js';
import {
  type StatisticalGateMode,
  validateStatisticalGateConfig,
} from '../gates/statistical.js';
import { publishReport, type PublishTarget } from '../publish/publish.js';
import { redactEvalReport, findSensitiveFields } from '../model/redact.js';
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
import {
  buildEvidenceBundle,
  verifyEvidenceBundle,
  type EvidenceBundleInput,
  type EvidenceBundleV1,
} from '../evidence/bundle.js';
import type { NewFailureKeyMode } from '../gates/check-gates.js';
import {
  defaultReportLink,
  sendGateNotifications,
  type NotificationDispatchResult,
} from '../notifications/notify.js';
import { signArtifact, verifyArtifact } from '../sign/sign.js';
import { verifyHeartbeatFile, gateRunStatusFromExitCode, type CheckHeartbeatPayload as ImportedCheckHeartbeatPayload } from '../gates/heartbeat.js';

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
  sign     Hash and detached-sign a check-result artifact (cosign keyless in CI).
  verify   Re-validate a check-result artifact's digest and detached signature.
  heartbeat-verify  Assert a fresh gate-run heartbeat exists for a release subject (scheduled check).
  org-rollup  Render one static HTML overview from N published per-repo history.json artifacts.
  evidence-export  Bundle a report, check result, waivers, and signature into one evidence file (4F.11).
  evidence-verify   Independently re-validate a previously produced evidence bundle.
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
  --json-out=<path>                Write machine-readable gate result JSON (eval-check-result/v1)
  --json-v2-out=<path>             Write eval-check-result/v2 JSON with full audit provenance
                                    (resolved gate config, per-suite dataset/rubric versions,
                                    sha256 digests of input artifacts, subject commit/release,
                                    and CI environment); v1 output/consumers are unaffected
  --junit-out=<path>               Write JUnit XML for CI test-report ingestion
  --sarif-out=<path>               Write SARIF JSON for code-scanning style ingestion
  --github-annotations-out=<path>  Write GitHub-annotation JSON payload for workflow adapters
  --heartbeat-out=<path>           Write gate-run heartbeat JSON (ran|skipped|errored)
  --waiver-file=<path>              Path to an eval-waiver-register/v1 JSON file; active
                                    waivers suppress their matched failures (reported
                                    prominently) and expired waivers always fail the gate
  --baseline-gate-config=<path>     Path to a recorded GateConfig JSON file; fails the gate
                                    if the resolved gate config loosens any threshold vs it
  --allow-gate-loosening            Escape hatch: acknowledge a detected loosening instead of
                                    failing the gate (still surfaced in diagnostics/json-out)
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
  --bypass-log=<path>                Append a JSON-lines bypass-usage record for this run
                                    (which of --allow-blocked-baseline/--allow-stale-calibration/
                                    --allow-gate-loosening were used); also configurable via
                                    bypassLogFile in the config file. Feed the same path to
                                    \`history --bypass-log=<path>\` to count/trend bypass use.
  --tier=<pr|full>                    Gate only suites tagged for this tier (suiteManifests[].tier;
                                    untagged suites default to "both" and always participate).
                                    Filters suites/rows before all other gates run.
  --max-pr-cost-usd=<number>          Fail if the selected tier's summed row metadata.costUsd
                                    exceeds this budget (requires --tier)
  --max-pr-duration-ms=<number>       Fail if the selected tier's summed row durationMs exceeds
                                    this budget (requires --tier)
`;

const publishUsage = `eval-dashboards publish [options]

Options:
  --input=<path>           Artifact directory to read. Default: .evals_output
  --report-dir=<path>      Generated report directory. Default: eval-report
  --target=<name>          Publish target: dir|github-pages|azure-static-webapp|azure-storage|github-pr-comment
  --out-dir=<path>         Output directory for --target=dir. Default: published-eval-report
  --dry-run                Preview target actions without writing remote state
  --redact                 Strip sensitive evidence text (prompts, outputs, judge/agent reasoning,
                           tool call args/results, questions) before rendering and publishing;
                           only the public tier (ids, counts, rates, categories, severities,
                           verdicts, versions) is emitted.
  --allow-sensitive-publish  Override the publish preflight hard-fail that triggers when
                           unredacted sensitive evidence fields are present in the payload.
                           Use of this override is always recorded in publish-run-record.json.
  --bypass-log=<path>      Append a JSON-lines bypass-usage record when --allow-sensitive-publish
                           was actually needed (i.e. sensitive fields were present); also
                           configurable via bypassLogFile in the config file.

Publish preflight:
  Publishing fails (exit code 2) when the report being published still contains
  sensitive evidence fields (question, input, output, expected, reason,
  judgeReasoning, agentReasoning, groundTruthAnnotation, turn content, tool
  call results) and --allow-sensitive-publish was not passed. Pass --redact to
  strip these fields, or pass --allow-sensitive-publish to publish anyway.

GitHub Pages target options:
  --repo=<owner/repo>      Required for --target=github-pages
  --branch=<name>          Target branch. Default: gh-pages
  --token=<token>          Optional GitHub token override (else uses GITHUB_TOKEN)

Azure Static Web App target options:
  --app-name=<name>        Required for --target=azure-static-webapp

Azure Storage target options:
  --account=<name>         Required for --target=azure-storage
  --container=<name>       Blob container. Default: $web

GitHub PR-comment target options:
  --pr-number=<n>          PR number to comment on. Falls back to GITHUB_EVENT_PATH
                           (pull_request/pull_request_target payload) or PR_NUMBER env var.
  --comment-marker=<text>  Hidden HTML-comment marker used to find and update the same
                           comment on repeat runs instead of creating duplicates.
                           Default: "<!-- eval-dashboards:pr-comment -->"
  Requires --repo=<owner/repo>. Posts the markdown-summary reporter output
  (report-dir/summary.md) as the comment body. Dry-run by default outside CI
  (no GITHUB_ACTIONS/CI env). Requires GITHUB_TOKEN with \`pull-requests: write\`
  permission. Never logs the token.

  Example GitHub Actions step:
    permissions:
      pull-requests: write
    steps:
      - run: npx eval-dashboards publish --input=.evals_output --report-dir=eval-report \\
              --target=github-pr-comment --repo=\${{ github.repository }}
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
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
  --bypass-log=<path>      Path to a JSON-lines bypass-usage log (written by \`check\`/\`publish\`
                           --bypass-log); when set, each run's history entry gets a
                           \`bypassUsage\` field counting gate escape hatches used for that run
                           id, so erosion shows up as a trend instead of only in CI logs.
`;

const signUsage = `eval-dashboards sign [options]

Hashes a check-result artifact (e.g. an eval-check-result/v1 or /v2 JSON file) and
writes a detached eval-check-signature/v1 record next to it. In CI with a Sigstore/
Fulcio OIDC token available, this shells out to \`cosign sign-blob --yes --bundle\`
for a real keyless signature. Locally, or wherever cosign is unavailable, the
signature record is written with method: "unavailable" and a clear reason instead
of failing or fabricating a signature.

Options:
  --artifact=<path>        Path to the check-result artifact to hash and sign (required)
  --out=<path>              Output signature JSON path. Default: <artifact>.sig.json
`;

const verifyUsage = `eval-dashboards verify [options]

Re-validates a check-result artifact against its recorded sha256 digest and detached
signature. Fails (exit 1) if the artifact's bytes no longer match the digest recorded
at signing time, or if the signature is missing/"unavailable"/fails cosign verify-blob.

Options:
  --artifact=<path>                       Path to the check-result artifact to verify (required)
  --signature=<path>                       Path to the eval-check-signature/v1 file. Default: <artifact>.sig.json
  --certificate-identity-regexp=<regexp>   Required cosign certificate identity regexp (cosign-keyless only)
  --certificate-oidc-issuer=<issuer>       Required cosign certificate OIDC issuer (cosign-keyless only)
`;

const orgRollupUsage = `eval-dashboards org-rollup [options]

Renders one static, offline HTML overview from N already-published per-repo
history.json artifacts (the same file \`eval-dashboards history\` or
\`report --reporter=html\` already writes). Answers "which agent regressed
this week" without opening each repo's own report site. Purely a static
reader over local files: no ingestion API, no auth, no server, no
cross-repo network calls — copy each repo's published history.json under
one directory first (e.g. via your existing CI publish step), then run
this against that directory.

Options:
  --input=<path>   Directory to recursively search for history.json files. Default: org-rollup-input
  --out=<path>     Output HTML path. Default: eval-report/org-rollup.html
  --locale=<tag>   BCP-47 locale for date formatting (e.g. en-US)
`;

const evidenceExportUsage = `eval-dashboards evidence-export [options]

4F.11 — Produces one self-contained evidence bundle for a release: the eval
report, the check-result artifact, the active waiver register, an optional
bypass log, an optional approval trail, and an optional detached signature
are each hashed (sha256) and embedded verbatim into a single JSON file,
alongside a top-level digest over all of those digests. Hand the resulting
file to an examiner and they can independently verify it (see
eval-dashboards evidence-verify) without needing access to any of the
original inputs.

Options:
  --report=<path>            Path to the eval-report/v1 JSON artifact (required)
  --check-result=<path>      Path to the eval-check-result/v1 or /v2 JSON artifact (required)
  --waiver-file=<path>       Path to the eval-waiver-register/v1 JSON file
  --bypass-log=<path>        Path to a bypass-usage JSON-lines log
  --approval-trail=<path>    Path to a freeform approval-trail JSON/text file
  --signature=<path>         Path to an eval-check-signature/v1 file (from the "sign" command)
  --run-id=<id>               runId recorded on the bundle (informational)
  --baseline-run-id=<id>       baselineRunId recorded on the bundle (informational)
  --out=<path>                Output bundle JSON path. Default: eval-report/evidence-bundle.json
`;

const evidenceVerifyUsage = `eval-dashboards evidence-verify [options]

Independently re-validates a previously produced evidence bundle: every
entry's embedded contents must hash to its recorded digest, and the
recomputed digest over all entries must match the bundle's top-level
digest. Needs nothing but the bundle file itself. Fails (exit 1) on any
mismatch or missing/malformed bundle.

Options:
  --bundle=<path>   Path to the eval-evidence-bundle/v1 JSON file (required)
`;

const heartbeatVerifyUsage = `eval-dashboards heartbeat-verify [options]

Scheduled 4F.7 verifier: asserts a fresh, healthy gate-run heartbeat exists for a
release subject, independent of the release pipeline that is supposed to produce it.
This is what makes deleting or skipping the eval gate step on a release detectable —
if the heartbeat file is missing, stale, or reports gateRunStatus!="ran", this command
fails and alerts, rather than the absence passing silently. Run it on its own schedule
(e.g. a periodic CI job unrelated to the release workflow) pointed at the heartbeat
path each release is expected to publish (e.g. alongside \`--heartbeat-out\` from
\`eval-dashboards check\`, copied/published somewhere this job can read it).

Options:
  --heartbeat=<path>       Path to the eval-check-heartbeat/v1 JSON file (required)
  --max-age-hours=<n>      Maximum allowed heartbeat age in hours (required, must be > 0)
`;

type CheckOutputRow = {
  id: string;
  suite: string;
  category?: string;
  severity?: string;
  reportAnchor: string;
};

/** Summarized waiver-register application, embedded in check output so active
 * exceptions are reported prominently and expired ones are visible in the payload
 * that failed the gate. */
type CheckOutputWaiverSummary = {
  active: Array<{
    id: string;
    suite: string;
    rowId?: string;
    reason: string;
    riskOwner: string;
    ticket: string;
    expiresAt: string;
    matchedRowIds: string[];
  }>;
  expired: Array<{
    id: string;
    suite: string;
    rowId?: string;
    reason: string;
    riskOwner: string;
    ticket: string;
    expiresAt: string;
  }>;
  unmatched: Array<{ id: string; suite: string; rowId?: string }>;
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
  waivers?: CheckOutputWaiverSummary;
  /** 4F.6 threshold-change detection: present whenever a baseline gate config was supplied. */
  thresholdChanges?: {
    loosened: boolean;
    allowed: boolean;
    changes: Array<{
      field: string;
      baselineValue: unknown;
      resolvedValue: unknown;
      direction: 'loosened' | 'tightened' | 'unchanged';
      description: string;
    }>;
  };
  /**
   * 4F.9 — bypass accounting: which gate escape hatches were used for this
   * invocation (`--allow-blocked-baseline`, `--allow-stale-calibration`,
   * `--allow-gate-loosening`). Always present so a clean run is a verifiable
   * `count: 0`, not an absent field indistinguishable from "not measured".
   */
  bypassUsage: {
    flags: {
      allowBlockedBaseline: boolean;
      allowStaleCalibration: boolean;
      allowGateLoosening: boolean;
      allowSensitivePublish: boolean;
    };
    used: string[];
    count: number;
  };
  /**
   * 4F.10 — PR-subset vs full-suite tiering: present whenever `--tier` was
   * passed. Reports which tier was gated and its cost/runtime totals against
   * any configured budget, so "PR gate is under budget" is a verifiable
   * number rather than an unstated assumption.
   */
  prTier?: TierCostSummary;
};

/** Per-suite dataset/rubric provenance recorded in `eval-check-result/v2`. */
type CheckOutputSuiteProvenance = {
  suite: string;
  datasetVersion?: string;
  rubricVersion?: string;
};

/** sha256 digest of an input artifact file, recorded in `eval-check-result/v2`. */
type CheckOutputArtifactDigest = {
  path: string;
  sha256: string;
};

/** Subject under test: commit SHA / release / image digest, if known. */
type CheckOutputSubject = {
  commit?: string;
  release?: string;
  imageDigest?: string;
};

/** CI environment provenance, auto-detected from common CI env vars. */
type CheckOutputCiEnvironment = {
  provider?: string;
  runId?: string;
  runUrl?: string;
  actor?: string;
};

/**
 * `eval-check-result/v2` extends v1 with full audit provenance: an auditor
 * should be able to read a single check-result file and determine which
 * thresholds were in force, against which dataset/rubric versions, for which
 * commit, without reading workflow YAML at that commit. v1 consumers are
 * unaffected: v2 is emitted only via `--json-v2-out`, never in place of v1.
 */
type CheckOutputPayloadV2 = Omit<CheckOutputPayload, 'schemaVersion'> & {
  schemaVersion: 'eval-check-result/v2';
  resolvedGateConfig: GateConfig;
  suiteProvenance: CheckOutputSuiteProvenance[];
  artifactDigests: CheckOutputArtifactDigest[];
  subject: CheckOutputSubject;
  ciEnvironment: CheckOutputCiEnvironment;
};

const sha256Hex = (contents: string): string => createHash('sha256').update(contents, 'utf8').digest('hex');

const detectCiEnvironment = (env: NodeJS.ProcessEnv): CheckOutputCiEnvironment => {
  if (env.GITHUB_ACTIONS === 'true') {
    const serverUrl = env.GITHUB_SERVER_URL ?? 'https://github.com';
    const repository = env.GITHUB_REPOSITORY;
    const runId = env.GITHUB_RUN_ID;
    const runUrl = repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : undefined;
    return {
      provider: 'github-actions',
      runId,
      runUrl,
      actor: env.GITHUB_ACTOR,
    };
  }

  if (env.TF_BUILD === 'True' || env.TF_BUILD === 'true') {
    const collectionUri = env.SYSTEM_COLLECTIONURI;
    const project = env.SYSTEM_TEAMPROJECT;
    const buildId = env.BUILD_BUILDID;
    const runUrl =
      collectionUri && project && buildId
        ? `${collectionUri}${project}/_build/results?buildId=${buildId}`
        : undefined;
    return {
      provider: 'azure-pipelines',
      runId: buildId,
      runUrl,
      actor: env.BUILD_REQUESTEDFOR,
    };
  }

  if (env.CI === 'true') {
    return { provider: 'unknown-ci' };
  }

  return {};
};

const detectSubject = (env: NodeJS.ProcessEnv, currentRun: EvalReportV1['run']): CheckOutputSubject => {
  const commit =
    currentRun.commit ||
    env.GITHUB_SHA ||
    env.BUILD_SOURCEVERSION ||
    env.GIT_COMMIT ||
    undefined;
  return {
    commit,
    release: currentRun.buildId,
  };
};

const buildSuiteProvenance = (suiteManifests?: SuiteManifest[]): CheckOutputSuiteProvenance[] =>
  (suiteManifests ?? []).map((manifest) => ({
    suite: manifest.name,
    datasetVersion: manifest.datasetVersion,
    rubricVersion: manifest.rubricVersion,
  }));

const buildArtifactDigests = async (filePaths: string[]): Promise<CheckOutputArtifactDigest[]> => {
  const digests = await Promise.all(
    filePaths.map(async (filePath) => {
      const contents = await readFile(filePath, 'utf8');
      return { path: filePath, sha256: sha256Hex(contents) };
    }),
  );
  return digests.sort((left, right) => left.path.localeCompare(right.path));
};

type CheckHeartbeatPayload = ImportedCheckHeartbeatPayload;

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
    const jsonV2Out = optionString(options, 'json-v2-out', '');
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

      const tierOption = optionString(options, 'tier', '').trim().toLowerCase();
      if (tierOption && tierOption !== 'pr' && tierOption !== 'full') {
        throw Object.assign(new Error(`--tier must be "pr" or "full" (got "${tierOption}").`), {
          exitCode: 2,
        });
      }
      const selectedTier = (tierOption || undefined) as 'pr' | 'full' | undefined;
      const maxPrCostUsd = optionNumber(options, 'max-pr-cost-usd');
      const maxPrDurationMs = optionNumber(options, 'max-pr-duration-ms');
      if (selectedTier) {
        context.current = filterReportByTier(context.current, selectedTier);
      }
      const prTierBudget = selectedTier
        ? evaluatePrTierBudget(context.current, {
            tier: selectedTier,
            maxCostUsd: maxPrCostUsd,
            maxDurationMs: maxPrDurationMs,
          })
        : undefined;

      const waiverFilePath = optionString(options, 'waiver-file', '') || config.waiverFile || '';
      const waiverRegister = waiverFilePath ? await loadWaiverRegister(waiverFilePath) : undefined;
      const waiverApplication = applyWaivers(context.current, waiverRegister);

      const baselineGateConfigPath =
        optionString(options, 'baseline-gate-config', '') || config.baselineGateConfigFile || '';
      const allowGateLoosening =
        optionBoolean(options, 'allow-gate-loosening') || gateConfig.allowLoosening === true;
      let thresholdChangeResult:
        | ReturnType<typeof detectGateConfigLoosening>
        | undefined;
      if (baselineGateConfigPath) {
        let baselineGateConfigRaw: string;
        try {
          baselineGateConfigRaw = await readFile(baselineGateConfigPath, 'utf8');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw Object.assign(
            new Error(`Could not read baseline gate config ${baselineGateConfigPath}: ${message}`),
            { exitCode: 2 },
          );
        }
        let baselineGateConfig: GateConfig;
        try {
          baselineGateConfig = JSON.parse(baselineGateConfigRaw) as GateConfig;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw Object.assign(
            new Error(`Baseline gate config ${baselineGateConfigPath} is not valid JSON: ${message}`),
            { exitCode: 2 },
          );
        }
        thresholdChangeResult = detectGateConfigLoosening(baselineGateConfig, gateConfig);
      }

      const gateResult = checkGates(
        waiverApplication.reportForGating,
        context.comparison,
        gateConfig,
        context.baselineCompatibility,
        context.previous,
      );
      const calibrationChecks = evaluateCalibrationChecks(context.reports, context.current, gateConfig);
      const thresholdChangeFailures =
        thresholdChangeResult && thresholdChangeResult.loosened && !allowGateLoosening
          ? thresholdChangeResult.failures
          : [];
      const combinedFailures = [
        ...gateResult.failures,
        ...calibrationChecks.failures,
        ...waiverApplication.failures,
        ...thresholdChangeFailures,
        ...(prTierBudget?.failures ?? []),
      ];
      const combinedDiagnostics = [
        ...waiverApplication.diagnostics,
        ...gateResult.diagnostics,
        ...calibrationChecks.diagnostics,
        ...(thresholdChangeResult?.diagnostics ?? []),
        ...(thresholdChangeResult?.loosened && allowGateLoosening
          ? ['Gate configuration loosening detected but explicitly allowed via --allow-gate-loosening.']
          : []),
        ...(prTierBudget?.diagnostics ?? []),
      ];
      const gatePassed = combinedFailures.length === 0;

      heartbeatRunId = context.current.run.id;
      heartbeatBaselineRunId = context.previous?.run.id;

      const bypassLogPath = optionString(options, 'bypass-log', '') || config.bypassLogFile || '';
      const bypassUsage = summarizeBypassUsage({
        allowBlockedBaseline,
        allowStaleCalibration: gateConfig.calibration?.allowBlockingWithoutRecentMatch === true,
        allowGateLoosening: Boolean(thresholdChangeResult?.loosened && allowGateLoosening),
      });

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
        bypassUsage,
        prTier: prTierBudget?.summary,
      };

      if (bypassLogPath) {
        const entry = buildBypassLogEntry('check', bypassUsage, { runId: context.current.run.id });
        await appendTextFile(bypassLogPath, serializeBypassLogEntry(entry));
      }

      if (
        waiverApplication.active.length > 0 ||
        waiverApplication.expired.length > 0 ||
        waiverApplication.unmatched.length > 0
      ) {
        checkPayload.waivers = {
          active: waiverApplication.active.map((entry) => ({
            id: entry.waiver.id,
            suite: entry.waiver.suite,
            rowId: entry.waiver.rowId,
            reason: entry.waiver.reason,
            riskOwner: entry.waiver.riskOwner,
            ticket: entry.waiver.ticket,
            expiresAt: entry.waiver.expiresAt,
            matchedRowIds: entry.matchedRowIds,
          })),
          expired: waiverApplication.expired.map((entry) => ({
            id: entry.waiver.id,
            suite: entry.waiver.suite,
            rowId: entry.waiver.rowId,
            reason: entry.waiver.reason,
            riskOwner: entry.waiver.riskOwner,
            ticket: entry.waiver.ticket,
            expiresAt: entry.waiver.expiresAt,
          })),
          unmatched: waiverApplication.unmatched.map((waiver) => ({
            id: waiver.id,
            suite: waiver.suite,
            rowId: waiver.rowId,
          })),
        };
      }

      if (thresholdChangeResult) {
        checkPayload.thresholdChanges = {
          loosened: thresholdChangeResult.loosened,
          allowed: thresholdChangeResult.loosened && allowGateLoosening,
          changes: thresholdChangeResult.changes,
        };
      }

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
      if (jsonV2Out) {
        const artifactFiles = await findJsonReports(input);
        const checkPayloadV2: CheckOutputPayloadV2 = {
          ...checkPayload,
          schemaVersion: 'eval-check-result/v2',
          resolvedGateConfig: gateConfig,
          suiteProvenance: buildSuiteProvenance(context.current.suiteManifests),
          artifactDigests: await buildArtifactDigests(artifactFiles),
          subject: detectSubject(process.env, context.current.run),
          ciEnvironment: detectCiEnvironment(process.env),
        };
        await writeJsonFile(jsonV2Out, checkPayloadV2);
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
    const bypassLogPath = optionString(options, 'bypass-log', '') || config.bypassLogFile || '';
    let bypassUsageByRunId: Record<string, ReturnType<typeof summarizeBypassUsage>> | undefined;
    if (bypassLogPath) {
      try {
        const raw = await readFile(bypassLogPath, 'utf8');
        const entries: BypassLogEntryV1[] = parseBypassLog(raw);
        const runIds = new Set(reports.map((report) => report.run.id));
        bypassUsageByRunId = {};
        for (const runId of runIds) {
          const usage = bypassUsageForRun(entries, runId);
          if (usage) {
            bypassUsageByRunId[runId] = usage;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Warning: could not read bypass log ${bypassLogPath}: ${message}`);
      }
    }
    await writeJsonFile(out, buildHistory(reports, { bypassUsageByRunId }));
    console.log(out);
    return;
  }

  if (command === 'sign') {
    if (optionBoolean(options, 'help')) {
      console.log(signUsage);
      return;
    }

    const artifactPath = optionString(options, 'artifact', '');
    if (!artifactPath) {
      console.error('sign requires --artifact=<path>');
      process.exitCode = 2;
      return;
    }
    const outPath = optionString(options, 'out', `${artifactPath}.sig.json`);

    let signature;
    try {
      signature = await signArtifact({ artifactPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to sign ${artifactPath}: ${message}`);
      process.exitCode = 2;
      return;
    }

    await writeJsonFile(outPath, signature);

    if (signature.method === 'unavailable') {
      console.log(
        `Wrote ${outPath} (digest sha256:${signature.digest.hex}). Signature unavailable: ${signature.unavailableReason}`,
      );
    } else {
      console.log(`Wrote ${outPath} (digest sha256:${signature.digest.hex}, method: ${signature.method})`);
    }
    return;
  }

  if (command === 'verify') {
    if (optionBoolean(options, 'help')) {
      console.log(verifyUsage);
      return;
    }

    const artifactPath = optionString(options, 'artifact', '');
    if (!artifactPath) {
      console.error('verify requires --artifact=<path>');
      process.exitCode = 2;
      return;
    }
    const signaturePath = optionString(options, 'signature', `${artifactPath}.sig.json`);
    const certificateIdentityRegexp = optionString(options, 'certificate-identity-regexp', '') || undefined;
    const certificateOidcIssuer = optionString(options, 'certificate-oidc-issuer', '') || undefined;

    let result;
    try {
      result = await verifyArtifact({
        artifactPath,
        signaturePath,
        certificateIdentityRegexp,
        certificateOidcIssuer,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to verify ${artifactPath}: ${message}`);
      process.exitCode = 2;
      return;
    }

    if (result.ok) {
      console.log(`Verified: digest matches and signature (${result.signatureMethod}) is valid.`);
      return;
    }

    console.error(`Verification failed:\n${result.reasons.join('\n')}`);
    process.exitCode = 1;
    return;
  }

  if (command === 'heartbeat-verify') {
    if (optionBoolean(options, 'help')) {
      console.log(heartbeatVerifyUsage);
      return;
    }

    const heartbeatPath = optionString(options, 'heartbeat', '');
    if (!heartbeatPath) {
      console.error('heartbeat-verify requires --heartbeat=<path>');
      process.exitCode = 2;
      return;
    }
    const maxAgeHours = optionNumber(options, 'max-age-hours');
    if (maxAgeHours === undefined || !Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
      console.error('heartbeat-verify requires --max-age-hours=<n> with n > 0');
      process.exitCode = 2;
      return;
    }

    const result = await verifyHeartbeatFile(heartbeatPath, { maxAgeHours });

    if (result.ok) {
      const ageNote = result.ageHours !== undefined ? ` (age: ${result.ageHours.toFixed(2)}h)` : '';
      console.log(`Heartbeat OK: ${heartbeatPath}${ageNote}.`);
      return;
    }

    console.error(`Heartbeat verification failed for ${heartbeatPath}:\n${result.reasons.join('\n')}`);
    process.exitCode = 1;
    return;
  }

  if (command === 'evidence-export') {
    if (optionBoolean(options, 'help')) {
      console.log(evidenceExportUsage);
      return;
    }

    const reportPath = optionString(options, 'report', '');
    const checkResultPath = optionString(options, 'check-result', '');
    if (!reportPath || !checkResultPath) {
      console.error('evidence-export requires --report=<path> and --check-result=<path>');
      process.exitCode = 2;
      return;
    }
    const waiverFilePath = optionString(options, 'waiver-file', '');
    const bypassLogPath = optionString(options, 'bypass-log', '');
    const approvalTrailPath = optionString(options, 'approval-trail', '');
    const signaturePath = optionString(options, 'signature', '');
    const runId = optionString(options, 'run-id', '') || undefined;
    const baselineRunId = optionString(options, 'baseline-run-id', '') || undefined;
    const out = optionString(options, 'out', path.join(reportDir, 'evidence-bundle.json'));

    const bundleInputs: EvidenceBundleInput[] = [
      { role: 'report', path: reportPath },
      { role: 'checkResult', path: checkResultPath },
    ];
    if (waiverFilePath) bundleInputs.push({ role: 'waiverRegister', path: waiverFilePath });
    if (bypassLogPath) bundleInputs.push({ role: 'bypassLog', path: bypassLogPath });
    if (approvalTrailPath) bundleInputs.push({ role: 'approvalTrail', path: approvalTrailPath });
    if (signaturePath) bundleInputs.push({ role: 'signature', path: signaturePath });

    let bundle: EvidenceBundleV1;
    try {
      bundle = await buildEvidenceBundle(bundleInputs, { runId, baselineRunId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to build evidence bundle: ${message}`);
      process.exitCode = 2;
      return;
    }

    await writeJsonFile(out, bundle);
    console.log(
      `Wrote ${out} (${bundle.entries.length} entr${bundle.entries.length === 1 ? 'y' : 'ies'}: ${bundle.entries.map((entry) => entry.role).join(', ')}; bundleDigest sha256:${bundle.bundleDigest.hex})`,
    );
    return;
  }

  if (command === 'evidence-verify') {
    if (optionBoolean(options, 'help')) {
      console.log(evidenceVerifyUsage);
      return;
    }

    const bundlePath = optionString(options, 'bundle', '');
    if (!bundlePath) {
      console.error('evidence-verify requires --bundle=<path>');
      process.exitCode = 2;
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(bundlePath, 'utf8'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Could not read evidence bundle ${bundlePath}: ${message}`);
      process.exitCode = 2;
      return;
    }

    const result = verifyEvidenceBundle(parsed);
    if (result.ok) {
      console.log(`Verified: all ${result.roles.length} entries and the bundle digest are intact.`);
      return;
    }

    console.error(`Evidence bundle verification failed:\n${result.reasons.join('\n')}`);
    process.exitCode = 1;
    return;
  }

  if (command === 'org-rollup') {
    if (optionBoolean(options, 'help')) {
      console.log(orgRollupUsage);
      return;
    }

    const rollupInput = optionString(options, 'input', 'org-rollup-input');
    const out = optionString(options, 'out', 'eval-report/org-rollup.html');
    const locale = optionString(options, 'locale', '') || undefined;

    const historyFiles = await findFilesByName(rollupInput, 'history.json');

    if (historyFiles.length === 0) {
      console.error(
        [
          `No history.json files found under ${rollupInput}.`,
          'What to do next:',
          '  1) Publish each repo\'s history.json (from `eval-dashboards history` or `report --reporter=html`) into a shared directory.',
          '  2) Point --input at that directory.',
        ].join('\n'),
      );
      process.exitCode = 3;
      return;
    }

    const histories: RepoHistory[] = [];
    for (const filePath of historyFiles) {
      try {
        const raw = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
        histories.push(repoHistoryFromPayload(filePath, raw));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Skipping invalid history file ${filePath}: ${message}`);
      }
    }

    if (histories.length === 0) {
      console.error(`Found ${historyFiles.length} history.json file(s) under ${rollupInput}, but none parsed successfully.`);
      process.exitCode = 2;
      return;
    }

    const summary = buildOrgRollup(histories);
    await writeTextFile(out, renderOrgRollupHtml(summary, locale));
    console.log(`${out} (${summary.totalRepos} repo(s), ${summary.regressedCount} regressed)`);
    return;
  }

  if (command === 'publish') {
    if (optionBoolean(options, 'help')) {
      console.log(publishUsage);
      return;
    }

    const context = await loadContext(input, reportDir);
    const redact = optionBoolean(options, 'redact');
    const allowSensitivePublish = optionBoolean(options, 'allow-sensitive-publish');
    if (redact) {
      context.current = redactEvalReport(context.current);
      if (context.previous) context.previous = redactEvalReport(context.previous);
    }

    // 4F.2 — publish preflight: hard-fail when unredacted sensitive evidence
    // fields are present in the payload being published, unless the caller
    // has explicitly opted in with --allow-sensitive-publish. The override's
    // use is always recorded in the publish run record for auditability.
    const sensitiveFieldsFound = findSensitiveFields(context.current);
    if (sensitiveFieldsFound.length > 0 && !allowSensitivePublish) {
      throw Object.assign(
        new Error(
          `Publish preflight failed: unredacted sensitive evidence field(s) present in the payload ` +
            `(${sensitiveFieldsFound.join(', ')}). Pass --redact to strip them, or pass ` +
            `--allow-sensitive-publish to publish anyway (this will be recorded in the run record).`,
        ),
        { exitCode: 2 },
      );
    }

    await renderReports(context, ['html', 'json-summary', 'markdown-summary']);
    const target = optionString(options, 'target', 'dir') as PublishTarget;
    // dryRun stays undefined (not false) when --dry-run wasn't passed, so
    // github-pr-comment's own "dry-run outside CI" default can take effect;
    // optionBoolean() always returns a concrete boolean and would otherwise
    // force dryRun:false for every unset flag, defeating that fallback.
    const dryRunFlagPassed = Object.prototype.hasOwnProperty.call(options, 'dry-run');
    const result = await publishReport({
      target,
      reportDir,
      outDir: optionString(options, 'out-dir', 'published-eval-report'),
      dryRun: dryRunFlagPassed ? optionBoolean(options, 'dry-run') : undefined,
      redact,
      repo: typeof options.repo === 'string' ? options.repo : undefined,
      branch: typeof options.branch === 'string' ? options.branch : undefined,
      token: typeof options.token === 'string' ? options.token : undefined,
      appName: typeof options['app-name'] === 'string' ? options['app-name'] : undefined,
      account: typeof options.account === 'string' ? options.account : undefined,
      container: typeof options.container === 'string' ? options.container : undefined,
      prNumber: typeof options['pr-number'] === 'string' && /^\d+$/.test(options['pr-number']) ? Number(options['pr-number']) : undefined,
      commentMarker: typeof options['comment-marker'] === 'string' ? options['comment-marker'] : undefined,
    });

    const runRecord = {
      schemaVersion: 'eval-publish-run-record/v1',
      generatedAt: new Date().toISOString(),
      target: result.target,
      dryRun: result.dryRun,
      redactionProfile: redact ? (context.current.metadata?.redactionProfile ?? 'default') : 'none',
      sensitiveFieldsFoundBeforeRedaction: sensitiveFieldsFound,
      allowSensitivePublish,
      message: result.message,
      url: result.url,
    };
    await writeJsonFile(path.join(reportDir, 'publish-run-record.json'), runRecord);

    const publishBypassLogPath = optionString(options, 'bypass-log', '') || config.bypassLogFile || '';
    if (publishBypassLogPath) {
      const bypassUsage = summarizeBypassUsage({
        allowSensitivePublish: sensitiveFieldsFound.length > 0 && allowSensitivePublish,
      });
      const entry = buildBypassLogEntry('publish', bypassUsage, { runId: context.current.run.id });
      await appendTextFile(publishBypassLogPath, serializeBypassLogEntry(entry));
    }

    if (sensitiveFieldsFound.length > 0 && allowSensitivePublish) {
      console.warn(
        `Warning: publishing with unredacted sensitive evidence field(s) present ` +
          `(${sensitiveFieldsFound.join(', ')}) due to --allow-sensitive-publish. Recorded in the run record.`,
      );
    }

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