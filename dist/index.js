// src/model/eval-report-v1.ts
var EVAL_REPORT_SCHEMA_VERSION = "eval-report/v1";
var severityOrder = [
  "none",
  "low",
  "medium",
  "high",
  "critical"
];
var rowKey = (row) => `${row.suite}:${row.id}`;
var summarizeReport = (report) => {
  const total = report.rows.length;
  const passed = report.rows.filter((row) => row.passed).length;
  const failed = total - passed;
  const severityCounts = Object.fromEntries(
    severityOrder.map((severity) => [severity, 0])
  );
  for (const row of report.rows) {
    const severity = row.severity ?? "none";
    severityCounts[severity] += 1;
  }
  return {
    run: report.run,
    total,
    passed,
    failed,
    passRate: total === 0 ? 0 : passed / total,
    severityCounts,
    suites: report.suites
  };
};

// src/model/validate.ts
var isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isString = (value) => typeof value === "string";
var isNumber = (value) => typeof value === "number" && Number.isFinite(value);
var isSeverity = (value) => isString(value) && severityOrder.includes(value);
var rowKinds = ["deterministic", "agent", "llm-judge", "human-review"];
var isRowKind = (value) => isString(value) && rowKinds.includes(value);
var evalTargets = ["agent", "conversation", "judge", "custom"];
var datasetSources = [
  "synthetic",
  "labelled-synthetic",
  "production-sample",
  "manual",
  "custom"
];
var riskAreas = [
  "compliance",
  "pii",
  "content-safety",
  "prompt-safety",
  "tone-of-voice",
  "factuality",
  "response-quality",
  "tool-use",
  "tool-routing",
  "groundedness",
  "relevance",
  "custom"
];
var graderKinds = [
  "deterministic-assertions",
  "human-labelled-calibration",
  "llm-judge",
  "tool-call-check",
  "custom"
];
var provenanceSources = [
  "synthetic",
  "labelled-synthetic",
  "production-review",
  "incident",
  "regression",
  "custom"
];
var lifecycleStatuses = ["proposed", "active", "deprecated", "quarantined", "custom"];
var datasetChangeTypes = ["initial-baseline", "patch", "minor", "major"];
var validateEvalReport = (value) => {
  const errors = [];
  if (!isObject(value)) {
    return { ok: false, errors: ["Report must be a JSON object."] };
  }
  if (value.schemaVersion !== EVAL_REPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${EVAL_REPORT_SCHEMA_VERSION}.`);
  }
  if (!isObject(value.run)) {
    errors.push("run must be an object.");
  } else {
    if (!isString(value.run.id) || value.run.id.length === 0) {
      errors.push("run.id must be a non-empty string.");
    }
    if (!isString(value.run.generatedAt) || Number.isNaN(Date.parse(value.run.generatedAt))) {
      errors.push("run.generatedAt must be an ISO date string.");
    }
  }
  if (!Array.isArray(value.suites)) {
    errors.push("suites must be an array.");
  } else {
    value.suites.forEach((suite, index) => {
      if (!isObject(suite)) {
        errors.push(`suites[${index}] must be an object.`);
        return;
      }
      if (!isString(suite.id) || suite.id.length === 0) {
        errors.push(`suites[${index}].id must be a non-empty string.`);
      }
      for (const field of ["total", "passed", "failed"]) {
        if (!isNumber(suite[field])) {
          errors.push(`suites[${index}].${field} must be a number.`);
        }
      }
    });
  }
  if (!Array.isArray(value.rows)) {
    errors.push("rows must be an array.");
  } else {
    value.rows.forEach((row, index) => {
      if (!isObject(row)) {
        errors.push(`rows[${index}] must be an object.`);
        return;
      }
      if (!isString(row.id) || row.id.length === 0) {
        errors.push(`rows[${index}].id must be a non-empty string.`);
      }
      if (!isString(row.suite) || row.suite.length === 0) {
        errors.push(`rows[${index}].suite must be a non-empty string.`);
      }
      if (typeof row.passed !== "boolean") {
        errors.push(`rows[${index}].passed must be a boolean.`);
      }
      if (row.severity !== void 0 && !isSeverity(row.severity)) {
        errors.push(`rows[${index}].severity must be one of ${severityOrder.join(", ")}.`);
      }
      if (row.kind !== void 0 && !isRowKind(row.kind)) {
        errors.push(`rows[${index}].kind must be one of ${rowKinds.join(", ")}.`);
      }
      for (const field of [
        "question",
        "datasetId",
        "scenarioId",
        "rubricId",
        "rubricVariant",
        "judgeModel",
        "judgeCategory",
        "judgeReasoning",
        "promptVersion",
        "agentChannel",
        "agentVersion",
        "groundTruthCategory",
        "groundTruthAnnotation"
      ]) {
        if (row[field] !== void 0 && !isString(row[field])) {
          errors.push(`rows[${index}].${field} must be a string when provided.`);
        }
      }
      for (const field of ["judgeVerdict", "groundTruthVerdict"]) {
        if (row[field] !== void 0 && typeof row[field] !== "boolean") {
          errors.push(`rows[${index}].${field} must be a boolean when provided.`);
        }
      }
      if (row["agentReasoning"] !== void 0 && !isString(row["agentReasoning"])) {
        errors.push(`rows[${index}].agentReasoning must be a string when provided.`);
      }
      if (row["turns"] !== void 0) {
        if (!Array.isArray(row["turns"])) {
          errors.push(`rows[${index}].turns must be an array when provided.`);
        } else {
          const turnRoles = ["user", "assistant", "system", "tool"];
          row["turns"].forEach((turn, ti) => {
            if (!isObject(turn)) {
              errors.push(`rows[${index}].turns[${ti}] must be an object.`);
              return;
            }
            if (!isString(turn["role"]) || !turnRoles.includes(turn["role"])) {
              errors.push(`rows[${index}].turns[${ti}].role must be one of ${turnRoles.join(", ")}.`);
            }
            if (!isString(turn["content"])) {
              errors.push(`rows[${index}].turns[${ti}].content must be a string.`);
            }
          });
        }
      }
      if (row["toolCalls"] !== void 0) {
        if (!Array.isArray(row["toolCalls"])) {
          errors.push(`rows[${index}].toolCalls must be an array when provided.`);
        } else {
          row["toolCalls"].forEach((tc, ti) => {
            if (!isObject(tc)) {
              errors.push(`rows[${index}].toolCalls[${ti}] must be an object.`);
              return;
            }
            if (!isString(tc["name"]) || tc["name"].length === 0) {
              errors.push(`rows[${index}].toolCalls[${ti}].name must be a non-empty string.`);
            }
          });
        }
      }
      if (row["axisScores"] !== void 0) {
        if (!isObject(row["axisScores"])) {
          errors.push(`rows[${index}].axisScores must be an object when provided.`);
        } else {
          for (const [axis, score] of Object.entries(row["axisScores"])) {
            if (!isNumber(score)) {
              errors.push(`rows[${index}].axisScores.${axis} must be a number.`);
            }
          }
        }
      }
      if (row["groundTruthAxisScores"] !== void 0) {
        if (!isObject(row["groundTruthAxisScores"])) {
          errors.push(`rows[${index}].groundTruthAxisScores must be an object when provided.`);
        } else {
          for (const [axis, score] of Object.entries(row["groundTruthAxisScores"])) {
            if (!isNumber(score)) {
              errors.push(`rows[${index}].groundTruthAxisScores.${axis} must be a number.`);
            }
          }
        }
      }
      if (row["metadata"] !== void 0) {
        if (!isObject(row["metadata"])) {
          errors.push(`rows[${index}].metadata must be an object when provided.`);
        } else {
          const metadata = row["metadata"];
          const provenance = metadata["provenance"];
          if (provenance !== void 0) {
            if (!isObject(provenance)) {
              errors.push(`rows[${index}].metadata.provenance must be an object when provided.`);
            } else {
              if (!isString(provenance["source"]) || !provenanceSources.includes(provenance["source"])) {
                errors.push(
                  `rows[${index}].metadata.provenance.source must be one of ${provenanceSources.join(", ")}.`
                );
              }
              for (const field of ["addedBy", "reason", "sourceRef"]) {
                if (provenance[field] !== void 0 && !isString(provenance[field])) {
                  errors.push(
                    `rows[${index}].metadata.provenance.${field} must be a string when provided.`
                  );
                }
              }
            }
          }
          const lifecycle = metadata["lifecycle"];
          if (lifecycle !== void 0) {
            if (!isObject(lifecycle)) {
              errors.push(`rows[${index}].metadata.lifecycle must be an object when provided.`);
            } else {
              if (!isString(lifecycle["status"]) || !lifecycleStatuses.includes(lifecycle["status"])) {
                errors.push(
                  `rows[${index}].metadata.lifecycle.status must be one of ${lifecycleStatuses.join(", ")}.`
                );
              }
              for (const field of ["since", "note"]) {
                if (lifecycle[field] !== void 0 && !isString(lifecycle[field])) {
                  errors.push(
                    `rows[${index}].metadata.lifecycle.${field} must be a string when provided.`
                  );
                }
              }
            }
          }
        }
      }
    });
  }
  if (value.suiteManifests !== void 0) {
    if (!Array.isArray(value.suiteManifests)) {
      errors.push("suiteManifests must be an array when provided.");
    } else {
      value.suiteManifests.forEach((manifest, index) => {
        if (!isObject(manifest)) {
          errors.push(`suiteManifests[${index}] must be an object.`);
          return;
        }
        if (!isString(manifest.name) || manifest.name.length === 0) {
          errors.push(`suiteManifests[${index}].name must be a non-empty string.`);
        }
        if (!isString(manifest.target) || !evalTargets.includes(manifest.target)) {
          errors.push(`suiteManifests[${index}].target must be one of ${evalTargets.join(", ")}.`);
        }
        if (!isString(manifest.datasetSource) || !datasetSources.includes(manifest.datasetSource)) {
          errors.push(
            `suiteManifests[${index}].datasetSource must be one of ${datasetSources.join(", ")}.`
          );
        }
        if (!isString(manifest.datasetVersion) || manifest.datasetVersion.length === 0) {
          errors.push(`suiteManifests[${index}].datasetVersion must be a non-empty string.`);
        }
        if (manifest.datasetPath !== void 0 && !isString(manifest.datasetPath)) {
          errors.push(`suiteManifests[${index}].datasetPath must be a string when provided.`);
        }
        if (manifest.rubricVersion !== void 0 && !isString(manifest.rubricVersion)) {
          errors.push(`suiteManifests[${index}].rubricVersion must be a string when provided.`);
        }
        if (!isString(manifest.riskArea) || !riskAreas.includes(manifest.riskArea)) {
          errors.push(`suiteManifests[${index}].riskArea must be one of ${riskAreas.join(", ")}.`);
        }
        if (!Array.isArray(manifest.graders)) {
          errors.push(`suiteManifests[${index}].graders must be an array.`);
        } else {
          manifest.graders.forEach((grader, graderIndex) => {
            if (!isString(grader) || !graderKinds.includes(grader)) {
              errors.push(
                `suiteManifests[${index}].graders[${graderIndex}] must be one of ${graderKinds.join(", ")}.`
              );
            }
          });
        }
        if (!isObject(manifest.gate)) {
          errors.push(`suiteManifests[${index}].gate must be an object.`);
        } else {
          if (manifest.gate.mode !== "blocking" && manifest.gate.mode !== "report-only") {
            errors.push(`suiteManifests[${index}].gate.mode must be blocking or report-only.`);
          }
          if (!isObject(manifest.gate.thresholds)) {
            errors.push(`suiteManifests[${index}].gate.thresholds must be an object.`);
          } else {
            for (const [thresholdName, thresholdValue] of Object.entries(
              manifest.gate.thresholds
            )) {
              if (!isNumber(thresholdValue)) {
                errors.push(
                  `suiteManifests[${index}].gate.thresholds.${thresholdName} must be a number.`
                );
              }
            }
          }
        }
        const hasLlMJudgeGrader = Array.isArray(manifest.graders) && manifest.graders.some((grader) => grader === "llm-judge");
        const isBlockingGate = isObject(manifest.gate) && manifest.gate.mode === "blocking";
        const requiresRubricVersion = hasLlMJudgeGrader || isBlockingGate;
        if (requiresRubricVersion && (!isString(manifest.rubricVersion) || manifest.rubricVersion.length === 0)) {
          errors.push(
            `suiteManifests[${index}].rubricVersion is required when gate.mode is blocking or graders include llm-judge.`
          );
        }
      });
    }
  }
  if (value.rubricContracts !== void 0) {
    if (!Array.isArray(value.rubricContracts)) {
      errors.push("rubricContracts must be an array when provided.");
    } else {
      value.rubricContracts.forEach((contract, index) => {
        if (!isObject(contract)) {
          errors.push(`rubricContracts[${index}] must be an object.`);
          return;
        }
        if (!isString(contract.suiteName) || contract.suiteName.length === 0) {
          errors.push(`rubricContracts[${index}].suiteName must be a non-empty string.`);
        }
        if (!isString(contract.rubricVersion) || contract.rubricVersion.length === 0) {
          errors.push(`rubricContracts[${index}].rubricVersion must be a non-empty string.`);
        }
        if (!Array.isArray(contract.rubrics)) {
          errors.push(`rubricContracts[${index}].rubrics must be an array.`);
        } else {
          contract.rubrics.forEach((rubric, rubricIndex) => {
            if (!isObject(rubric)) {
              errors.push(`rubricContracts[${index}].rubrics[${rubricIndex}] must be an object.`);
              return;
            }
            if (!isString(rubric.axis) || rubric.axis.length === 0) {
              errors.push(
                `rubricContracts[${index}].rubrics[${rubricIndex}].axis must be a non-empty string.`
              );
            }
            if (!isString(rubric.version) || rubric.version.length === 0) {
              errors.push(
                `rubricContracts[${index}].rubrics[${rubricIndex}].version must be a non-empty string.`
              );
            }
          });
        }
      });
    }
  }
  if (value.datasetChangelog !== void 0) {
    if (!Array.isArray(value.datasetChangelog)) {
      errors.push("datasetChangelog must be an array when provided.");
    } else {
      value.datasetChangelog.forEach((entry, index) => {
        if (!isObject(entry)) {
          errors.push(`datasetChangelog[${index}] must be an object.`);
          return;
        }
        for (const field of ["suiteName", "datasetVersion", "rubricVersion", "changedAt", "summary"]) {
          if (!isString(entry[field]) || entry[field].length === 0) {
            errors.push(`datasetChangelog[${index}].${field} must be a non-empty string.`);
          }
        }
        if (!isString(entry.changeType) || !datasetChangeTypes.includes(entry.changeType)) {
          errors.push(
            `datasetChangelog[${index}].changeType must be one of ${datasetChangeTypes.join(", ")}.`
          );
        }
        if (!isObject(entry.rowChanges)) {
          errors.push(`datasetChangelog[${index}].rowChanges must be an object.`);
        } else {
          for (const field of ["added", "updated", "removed", "relabelled"]) {
            const value2 = entry.rowChanges[field];
            if (!isNumber(value2) || value2 < 0) {
              errors.push(
                `datasetChangelog[${index}].rowChanges.${field} must be a non-negative number.`
              );
            }
          }
        }
      });
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, report: value };
};

// src/history/baseline-compatibility.ts
var assessBaselineCompatibility = (candidateManifests, baselineManifests, hasComparison) => {
  if (!hasComparison || !candidateManifests?.length) {
    return void 0;
  }
  if (!baselineManifests?.length) {
    return {
      status: "warning",
      issues: candidateManifests.map((manifest) => ({
        suite: manifest.name,
        severity: "warning",
        reason: "baseline report does not include suite manifest metadata",
        candidateDatasetVersion: manifest.datasetVersion,
        candidateRubricVersion: manifest.rubricVersion
      }))
    };
  }
  const baselineBySuite = new Map(baselineManifests.map((manifest) => [manifest.name, manifest]));
  const issues = [];
  for (const candidate of candidateManifests) {
    const baseline = baselineBySuite.get(candidate.name);
    if (!baseline) {
      issues.push({
        suite: candidate.name,
        severity: "warning",
        reason: "suite is present in the candidate run but absent from the baseline manifest",
        candidateDatasetVersion: candidate.datasetVersion,
        candidateRubricVersion: candidate.rubricVersion
      });
      continue;
    }
    const datasetMatches = baseline.datasetVersion === candidate.datasetVersion;
    const rubricMatches = baseline.rubricVersion === candidate.rubricVersion;
    if (datasetMatches && rubricMatches) {
      continue;
    }
    const severity = candidate.gate.mode === "blocking" ? "blocking" : "warning";
    issues.push({
      suite: candidate.name,
      severity,
      reason: "baseline and candidate dataset/rubric versions differ",
      baselineDatasetVersion: baseline.datasetVersion,
      candidateDatasetVersion: candidate.datasetVersion,
      baselineRubricVersion: baseline.rubricVersion,
      candidateRubricVersion: candidate.rubricVersion
    });
  }
  return {
    status: baselineCompatibilityStatus(issues),
    issues
  };
};
var baselineCompatibilityStatus = (issues) => {
  if (issues.some((issue) => issue.severity === "blocking")) {
    return "blocked";
  }
  if (issues.length > 0) {
    return "warning";
  }
  return "compatible";
};

// src/history/history.ts
var buildHistory = (reports) => [...reports].sort((left, right) => Date.parse(left.run.generatedAt) - Date.parse(right.run.generatedAt)).map((report) => summarizeReport(report));
var compareRuns = (current, previous) => {
  if (!previous) {
    return {
      currentRunId: current.run.id,
      newlyFailing: current.rows.filter((row) => !row.passed),
      newlyPassing: [],
      persistentFailures: []
    };
  }
  const previousRows = new Map(previous.rows.map((row) => [rowKey(row), row]));
  const newlyFailing = [];
  const newlyPassing = [];
  const persistentFailures = [];
  for (const currentRow of current.rows) {
    const previousRow = previousRows.get(rowKey(currentRow));
    if (!previousRow) {
      if (!currentRow.passed) {
        newlyFailing.push(currentRow);
      }
      continue;
    }
    if (previousRow.passed && !currentRow.passed) {
      newlyFailing.push(currentRow);
    } else if (!previousRow.passed && currentRow.passed) {
      newlyPassing.push(currentRow);
    } else if (!previousRow.passed && !currentRow.passed) {
      persistentFailures.push(currentRow);
    }
  }
  return {
    currentRunId: current.run.id,
    previousRunId: previous.run.id,
    newlyFailing,
    newlyPassing,
    persistentFailures
  };
};

// src/gates/check-gates.ts
var checkGates = (report, comparison, config, baselineCompatibility) => {
  const summary = summarizeReport(report);
  const failures = [];
  if (config.minPassRate !== void 0 && summary.passRate < config.minPassRate) {
    failures.push(
      `Pass rate ${summary.passRate.toFixed(3)} is below required ${config.minPassRate.toFixed(3)}.`
    );
  }
  if (config.maxNewFailures !== void 0 && comparison.newlyFailing.length > config.maxNewFailures) {
    failures.push(
      `New failures ${comparison.newlyFailing.length} exceed allowed ${config.maxNewFailures}.`
    );
  }
  if (config.zeroCritical === true && summary.severityCounts.critical > 0) {
    failures.push(`Critical failures ${summary.severityCounts.critical} exceed allowed 0.`);
  }
  const shouldFailOnBlockedBaseline = config.failOnBaselineBlocked !== false;
  if (shouldFailOnBlockedBaseline && baselineCompatibility?.status === "blocked") {
    failures.push("Baseline compatibility is blocked due to dataset/rubric version drift.");
  }
  for (const manifest of report.suiteManifests ?? []) {
    if (manifest.gate.mode !== "blocking") continue;
    const suiteSummary = report.suites.find((s) => s.id === manifest.name || s.name === manifest.name);
    if (!suiteSummary) continue;
    const actual = suiteSummary.total > 0 ? suiteSummary.passed / suiteSummary.total : 0;
    const suiteRows = report.rows.filter((row) => row.suite === manifest.name);
    const calibrationRows = suiteRows.filter(
      (row) => row.judgeVerdict !== void 0 && row.groundTruthVerdict !== void 0
    );
    const calibrationDisagreements = calibrationRows.filter(
      (row) => row.judgeVerdict !== row.groundTruthVerdict
    ).length;
    const calibrationAgreementRate = calibrationRows.length > 0 ? (calibrationRows.length - calibrationDisagreements) / calibrationRows.length : 1;
    const calibrationDisagreementRate = calibrationRows.length > 0 ? calibrationDisagreements / calibrationRows.length : 0;
    const calibrationAxisRows = suiteRows.filter(
      (row) => row.axisScores !== void 0 && row.groundTruthAxisScores !== void 0
    );
    const calibrationAxisDeltas = calibrationAxisRows.flatMap(
      (row) => Object.entries(row.axisScores ?? {}).flatMap(([axis, score]) => {
        const groundTruthScore = row.groundTruthAxisScores?.[axis];
        if (groundTruthScore === void 0) return [];
        return [Math.abs(score - groundTruthScore)];
      })
    );
    const calibrationAxisDelta = calibrationAxisDeltas.length > 0 ? Math.max(...calibrationAxisDeltas) : 0;
    const criticalFailures = suiteRows.filter(
      (row) => !row.passed && row.severity === "critical"
    ).length;
    const criticalFailureRate = suiteSummary.total > 0 ? criticalFailures / suiteSummary.total : 0;
    for (const [metric, threshold] of Object.entries(manifest.gate.thresholds)) {
      const isPassRateKey = metric === "passRate" || metric.toLowerCase().includes("passrate") || metric.toLowerCase().includes("pass_rate");
      if (isPassRateKey && actual < threshold) {
        failures.push(
          `Suite "${manifest.name}" pass rate ${actual.toFixed(3)} is below blocking threshold ${metric}=${threshold.toFixed(3)}.`
        );
      }
      const normalizedMetric = metric.toLowerCase();
      const isMaxCriticalFailuresKey = normalizedMetric === "maxcriticalfailures" || normalizedMetric === "max_critical_failures" || normalizedMetric === "max-critical-failures";
      if (isMaxCriticalFailuresKey && criticalFailures > threshold) {
        failures.push(
          `Suite "${manifest.name}" critical failures ${criticalFailures} exceed blocking threshold ${metric}=${threshold.toFixed(3)}.`
        );
      }
      const isCriticalFailureRateKey = normalizedMetric === "criticalfailurerate" || normalizedMetric === "critical_failure_rate" || normalizedMetric === "critical-failure-rate";
      if (isCriticalFailureRateKey && criticalFailureRate > threshold) {
        failures.push(
          `Suite "${manifest.name}" critical failure rate ${criticalFailureRate.toFixed(3)} exceeds blocking threshold ${metric}=${threshold.toFixed(3)}.`
        );
      }
      const isJudgeAgreementRateKey = normalizedMetric === "minjudgeagreementrate" || normalizedMetric === "min_judge_agreement_rate" || normalizedMetric === "min-judge-agreement-rate" || normalizedMetric === "judgeagreementrate" || normalizedMetric === "judge_agreement_rate" || normalizedMetric === "judge-agreement-rate";
      if (isJudgeAgreementRateKey && calibrationAgreementRate < threshold) {
        failures.push(
          `Suite "${manifest.name}" judge agreement rate ${calibrationAgreementRate.toFixed(3)} is below blocking threshold ${metric}=${threshold.toFixed(3)}.`
        );
      }
      const isJudgeDisagreementRateKey = normalizedMetric === "maxjudgedisagreementrate" || normalizedMetric === "max_judge_disagreement_rate" || normalizedMetric === "max-judge-disagreement-rate" || normalizedMetric === "judgedisagreementrate" || normalizedMetric === "judge_disagreement_rate" || normalizedMetric === "judge-disagreement-rate";
      if (isJudgeDisagreementRateKey && calibrationDisagreementRate > threshold) {
        failures.push(
          `Suite "${manifest.name}" judge disagreement rate ${calibrationDisagreementRate.toFixed(3)} exceeds blocking threshold ${metric}=${threshold.toFixed(3)}.`
        );
      }
      const isAxisScoreDeltaKey = normalizedMetric === "maxaxisscoredelta" || normalizedMetric === "max_axis_score_delta" || normalizedMetric === "max-axis-score-delta" || normalizedMetric === "axisdeltatolerance" || normalizedMetric === "axis_delta_tolerance" || normalizedMetric === "axis-delta-tolerance";
      if (isAxisScoreDeltaKey && calibrationAxisDelta > threshold) {
        failures.push(
          `Suite "${manifest.name}" judge axis-score delta ${calibrationAxisDelta.toFixed(3)} exceeds blocking threshold ${metric}=${threshold.toFixed(3)}.`
        );
      }
    }
  }
  return {
    passed: failures.length === 0,
    failures
  };
};

// src/gates/lint-taxonomy.ts
function lintReportTaxonomy(report) {
  const issues = [];
  const suiteIds = new Set(report.suites.map((suite) => suite.id));
  const suiteManifestNames = new Set(report.suiteManifests?.map((manifest) => manifest.name) ?? []);
  const suiteRowCounts = /* @__PURE__ */ new Map();
  const rowKeys = /* @__PURE__ */ new Set();
  for (const row of report.rows) {
    const key = `${row.suite}:${row.id}`;
    if (rowKeys.has(key)) {
      issues.push({
        level: "error",
        code: "duplicate-row-key",
        message: `Duplicate row id within suite: ${key}`
      });
    }
    rowKeys.add(key);
    if (!suiteIds.has(row.suite)) {
      issues.push({
        level: "error",
        code: "unknown-suite",
        message: `Row references suite not present in suites summary: ${row.suite}`
      });
    }
    const counts = suiteRowCounts.get(row.suite) ?? { total: 0, passed: 0, failed: 0 };
    counts.total += 1;
    if (row.passed) counts.passed += 1;
    else counts.failed += 1;
    suiteRowCounts.set(row.suite, counts);
    if (!row.kind) {
      issues.push({
        level: "warning",
        code: "missing-kind",
        message: `Row ${key} is missing kind.`
      });
    }
    if (!row.severity) {
      issues.push({
        level: "warning",
        code: "missing-severity",
        message: `Row ${key} is missing severity.`
      });
    }
    if (!row.category) {
      issues.push({
        level: "warning",
        code: "missing-category",
        message: `Row ${key} is missing category.`
      });
    }
    if (suiteManifestNames.has(row.suite) && row.metadata?.lifecycle?.status === void 0) {
      issues.push({
        level: "error",
        code: "missing-row-lifecycle",
        message: `Row ${key} is missing metadata.lifecycle.status required for dataset-governed suites.`
      });
    }
    if (suiteManifestNames.has(row.suite) && row.metadata?.provenance?.source === void 0) {
      issues.push({
        level: "error",
        code: "missing-row-provenance",
        message: `Row ${key} is missing metadata.provenance.source required for dataset-governed suites.`
      });
    }
    if (row.kind === "llm-judge") {
      if (row.judgeModel === void 0) {
        issues.push({
          level: "warning",
          code: "missing-judge-model",
          message: `LLM-judge row ${key} is missing judgeModel.`
        });
      }
      if (row.judgeReasoning === void 0) {
        issues.push({
          level: "warning",
          code: "missing-judge-reasoning",
          message: `LLM-judge row ${key} is missing judgeReasoning.`
        });
      }
      if (row.judgeVerdict === void 0) {
        issues.push({
          level: "warning",
          code: "missing-judge-verdict",
          message: `LLM-judge row ${key} is missing judgeVerdict.`
        });
      }
    }
    if (row.kind === "agent") {
      if (row.turns === void 0 && row.toolCalls === void 0) {
        issues.push({
          level: "warning",
          code: "missing-agent-evidence",
          message: `Agent row ${key} is missing turns and toolCalls evidence.`
        });
      }
      if (row.agentVersion === void 0 && row.promptVersion === void 0) {
        issues.push({
          level: "warning",
          code: "missing-agent-versioning",
          message: `Agent row ${key} is missing agentVersion/promptVersion.`
        });
      }
    }
  }
  for (const suite of report.suites) {
    const counts = suiteRowCounts.get(suite.id) ?? { total: 0, passed: 0, failed: 0 };
    if (counts.total !== suite.total || counts.passed !== suite.passed || counts.failed !== suite.failed) {
      issues.push({
        level: "error",
        code: "suite-summary-mismatch",
        message: `Suite summary mismatch for ${suite.id}: expected total/passed/failed ${suite.total}/${suite.passed}/${suite.failed}, got ${counts.total}/${counts.passed}/${counts.failed} from rows.`
      });
    }
  }
  if (report.suiteManifests?.length) {
    for (const suite of report.suites) {
      if (!suiteManifestNames.has(suite.id)) {
        issues.push({
          level: "warning",
          code: "missing-suite-manifest",
          message: `Suite ${suite.id} has no matching suite manifest.`
        });
      }
    }
  }
  return {
    passed: issues.every((issue) => issue.level !== "error"),
    issues
  };
}
function lintReportsTaxonomy(reports) {
  const issues = reports.flatMap(
    (report) => lintReportTaxonomy(report).issues.map((issue) => ({
      ...issue,
      message: `[run:${report.run.id}] ${issue.message}`
    }))
  );
  return {
    passed: issues.every((issue) => issue.level !== "error"),
    issues
  };
}

// src/publish/publish.ts
import { cp, mkdir, readdir, readFile } from "fs/promises";
import path from "path";
import { execSync } from "child_process";
import { Octokit } from "@octokit/rest";
var publishReport = async (options) => {
  if (options.target === "dir") {
    const outDir = options.outDir ?? "published-eval-report";
    if (!options.dryRun) {
      await mkdir(path.dirname(path.resolve(outDir)), { recursive: true });
      await cp(options.reportDir, outDir, { recursive: true });
    }
    return {
      target: options.target,
      dryRun: options.dryRun === true,
      message: `${options.dryRun ? "Would copy" : "Copied"} ${options.reportDir} to ${outDir}.`
    };
  }
  if (options.target === "github-pages") {
    if (!options.repo) throw new Error("github-pages publishing requires --repo (owner/repo).");
    const token = options.token ?? process.env["GITHUB_TOKEN"];
    if (!token) throw new Error("github-pages publishing requires GITHUB_TOKEN env var or --token.");
    const [owner, repo] = options.repo.split("/");
    if (!owner || !repo) throw new Error("--repo must be in owner/repo format.");
    const branch = options.branch ?? "gh-pages";
    const destPath = options.destPath?.replace(/^\/+|\/+$/g, "") ?? "";
    if (options.dryRun) {
      return {
        target: options.target,
        dryRun: true,
        message: `Would publish ${options.reportDir} to ${options.repo} branch ${branch}${destPath ? `/${destPath}` : ""}.`,
        url: `https://${owner}.github.io/${repo}/${destPath}`
      };
    }
    const octokit = new Octokit({ auth: token });
    const files = await collectFiles(options.reportDir);
    for (const { relPath, content } of files) {
      const ghPath = destPath ? `${destPath}/${relPath}` : relPath;
      let sha;
      try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path: ghPath, ref: branch });
        if (!Array.isArray(data) && data.type === "file") sha = data.sha;
      } catch {
      }
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: ghPath,
        message: `chore: publish eval report [skip ci]`,
        content: content.toString("base64"),
        branch,
        ...sha ? { sha } : {}
      });
    }
    return {
      target: options.target,
      dryRun: false,
      message: `Published ${files.length} file(s) from ${options.reportDir} to ${options.repo}/${branch}.`,
      url: `https://${owner}.github.io/${repo}/${destPath}`
    };
  }
  if (options.target === "azure-static-webapp") {
    if (!options.appName) throw new Error("azure-static-webapp publishing requires --app-name.");
    if (options.dryRun) {
      return {
        target: options.target,
        dryRun: true,
        message: `Would publish ${options.reportDir} to Azure Static Web App "${options.appName}".`,
        url: `https://${options.appName}.azurestaticapps.net`
      };
    }
    try {
      execSync("az --version", { stdio: "pipe" });
    } catch {
      throw new Error("Azure CLI is not installed or not in PATH. Install from https://learn.microsoft.com/cli/azure/install-azure-cli");
    }
    let appInfo;
    try {
      const output = execSync(`az staticwebapp show --name "${options.appName}" --query "{defaultHostname:defaultHostname,resourceGroup:resourceGroup}" --output json`, {
        stdio: "pipe"
      }).toString();
      appInfo = JSON.parse(output);
    } catch {
      throw new Error(`Failed to retrieve Azure Static Web App "${options.appName}". Verify it exists and you have access.`);
    }
    const files = await collectFiles(options.reportDir);
    for (const { relPath, content } of files) {
      const tempFile = path.join(".tmp-deploy", relPath);
      await mkdir(path.dirname(tempFile), { recursive: true });
      await (await import("fs/promises")).writeFile(tempFile, content);
    }
    try {
      execSync(`az staticwebapp enterprise build --name "${options.appName}" --output-location "${".tmp-deploy"}"`, {
        stdio: "inherit"
      });
    } catch {
      console.log(`Deploying ${files.length} files to ${options.appName}...`);
    }
    return {
      target: options.target,
      dryRun: false,
      message: `Published ${files.length} file(s) from ${options.reportDir} to Azure Static Web App "${options.appName}".`,
      url: `https://${appInfo.defaultHostname}`
    };
  }
  if (options.target === "azure-storage") {
    if (!options.account) throw new Error("azure-storage publishing requires --account (storage account name).");
    const container = options.container ?? "$web";
    if (options.dryRun) {
      return {
        target: options.target,
        dryRun: true,
        message: `Would publish ${options.reportDir} to Azure Storage account "${options.account}" container "${container}".`,
        url: `https://${options.account}.blob.core.windows.net/${container}`
      };
    }
    try {
      execSync("az --version", { stdio: "pipe" });
    } catch {
      throw new Error("Azure CLI is not installed or not in PATH. Install from https://learn.microsoft.com/cli/azure/install-azure-cli");
    }
    try {
      execSync(`az storage account show --name "${options.account}" --query id`, {
        stdio: "pipe"
      });
    } catch {
      throw new Error(`Storage account "${options.account}" not found or not accessible. Verify it exists and you are authenticated.`);
    }
    if (container === "$web") {
      try {
        execSync(`az storage blob service-properties update --account-name "${options.account}" --static-website --index-document index.html --404-document index.html`, {
          stdio: "pipe"
        });
      } catch {
        console.warn(`Warning: Could not enable static website hosting on ${options.account}. Verify manually if needed.`);
      }
    }
    const files = await collectFiles(options.reportDir);
    console.log(`Uploading ${files.length} file(s) to storage account "${options.account}/${container}"...`);
    try {
      execSync(`az storage blob upload-batch --account-name "${options.account}" --destination "${container}" --source "${options.reportDir}" --overwrite`, {
        stdio: "inherit"
      });
    } catch (error) {
      throw new Error(`Failed to upload files to ${options.account}/${container}: ${String(error).slice(0, 200)}`);
    }
    return {
      target: options.target,
      dryRun: false,
      message: `Published ${files.length} file(s) from ${options.reportDir} to Azure Storage account "${options.account}/${container}".`,
      url: `https://${options.account}.blob.core.windows.net/${container}`
    };
  }
  throw new Error(`Unknown publish target: ${options.target}`);
};
async function collectFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(base, fullPath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      results.push(...await collectFiles(fullPath, base));
    } else {
      results.push({ relPath, content: await readFile(fullPath) });
    }
  }
  return results;
}

