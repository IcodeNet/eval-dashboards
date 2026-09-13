# Roadmap Completion Plan (Continuous Milestones)

> For Hermes execution: run this as a rolling slice queue; do not claim completion until checklist counts are zero for claimed scopes and evidence gates pass.

## Goal
Complete Phase 4D with dependency-ordered slices, continuous weekly execution, and no false completion claims across `docs/ROADMAP.md` and `docs/STATUS.md`.

## Current truth baseline (from repo)
- Open checklist items: `docs/ROADMAP.md` **13 unchecked**, `docs/STATUS.md` **6 unchecked**.
- Status/roadmap alignment issue: STATUS marks 4C complete while ROADMAP still has unchecked 4C.1 implementation recommendation items (Node-first docs stack decision/publish-target wording).
- Adoption KPI baseline (`docs/adoption-metrics/latest.json`): weekly downloads 37/100, external adoptions 0/1, schema citations verified 0/2.
- 4D is the active unfinished phase and should be treated as the execution spine.

---

## Dependency-ordered execution sequence (immediate start)

## Slice 0 — Truth-sync preflight (Day 0)
**Why first:** prevents false “complete” claims while work starts.

**Actions**
1. Freeze a “truth baseline” artifact with unchecked counts and unresolved lines from ROADMAP/STATUS.
2. Reconcile 4C status wording mismatch (ROADMAP unchecked vs STATUS checked) as either:
   - re-scope 4C.1 unchecked bullets into 4D docs-hardening, or
   - mark them complete with evidence and update ROADMAP.
3. Create/update a single execution tracker doc for 4D slices with owner, dependency, stop/go, evidence links.

**Stop/Go gate**
- **Go** only when roadmap/status phase labels and next steps are consistent.
- **Stop** if any section still claims complete while carrying unresolved checklist items.

**Checkbox update timing**
- Do **not** check 4D boxes yet.
- Update only wording/placement consistency items (if moved/re-scoped).

---

## Slice 1 — 4D.1 Schema source-of-truth + drift guard (Days 1–2)
**Depends on:** Slice 0.

**Actions**
1. Define canonical schema generation command/path from TS model.
2. Add CI drift check that fails on generated-schema mismatch.
3. Remove stale line/test/completion counts from maintained docs surfaces.

**Verification gates (required)**
- Local: `pnpm test`, `pnpm typecheck`, `pnpm build`.
- Drift proof: run schema generation + CI-equivalent drift check locally.
- Docs truth-sync proof: grep/report script output showing stale count claims removed.
- Workflow proof: raw GitHub Actions logs for touched workflows (per `CHECKS_LEDGER.md`).

**Stop/Go gate**
- **Go** when drift check is deterministic and fails on intentional mismatch.
- **Stop** if schema can drift silently or docs still contain stale quantitative claims.

**Checkbox update timing**
- Mark `ROADMAP 4D.1` and `STATUS 4D.1` only after all gates above pass and raw workflow logs are attached.

---

## Slice 2 — 4D.2 Validation contract + CI-native outputs foundation (Days 3–6)
**Depends on:** Slice 1.

**Actions**
1. Stabilize Ajv/runtime validation error shape (document + tests).
2. Establish CI machine-output baseline (`--json-out` contract + row-anchor mapping).
3. Define backlog entries for JUnit/SARIF/annotations as sequenced follow-ons, not implied done.

**Verification gates**
- Contract tests for deterministic validation shape.
- Golden fixture tests for machine output shape and row anchors.
- CLI help/docs alignment snapshots for changed commands.

**Stop/Go gate**
- **Go** when same invalid input produces same structured error payload and machine output resolves row anchors in one hop.
- **Stop** if output shape changes across runs/versions without versioned doc updates.

**Checkbox update timing**
- Mark 4D.2 only when backlog items each have dependency + pass/fail checks and output contracts are tested.

---

## Slice 3 — 4D.3 14-day window execution (exact 6 items; Days 1–14 rolling)
**Depends on:** Slices 1–2 scaffolding.

Execute the six ROADMAP items in order; each item requires owner, dependency, acceptance evidence, and proofreader pass.

**Milestone M1 (Day 14) outcomes**
1. Schema drift guard live.
2. Stable validation error contract live.
3. CI machine output baseline live.
4. Docs truth-sync sweep complete.
5. Adopt-now path published in plain English.
6. Independent proofreader + full verification complete.

