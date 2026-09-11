// Bundle of static rule data read from zshref release artifacts.
// Pass through `loadRules` once at startup; the ranker reads it as `Rules`.

import {
  type Stopwords,
  StopwordsSchema,
  type Synonyms,
  SynonymsSchema,
  type Tuning,
  TuningSchema
} from './types';

export interface Rules {
  tuning: Tuning;
  stopwords: Stopwords;
  synonyms: Synonyms;
}

export function loadRules(input: {
  tuning: unknown;
  stopwords: unknown;
  synonyms: unknown;
}): Rules {
  return {
    tuning: TuningSchema.parse(input.tuning),
    stopwords: StopwordsSchema.parse(input.stopwords),
    synonyms: SynonymsSchema.parse(input.synonyms)
  };
}