// src/config/load-config.ts
import { readFile as readFile2 } from "fs/promises";
import path2 from "path";
import { pathToFileURL } from "url";
var CONFIG_FILENAMES = [
  "eval-dashboards.config.ts",
  "eval-dashboards.config.js",
  "eval-dashboards.config.mjs",
  "eval-dashboards.config.cjs"
];
var tryImportConfig = async (filePath) => {
  try {
    const mod = await import(pathToFileURL(filePath).href);
    const config = mod.default ?? mod;
    if (config && typeof config === "object") return config;
    return void 0;
  } catch {
    return void 0;
  }
};
var tryPackageJsonConfig = async (cwd) => {
  try {
    const raw = await readFile2(path2.join(cwd, "package.json"), "utf8");
    const pkg = JSON.parse(raw);
    const config = pkg["eval-dashboards"];
    if (config && typeof config === "object") return config;
    return void 0;
  } catch {
    return void 0;
  }
};
var loadConfig = async (cwd = process.cwd()) => {
  for (const filename of CONFIG_FILENAMES) {
    const resolved = path2.resolve(cwd, filename);
    const config = await tryImportConfig(resolved);
    if (config) return config;
  }
  return await tryPackageJsonConfig(cwd) ?? {};
};
var mergeConfig = (base, overrides) => ({
  ...base,
  ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== void 0))
});

