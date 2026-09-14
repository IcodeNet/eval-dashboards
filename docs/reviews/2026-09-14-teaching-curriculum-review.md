# Teaching curriculum review: teach-labs + teach-exercises

Reviewer: independent product-quality pass. Every command below was executed
against this worktree. Findings marked VERIFIED were reproduced; nothing here is
inferred from reading alone.

Scope: `docs/teach-labs/*.md` (7 files), `docs/teach-exercises/*.md` (12 files).

---

## 0. Important context discovered during the review

**Labs 04 and 05 were rewritten mid-review.** Commit `47aec9b`
("docs(teach): add red-run diagnosis exercise and deepen release labs") landed
while this review was running. The two files the owner complained about are
**no longer anaemic** — they are now the best files in the set and should be
treated as the template, not as defects.

That changes the shape of the problem. The set is not uniformly thin. It is
**bimodal**: four rich files and fifteen thin ones, with no shared structure
between them. The real defect is inconsistency plus a batch of commands that do
not do what the docs say.

The four good files: `teach-labs/04`, `teach-labs/05`,
`teach-exercises/11-diagnose-a-red-run`, `teach-exercises/pm-01-reading-a-report`.

---

## 1. Broken and misleading commands (highest-value findings)

These are ranked by damage. Each was run.

### 1.1 BLOCKER — Exercise 07 fails lint; the doc says it passes

`docs/teach-exercises/07-judge-calibration.md` claims:

> Example result
> - Commands run without schema errors.

VERIFIED FALSE. Running the exercise's own Python block then its own
`lint --input=.evals_output` gives **exit code 1**:

```text
Eval taxonomy lint failed with 2 error(s) and 5 warning(s):
ERROR [missing-row-lifecycle] Row answer-quality:judge-row-001 is missing metadata.lifecycle.status required for dataset-governed suites.
ERROR [missing-row-provenance] Row answer-quality:judge-row-001 is missing metadata.provenance.source required for dataset-governed suites.
```

The row the exercise tells you to write is not valid under the lint rules this
repo ships. A learner following instructions exactly hits a hard failure with no
explanation, on the exercise about *judge trustworthiness*. This is the single
worst item in the curriculum. The exercise must either add
`metadata.lifecycle.status` + `metadata.provenance.source` to the row, or the
doc must teach the error as the lesson.

Root cause is cross-file: Ex05 introduces `suiteManifests`, which promotes those
suites to "dataset-governed", which makes provenance/lifecycle mandatory in
Ex07. **Ex05 sets the trap and Ex07 springs it.** Neither file mentions it.

### 1.2 BLOCKER — `history --history-dir` is not a real flag, and silently writes elsewhere

`docs/teach-exercises/11-diagnose-a-red-run.md:66`:

```sh
npx eval-dashboards history --input=.evals_output --history-dir=eval-report
```

VERIFIED: `history` accepts only `--input` and `--out` (`history --help`).
`--history-dir` is **silently ignored** — no error, no warning. The command
prints `eval-report/history.json` and exits 0, so it *looks* correct. In fact it
wrote to the default path.

This is worse than a crash. I ran it with `--input=.tmp/ex11/.evals_output
--history-dir=eval-report` and it wrote to the **repo root** `eval-report/history.json`,
not under the input dir. A learner working in a subdirectory will scatter files
into the repo root and never know. Fix: use `--out=eval-report/history.json`.
Separately, the CLI should reject unknown flags — silent ignore is a product bug,
not just a docs bug.

### 1.3 Ex08 documents output the CLI does not produce

`docs/teach-exercises/08-gates-release.md` claims:

> In this early dataset stage, a failing `check` (exit code `1`) is expected and
> useful because it shows which gate failed.

VERIFIED FALSE. Following Ex02 → Ex08 exactly, `check --min-pass-rate=0.9
--zero-critical` prints `Eval gates passed.` and **exits 0**. The minimal
artifact has one passing row, so the pass rate is 1.0. The doc primes the
learner to expect a red result and then hands them a green one, with no
explanation of why. Either change the fixture or change the text.

