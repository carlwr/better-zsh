// The three rule files as one bundle: their shapes by name, and the loader.
// The browser passes the fetched `rules/*.json` through `loadRules` once at
// startup; the Node side feeds it the YAML (nlp/rules-load.ts). The ranker
// reads the result as `Rules`.

import type { z } from 'zod';

import { StopwordsSchema, SynonymsSchema, TuningSchema } from './types';

// Canonical key source: file base names (`<name>.yaml`, `<name>.json`,
// `<name>.schema.json`) in emission order.
export const RULE_SCHEMAS = {
  tuning: TuningSchema,
  stopwords: StopwordsSchema,
  synonyms: SynonymsSchema
} as const;
export type RuleFile = keyof typeof RULE_SCHEMAS;
export const RULE_FILES = Object.keys(RULE_SCHEMAS) as RuleFile[];

export type Rules = { [K in RuleFile]: z.output<(typeof RULE_SCHEMAS)[K]> };

export function loadRules(input: Record<RuleFile, unknown>): Rules {
  return {
    tuning: TuningSchema.parse(input.tuning),
    stopwords: StopwordsSchema.parse(input.stopwords),
    synonyms: SynonymsSchema.parse(input.synonyms)
  };
}
