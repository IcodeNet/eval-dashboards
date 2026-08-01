# Implementation Status

Update this file as features are implemented. Keep it honest: mark an item done only after the relevant code and tests exist.

## Done

- [x] Create independent `eval-reports` project directory.
- [x] Add npm package metadata for `@icodenet/eval-reports`.
- [x] Add TypeScript, tsup, and Vitest project skeleton.
- [x] Add CLI binary entry point.
- [x] Add PRP documentation.
- [x] Add versioned `eval-report/v1` model and validation.
- [x] Add first-class optional agent and LLM judge report fields.
- [x] Add portable suite manifest, gate policy, and rubric contract fields.
- [x] Add baseline compatibility assessment for dataset and rubric version drift.
- [x] Add basic report discovery and history building.
- [x] Add latest-vs-previous comparison.
- [x] Add initial gate checking.
- [x] Add starter `text`, `json-summary`, `markdown-summary`, and `html` reporters.
- [x] Add local directory publish target.
- [x] Add dry-run validation placeholders for GitHub Pages, Azure Static Web Apps, and Azure Storage.
- [x] Add required example directories and starter artifacts.
- [x] Add runnable provider-free agent/chat eval example that generates artifacts and reports.
- [x] Add focused starter tests.
- [x] Add focused governance and baseline compatibility tests.

## Remaining

- [ ] Implement `eval-reports init` config generation.
- [ ] Implement full config loading from `eval-reports.config.ts`, `eval-reports.config.js`, and `package.json`.
- [ ] Implement explicit baseline selection by file, branch label, or run id.
- [ ] Enforce suite manifest gate policy thresholds in `eval-reports check`.
- [ ] Implement persistent failure and flaky row classification.
- [ ] Improve HTML dashboard styling and charts.
- [ ] Implement production GitHub Pages publishing.
- [ ] Implement production Azure Static Web Apps publishing.
- [ ] Implement production Azure Storage static website publishing.
- [ ] Add Jest custom reporter example implementation.
- [ ] Add Vitest eval example implementation.
- [ ] Add dashboard grouping by dataset, scenario, rubric, and judge model.
- [ ] Add example smoke tests in CI.
- [ ] Add npm publishing workflow after package API stabilizes.