### 1.4 Ex05 makes lint strictly worse and never says so

VERIFIED. Before Ex05, lint is clean:

```text
Eval taxonomy lint passed with no issues.
```

After running Ex05 verbatim:

```text
WARNING [missing-suite-manifest] Suite quality has no matching suite manifest.
```

The exercise adds manifests for `refusal-safety` and `answer-quality` — neither
of which is a suite that exists in the artifact. The one suite that does exist
(`quality`) gets no manifest, so adding governance metadata *introduces* a
warning. The doc's "Example result" says only "Commands run without schema
errors", which is technically true and educationally useless. A learner doing
the right thing watches their lint output degrade and is told nothing.

### 1.5 Dangling forward reference

`pm-01-reading-a-report.md` ends:

> Next: `docs/teach-exercises/pm-02-reading-drift.md`.

VERIFIED: that file does not exist. The "Reading track A" naming also implies a
track B that does not exist.

### 1.6 Ex11 `rowStability` claim — correct, but only by luck

The exercise promises `{'stable': 8, 'flaky': 4, 'persistentFailure': 1}`.
VERIFIED correct. But the only reason the learner sees it is that the broken
`--history-dir` flag happened to fall back to the same `eval-report/history.json`
the next line reads. Fix 1.2 without care and this step breaks.

### 1.7 No doc implies an HTML trend/flaky panel — clears the owner's concern

I checked this explicitly because it was called out. VERIFIED: the rendered
`index.html` contains **zero** occurrences of "flaky" and no `rowStability`
panel. It does render a "Pass-rate trend" card, which with two runs degrades
gracefully to `add another run to graph trend`. No lab or exercise claims a flaky
panel exists. **This one is clean** — the docs do not overpromise the HTML.

### 1.8 Everything else runs

For completeness, these were executed end-to-end and behave as documented:
Labs 01, 02, 03, 04, 05, the FDE fixture block, and Ex02, Ex03, Ex04, Ex06,
Ex09, Ex10, Ex11 step 1. Lab 04's newly-added expected-output blocks match real
output byte-for-byte, including `pass_rate= 97.33` and both `rq-fail-*` lines.

---

## 2. File-by-file

Format: claims / actually walks away with / the gap.

### teach-labs

**01-local-dev-loop.md — ANAEMIC**
Claims: "Local development should produce decision-ready evidence, not only a
pass/fail feeling." Walks away with: four Python blocks that print field values.
Gap: the lab never says what a *decision* would be. It prints
`persistent_failures= 2` and `disappeared= 4` and stops. Nothing explains that
`disappeared=4` here is **ID churn, not four fixed bugs** — which is the single
most confusing number in the fixture, and the one that Lab 03 later admits in a
throwaway bullet. Step 2 is a file-existence check dressed up as a lesson: it
teaches `Path.exists()`, not evaluation.

**02-pre-pr-gating.md — ANAEMIC**
Claims: "A gate is a policy decision over evidence, not a generic test failure."
That framing is genuinely good and then abandoned. Walks away with: two `check`
invocations at 0.95 and 0.99 and a printed `merge-eligible`/`blocked`.
Gap: the entire lesson is *where does 0.95 come from?* and the lab never asks
it. Real output shows `pass_rate 0.973`, so the threshold was reverse-engineered
to straddle the fixture. Say that. Teach the learner that a threshold is a
negotiated risk position, not a constant. Also prints
`diagnostics: [...]` including `missing-judge-model=55` with no comment — 55
rows with no recorded judge, in a lab about trusting a gate.

**03-pr-review-triage.md — WEAK (better than 01/02)**
Claims: triage is comparison analysis. Walks away with: three labelled row
lists. Gap: it has the one honest interpretive line in the old set —
"`newlyPassing` can be empty because improvements can appear under `disappeared`
when row IDs changed" — but buries it under "Expected outputs" as a bullet.
That sentence is the actual lesson of the fixture and deserves to be the
headline. Verified: `newlyPassing 0`, `newlyFailing 0`, `disappeared 4`. A
reviewer reading this fixture cold concludes "nothing changed", which is wrong.

