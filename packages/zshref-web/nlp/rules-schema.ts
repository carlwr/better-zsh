// The rule shapes for the Node side, and the JSON Schema (draft 2020-12)
// generated from them for the YAML editor. The shapes live in the browser
// bundle (src/lib/ranker/types.ts), zod-only, so one definition validates the
// YAML here and the emitted JSON there; this module re-exports them and adds
// the schema emission. The committed rules/schema/*.schema.json are
// regenerated from `rulesJsonSchemas()` once the Rust nlp module goes (until
// then they are schemars output, asserted by the Rust test suite).

import { z } from 'zod';

import { RULE_FILES, RULE_SCHEMAS, type RuleFile } from '../src/lib/ranker/rules';

export { RULE_FILES, RULE_SCHEMAS, type RuleFile, type Rules } from '../src/lib/ranker/rules';
export {
  MAX_SCORE_TERM,
  StopwordsSchema,
  SynonymsSchema,
  TuningSchema
} from '../src/lib/ranker/types';

export type RuleSchemaFile = `${RuleFile}.schema.json`;
export type JsonSchema = z.core.JSONSchema.BaseSchema;

export const ruleSchemaFile = (f: RuleFile): RuleSchemaFile => `${f}.schema.json`;

/**
 * One JSON Schema per rule file, keyed by its schema file name. The input
 * side of the shapes (`io: 'input'`): the YAML as authored — defaulted lists
 * optional, terms un-normalized. Range checks and normalization are
 * load-time only; a JSON Schema cannot express them.
 */
export function rulesJsonSchemas(): Record<RuleSchemaFile, JsonSchema> {
  const entries = RULE_FILES.map((f) => [
    ruleSchemaFile(f),
    z.toJSONSchema(RULE_SCHEMAS[f], { target: 'draft-2020-12', io: 'input' })
  ]);
  // Invariant: the keys are exactly `ruleSchemaFile(RULE_FILES[*])`.
  return Object.fromEntries(entries) as Record<RuleSchemaFile, JsonSchema>;
}
