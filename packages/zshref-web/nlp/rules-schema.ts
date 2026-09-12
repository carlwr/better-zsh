// The rule shapes for the Node side, and the JSON Schema (draft 2020-12)
// generated from them for the YAML editor. The shapes live in the browser
// bundle (src/lib/ranker/types.ts), zod-only, so one definition validates the
// YAML here and the emitted JSON there; this module re-exports them and adds
// the schema emission — for the sentence fixture too, which shares the
// rules/ dir and its schema/ (shape: nlp/eval/sentence-fixture.ts). The
// committed rules/schema/*.schema.json are regenerated from
// `rulesJsonSchemas()` once the Rust nlp module goes (until then they are
// schemars output, asserted by the Rust test suite).

import { z } from 'zod';

import { RULE_FILES, RULE_SCHEMAS, type RuleFile } from '../src/lib/ranker/rules';
import { SentenceFixtureSchema } from './eval/sentence-fixture';

export { RULE_FILES, RULE_SCHEMAS, type RuleFile, type Rules } from '../src/lib/ranker/rules';
export {
  MAX_SCORE_TERM,
  StopwordsSchema,
  SynonymsSchema,
  TuningSchema
} from '../src/lib/ranker/types';

export type RuleSchemaFile = `${RuleFile}.schema.json`;
export const SENTENCE_FIXTURE_SCHEMA_FILE = 'sentence-fixture.schema.json';
/** Everything under rules/schema/. */
export type SchemaFile = RuleSchemaFile | typeof SENTENCE_FIXTURE_SCHEMA_FILE;
export type JsonSchema = z.core.JSONSchema.BaseSchema;

export const ruleSchemaFile = (f: RuleFile): RuleSchemaFile => `${f}.schema.json`;

const toJsonSchema = (shape: z.ZodType): JsonSchema =>
  z.toJSONSchema(shape, { target: 'draft-2020-12', io: 'input' });

/**
 * One JSON Schema per rule file plus the sentence fixture's, keyed by schema
 * file name. The input side of the shapes (`io: 'input'`): the YAML as
 * authored — defaulted lists optional, terms un-normalized, fixture
 * defaults unresolved. Range checks and normalization are load-time only; a
 * JSON Schema cannot express them.
 */
export function rulesJsonSchemas(): Record<SchemaFile, JsonSchema> {
  const rules = RULE_FILES.map((f) => [ruleSchemaFile(f), toJsonSchema(RULE_SCHEMAS[f])]);
  // Invariant: the keys are exactly `ruleSchemaFile(RULE_FILES[*])`.
  return {
    ...(Object.fromEntries(rules) as Record<RuleSchemaFile, JsonSchema>),
    [SENTENCE_FIXTURE_SCHEMA_FILE]: toJsonSchema(SentenceFixtureSchema)
  };
}
