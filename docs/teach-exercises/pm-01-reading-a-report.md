# Reading track A: is this release safe?

Audience
- Product managers, reviewers, and anyone who approves a release without
  writing eval code.

What you need
- A browser.
- One sample report. Generate it once, or ask an engineer to send you the
  `index.html` file:

```sh
npx eval-dashboards report --input=examples/diagnose-a-red-run/.evals_output \
  --reporter=html --report-dir=eval-dashboard
open eval-dashboard/index.html
```

No CLI, JSON, or code is required after that. Everything below is read off the
page. Hover any `i` icon for an inline explanation.

## The three-second answer

Look at the header strip. In the sample report it reads:

```text
Pass rate 61.5%   Passed 8/13   New failures 4   New passes 0   Baseline blocked
```

`Pass rate` alone does not tell you whether to ship. You need all four.

## Question 1: did anything get worse?

Find **New failures**. The sample shows `4`.

- `New failures 0` means nothing that used to work is now broken. This is the
  single most important number on the page for a release decision.
- Any number above zero means rows that passed in the comparison run now fail.

Now find the **Baseline** chip. The sample shows `Baseline blocked`.

This is the trap. When the baseline is blocked, the comparison is against a
different dataset version, so `New failures 4` is **not trustworthy**. Hovering
the chip says it plainly: "breaking version mismatch; new/lost failures may be
noise, not signal".

> If you read one thing on this page: a blocked baseline means "we cannot tell
> yet", not "we are fine". Ask for a rebaseline before approving.

## Question 2: how bad are the failures?

Open **Failing rows**. The sample header reads:

```text
5 rows • 4 new regressions • 1 persistent failure
```

Two different things:

- **New regression** — worked before, broken now. This is what your change did.
- **Persistent failure** — was already failing before this change. Not caused by
  this release, but someone still owns it.

Then read the **Severity** column on each failing row: `none → low → medium →
high → critical`.

A release with one `critical` failure is worse than a release with ten `low`
ones, even though the pass rate looks the same. Teams normally block any
`critical`. In the sample, all failures are `medium`.

## Question 3: can I trust this report at all?

Each row has a **Score** chip. That is *taxonomy completeness*: how much context
the team recorded about the row, from 0% to 100%. In the sample every failing
row shows **78%**. Hover it to see which fields are missing.

Reading the score:

| Score | What it means for you |
|-------|----------------------|
| 80-100% | Rich evidence. You can see why it failed and act on it. |
| 50-79%  | Usable, but some context missing. Expect follow-up questions. |
| Under 50% | Thin. The gate still runs, but nobody can explain a failure from the report. |

A dashboard full of low scores is a process warning, not a model problem. It
means failures will be hard to diagnose later.

## Your turn

Using the sample report only, answer:

1. What is the pass rate, and how many rows is it computed from?
2. Should you trust `New failures 4`? Why or why not?
3. How many failing rows were already broken before this change?
4. Is there a `critical`-severity failure?
5. Based on the above, do you approve this release?

<details>
<summary>Answers</summary>

1. 61.5%, from 13 rows (8 passed).
2. No. The `Baseline blocked` chip means the dataset version changed between
   runs, so the count compares two different sets of questions.
3. One — the persistent failure. The other four are flagged as new regressions,
   but see answer 2 about how much that count is worth right now.
4. No. All failing rows are `medium`.
5. No, but not because the agent is proven worse. You cannot yet tell. The
   correct ask is a rebaseline on the new dataset version, not a fix.

</details>

Definition of done
- You can find pass rate, new failures, baseline status, and severity without help.
- You can explain why a blocked baseline invalidates the regression count.
- You never approved a release on pass rate alone.

Next: `docs/teach-exercises/pm-02-reading-drift.md`.