**Stop/Go gate**
- **Go** to 45-day window only if all six are complete with evidence.
- **Stop** if any one item lacks verification or proofreader signoff.

**Checkbox update timing**
- Mark `STATUS 4D.3` only after all 6 sub-items verified; never on partial completion.

---

## Slice 4 — 4D.4 45-day window execution (exact 8 items; Days 15–45)
**Depends on:** M1 done.

Prioritized order:
1. JUnit output
2. SARIF output
3. GitHub annotation helper
4. Usage metrics contract (tokens/cost/latency)
5. Python emitter path
6. Interop adapter expansion
7. Judge calibration hardening
8. Trace/OTel evidence hardening

**Milestone M2 (Day 45) outcomes**
- All eight shipped with fixture tests + docs + CLI examples.
- Risk register entries mapped to triggers/mitigations (4D.5).
- Discoverability surfaces synchronized (4D.6).

**Stop/Go gate**
- **Go** to “Phase 4D complete” only when all eight items have passing acceptance checks.
- **Stop** if any CI-native output lacks deterministic schema/fixture validation.

**Checkbox update timing**
- Mark `STATUS 4D.4` only when all 8 done.
- Mark `STATUS 4D.5` and `4D.6` only after risk + discoverability checks pass with evidence.

---

## Slice 5 — Adoption-map outcome track (runs weekly in parallel)
**Depends on:** Slice 2 minimum (`import`/output contracts stable).

**Required outcome (must be explicit)**
- Adoption map remains actionable with verified evidence for at least 3 distinct candidate repos, each with:
  - runner command source anchor,
  - conversion path to `eval-report/v1`,
  - non-disruptive PR-style change set,
  - risk + mitigation + baseline bootstrapping note.

**Operational cadence**
- Weekly runbook from `docs/adoption-feedback-loop.md`.
- Any failed page-to-action check creates `DOC-F###` backlog entry before review closes.

**Stop/Go gate**
- **Go** when two consecutive weekly reviews satisfy adoption-loop exit criteria.
- **Stop** if unresolved critical friction item >14 days or no verified import path in-week.

**Checkbox update timing**
- Do not mark roadmap “external adoption outcomes” as complete (they are ongoing KPIs).
- Mark process-infrastructure tasks only (loop exists and is actively used).

---

## Slice 6 — Historical-trends outcome track (runs per release + weekly monitor)
**Depends on:** Slice 1 and machine outputs from Slice 2.

**Required outcome (must be explicit)**
- Trend claims are reproducible from retained artifacts:
  - `history.json` and summary/manifests reflect retained run count,
  - pass-rate trend and flaky/persistent classifications are evidence-backed,
  - baseline compatibility banners align with dataset/rubric version drift.

**Verification gates**
- Trend integrity checks from `CHECKS_LEDGER.md` section 4.
- Scenario tests with at least one new fail, one persistent fail, one recovery case.

**Stop/Go gate**
- **Go** when trend UI/output matches underlying history files in fixtures.
- **Stop** on any mismatch between rendered trend claims and stored run history.

**Checkbox update timing**
- Only update trend-related done claims when fixture/regression tests and artifact verification both pass.

---

## Where to pivot goals (misleading wording to correct)
1. **“Complete” phrasing where checkboxes remain open**
   - Pivot from phase-level “complete” wording to “complete except listed unresolved items” until unchecked counts are zero for that phase.
2. **CI-native outputs wording ambiguity**
   - Keep `--json-out` as foundational complete work, but do not imply JUnit/SARIF/annotations are complete until their own acceptance tests pass.
3. **Adoption completion framing**
   - Preserve “ongoing KPI” language; do not present external adoption targets as one-time completed tasks.
4. **Immediate next steps drift**
   - Replace stale “dataset governance next” text when 4D execution slices supersede it; maintain one active priority queue.

---

## Continuous operating model (after Day 45)
- **Weekly (fixed):** adoption loop, docs cadence checks, friction triage, partnership log updates.
- **Per PR touching CLI/docs/schema:** full ledger checks + help snapshot sync + raw workflow log verification.
- **Per release:** trend integrity audit + roadmap/status unchecked recount + risk register review.

## Final completion rule (hard gate)
Do not claim “roadmap complete” until programmatic checklist recount is zero for targeted roadmap/status scopes **and** required evidence artifacts (tests, command outputs, workflow raw logs, trend/adoption proofs) are attached.
