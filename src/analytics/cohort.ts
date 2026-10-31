import { rowMatchedExpectation, type EvalReportV1, type EvalRow, type SuiteManifest } from '../model/eval-report-v1.js';

export type CohortStatus = 'compatible' | 'unknown' | 'incompatible' | 'ambiguous' | 'not-compared';
export type CohortIssue = { code: string; suite?: string; id?: string; status: Exclude<CohortStatus, 'compatible' | 'not-compared'> };
export type MatchedCase = { current: EvalRow; previous: EvalRow; eligible: boolean; issues: CohortIssue[] };
export type ScoreChange = { suite: string; id: string; previous: number; current: number; delta: number; direction: 'higher-is-better' | 'lower-is-better'; change: 'regression' | 'improvement' };
export type CohortSummary = {
  currentRunId: string;
  previousRunId?: string;
  status: CohortStatus;
  currentRows: number;
  previousRows?: number;
  matchedCases: number;
  eligibleCases: number;
  currentMatchCoverage?: number;
  previousMatchCoverage?: number;
  introducedCases: number;
  introducedFailures: number;
  removedCases: number;
  matchedRegressions: number;
  matchedRecoveries: number;
  repeatedCases: number;
  duplicateIdentities: number;
  issues: CohortIssue[];
  issueCount: number;
  scores: { measuredPairs: number; unavailablePairs: number; regressions: number; improvements: number; unchanged: number; changes: ScoreChange[]; changeCount: number };
};

/** Structured identity avoids delimiter collisions such as (a:b,c) versus (a,b:c). */
export const caseIdentity = (row: Pick<EvalRow, 'suite' | 'id'>): string => JSON.stringify([row.suite, row.id]);
const indexRows = (rows: EvalRow[]) => {
  const result = new Map<string, EvalRow[]>();
  for (const row of rows) { const key = caseIdentity(row); const group = result.get(key) ?? []; group.push(row); result.set(key, group); }
  return result;
};
const indexManifests = (report: EvalReportV1) => {
  const result = new Map<string, SuiteManifest[]>();
  for (const manifest of report.suiteManifests ?? []) { const group = result.get(manifest.name) ?? []; group.push(manifest); result.set(manifest.name, group); }
  return result;
};
const present = (value: string | undefined): value is string => typeof value === 'string' && value.trim().length > 0;
const scoreDefinition = (manifest?: SuiteManifest): string | undefined => manifest?.scoreScale && manifest.scoreDirection
  ? JSON.stringify([manifest.scoreScale.min, manifest.scoreScale.max, manifest.scoreDirection]) : undefined;