**04-release-readiness.md — NOW STRONG (reference file)**
Post-`47aec9b`. Has stated learning objectives, a "Why this matters" that names
the real tension (green gate + two live failures), prerequisites, per-step
rationale, verbatim expected output, a signal-interpretation table with a "Watch
out for" column, and five concrete common mistakes. The line "`2` is thin. Two
runs cannot show a trend. Be honest about that" is exactly the register the whole
curriculum needs. No changes required.

**05-post-release-monitoring.md — NOW STRONG (reference file)**
Same treatment. "Nothing about your agent has to change for its quality to fall"
earns the lab's existence in one sentence. No changes required.

**fde-role-workflow.md — ANAEMIC, and structurally odd**
Claims: the FDE is "an evidence translator between product risk and engineering
action." Walks away with: a responsibilities table and five `npx` snippets.
Gap: it is a role description wearing a lab's clothes. The stage table is the
most useful artifact in the whole directory and is never exercised — the learner
never fills one in for a scenario. Steps 1–5 use `npx eval-dashboards` against a
hypothetical customer repo that does not exist, so **none of steps 1–5 are
runnable as written**; only the trailing fixture block runs. It also duplicates
Labs 01–05 rather than composing them.

**README.md — ADEQUATE**
The "four evidence classes" framing (history / progress / gate / row detail) is
the best organising idea in the curriculum and is the one thing every lab
actually shares. Gap: it is stated once here and never referenced again by any
lab. It should be the spine. Also gates the entire track behind an external link
(`icodenet.github.io/langfuse-101`) as "recommended pre-read" — a third-party
dependency for a first-run experience.

### teach-exercises

