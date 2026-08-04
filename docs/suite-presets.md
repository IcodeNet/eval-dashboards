# Agent Quality Suite Presets

Suite presets are starting points for teams setting up agent or LLM eval programs. They are not required `eval-report/v1` enum values. A team may rename them, split them, or merge them as long as the emitted artifact still contains clear suite manifests, dataset versions, rubric versions, gates, and row evidence.

Use presets when you want consistent setup language across datasets, rubrics, CI jobs, and dashboards.

## Preset Map

| Preset | Use When | Primary Risk Area | Target | Typical Graders | Suggested Gate |
|---|---|---|---|---|---|
| `retrieval-recall` | The agent must find the right source material before answering. | `relevance` | `agent` | `deterministic-assertions`, `tool-call-check` | blocking, `passRate >= 0.9` |
| `answer-groundedness` | Answers must be supported by retrieved or supplied evidence. | `groundedness` | `agent` | `llm-judge`, `human-labelled-calibration` | blocking after calibration, `passRate >= 0.9` |
| `answer-quality` | Answers must be useful, direct, and complete. | `response-quality` | `conversation` | `llm-judge`, `human-labelled-calibration` | report-only until judge calibration is stable |
| `tone-of-voice` | Responses should match expected brand/professional tone and audience style. | `tone-of-voice` | `conversation` | `llm-judge`, `human-labelled-calibration` | report-only first, then blocking for high-risk channels |
| `factuality` | Responses must avoid fabricated facts and unsupported figures. | `factuality` | `conversation` | `llm-judge`, `deterministic-assertions` | blocking for regulated or policy-bound flows |
| `refusal-safety` | The agent must refuse out-of-scope, unsafe, or policy-disallowed requests. | `prompt-safety` | `agent` | `deterministic-assertions`, `llm-judge` | blocking, `passRate >= 1.0` for critical refusal cases |
| `content-safety` | The agent must not generate harmful, hateful, sexual, or self-harm enabling content. | `content-safety` | `agent` | `deterministic-assertions`, `llm-judge` | blocking, `passRate >= 1.0` for critical categories |
| `prompt-injection-resilience` | The agent must resist instructions that attempt to override system or domain boundaries. | `prompt-safety` | `agent` | `deterministic-assertions`, `llm-judge` | blocking for critical cases |
| `mcp-routing` | The agent must choose the right MCP or tool route. | `tool-routing` | `agent` | `tool-call-check` | blocking, `passRate >= 0.95` |
| `tool-call-accuracy` | The agent should call the correct tool(s) for task completion and avoid unnecessary or hallucinated calls. | `tool-use` | `agent` | `tool-call-check`, `deterministic-assertions` | blocking, `passRate >= 0.95` |
| `tool-argument-accuracy` | Tool call arguments should match schema, include required fields, and avoid unsafe values. | `tool-use` | `agent` | `tool-call-check`, `deterministic-assertions` | blocking, `passRate >= 0.98` |
| `tool-execution-reliability` | Tool runs should succeed reliably with safe retry/fallback behavior on transient failures. | `tool-use` | `agent` | `deterministic-assertions`, `tool-call-check` | report-only first, then blocking on mature flows |
| `goal-success` | The assistant should complete the user goal correctly end-to-end. | `response-quality` | `conversation` | `llm-judge`, `deterministic-assertions` | blocking, `passRate >= 0.9` |
| `intent-resolution` | The assistant should resolve the user intent, not just answer adjacent topics. | `relevance` | `conversation` | `llm-judge`, `deterministic-assertions` | report-only first, then blocking once calibrated |
| `task-adherence` | The assistant should follow user constraints (scope, format, and must-do/must-not-do instructions). | `response-quality` | `conversation` | `llm-judge`, `deterministic-assertions` | report-only first, then blocking for high-risk workflows |
| `sensitive-disclosure` | The assistant must not disclose PII, secrets, or hidden internal data. | `pii` | `agent` | `deterministic-assertions`, `llm-judge` | blocking, `passRate >= 1.0` for critical cases |
| `agency-boundary` | The assistant must not take high-impact actions beyond authorized privilege and confirmation boundaries. | `compliance` | `agent` | `deterministic-assertions`, `tool-call-check` | blocking, `passRate >= 1.0` for critical actions |
| `multiturn-trajectory` | The assistant should maintain context, pick correct tools, and complete tasks coherently across multiple turns. | `tool-use` | `conversation` | `llm-judge`, `tool-call-check`, `deterministic-assertions` | report-only first, then blocking once scenarios are calibrated |
| `content-coverage` | The eval suite should cover the important content or product areas. | `relevance` | `agent` | `deterministic-assertions`, `llm-judge` | report-only until coverage gaps are understood |
| `regression-incidents` | Past incidents must stay fixed. | `custom` | `agent` | `deterministic-assertions`, `llm-judge` | blocking for active incidents |
| `judge-calibration` | The judge itself must match labelled human expectations. | `custom` | `judge` | `human-labelled-calibration` | report-only first, then blocking once labels stabilize |

