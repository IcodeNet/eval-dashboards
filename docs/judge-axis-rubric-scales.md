# Judge Axis Rubric Scales

This guide explains how to define and label rubric axis scores so judge calibration is consistent across runs and reviewers.

Use this document when you are deciding:

- whether a suite should use one axis or multiple axes
- how to score axes for calibration rows
- how to set tolerance thresholds for axis-score drift
- how to adapt groundedness scoring for multi-turn conversations

## 1) Single-Axis vs Multi-Axis

Use a single axis when your suite has one dominant quality signal and the failure mode is narrow.

Examples:

- strict refusal-safety checks where the key question is "did it refuse safely?"
- narrow routing checks where the key question is "did it call the required tool?"

Use multiple axes when pass/fail quality depends on more than one independent behavior.

Examples:

- answer quality (correctness, completeness, clarity)
- groundedness (evidence support, contradiction handling)
- multi-turn trajectories (context retention, goal completion, tool discipline)

## 2) Recommended Axis Scale

For portability across runners, use numeric scores in the closed range [0, 1].

- `1.0`: clearly meets rubric expectation
- `0.5`: partially meets expectation
- `0.0`: clearly violates expectation

You can use finer-grained values (for example `0.82`) when your rubric definitions justify them.

Keep scales stable across the same `rubricVersion`. If the scoring policy changes, bump `rubricVersion`.

## 3) Ground Truth Labeling Workflow

For `judge-calibration` rows, label both verdict-level and axis-level expectations:

1. Set `groundTruthVerdict` to the labelled pass/fail outcome.
2. Optionally set `groundTruthCategory` and `groundTruthAnnotation` to explain the decision.
3. Set `groundTruthAxisScores` with one score per rubric axis.
4. Record current judge output in `judgeVerdict` and `axisScores`.
5. Compare labels to judge output using disagreement and axis-delta checks.

When a single reviewer is used, the reviewer output is still treated as the final ground-truth label for that dataset version. If your process later adds adjudication, publish a new `datasetVersion` or `rubricVersion` when labels change meaningfully.

## 4) Axis Delta Thresholds

Use suite gate thresholds to prevent silent drift when verdicts still look similar.

Common calibration thresholds:

- `judgeAgreementRate >= 0.9`
- `judgeDisagreementRate <= 0.1`
- `axisScoreDelta <= 0.2`

Treat these as starting points. Tighten or relax by risk area, judge stability, and label quality.

## 5) Multi-Turn Groundedness Axes

For multi-turn groundedness, add episode-level axes in addition to per-turn checks.

Suggested axes:

- `evidence_alignment`: claims stay supported by provided or retrieved evidence
- `context_retention`: the assistant preserves constraints and facts across turns
- `contradiction_avoidance`: later turns do not conflict with earlier validated information
- `trajectory_completion`: the final answer completes the user goal under stated constraints

These axes are useful for suites such as `answer-groundedness` and `multiturn-trajectory`.

## 6) Row Example

```json
{
  "id": "judge-calibration-001",
  "suite": "judge-calibration",
  "kind": "llm-judge",
  "passed": true,
  "judgeModel": "judge-model-v3",
  "judgeVerdict": true,
  "judgeReasoning": "Claims are supported and constraints are preserved across turns.",
  "axisScores": {
    "evidence_alignment": 0.94,
    "context_retention": 0.92,
    "trajectory_completion": 0.9
  },
  "groundTruthVerdict": true,
  "groundTruthAxisScores": {
    "evidence_alignment": 0.95,
    "context_retention": 0.9,
    "trajectory_completion": 0.92
  }
}
```

## 7) Related Docs

- [taxonomy.md](taxonomy.md)
- [suite-presets.md](suite-presets.md)
- [gates.md](gates.md)
- [examples/llm-agent-evals/README.md](../examples/llm-agent-evals/README.md)