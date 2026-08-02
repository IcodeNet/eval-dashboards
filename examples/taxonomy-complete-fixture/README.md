# Taxonomy-Complete Fixture

This is a **complete example** of an `eval-report/v1` artifact with all recommended taxonomy fields filled in.

## What to Look For

This fixture demonstrates:

- ✅ **Complete row-level taxonomy:** `kind`, `severity`, `category`, `datasetId`, `scenarioId`, `rubricId`, `promptVersion`, `agentVersion`
- ✅ **Evidence fields appropriate to `kind`:** `turns` and `toolCalls` for agents; `judgeModel`, `judgeVerdict`, `judgeReasoning` for LLM judges
- ✅ **Axis scores:** `axisScores` for graded evaluations
- ✅ **Suite manifests:** Complete declarations with `target`, `riskArea`, `datasetSource`, `datasetVersion`, `gate` policies
- ✅ **Rubric contracts:** Axis definitions for reference
- ✅ **Baseline compatibility:** Even if empty, shows the shape
- ✅ **Run metadata:** Project, team, branch, commit, buildId for context

## Use This As a Template

When building an eval runner, reference `run-complete.json` to see:

1. What fields belong in each section
2. How to structure nested objects like `turns` and `toolCalls`
3. What `gate` policies look like
4. How to fill `axisScores`

## View the Report

```bash
eval-dashboards report --input=examples/taxonomy-complete-fixture --reporter=html
eval-dashboards report --input=examples/taxonomy-complete-fixture --reporter=text
```

The report will render the complete taxonomy and show how the dashboard surfaces all the information.

## Copy This for Your Own Tests

```bash
cp examples/taxonomy-complete-fixture/run-complete.json my-evals/run-001.json
# Edit to match your data
eval-dashboards report --input=my-evals
```

## Notes

- All optional fields are filled in, which is great for testing. In production, you may omit fields that don't apply to your eval.
- The `metadata` field shows how to extend the schema with custom fields.
- Both passing and failing rows are included to show how failures are categorized.