## Dataset Expectations

A preset dataset should contain stable case ids, a dataset version, source or provenance notes, lifecycle status, and enough expected evidence for the grader to explain failures. For example, a retrieval case should name expected source ids, while a refusal case should state why refusal is expected.

Dataset versions should change when case meaning changes, not merely when formatting changes. Use a patch bump for small wording fixes, a minor bump when cases are added without changing intent, and a major bump when labels or scoring expectations change enough to affect baseline compatibility.

## Rubric Expectations

Rubrics define what good means for a suite. They should name axes, versions, and source paths where the rules live. Bump a rubric version when scoring scales, judge prompts, required axes, or pass/fail thresholds change.

Blocking suites should declare `rubricVersion` and, when possible, `rubricContracts[]` so reports can explain what was evaluated and baseline compatibility can catch changed expectations.

For tool suites, align checks with common trajectory-style standards used in production eval tooling:

- expected tool used (and unexpected tool not used)
- tool args match required schema and intent
- tool call sequence validity for multi-step tasks
- bounded retry and safe fallback behavior

For multi-turn suites, include episode-level assertions in addition to per-turn checks:

- context retention across turns and references
- state consistency after tool outputs and follow-up instructions
- delayed safety/injection resilience (adversarial turns after trust-building)
- end-to-end goal completion over the full conversation trajectory

## CI Tiers

Use these presets across three tiers:

1. **Offline wiring gates:** cheap deterministic checks on pull requests. These validate dataset shape, row completeness, and routing logic.
2. **Live quality gates:** main/deploy checks that call real retrieval, agents, tools, and judges when credentials are available.
3. **Scheduled monitoring:** drift checks that compare production-like runs against stable datasets and calibrated rubrics.

Generate reports after artifacts are emitted. Deploy workflows should fail if the expected generated dashboard is missing instead of publishing a placeholder or stale report.

## Artifact Boundary

The preset is setup guidance. The artifact remains runner-agnostic:

- `suiteManifests[]` records the suite purpose, target, risk area, dataset version, rubric version, graders, and gate.
- `rubricContracts[]` records the scoring axes for suites that use human or judge grading.
- `rows[]` records the actual evidence and pass/fail outcome for each case.

See [../examples/agent-quality-preset/README.md](../examples/agent-quality-preset/README.md) for a runnable template artifact and starter dataset/rubric files.

## CLI Starter

Print a starter configuration for the template with:

```sh
eval-dashboards init --preset=agent-quality
```

Write scaffold files for a new project with:

```sh
eval-dashboards init --preset=agent-quality --write
```

This writes:

- `eval-dashboards.config.ts`
- `eval/datasets/agent-quality-cases.jsonl`
- `eval/rubrics/agent-quality-rubrics.json`
- `.evals_output/run-agent-quality-template.json`
- `.github/workflows/eval-quality.yml.snippet`

Use `--dry-run --write` to preview paths without writing, `--out-dir <path>` to target another directory, and `--force` to overwrite existing files.

For a guided dry-run walkthrough that explains the eval flow and setup steps:

```sh
eval-dashboards init --preset=agent-quality --teach
```