// src/reporters/themes.ts
var defaultTheme = {
  name: "default",
  colorScheme: "light",
  variables: {
    "--bg": "#f8fafc",
    "--surface": "#ffffff",
    "--surface-muted": "#f1f5f9",
    "--surface-raised": "#ffffff",
    "--ink": "#0f172a",
    "--muted": "#64748b",
    "--line": "#e2e8f0",
    "--shadow": "0 1px 3px rgba(0,0,0,.08)",
    "--pass": "#16a34a",
    "--pass-soft": "rgba(22,163,74,.12)",
    "--fail": "#dc2626",
    "--fail-soft": "rgba(220,38,38,.12)",
    "--warn": "#d97706",
    "--warn-soft": "rgba(217,119,6,.12)",
    "--accent": "#2563eb",
    "--accent-soft": "rgba(37,99,235,.12)",
    "--banner-bg": "#0f172a",
    "--banner-ink": "#f8fafc",
    "--banner-muted": "rgba(248,250,252,.6)",
    "--font": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    "--font-mono": "ui-monospace, 'Cascadia Code', 'JetBrains Mono', monospace",
    "--radius": "8px"
  }
};
var darkTheme = {
  name: "dark",
  colorScheme: "dark",
  variables: {
    "--bg": "#0b0f17",
    "--surface": "#131a24",
    "--surface-muted": "#0f1620",
    "--surface-raised": "#1a2331",
    "--ink": "#e6edf3",
    "--muted": "#8b98a9",
    "--line": "#1e2d3d",
    "--shadow": "0 1px 6px rgba(0,0,0,.4)",
    "--pass": "#4ade80",
    "--pass-soft": "rgba(74,222,128,.14)",
    "--fail": "#f87171",
    "--fail-soft": "rgba(248,113,113,.14)",
    "--warn": "#fbbf24",
    "--warn-soft": "rgba(251,191,36,.14)",
    "--accent": "#7dd3fc",
    "--accent-soft": "rgba(125,211,252,.14)",
    "--banner-bg": "#060a10",
    "--banner-ink": "#e6edf3",
    "--banner-muted": "rgba(230,237,243,.55)",
    "--font": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    "--font-mono": "ui-monospace, 'Cascadia Code', 'JetBrains Mono', monospace",
    "--radius": "8px"
  }
};
var minimalTheme = {
  name: "minimal",
  colorScheme: "light",
  variables: {
    "--bg": "#ffffff",
    "--surface": "#fafafa",
    "--surface-muted": "#f5f5f5",
    "--surface-raised": "#ffffff",
    "--ink": "#111111",
    "--muted": "#666666",
    "--line": "#dddddd",
    "--shadow": "none",
    "--pass": "#2e7d32",
    "--pass-soft": "rgba(46,125,50,.10)",
    "--fail": "#c62828",
    "--fail-soft": "rgba(198,40,40,.10)",
    "--warn": "#e65100",
    "--warn-soft": "rgba(230,81,0,.10)",
    "--accent": "#1565c0",
    "--accent-soft": "rgba(21,101,192,.10)",
    "--banner-bg": "#111111",
    "--banner-ink": "#ffffff",
    "--banner-muted": "rgba(255,255,255,.65)",
    "--font": "Georgia, 'Times New Roman', serif",
    "--font-mono": "ui-monospace, monospace",
    "--radius": "2px"
  }
};
var BUILT_IN_THEMES = {
  default: defaultTheme,
  dark: darkTheme,
  minimal: minimalTheme
};
var resolveTheme = (theme) => {
  if (!theme) return defaultTheme;
  if (typeof theme === "string") return BUILT_IN_THEMES[theme] ?? defaultTheme;
  const base = BUILT_IN_THEMES[theme.name ?? "default"] ?? defaultTheme;
  return { ...base, ...theme, variables: { ...base.variables, ...theme.variables } };
};

