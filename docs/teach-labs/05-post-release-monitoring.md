# Lab 05: Post-release monitoring

## What this lab teaches

How to keep watching an agent's health **after** it goes live, so you catch
drift and silent degradation instead of hearing about them from users.

Most teams stop evaluating at deploy. This lab turns the same evidence loop into
a scheduled, repeatable job that emits a small machine-readable payload you can
wire into alerting.

Four ideas, in order:

1. **Preventing blind spots.** Production moves: data drifts, prompts change,
   models are updated underneath you. A build that passed last month is not
   evidence about today.
2. **Building a monitoring snapshot.** Pull history, rebuild the summary, re-run
   the gate into a scratch directory — the same three commands every time, so
   the output is comparable run over run.
3. **Computing watch signals.** Reduce a large report to a handful of numbers
   you can track on a chart and alert on.
4. **Emitting a compact alert payload.** Compress everything into a small JSON
   object carrying metrics plus arrays of problem row IDs, suitable for Slack,
   PagerDuty, or a weekly review email.

In short: move from manual launch testing to continuous monitoring, with a
repeatable trigger when the live system degrades.

## Why this matters

Release-day evidence has a shelf life. Nothing about your agent has to change
for its quality to fall — a retrieval index goes stale, a provider silently
swaps a model version, real user questions drift away from your dataset.

Without a loop, the first signal is a customer complaint. With one, it is a
number that moved.

## Lab question

Can you produce a stable monitoring payload that drives alerts or a weekly
review, and explain what each field would page someone about?

## Prerequisites

- Lab 04 (release readiness) — you can build and read an evidence packet.

## Steps

### 1) Refresh artifacts

```sh
./scripts/generate-report-power-artifacts.sh
```

### 2) Build a monitoring snapshot

```sh
rm -rf .tmp/post-release-monitor
pnpm cli:dev history --input=examples/report-power-artifacts/.evals_output --out=.tmp/post-release-monitor/history.json
pnpm cli:dev report --input=examples/report-power-artifacts/.evals_output --reporter=json-summary --report-dir=.tmp/post-release-monitor
pnpm cli:dev check --input=examples/report-power-artifacts/.evals_output --min-pass-rate=0.95 --max-new-failures=0 --zero-critical --json-out=.tmp/post-release-monitor/check.json
```

Only `json-summary` here — no HTML. A monitoring job has no human reader at 3am;
it needs parseable output. The scratch directory is rebuilt each run so a failed
job can never leave yesterday's numbers behind for today's alert to read.

On a schedule, these three commands are the whole job.

### 3) Compute watch signals

```sh
python3 - <<'PY'
import json
from pathlib import Path
hist = json.loads(Path('.tmp/post-release-monitor/history.json').read_text())
summary = json.loads(Path('.tmp/post-release-monitor/summary.json').read_text())
check = json.loads(Path('.tmp/post-release-monitor/check.json').read_text())
print('history_runs=', len(hist))
print('latest_run=', summary['summary']['run']['id'])
print('pass_rate=', round(summary['summary']['passRate'] * 100, 2))
print('gate_passed=', check['passed'])
print('persistent_failures=', len(summary['comparison'].get('persistentFailures', [])))
print('disappeared=', len(summary['comparison'].get('disappeared', [])))
PY
```

Expected output:

```text
history_runs= 2
latest_run= agent-v4-2026-07-31
pass_rate= 97.33
gate_passed= True
persistent_failures= 2
disappeared= 4
```

What each signal is for:

| Signal | Track it because | Alert when |
|---|---|---|
| `history_runs` | Trend confidence grows with runs. | The job stops adding runs — the monitor itself has died. |
| `pass_rate` | The headline health number. | It drops more than your agreed delta versus the rolling average. |
| `gate_passed` | Policy verdict, not a quality score. | It flips True → False. |
| `persistent_failures` | Long-lived breakage nobody owns. | The count grows, or a row persists beyond an agreed age. |
| `disappeared` | Rows in the baseline that are gone now. | Any non-zero value you did not expect. |

**The trap in this fixture.** `disappeared=4` with `newlyPassing=[]`. Four rows
that used to fail are simply *absent* from the new run. That is not four fixes.
Rows vanish because someone renamed IDs, trimmed the dataset, or a runner
crashed part-way. A monitor that only watched `pass_rate` would show
improvement here; the real story is that the comparison lost four cases. Always
read `disappeared` alongside the pass rate.

### 4) Emit a compact alert payload

```sh
python3 - <<'PY'
import json
from pathlib import Path
summary = json.loads(Path('.tmp/post-release-monitor/summary.json').read_text())
payload = {
  'runId': summary['summary']['run']['id'],
  'passRate': summary['summary']['passRate'],
  'previousRunId': summary['comparison'].get('previousRunId'),
  'persistentFailureIds': [r['id'] for r in summary['comparison'].get('persistentFailures', [])],
  'baselineMissingRowIds': [r['id'] for r in summary['comparison'].get('disappeared', [])],
  'newlyPassingRowIds': [r['id'] for r in summary['comparison'].get('newlyPassing', [])],
}
print(json.dumps(payload, indent=2))
PY
```

Expected output:

```text
{
  "runId": "agent-v4-2026-07-31",
  "passRate": 0.9733333333333334,
  "previousRunId": "agent-v3-2026-07-30",
  "persistentFailureIds": [
    "rq-fail-1",
    "rq-fail-3"
  ],
  "baselineMissingRowIds": [
    "rq-fail-2",
    "rq-fail-4",
    "tu-fail-1",
    "tu-fail-2"
  ],
  "newlyPassingRowIds": []
}
```

It carries **IDs, not prose**, so a human can jump straight to the row, and two
consecutive payloads can be diffed by machine. Keep it small enough to fit in a
Slack message.

`eval-dashboards check` can post this for you — see `--notify=slack|teams|email`
in `docs/cli-help/check.txt` — but building it by hand first shows exactly what
those notifications contain.

## Expected outputs

- Snapshot contains history, summary, and check artifacts.
- Alert payload references persistent row IDs plus baseline-missing or
  newly-passing IDs.
- Gate status and pass rate are explicit and machine-readable.
- `newlyPassingRowIds` is empty in this fixture: improvements here show up as
  baseline-missing rows because of ID churn. Real fixes should appear in
  `newlyPassingRowIds`; if they never do, suspect your row IDs are unstable.

## Common mistakes

- **Alerting on pass rate alone.** This snapshot looks healthy while quietly
  losing four rows from the comparison.
- **Treating `disappeared` as fixed.** Absent is not passing.
- **Letting the monitor die silently.** If `history_runs` stops increasing, you
  have no monitoring — and no alert will tell you, because nothing ran.
- **Paging on every change.** Alert on sustained movement against the rolling
  average, or the team will mute the channel within a fortnight.
- **Unstable row IDs.** Without stable IDs, none of these arrays mean anything
  across runs.

## Definition of done

You can run this loop on a schedule, explain what each field in the payload
would page someone about, and correctly interpret a rising `disappeared` count
as a dataset problem rather than a win.
