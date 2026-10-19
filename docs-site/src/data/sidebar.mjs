/**
 * Left sidebar for the docs site. Pages are grouped by audience, in the order a reader needs them.
 * Every Markdown file in `docs/` must appear in exactly one group; `sidebar.test.ts` fails when one
 * is missing, listed twice, or points at a file that does not exist.
 *
 * Each entry is a path under `docs/` without `.md`. A trailing `/` means the folder's README.
 */
export const SIDEBAR = [
  {
    label: 'Start here',
    items: ['artifact-format', 'taxonomy', 'configuration', 'faq', 'examples'],
  },
  {
    label: 'Contract and schema',
    items: [
      'schema-taxonomy-decisions',
      'judge-axis-rubric-scales',
      'suite-presets',
      'benchmark-packs',
      'import-eval-ai-library-taxonomy',
    ],
  },
  {
    label: 'CI and governance',
    items: [
      'gates',
      'publishing',
      'github-approval-gate-pattern',
      'REPO-HARDENING',
      'npm-publishing',
      'commit-quality',
    ],
  },
  {
    label: 'Reference',
    items: ['cli-help/', 'reporters', 'history-storage'],
  },
  {
    label: 'Integrations',
    items: [
      'integrations/',
      'integrations/promptfoo',
      'integrations/deepeval',
      'integrations/openevals-agentevals',
      'integrations/inspect-ai',
      'integrations/anthropic-eval-methodology',
      'integrations/langfuse',
      'integrations/langsmith',
      'integrations/openai-evals',
      'integrations/otel-genai',
      'integrations/wandb-weave',
      'integrations/arize-phoenix',
      'integrations/braintrust',
      'integrations/ragas',
      'integrations/trulens',
      'integrations/patronus',
      'integrations/trace-stacks',
      'integrations/risk-register',
    ],
  },
  {
    label: 'Teaching: exercises',
    items: [
      'teach-curriculum',
      'teach-exercises/',
      'teach-exercises/01-foundations',
      'teach-exercises/02-artifact-first',
      'teach-exercises/03-first-synthetic-dataset',
      'teach-exercises/04-row-taxonomy',
      'teach-exercises/05-suite-taxonomy',
      'teach-exercises/06-live-agent-evidence',
      'teach-exercises/07-judge-calibration',
      'teach-exercises/08-gates-release',
      'teach-exercises/09-reports-history',
      'teach-exercises/10-iteration-loop',
      'teach-exercises/11-diagnose-a-red-run',
      'teach-exercises/pm-01-reading-a-report',
      'teach-exercises/pm-02-reading-drift',
    ],
  },
  {
    label: 'Teaching: labs',
    items: [
      'teach-labs/',
      'teach-labs/01-local-dev-loop',
      'teach-labs/02-pre-pr-gating',
      'teach-labs/03-pr-review-triage',
      'teach-labs/04-release-readiness',
      'teach-labs/05-post-release-monitoring',
      'teach-labs/fde-role-workflow',
    ],
  },
  {
    label: 'Case studies',
    items: ['case-studies/assistant-ui/', 'case-studies/assistant-ui/2026-10-07-integration'],
  },
  {
    label: 'Product and roadmap',
    items: [
      'PROPOSITION-AND-TAXONOMY',
      'PROPOSITION-REVIEW',
      'PRP',
      'STATUS',
      'ROADMAP',
      'ARCHITECTURE',
      'industry-coverage-audit',
      'docs-site-stack-decision',
      'comparison-with-nyc',
      'adoption-map',
      'adoption-feedback-loop',
      'adoption-friction-backlog',
      'community-partnership-log',
      'onboarding-runbook',
    ],
  },
  {
    label: 'Reviews',
    items: [
      'reviews/2026-09-14-teaching-curriculum-review',
      'reviews/2026-10-07-deliverables',
      'reviews/2026-10-08-assistant-ui-upstream-pr',
      'reviews/2026-10-10-eval-pr5',
      'reviews/2026-10-10-eval-pr6',
      'reviews/2026-10-10-eval-pr9',
      'reviews/2026-10-10-eval-pr11',
      'reviews/2026-10-11-pr14-langsmith-provenance',
      'reviews/2026-10-11-sandbox-gap-remediation',
      'reviews/2026-10-18-user-question-audit',
    ],
  },
];

/** Docs index page, linked at the top of the sidebar. It is not a group member. */
export const INDEX_ENTRY = 'README';

/**
 * Pages the site generates that have no Markdown file in `docs/`. They are linked next to the docs index at the
 * top of the sidebar. `route` is the path under `/docs/`.
 */
export const GENERATED_PAGES = [{ route: 'glossary', title: 'Glossary' }];