**01-foundations.md — THIN BUT CORRECT**
Claims: define a behaviour and define failure. Walks away with: a two-line notes
file. Gap: it hands the learner the answer. The example text ("grounded support
answers that cite policy docs") *is* the deliverable, copy-pasteable, so nothing
is practised. Needs a bad example next to the good one — that is what teaches
"narrow" and "concrete". Its "If you get stuck" section is good and is the only
one in the set.

**02-artifact-first.md — ADEQUATE**
Claims: one valid artifact, validated. Verified working, and it is the only
early exercise that shows real expected output including the three warnings.
Gap: never explains *why* those three fields are warnings and not errors. That
distinction — minimal-valid vs taxonomy-complete — is the package's core
teaching and is deferred to Ex04.

**03-first-synthetic-dataset.md — WEAK**
Claims: 2 expected-pass, 2 expected-fail rows. Verified: counts print `2` and
`2`. Gap: introduces `expectation` as "one extra field" for this exercise, but
`expectation` connects to a real gate — `--min-matched-expectation-rate` exists
in `check --help` and is never mentioned anywhere in the curriculum. The
exercise teaches a field and hides its purpose. Also silently instructs
`rm -f .evals_output/run-agent-quality-template.json`, deleting the scaffolder's
own output, with a one-line justification.

**04-row-taxonomy.md — GOOD (best of the old exercises)**
Claims: minimal → taxonomy-complete. Walks away with: a genuine understanding of
the three field groups (classification / governance / evidence). Verified: lint
goes to `passed with no issues`. Gap: does not show the before/after lint counts
side by side, which is the proof. It has a "Common mistakes" section — the only
old exercise that does — and that section is the model for the rest.

**05-suite-taxonomy.md — POOR**
See 1.4. Adds manifests for suites that do not exist, makes lint worse, reports
"no schema errors". The Ex05→Ex07 trap starts here.

**06-live-agent-evidence.md — WEAK**
Claims: `turns[]` and `toolCalls[]`. Verified lint exit 0 with 3 warnings. Gap:
"Final answer alone hides many failures" is the correct thesis and is never
demonstrated — the row added **passes**. To teach that trajectory evidence finds
hidden failures, the row must be one where the output looks right and the tool
call is wrong. As written it adds fields and proves nothing. The new
`missing-agent-versioning` warning appears in real output and is unexplained.

**07-judge-calibration.md — BROKEN**
See 1.1. Hard fail, exit 1, doc claims success.

**08-gates-release.md — POOR (939 bytes, the thinnest file)**
Claims: "You can explain why each command runs in this order." Walks away with:
three commands in a single unexplained block. Gap: the definition of done asks
for an explanation the document never provides. Why lint before check? Why check
before report? The answer (fail cheap before you fail expensive; never publish a
report for an artifact you have not validated) is a genuinely good lesson and is
simply absent. Plus the wrong exit-code claim in 1.3.

**09-reports-history.md — ADEQUATE**
Verified: history has 2 entries, check exits 1 with `New failures 1 exceed
allowed 0`. Correctly labels the failure as intentional. Gap: never explains
what a baseline *is* or why `--baseline-run-id` must be pinned. The `mv` to
rename run-minimal is explained in one line; the deeper point — that run IDs are
your history's primary key — is not made.

**10-iteration-loop.md — WEAK**
Verified passes. Gap: the "fix" is editing `passed: false` to `passed: true` in
the artifact. That is *falsifying the evidence*, which is the exact behaviour
this package exists to prevent. The change-note text hand-waves it as a rubric
fix. Without a loud framing that this is a simulation of a rubric change and
never something you do to a real run, this exercise teaches the worst possible
habit. Highest-risk content in the set even though it executes cleanly.

**11-diagnose-a-red-run.md — STRONG (reference file)**
Claims: name each distinct cause of a red run, decide a response per cause. This
is the best teaching document in the repo. It poses questions before answers,
hides conclusions in `<details>`, distinguishes four causes with an explicit
"Response:" for each, and closes with "You never proposed lowering
`--min-pass-rate` to make the run pass" — a definition of done that tests
judgement rather than command completion. Only defect is the `--history-dir`
flag (1.2).

**pm-01-reading-a-report.md — STRONG (reference file)**
Verified against the real rendered HTML: header strip shows `Pass rate 61.5%`,
`Passed 8/13`, `New failures 4`, `New passes 0`, `Baseline blocked`; failing-rows
header reads `5 rows • 4 new regressions • 1 persistent failure`; the score chip
shows `78%`. **Every claim in this document is literally true of the artifact.**
The score-interpretation table and the "this is the trap" framing on the blocked
baseline are exactly the bar. Only defect is the dangling pm-02 link (1.5).

---

## 3. Systemic weaknesses

Checked against the owner's candidate list, with verdicts.

1. **No stated learning objectives — CONFIRMED, 15 of 19 files.** Old labs open
   with a one-line "Concept" aphorism. "A gate is a policy decision over
   evidence" is a *conclusion*, not an objective. Labs 04/05 now open with "What
   this lab teaches" + four numbered ideas. Nothing else does.

2. **No expected output — CONFIRMED and it is the worst structural gap.** Old
   labs have an "Expected outputs" section that lists *file names*, not
   *values*. `- summary.json includes comparison.previousRunId` does not let a
   learner self-check. Compare Lab 04's verbatim block showing
   `pass_rate= 97.33`. Nine exercises use the boilerplate "Commands run without
   schema errors. Artifact is updated as described in the goal." — that string
   appears in Ex05, Ex06, Ex07, Ex10 identically, and in Ex07 it is **false**.
   This copy-paste placeholder is the single clearest marker of anaemia.

3. **No interpretation guidance — CONFIRMED.** Numbers are printed, never read.
   `disappeared= 4` is printed by three separate labs and explained by none of
   them properly. `pass_rate= 97.33` is printed without the observation that it
   sits above a 0.95 gate and below a 0.99 one, which is the whole point of the
   fixture.

4. **No decision framing — CONFIRMED.** Lab 02 prints `merge-eligible` and
   stops. It never asks the learner to write the PR comment. Labs 04/05 fixed
   this by naming a deliverable ("These two lines are the deliverable").

5. **No failure modes / common mistakes — CONFIRMED, 15 of 19.** Only Ex04,
   Lab 04, Lab 05 have one.

6. **No prerequisite chain — CONFIRMED and it causes a real bug.** Every
   exercise says "Prerequisite: Complete setup in teach-curriculum.md section
   Exercise rules" — identical boilerplate, never naming the actual dependency.
   The real chain is Ex02→Ex04→Ex05→Ex06→Ex07→Ex09→Ex10 mutating one shared
   file, and that is never stated. Ex05's manifests silently break Ex07 (1.1)
   precisely because the chain is undocumented. Ex11 is the only exercise that
   names its real prerequisite ("Finish Exercise 09"). Old labs name none.

7. **Commands that do not run — CONFIRMED.** Ex07 fails (1.1);
   `--history-dir` is fake (1.2); Ex08's exit-code claim is wrong (1.3); FDE
   steps 1–5 are unrunnable; pm-02 does not exist (1.5).

8. **NEW — indexing is broken.** `docs/teach-curriculum.md` does not reference
   `11-diagnose-a-red-run.md` or `pm-01-reading-a-report.md` at all (grep: no
   match). The two best exercises in the repo are unreachable from the index
   that is supposed to organise the curriculum.

9. **NEW — no artifact-hygiene guidance, and the docs model bad practice.**
   Labs 04/05 use `.tmp/` scratch dirs (good, added in `47aec9b`). Exercises
   write into the repo root: `.evals_output/`, `eval/notes/`, `eval-dashboard/`,
   `eval/datasets/`. Ex03 runs `init --write` which drops five files including
   `.github/workflows/eval-quality.yml.snippet` into the working directory. A
   learner who runs the exercises inside the eval-dashboards checkout — which
   labs/README explicitly requires for the labs — pollutes the repo. **I did
   exactly this during review.** The curriculum needs one stated rule: exercises
   run in a scratch directory, never the repo root.

10. **NEW — the "four evidence classes" spine is declared once and never used.**
    labs/README names history / progress / gate / row-detail as the shared
    frame. No individual lab labels its steps against it. Doing so would cost
    four words per step and make the whole track cohere.

---

## 4. Proposed section template

One template for every lab and exercise. Derived from what Labs 04/05, Ex11 and
pm-01 already do — this is not new invention, it is normalising the best four
files onto the other fifteen.

```markdown
# <Lab NN | Exercise NN>: <Title>

## What this teaches
<2-3 sentences: the capability gained, in the learner's words.>
<One transformation line: "turn X into Y".>

Ideas, in order:
1. **<Named idea>.** <Why it is true.>
2. **<Named idea>.** <Why it is true.>
3. **<Named idea>.** <Why it is true.>
4. **<Named idea>.** <Why it is true.>

## Why this matters
<The failure that happens without this skill. Name the tension in THIS
fixture — e.g. "the gate passes and two failures ship anyway".>

## Question this answers
<One question the learner can answer aloud when done.>

## Prerequisites
- <Named prior lab/exercise and the specific thing it gave you.>
- <Artifact state this assumes, if it mutates a shared file.>

## Where to run this
<Scratch dir or repo root. Explicit. Exercises: scratch dir.>

## Steps

### N) <Imperative step title>
```sh
<command>
```
**Why:** <what this step buys you; why it is not optional.>

**Expected output:**
```text
<VERBATIM real output. Must be reproducible.>
```

**How to read it:**
| Signal | What it answers | Watch out for |
|---|---|---|
| `field` | <question it answers> | <the misreading> |

**Decision:** <what you would DO differently based on this value.>

## Evidence classes covered
<history | progress | gate decision | row-level detail — tick which.>

## Common mistakes
- **<Mistake>.** <Why it is tempting and what it costs.>

## Definition of done
<Tests judgement, not command completion. Include at least one negative:
"You never <the tempting wrong action>.">
```

Two rules that matter more than the template shape:

- **Every `Expected output` block must be generated by running the command,
  and kept in sync.** The string "Commands run without schema errors" is banned.
  Consider a CI check that executes fenced `sh` blocks in these docs and diffs
  against the adjacent `text` block — the Ex07 and Ex08 bugs would both have been
  caught by it, and this repo's own ethos (artifact-first, verify don't assume)
  demands it.