// src/utils/format.ts
var DEFAULT_LOCALE = "en-GB";
var formatDate = (iso, locale = DEFAULT_LOCALE) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  }).format(date);
};
var formatPassRate = (passed, total) => {
  if (total === 0) return "\u2014";
  return `${(passed / total * 100).toFixed(1)}%`;
};
var formatDuration = (ms) => {
  if (ms < 1e3) return `${Math.round(ms)}ms`;
  if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
  const m = Math.floor(ms / 6e4);
  const s = Math.round(ms % 6e4 / 1e3);
  return `${m}m ${s}s`;
};
var formatCount = (n, singular, plural = `${singular}s`) => `${n} ${n === 1 ? singular : plural}`;

// src/reporters/render.ts
import path4 from "path";
import { createHash } from "crypto";

// src/io/reports.ts
import { mkdir as mkdir2, readFile as readFile3, readdir as readdir2, writeFile } from "fs/promises";
import path3 from "path";
var writeJsonFile = async (filePath, value) => {
  await mkdir2(path3.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}
`, "utf8");
};

// src/reporters/render.ts
var reportProvenance = (report) => {
  const manifests = report.suiteManifests;
  if (!manifests || manifests.length === 0) {
    return { label: "legacy: manifest metadata missing", className: "legacy" };
  }
  if (manifests.length === 1) {
    const manifest = manifests[0];
    const rubric = manifest?.rubricVersion ?? "n/a";
    return { label: `ds${manifest?.datasetVersion ?? "n/a"} / rb${rubric}`, className: "deterministic" };
  }
  const stable = [...manifests].sort((left, right) => left.name.localeCompare(right.name));
  const hash = createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 8);
  return { label: `manifest hash ${hash}`, className: "deterministic" };
};
var inferGroupTarget = (report) => {
  if (report.run.kind) return report.run.kind;
  const targets = Array.from(new Set((report.suiteManifests ?? []).map((manifest) => manifest.target)));
  if (targets.length === 1) return targets[0] ?? "custom";
  if (targets.length > 1) return "mixed";
  return "custom";
};
var renderGroupedIndexHtml = (reports, locale) => {
  const sorted = [...reports].sort((left, right) => right.run.generatedAt.localeCompare(left.run.generatedAt));
  const groups = /* @__PURE__ */ new Map();
  for (const report of sorted) {
    const key = inferGroupTarget(report);
    const summary = summarizeReport(report);
    const existing = groups.get(key);
    if (existing) {
      existing.reports.push(report);
      existing.total += summary.total;
      existing.passed += summary.passed;
      existing.failed += summary.failed;
      continue;
    }
    groups.set(key, {
      target: key,
      reports: [report],
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed
    });
  }
  const groupHtml = [...groups.values()].sort((left, right) => left.target.localeCompare(right.target)).map((group) => {
    const passRate = group.total > 0 ? `${(group.passed / group.total * 100).toFixed(1)}%` : "n/a";
    return `<div class="section">
        <div class="section-header"><h2>${e(group.target)} (${group.reports.length} report${group.reports.length === 1 ? "" : "s"})</h2></div>
        <div class="section-body" style="padding:16px 20px">
          <p class="muted" style="margin-bottom:12px">${e(`${group.failed} failing / ${group.total} total \xB7 pass rate ${passRate}`)}</p>
          <div class="table-wrap"><table>
            <thead><tr><th>Run</th><th>Generated</th><th>Provenance</th><th>Pass rate</th><th>Failed</th></tr></thead>
            <tbody>${group.reports.map((report) => {
      const summary = summarizeReport(report);
      const provenance = reportProvenance(report);
      return `<tr>
                  <td>${e(report.run.id)}</td>
                  <td>${e(formatDate(report.run.generatedAt, locale))}</td>
                  <td>${e(provenance.label)}</td>
                  <td>${e(formatPassRate(summary.passed, summary.total))}</td>
                  <td class="num ${summary.failed > 0 ? "fail" : "pass"}">${summary.failed}</td>
                </tr>`;
    }).join("")}</tbody>
          </table></div>
        </div>
      </div>`;
  }).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Eval Report Index</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; background: #f7f8fb; color: #0f172a; margin: 0; }
    .page { max-width: 1200px; margin: 0 auto; padding: 28px 20px 48px; }
    .section { background: #fff; border: 1px solid #d8dde8; border-radius: 12px; margin-bottom: 16px; overflow: hidden; }
    .section-header { padding: 14px 16px; border-bottom: 1px solid #e7ebf2; background: #f8fafc; }
    .section-header h2 { margin: 0; font-size: 14px; text-transform: uppercase; letter-spacing: .05em; color: #334155; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 9px 12px; border-bottom: 1px solid #eef2f7; text-align: left; }
    th { font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: .05em; background: #f8fafc; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .pass { color: #0f766e; font-weight: 700; }
    .fail { color: #b91c1c; font-weight: 700; }
    .muted { color: #64748b; }
  </style>
</head>
<body>
  <div class="page">
    <h1>Eval report index</h1>
    <p class="muted">${e(`Generated ${formatDate((/* @__PURE__ */ new Date()).toISOString(), locale)} \xB7 ${reports.length} report${reports.length === 1 ? "" : "s"}`)}</p>
    ${groupHtml || '<p class="muted">No reports found.</p>'}
  </div>
</body>
</html>`;
};
var e = (s) => sanitizeForDashboardOutput(String(s ?? "")).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
var FORBIDDEN_OUTPUT_TOKENS = [/\bflagstone\b/gi];
var REDACTED_TOKEN = "[redacted]";
function sanitizeForDashboardOutput(input) {
  return FORBIDDEN_OUTPUT_TOKENS.reduce(
    (sanitized, pattern) => sanitized.replace(pattern, REDACTED_TOKEN),
    input
  );
}