/** Match cases before aggregation. Version identity is separate from descriptive pass/fail flips. */
export const buildMatchedCohort = (current: EvalReportV1, previous?: EvalReportV1): { summary: CohortSummary; pairs: MatchedCase[] } => {
  const summary: CohortSummary = {
    currentRunId: current.run.id, previousRunId: previous?.run.id,
    status: previous ? 'compatible' : 'not-compared', currentRows: current.rows.length, previousRows: previous?.rows.length,
    matchedCases: 0, eligibleCases: 0, introducedCases: 0, introducedFailures: 0, removedCases: 0,
    matchedRegressions: 0, matchedRecoveries: 0, repeatedCases: 0, duplicateIdentities: 0,
    issues: [], issueCount: 0,
    scores: { measuredPairs: 0, unavailablePairs: 0, regressions: 0, improvements: 0, unchanged: 0, changes: [], changeCount: 0 },
  };
  const pairs: MatchedCase[] = [];
  if (!previous) return { summary, pairs };
  // Retain bounded examples, but count every issue/change. No raw input/output is copied into analytics.
  const addIssue = (issue: CohortIssue) => {
    summary.issueCount += 1;
    const rank = { compatible: 0, 'not-compared': 0, unknown: 1, incompatible: 2, ambiguous: 3 };
    summary.issues.push(issue);
    summary.issues.sort((a, b) => {
      const severity = rank[b.status] - rank[a.status];
      if (severity) return severity;
      const left = JSON.stringify([a.suite ?? '', a.id ?? '', a.code]);
      const right = JSON.stringify([b.suite ?? '', b.id ?? '', b.code]);
      return left < right ? -1 : left > right ? 1 : 0;
    });
    if (summary.issues.length > 20) summary.issues.pop();
    if (rank[issue.status] > rank[summary.status]) summary.status = issue.status;
  };
  const currentRows = indexRows(current.rows), previousRows = indexRows(previous.rows);
  const currentManifests = indexManifests(current), previousManifests = indexManifests(previous);
  const globalIssues: CohortIssue[] = [];
  if (!present(current.run.project) || !present(previous.run.project)) globalIssues.push({ code: 'missing-project', status: 'unknown' });
  else if (current.run.project !== previous.run.project) globalIssues.push({ code: 'project-changed', status: 'incompatible' });
  if (current.run.team && previous.run.team && current.run.team !== previous.run.team) globalIssues.push({ code: 'team-changed', status: 'incompatible' });
  globalIssues.forEach(addIssue);

  for (const key of [...new Set([...currentRows.keys(), ...previousRows.keys()])].sort()) {
    const candidates = currentRows.get(key) ?? [], baselines = previousRows.get(key) ?? [];
    const identity = candidates[0] ?? baselines[0];
    if (candidates.length > 1 || baselines.length > 1) {
      summary.duplicateIdentities += 1;
      addIssue({ suite: identity.suite, id: identity.id, code: 'duplicate-case-identity', status: 'ambiguous' });
      continue;
    }
    if (!baselines.length) { summary.introducedCases += 1; if (!rowMatchedExpectation(candidates[0])) summary.introducedFailures += 1; continue; }
    if (!candidates.length) { summary.removedCases += 1; continue; }
    const row = candidates[0], before = baselines[0];
    const issues: CohortIssue[] = [...globalIssues];
    const issue = (code: string, status: CohortIssue['status']) => { const item = { suite: row.suite, id: row.id, code, status }; issues.push(item); addIssue(item); };
    const manifests = currentManifests.get(row.suite) ?? [], oldManifests = previousManifests.get(row.suite) ?? [];
    const manifest = manifests[0], oldManifest = oldManifests[0];
    if (manifests.length > 1 || oldManifests.length > 1) issue('duplicate-suite-manifest', 'ambiguous');
    else if (!manifest || !oldManifest) issue('missing-suite-manifest', 'unknown');
    else {
      for (const field of ['datasetVersion', 'rubricVersion', 'graderVersion'] as const) {
        if (!present(manifest[field]) || !present(oldManifest[field])) issue(`missing-${field}`, 'unknown');
        else if (manifest[field] !== oldManifest[field]) issue(`${field}-changed`, 'incompatible');
      }
      if (manifest.datasetSource !== oldManifest.datasetSource || manifest.target !== oldManifest.target) issue('suite-definition-changed', 'incompatible');
      const graders = (m: SuiteManifest) => JSON.stringify([...new Set(m.graders)].sort());
      if (!manifest.graders.length || !oldManifest.graders.length) issue('missing-graders', 'unknown');
      else if (graders(manifest) !== graders(oldManifest)) issue('graders-changed', 'incompatible');
      if (manifest.graders.includes('llm-judge') || oldManifest.graders.includes('llm-judge') || row.kind === 'llm-judge' || before.kind === 'llm-judge') {
        if (!present(row.judgeModel) || !present(before.judgeModel)) issue('missing-judge-model', 'unknown');
        else if (row.judgeModel !== before.judgeModel) issue('judge-model-changed', 'incompatible');
      }
      const definition = scoreDefinition(manifest), oldDefinition = scoreDefinition(oldManifest);
      if (definition && oldDefinition && definition !== oldDefinition) issue('score-definition-changed', 'incompatible');
    }
    if ((row.expectedOutcome ?? 'pass') !== (before.expectedOutcome ?? 'pass')) issue('expected-outcome-changed', 'incompatible');
    if (row.kind && before.kind && row.kind !== before.kind) issue('row-kind-changed', 'incompatible');
    for (const field of ['input', 'expected'] as const) if (row[field] !== undefined && before[field] !== undefined && row[field] !== before[field]) issue(`case-${field}-changed`, 'incompatible');
    if (Boolean(row.repeated) !== Boolean(before.repeated)) issue('missing-repeat-evidence', 'unknown');
    if (row.repeated && before.repeated && row.repeated.aggregation !== before.repeated.aggregation) issue('repeat-aggregation-changed', 'incompatible');
    const pair: MatchedCase = { current: row, previous: before, eligible: issues.length === 0, issues };
    pairs.push(pair); summary.matchedCases += 1;
    if (row.repeated || before.repeated) summary.repeatedCases += 1;
    if (rowMatchedExpectation(before) && !rowMatchedExpectation(row)) summary.matchedRegressions += 1;
    if (!rowMatchedExpectation(before) && rowMatchedExpectation(row)) summary.matchedRecoveries += 1;
    if (!pair.eligible) { summary.scores.unavailablePairs += 1; continue; }
    summary.eligibleCases += 1;
    const scale = manifest?.scoreScale;
    const scored = scoreDefinition(manifest) && scoreDefinition(manifest) === scoreDefinition(oldManifest) &&
      typeof row.score === 'number' && Number.isFinite(row.score) && typeof before.score === 'number' && Number.isFinite(before.score) &&
      scale && row.score >= scale.min && row.score <= scale.max && before.score >= scale.min && before.score <= scale.max;
    if (!scored) { summary.scores.unavailablePairs += 1; continue; }
    const delta = row.score! - before.score!;
    if (!Number.isFinite(delta)) { summary.scores.unavailablePairs += 1; continue; }
    summary.scores.measuredPairs += 1;
    if (delta === 0) { summary.scores.unchanged += 1; continue; }
    const direction = manifest!.scoreDirection!;
    const change = (direction === 'higher-is-better' ? delta < 0 : delta > 0) ? 'regression' : 'improvement';
    summary.scores[change === 'regression' ? 'regressions' : 'improvements'] += 1;
    summary.scores.changeCount += 1;
    if (summary.scores.changes.length < 20) summary.scores.changes.push({ suite: row.suite, id: row.id, previous: before.score!, current: row.score!, delta, direction, change });
  }
  if (summary.matchedCases === 0) addIssue({ code: 'no-matched-cases', status: 'unknown' });
  summary.currentMatchCoverage = current.rows.length ? summary.matchedCases / current.rows.length : undefined;
  summary.previousMatchCoverage = previous.rows.length ? summary.matchedCases / previous.rows.length : undefined;
  return { summary, pairs };
};

export const analyzeComparisonCohort = (current: EvalReportV1, previous?: EvalReportV1): CohortSummary => buildMatchedCohort(current, previous).summary;