- **Every definition of done must contain one negative clause.** Ex11's "You
  never proposed lowering `--min-pass-rate`" is the model. It is what turns a
  checklist into judgement.

---

## 5. Ranking, worst to best

Priority order for the rewrite. Rank weighs correctness first (a doc that lies
is worse than a doc that is merely thin), then depth.

| # | File | State | Why here |
|---|------|-------|---------|
| 1 | `teach-exercises/07-judge-calibration.md` | **BROKEN** | Hard-fails lint, exit 1, doc claims success. Blocks the chain. |
| 2 | `teach-exercises/08-gates-release.md` | **BROKEN + thinnest** | 939 bytes; wrong exit-code claim; DoD asks for an explanation the doc never gives. |
| 3 | `teach-exercises/05-suite-taxonomy.md` | **HARMFUL** | Degrades lint, reports success, sets the trap that breaks Ex07. |
| 4 | `teach-exercises/10-iteration-loop.md` | **HARMFUL** | Teaches editing `passed` to true as "fixing". Runs clean, which makes it worse. |
| 5 | `teach-labs/01-local-dev-loop.md` | Anaemic | File-existence check as a lesson; prints numbers, reads none. |
| 6 | `teach-labs/fde-role-workflow.md` | Anaemic + unrunnable | Steps 1–5 do not execute; role doc masquerading as a lab. |
| 7 | `teach-labs/02-pre-pr-gating.md` | Anaemic | Strong thesis, zero follow-through; never asks where 0.95 comes from. |
| 8 | `teach-exercises/06-live-agent-evidence.md` | Weak | Thesis is "final answer hides failures"; demo row passes, proving nothing. |
| 9 | `teach-exercises/03-first-synthetic-dataset.md` | Weak | Teaches `expectation` while hiding `--min-matched-expectation-rate`. |
| 10 | `teach-exercises/01-foundations.md` | Thin | Hands over the answer; nothing is practised. |
| 11 | `teach-labs/03-pr-review-triage.md` | Weak | Has the key insight, buried as a bullet under Expected outputs. |
| 12 | `teach-exercises/09-reports-history.md` | Adequate | Runs as documented; never defines "baseline". |
| 13 | `teach-exercises/02-artifact-first.md` | Adequate | Correct, real output shown; defers the valid-vs-complete lesson. |
| 14 | `teach-labs/README.md` | Adequate | Good spine, never used by the labs; external pre-read dependency. |
| 15 | `teach-exercises/04-row-taxonomy.md` | Good | Best of the old set; has Common mistakes; needs before/after lint proof. |
| 16 | `teach-labs/05-post-release-monitoring.md` | **Reference** | Rewritten in `47aec9b`. No changes needed. |
| 17 | `teach-labs/04-release-readiness.md` | **Reference** | Rewritten in `47aec9b`. Verified accurate to real output. |
| 18 | `teach-exercises/pm-01-reading-a-report.md` | **Reference** | Every claim verified true of the rendered HTML. Fix dangling pm-02 link only. |
| 19 | `teach-exercises/11-diagnose-a-red-run.md` | **Reference / best in repo** | Teaches judgement. Fix `--history-dir` only. |