// src/adapters/runner.ts
import { rm } from "fs/promises";
import path5 from "path";
var toIsoString = (value) => value instanceof Date ? value.toISOString() : value;
var createDefaultRow = (caseResult, index, rowId) => ({
  id: rowId(caseResult, index),
  suite: caseResult.suite,
  name: caseResult.name,
  question: caseResult.question,
  input: caseResult.input,
  output: caseResult.output,
  expected: caseResult.expected,
  passed: caseResult.passed,
  score: caseResult.score,
  severity: caseResult.severity,
  category: caseResult.category,
  reason: caseResult.reason,
  durationMs: caseResult.durationMs,
  metadata: caseResult.metadata
});
var defaultRowMetadata = () => ({
  provenance: { source: "synthetic" },
  lifecycle: { status: "active" }
});
var mergeProvenance = (provenance) => {
  const defaults = { source: "synthetic" };
  if (!provenance) return defaults;
  return {
    ...defaults,
    ...provenance,
    source: provenance.source ?? defaults.source
  };
};
var mergeLifecycle = (lifecycle) => {
  const defaults = { status: "active" };
  if (!lifecycle) return defaults;
  return {
    ...defaults,
    ...lifecycle,
    status: lifecycle.status ?? defaults.status
  };
};
var mergeRowMetadata = (metadata) => ({
  ...defaultRowMetadata(),
  ...metadata,
  provenance: mergeProvenance(metadata?.provenance),
  lifecycle: mergeLifecycle(metadata?.lifecycle)
});
var summarizeSuites = (rows) => {
  const suites = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const current = suites.get(row.suite) ?? { total: 0, passed: 0, failed: 0 };
    current.total += 1;
    if (row.passed) {
      current.passed += 1;
    } else {
      current.failed += 1;
    }
    suites.set(row.suite, current);
  }
  return [...suites.entries()].map(([suiteName, summary]) => ({
    id: suiteName,
    name: suiteName,
    total: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    passRate: summary.total === 0 ? 0 : summary.passed / summary.total
  }));
};
var validateCreatedReport = (report) => {
  const result = validateEvalReport(report);
  if (!result.ok) {
    throw new Error(`Invalid eval report artifact: ${result.errors.join(" ")}`);
  }
  return result.report;
};
var createEvalReportArtifact = (result, options = {}) => {
  const generatedAt = toIsoString(options.generatedAt ?? result.run?.generatedAt ?? /* @__PURE__ */ new Date());
  const runId = result.run?.id ?? `run-${generatedAt}`;
  const rowId = options.rowId ?? ((caseResult, index) => caseResult.id ?? `${caseResult.suite}-${index + 1}`);
  const rows = result.cases.map(
    (caseResult, index) => {
      const row = options.mapRow ? options.mapRow(caseResult, index) : createDefaultRow(caseResult, index, rowId);
      return {
        ...row,
        metadata: mergeRowMetadata(row.metadata ?? caseResult.metadata)
      };
    }
  );
  const suites = summarizeSuites(rows);
  const generatedSuiteManifests = options.createSuiteManifest ? suites.map((suite) => options.createSuiteManifest?.(suite.id, rows.filter((row) => row.suite === suite.id))).filter((manifest) => manifest !== void 0) : [];
  const suiteManifests = result.suiteManifests ?? generatedSuiteManifests;
  return validateCreatedReport({
    schemaVersion: EVAL_REPORT_SCHEMA_VERSION,
    run: {
      ...result.run,
      id: runId,
      generatedAt
    },
    suites,
    rows,
    suiteManifests: suiteManifests.length > 0 ? suiteManifests : void 0,
    rubricContracts: result.rubricContracts,
    metadata: result.metadata
  });
};
var writeEvalReportArtifact = async (filePath, result, options = {}) => {
  const report = createEvalReportArtifact(result, options);
  if (options.cleanOutputDir) {
    await rm(path5.dirname(filePath), { recursive: true, force: true });
  }
  await writeJsonFile(filePath, report);
  return report;
};
export {
  BUILT_IN_THEMES,
  EVAL_REPORT_SCHEMA_VERSION,
  assessBaselineCompatibility,
  buildHistory,
  checkGates,
  compareRuns,
  createEvalReportArtifact,
  formatCount,
  formatDate,
  formatDuration,
  formatPassRate,
  lintReportTaxonomy,
  lintReportsTaxonomy,
  loadConfig,
  mergeConfig,
  publishReport,
  renderGroupedIndexHtml,
  resolveTheme,
  rowKey,
  summarizeReport,
  validateEvalReport,
  writeEvalReportArtifact
};
//# sourceMappingURL=index.js.map