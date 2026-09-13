import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DATASET_CHANGE_TYPES,
  DATASET_SOURCES,
  EVAL_REPORT_SCHEMA_VERSION,
  EVAL_ROW_KINDS,
  EVAL_SEVERITIES,
  EVAL_TARGETS,
  GATE_MODES,
  GRADER_KINDS,
  RISK_AREAS,
  ROW_LIFECYCLE_STATUSES,
  ROW_PROVENANCE_SOURCES,
} from '../src/model/eval-report-v1.js';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

const schemaPath = resolve(process.cwd(), 'schemas/eval-report-v1.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as JsonObject;

const getObject = (root: JsonObject, path: string): JsonObject => {
  const cursor = path.split('.').reduce<JsonValue>((current, segment) => {
    if (!current || Array.isArray(current) || typeof current !== 'object' || !(segment in current)) {
      throw new Error(`Schema path not found: ${path}`);
    }

    return (current as JsonObject)[segment];
  }, root);

  if (!cursor || Array.isArray(cursor) || typeof cursor !== 'object') {
    throw new Error(`Schema path is not an object: ${path}`);
  }

  return cursor as JsonObject;
};

const setArray = (path: string, values: readonly string[]) => {
  const node = getObject(schema, path);
  node.enum = [...values];
};

const setConst = (path: string, value: string) => {
  const node = getObject(schema, path);
  node.const = value;
};

setConst('properties.schemaVersion', EVAL_REPORT_SCHEMA_VERSION);
setArray('definitions.EvalRow.properties.kind', EVAL_ROW_KINDS);
setArray('definitions.EvalRow.properties.severity', EVAL_SEVERITIES);
setArray('definitions.SuiteManifest.properties.target', EVAL_TARGETS);
setArray('definitions.SuiteManifest.properties.datasetSource', DATASET_SOURCES);
setArray('definitions.SuiteManifest.properties.riskArea', RISK_AREAS);
setArray('definitions.SuiteManifest.properties.graders.items', GRADER_KINDS);
setArray('definitions.GatePolicy.properties.mode', GATE_MODES);
setArray('definitions.RowProvenance.properties.source', ROW_PROVENANCE_SOURCES);
setArray('definitions.RowLifecycle.properties.status', ROW_LIFECYCLE_STATUSES);
setArray('definitions.DatasetChangelogEntry.properties.changeType', DATASET_CHANGE_TYPES);

writeFileSync(schemaPath, `${JSON.stringify(schema, null, 2)}\n`, 'utf8');
console.log(`Synced schema enums to ${schemaPath}`);
