import {
  DATASET_CHANGE_TYPES,
  DATASET_SOURCES,
  EVAL_REPORT_SCHEMA_VERSION,
  EVAL_ROW_KINDS,
  EVAL_TARGETS,
  GATE_MODES,
  GRADER_KINDS,
  RISK_AREAS,
  ROW_LIFECYCLE_STATUSES,
  ROW_PROVENANCE_SOURCES,
  type DatasetSource,
  type EvalRowKind,
  type EvalTarget,
  type GraderKind,
  type RiskArea,
  type EvalReportV1,
  type EvalSeverity,
  severityOrder,
} from './eval-report-v1.js';

export type ValidationResult =
  | { ok: true; report: EvalReportV1 }
  | { ok: false; errors: string[]; issues: ValidationIssue[] };

export type ValidationIssue = {
  code: 'VALIDATION_ERROR';
  path: string;
  message: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isRunConfigSnapshotValue = (value: unknown): boolean =>
  value === null || isString(value) || isNumber(value) || typeof value === 'boolean';

const isSeverity = (value: unknown): value is EvalSeverity =>
  isString(value) && severityOrder.includes(value as EvalSeverity);

const parseValidationPath = (message: string): string => {
  if (message.startsWith('Report must be')) return '$';
  const markers = [' must', ' is required', ' is '];
  const marker = markers
    .map((token) => message.indexOf(token))
    .filter((index) => index > 0)
    .sort((a, b) => a - b)[0] ?? -1;
  if (marker <= 0) return '$';
  const candidate = message.slice(0, marker).trim();
  return candidate.length > 0 ? candidate : '$';
};

export const toValidationIssues = (errors: string[]): ValidationIssue[] =>
  errors.map((message) => ({
    code: 'VALIDATION_ERROR',
    path: parseValidationPath(message),
    message,
  }));

const rowKinds = [...EVAL_ROW_KINDS];

const isRowKind = (value: unknown): value is EvalRowKind =>
  isString(value) && rowKinds.includes(value as EvalRowKind);

const evalTargets = [...EVAL_TARGETS];
const datasetSources = [...DATASET_SOURCES];
const riskAreas = [...RISK_AREAS];
const graderKinds = [...GRADER_KINDS];

const provenanceSources = [...ROW_PROVENANCE_SOURCES] as string[];

const lifecycleStatuses = [...ROW_LIFECYCLE_STATUSES] as string[];
const datasetChangeTypes = [...DATASET_CHANGE_TYPES] as string[];

/**
 * Validate an unknown value against the `eval-report/v1` schema/shape,
 * returning a structured result with `valid: boolean` plus a list of
 * human-readable error messages. Does not throw; use this to check
 * artifacts before further processing (reporting, gating, publishing).
 */
export const validateEvalReport = (value: unknown): ValidationResult => {
  const errors: string[] = [];

  if (!isObject(value)) {
    const topLevelErrors = ['Report must be a JSON object.'];
    return { ok: false, errors: topLevelErrors, issues: toValidationIssues(topLevelErrors) };
  }

  if (value.schemaVersion !== EVAL_REPORT_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${EVAL_REPORT_SCHEMA_VERSION}.`);
  }

  if (!isObject(value.run)) {
    errors.push('run must be an object.');
  } else {
    if (!isString(value.run.id) || value.run.id.length === 0) {
      errors.push('run.id must be a non-empty string.');
    }

    if (!isString(value.run.generatedAt) || Number.isNaN(Date.parse(value.run.generatedAt))) {
      errors.push('run.generatedAt must be an ISO date string.');
    }

    if (value.run.configSnapshot !== undefined) {
      if (!isObject(value.run.configSnapshot)) {
        errors.push('run.configSnapshot must be an object when provided.');
      } else {
        const snapshot = value.run.configSnapshot as Record<string, unknown>;

        if (snapshot.redacted !== undefined && typeof snapshot.redacted !== 'boolean') {
          errors.push('run.configSnapshot.redacted must be a boolean when provided.');
        }

        if (snapshot.source !== undefined && !isString(snapshot.source)) {
          errors.push('run.configSnapshot.source must be a string when provided.');
        }

        if (!isObject(snapshot.values)) {
          errors.push('run.configSnapshot.values must be an object.');
        } else {
          for (const [key, val] of Object.entries(snapshot.values as Record<string, unknown>)) {
            if (!isRunConfigSnapshotValue(val)) {
              errors.push(
                `run.configSnapshot.values.${key} must be a string, number, boolean, or null.`,
              );
            }
          }
        }
      }
    }
  }

  if (!Array.isArray(value.suites)) {
    errors.push('suites must be an array.');
  } else {
    value.suites.forEach((suite, index) => {
      if (!isObject(suite)) {
        errors.push(`suites[${index}] must be an object.`);
        return;
      }

      if (!isString(suite.id) || suite.id.length === 0) {
        errors.push(`suites[${index}].id must be a non-empty string.`);
      }

      for (const field of ['total', 'passed', 'failed']) {
        if (!isNumber(suite[field])) {
          errors.push(`suites[${index}].${field} must be a number.`);
        }
      }
    });
  }

  if (!Array.isArray(value.rows)) {
    errors.push('rows must be an array.');
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

      if (typeof row.passed !== 'boolean') {
        errors.push(`rows[${index}].passed must be a boolean.`);
      }

      if (row.score !== undefined && row.score !== null && !isNumber(row.score)) {
        errors.push(`rows[${index}].score must be a number when provided.`);
      }

      if (row.durationMs !== undefined && row.durationMs !== null && !isNumber(row.durationMs)) {
        errors.push(`rows[${index}].durationMs must be a number when provided.`);
      }

      if (row.severity !== undefined && !isSeverity(row.severity)) {
        errors.push(`rows[${index}].severity must be one of ${severityOrder.join(', ')}.`);
      }

      if (row.kind !== undefined && !isRowKind(row.kind)) {
        errors.push(`rows[${index}].kind must be one of ${rowKinds.join(', ')}.`);
      }

      for (const field of [
        'question',
        'datasetId',
        'scenarioId',
        'rubricId',
        'rubricVariant',
        'judgeModel',
        'judgeCategory',
        'judgeReasoning',
        'promptVersion',
        'agentChannel',
        'agentVersion',
        'groundTruthCategory',
        'groundTruthAnnotation',
      ]) {
        if (row[field] !== undefined && !isString(row[field])) {
          errors.push(`rows[${index}].${field} must be a string when provided.`);
        }
      }

      for (const field of ['judgeVerdict', 'groundTruthVerdict']) {
        if (row[field] !== undefined && typeof row[field] !== 'boolean') {
          errors.push(`rows[${index}].${field} must be a boolean when provided.`);
        }
      }

      if (row['agentReasoning'] !== undefined && !isString(row['agentReasoning'])) {
        errors.push(`rows[${index}].agentReasoning must be a string when provided.`);
      }

      if (row['turns'] !== undefined) {
        if (!Array.isArray(row['turns'])) {
          errors.push(`rows[${index}].turns must be an array when provided.`);
        } else {
          const turnRoles = ['user', 'assistant', 'system', 'tool'];
          (row['turns'] as unknown[]).forEach((turn, ti) => {
            if (!isObject(turn)) {
              errors.push(`rows[${index}].turns[${ti}] must be an object.`);
              return;
            }
            if (!isString(turn['role']) || !turnRoles.includes(turn['role'])) {
              errors.push(`rows[${index}].turns[${ti}].role must be one of ${turnRoles.join(', ')}.`);
            }
            if (!isString(turn['content'])) {
              errors.push(`rows[${index}].turns[${ti}].content must be a string.`);
            }
          });
        }
      }

      if (row['toolCalls'] !== undefined) {
        if (!Array.isArray(row['toolCalls'])) {
          errors.push(`rows[${index}].toolCalls must be an array when provided.`);
        } else {
          (row['toolCalls'] as unknown[]).forEach((tc, ti) => {
            if (!isObject(tc)) {
              errors.push(`rows[${index}].toolCalls[${ti}] must be an object.`);
              return;
            }
            if (!isString(tc['name']) || tc['name'].length === 0) {
              errors.push(`rows[${index}].toolCalls[${ti}].name must be a non-empty string.`);
            }
          });
        }
      }

      if (row['axisScores'] !== undefined) {
        if (!isObject(row['axisScores'])) {
          errors.push(`rows[${index}].axisScores must be an object when provided.`);
        } else {
          for (const [axis, score] of Object.entries(row['axisScores'] as Record<string, unknown>)) {
            if (!isNumber(score)) {
              errors.push(`rows[${index}].axisScores.${axis} must be a number.`);
            }
          }
        }
      }

      if (row['axisReasoning'] !== undefined) {
        if (!isObject(row['axisReasoning'])) {
          errors.push(`rows[${index}].axisReasoning must be an object when provided.`);
        } else {
          for (const [axis, reasoning] of Object.entries(row['axisReasoning'] as Record<string, unknown>)) {
            if (!isString(reasoning)) {
              errors.push(`rows[${index}].axisReasoning.${axis} must be a string.`);
            }
          }
        }
      }

      if (row['groundTruthAxisScores'] !== undefined) {
        if (!isObject(row['groundTruthAxisScores'])) {
          errors.push(`rows[${index}].groundTruthAxisScores must be an object when provided.`);
        } else {
          for (const [axis, score] of Object.entries(row['groundTruthAxisScores'] as Record<string, unknown>)) {
            if (!isNumber(score)) {
              errors.push(`rows[${index}].groundTruthAxisScores.${axis} must be a number.`);
            }
          }
        }
      }

      if (row['trace'] !== undefined) {
        if (!isObject(row['trace'])) {
          errors.push(`rows[${index}].trace must be an object when provided.`);
        } else {
          for (const field of ['traceId', 'spanId', 'traceUrl', 'spanUrl', 'spanType']) {
            if (row['trace'][field] !== undefined && !isString(row['trace'][field])) {
              errors.push(`rows[${index}].trace.${field} must be a string when provided.`);
            }
          }
        }
      }

      if (row['usage'] !== undefined) {
        if (!isObject(row['usage'])) {
          errors.push(`rows[${index}].usage must be an object when provided.`);
        } else {
          const usage = row['usage'] as Record<string, unknown>;
          for (const field of ['promptTokens', 'completionTokens', 'totalTokens', 'costUsd']) {
            if (usage[field] !== undefined && usage[field] !== null && !isNumber(usage[field])) {
              errors.push(`rows[${index}].usage.${field} must be a number when provided.`);
            }
          }
          if (usage['model'] !== undefined && !isString(usage['model'])) {
            errors.push(`rows[${index}].usage.model must be a string when provided.`);
          }
        }
      }

      if (row['complianceRefs'] !== undefined) {
        if (!Array.isArray(row['complianceRefs'])) {
          errors.push(`rows[${index}].complianceRefs must be an array when provided.`);
        } else {
          (row['complianceRefs'] as unknown[]).forEach((ref, refIndex) => {
            if (!isString(ref) || ref.length === 0) {
              errors.push(`rows[${index}].complianceRefs[${refIndex}] must be a non-empty string.`);
            }
          });
        }
      }

      if (row['metadata'] !== undefined) {
        if (!isObject(row['metadata'])) {
          errors.push(`rows[${index}].metadata must be an object when provided.`);
        } else {
          const metadata = row['metadata'] as Record<string, unknown>;
          const provenance = metadata['provenance'];
          if (provenance !== undefined) {
            if (!isObject(provenance)) {
              errors.push(`rows[${index}].metadata.provenance must be an object when provided.`);
            } else {
              if (
                !isString(provenance['source']) ||
                !provenanceSources.includes(provenance['source'])
              ) {
                errors.push(
                  `rows[${index}].metadata.provenance.source must be one of ${provenanceSources.join(', ')}.`,
                );
              }

              for (const field of ['addedBy', 'reason', 'sourceRef']) {
                if (provenance[field] !== undefined && !isString(provenance[field])) {
                  errors.push(
                    `rows[${index}].metadata.provenance.${field} must be a string when provided.`,
                  );
                }
              }
            }
          }

          const lifecycle = metadata['lifecycle'];
          if (lifecycle !== undefined) {
            if (!isObject(lifecycle)) {
              errors.push(`rows[${index}].metadata.lifecycle must be an object when provided.`);
            } else {
              if (
                !isString(lifecycle['status']) ||
                !lifecycleStatuses.includes(lifecycle['status'])
              ) {
                errors.push(
                  `rows[${index}].metadata.lifecycle.status must be one of ${lifecycleStatuses.join(', ')}.`,
                );
              }

              for (const field of ['since', 'note']) {
                if (lifecycle[field] !== undefined && !isString(lifecycle[field])) {
                  errors.push(
                    `rows[${index}].metadata.lifecycle.${field} must be a string when provided.`,
                  );
                }
              }
            }
          }
        }
      }
    });
  }

  if (value.suiteManifests !== undefined) {
    if (!Array.isArray(value.suiteManifests)) {
      errors.push('suiteManifests must be an array when provided.');
    } else {
      value.suiteManifests.forEach((manifest, index) => {
        if (!isObject(manifest)) {
          errors.push(`suiteManifests[${index}] must be an object.`);
          return;
        }

        if (!isString(manifest.name) || manifest.name.length === 0) {
          errors.push(`suiteManifests[${index}].name must be a non-empty string.`);
        }

        if (!isString(manifest.target) || !evalTargets.includes(manifest.target as EvalTarget)) {
          errors.push(`suiteManifests[${index}].target must be one of ${evalTargets.join(', ')}.`);
        }

        if (
          !isString(manifest.datasetSource) ||
          !datasetSources.includes(manifest.datasetSource as DatasetSource)
        ) {
          errors.push(
            `suiteManifests[${index}].datasetSource must be one of ${datasetSources.join(', ')}.`,
          );
        }

        if (!isString(manifest.datasetVersion) || manifest.datasetVersion.length === 0) {
          errors.push(`suiteManifests[${index}].datasetVersion must be a non-empty string.`);
        }

        if (manifest.datasetPath !== undefined && !isString(manifest.datasetPath)) {
          errors.push(`suiteManifests[${index}].datasetPath must be a string when provided.`);
        }

        if (manifest.rubricVersion !== undefined && !isString(manifest.rubricVersion)) {
          errors.push(`suiteManifests[${index}].rubricVersion must be a string when provided.`);
        }

        if (!isString(manifest.riskArea) || !riskAreas.includes(manifest.riskArea as RiskArea)) {
          errors.push(`suiteManifests[${index}].riskArea must be one of ${riskAreas.join(', ')}.`);
        }

        if (!Array.isArray(manifest.graders)) {
          errors.push(`suiteManifests[${index}].graders must be an array.`);
        } else {
          manifest.graders.forEach((grader, graderIndex) => {
            if (!isString(grader) || !graderKinds.includes(grader as GraderKind)) {
              errors.push(
                `suiteManifests[${index}].graders[${graderIndex}] must be one of ${graderKinds.join(', ')}.`,
              );
            }
          });
        }

        if (!isObject(manifest.gate)) {
          errors.push(`suiteManifests[${index}].gate must be an object.`);
        } else {
          if (!isString(manifest.gate.mode) || !(GATE_MODES as readonly string[]).includes(manifest.gate.mode)) {
            errors.push(`suiteManifests[${index}].gate.mode must be ${GATE_MODES.join(' or ')}.`);
          }

          if (!isObject(manifest.gate.thresholds)) {
            errors.push(`suiteManifests[${index}].gate.thresholds must be an object.`);
          } else {
            for (const [thresholdName, thresholdValue] of Object.entries(
              manifest.gate.thresholds,
            )) {
              if (!isNumber(thresholdValue)) {
                errors.push(
                  `suiteManifests[${index}].gate.thresholds.${thresholdName} must be a number.`,
                );
              }
            }
          }
        }

        if (manifest.complianceFrameworks !== undefined) {
          if (!Array.isArray(manifest.complianceFrameworks)) {
            errors.push(`suiteManifests[${index}].complianceFrameworks must be an array when provided.`);
          } else {
            manifest.complianceFrameworks.forEach((framework, frameworkIndex) => {
              if (!isString(framework) || framework.length === 0) {
                errors.push(
                  `suiteManifests[${index}].complianceFrameworks[${frameworkIndex}] must be a non-empty string.`,
                );
              }
            });
          }
        }

        if (manifest.scoreScale !== undefined) {
          if (!isObject(manifest.scoreScale)) {
            errors.push(`suiteManifests[${index}].scoreScale must be an object when provided.`);
          } else {
            const { min, max } = manifest.scoreScale;
            if (!isNumber(min)) {
              errors.push(`suiteManifests[${index}].scoreScale.min must be a number.`);
            }
            if (!isNumber(max)) {
              errors.push(`suiteManifests[${index}].scoreScale.max must be a number.`);
            }
            if (isNumber(min) && isNumber(max) && min >= max) {
              errors.push(`suiteManifests[${index}].scoreScale.min must be less than scoreScale.max.`);
            }
          }
        }

        const hasLlMJudgeGrader =
          Array.isArray(manifest.graders) && manifest.graders.some((grader) => grader === 'llm-judge');
        const isBlockingGate = isObject(manifest.gate) && manifest.gate.mode === 'blocking';
        const requiresRubricVersion = hasLlMJudgeGrader || isBlockingGate;
        if (
          requiresRubricVersion &&
          (!isString(manifest.rubricVersion) || manifest.rubricVersion.length === 0)
        ) {
          errors.push(
            `suiteManifests[${index}].rubricVersion is required when gate.mode is blocking or graders include llm-judge.`,
          );
        }
      });
    }
  }

  if (value.rubricContracts !== undefined) {
    if (!Array.isArray(value.rubricContracts)) {
      errors.push('rubricContracts must be an array when provided.');
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
                `rubricContracts[${index}].rubrics[${rubricIndex}].axis must be a non-empty string.`,
              );
            }

            if (!isString(rubric.version) || rubric.version.length === 0) {
              errors.push(
                `rubricContracts[${index}].rubrics[${rubricIndex}].version must be a non-empty string.`,
              );
            }
          });
        }
      });
    }
  }

  if (value.datasetChangelog !== undefined) {
    if (!Array.isArray(value.datasetChangelog)) {
      errors.push('datasetChangelog must be an array when provided.');
    } else {
      value.datasetChangelog.forEach((entry, index) => {
        if (!isObject(entry)) {
          errors.push(`datasetChangelog[${index}] must be an object.`);
          return;
        }

        for (const field of ['suiteName', 'datasetVersion', 'rubricVersion', 'changedAt', 'summary']) {
          if (!isString(entry[field]) || entry[field].length === 0) {
            errors.push(`datasetChangelog[${index}].${field} must be a non-empty string.`);
          }
        }

        if (!isString(entry.changeType) || !datasetChangeTypes.includes(entry.changeType)) {
          errors.push(
            `datasetChangelog[${index}].changeType must be one of ${datasetChangeTypes.join(', ')}.`,
          );
        }

        if (!isObject(entry.rowChanges)) {
          errors.push(`datasetChangelog[${index}].rowChanges must be an object.`);
        } else {
          for (const field of ['added', 'updated', 'removed', 'relabelled']) {
            const value = entry.rowChanges[field];
            if (!isNumber(value) || value < 0) {
              errors.push(
                `datasetChangelog[${index}].rowChanges.${field} must be a non-negative number.`,
              );
            }
          }
        }
      });
    }
  }

  if (value.tags !== undefined) {
    if (!isObject(value.tags)) {
      errors.push('tags must be an object when provided.');
    } else {
      for (const [key, tagValue] of Object.entries(value.tags as Record<string, unknown>)) {
        if (!isString(tagValue)) {
          errors.push(`tags.${key} must be a string.`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, issues: toValidationIssues(errors) };
  }

  return { ok: true, report: value as EvalReportV1 };
};