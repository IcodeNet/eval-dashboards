/**
 * Glossary terms for the docs site. `page` is a path under `docs/` without `.md` (a trailing `/` means the
 * folder README). `glossary.test.ts` fails on a duplicate term, a long definition, or a page that does not exist.
 * Keep each definition to two sentences.
 */
export const GLOSSARY = [
  {
    term: 'Runner',
    definition:
      'The code that executes eval cases, such as Vitest, Jest, a Python script or an agent harness. It writes the report file that this tool reads.',
    page: 'taxonomy',
  },
  {
    term: 'Dataset',
    definition:
      'The set of cases being evaluated. It needs stable ids and a version, so a change in pass rate can be traced to the product or to the cases.',
    page: 'taxonomy',
  },
  {
    term: 'Suite',
    definition:
      'A named group of related rows from a run, usually tied to one risk area such as retrieval, refusal safety or tool routing.',
    page: 'taxonomy',
  },
  {
    term: 'Row',
    definition: 'One evaluated case inside a report. It carries the evidence that made the case pass or fail.',
    page: 'taxonomy',
  },
  {
    term: 'Rubric',
    definition:
      'The scoring rules for a suite or a judge. When the rules change, the rubric version should change too.',
    page: 'taxonomy',
  },
  {
    term: 'Baseline',
    definition:
      'The earlier run that the current run is compared with. It is chosen by an explicit run id or by a strategy, rolling or champion.',
    page: 'gates',
  },
  {
    term: 'Rolling baseline',
    definition:
      'The default strategy: the baseline is the latest earlier run that shares a suite with the current run. Calibration runs are skipped, and so are runs with a different mode when the current run sets one.',
    page: 'gates',
  },
  {
    term: 'Champion baseline',
    definition:
      'The earlier run with the highest pass rate among the same candidates. If two runs tie, the more recent one wins.',
    page: 'gates',
  },
  {
    term: 'Waiver',
    definition:
      'A recorded exception that lets a specific known failure ship for a limited time, with a reason, an owner and an expiry date. An expired waiver always fails the gate.',
    page: 'gates',
  },
  {
    term: 'Heartbeat',
    definition:
      'A small file that records whether the gate step ran, was skipped, or errored. A scheduled check can then alert when a gate did not run.',
    page: 'gates',
  },
  {
    term: 'Artifact',
    definition:
      'The JSON report file a runner writes, with schemaVersion eval-report/v1. This tool validates it, gates it, compares it and renders it.',
    page: 'artifact-format',
  },
  {
    term: 'Taxonomy',
    definition:
      'The agreed set of fields that classify rows and suites, such as kind, severity and category. A report that fills them in is complete and can be compared across runs.',
    page: 'taxonomy',
  },
  {
    term: 'Gate',
    definition:
      'A check that turns a report into pass or fail, for example a minimum pass rate or zero new critical failures. A failed gate makes the command exit with code 1.',
    page: 'gates',
  },
  {
    term: 'Newly failing',
    definition: 'A row that failed in this run and either passed in the baseline or was not in the baseline.',
    page: 'gates',
  },
  {
    term: 'Persistent failure',
    definition: 'A row that failed in both the baseline and the current run.',
    page: 'gates',
  },
  {
    term: 'Disappeared',
    definition:
      'A row that was in the baseline but is missing from the current run. It is not the same as fixed, because the case may simply have been removed.',
    page: 'gates',
  },
  {
    term: 'Evidence bundle',
    definition:
      'One JSON file that embeds the report, the check result and optional waivers and signature, each with a sha256 digest. A separate command recomputes the digests to prove nothing changed.',
    page: 'gates',
  },
  {
    term: 'Redaction',
    definition:
      'Removing prompts, outputs, reasoning and similar free text from a report before it is published, so only the public tier of fields remains.',
    page: 'publishing',
  },
];