Suggested sequencing:

- **Now (correctness):** items 1–4, plus the `--history-dir` fix in item 19 and
  the pm-02 link in item 18. These are bugs, not depth problems.
- **Next (indexing):** add Ex11 and pm-01 to `teach-curriculum.md` — two of the
  four best files are currently unreachable.
- **Then (depth):** items 5–11 onto the §4 template.
- **Standing:** the docs-execution CI check, and one stated scratch-directory
  rule for all exercises.

---

## 6. Verification appendix

Executed from the repo root unless noted; exercise chain run in `.tmp/sbx`.

- `./scripts/generate-report-power-artifacts.sh` — OK, regenerates fixture.
- Lab 01 steps 1–4 — all run. `pass_rate= 97.33`, `persistent_failures= 2`,
  `disappeared= 4`.
- Lab 02 steps 1–4 — run. `decision@0.95: merge-eligible`,
  `decision@0.99: blocked`, `baselineRunId: agent-v3-2026-07-30` present.
- Lab 03 steps 1–4 — run. `newlyPassing 0`, `newlyFailing 0`, `disappeared 4`.
- Lab 04 steps 1–4 — run; output matches documented blocks exactly.
- Lab 05 — commands present and valid.
- FDE fixture block — runs. Steps 1–5 not runnable (hypothetical customer repo).
- Ex02 — lint exit 0, 3 warnings, matches doc.
- Ex03 — `init --write` wrote 5 files; pass/fail counts both `2`.
- Ex04 — lint `passed with no issues`.
- Ex05 — lint gains `missing-suite-manifest` warning. Doc silent.
- Ex06 — lint exit 0, 3 warnings incl. `missing-agent-versioning`. Doc silent.
- Ex07 — **lint exit 1, 2 errors.** Doc claims no errors.
- Ex08 — `Eval gates passed.` exit 0. Doc claims exit 1 expected.
- Ex09 — history 2 entries; check exit 1 `New failures 1 exceed allowed 0`.
- Ex10 — check exit 0 `Eval gates passed.`
- Ex11 step 1 — reproduces all four documented failure lines verbatim.
- Ex11 step 3 — `rowStability` = `{'stable': 8, 'flaky': 4,
  'persistentFailure': 1}` as documented; `--history-dir` silently ignored.
- pm-01 — HTML verified: header strip, `Baseline blocked`, `5 rows • 4 new
  regressions • 1 persistent failure`, `78%` score chips, zero `critical` among
  failing rows.
- HTML flaky/trend audit — `flaky` appears 0 times in rendered HTML; a
  "Pass-rate trend" card exists and degrades to "add another run to graph
  trend" at 2 runs. No doc overclaims this.
- `history --help` — accepts `--input`, `--out` only. No `--history-dir`.
- `report --help` — no `--history-dir`. Confirms the owner's note.
- labs/README pre-read link `https://icodenet.github.io/langfuse-101/` — HTTP
  **200, reachable**. The critique in §2 is about it being a third-party
  dependency in the first-run path, not about it being broken.
- `docs/teach-exercises/pm-02-reading-drift.md` — confirmed absent.
- `grep "11-diagnose\|pm-01" docs/teach-curriculum.md` — **no match**. The only
  hit in that grep was the unrelated line 22 "Exercise rules". Confirms the two
  best exercises are not indexed.

### Reviewer-caused repo changes (disclosure)

While running Ex03 I invoked `init --preset=agent-quality --write` from the repo
root by mistake. It created five files; I deleted them before being instructed to
stop deleting. All five were created by that command moments earlier, were
untracked, and did not exist beforehand:
`eval-dashboards.config.ts`, `eval/datasets/agent-quality-cases.jsonl`,
`eval/rubrics/agent-quality-rubrics.json`,
`.evals_output/run-agent-quality-template.json`,
`.github/workflows/eval-quality.yml.snippet`.

Left in place, not removed: an empty `.evals_output/` directory, and
`eval-report/history.json` (written by the Ex11 `--history-dir` command landing
at its default path). Both are gitignored.

No tracked file was modified by this review. `git status` shows only the other
session's in-flight work (`src/cli/index.ts`, `src/gates/lint-taxonomy.ts`,
`test/lint-taxonomy.test.ts`, `test/cli-lint.test.ts`, `docs/cli-help/lint.txt`,
`docs/taxonomy.md`, and the two regenerated fixture gate JSONs).
