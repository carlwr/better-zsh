// The QA corpus (`nlp-corpus.yaml`): its shape, the loader, and the JSON
// Schema generated from the shape for the YAML editor (the conventions of
// nlp/rules-schema.ts; the committed schema.json is `qaCorpusJsonSchema()`
// output, regenerated under `UPDATE_SCHEMAS=1` beside the rules schemas).
// The corpus is a held-out set (NLP.md): code loads it, nothing prints an
// entry.

import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { PATHS } from '../paths';
import type { JsonSchema } from '../rules-schema';

export const DEFAULT_LIMIT = 20;
export const DEFAULT_WEIGHT = 1.0;

const positiveInt = z.number().int().min(1);

export const QaExpectedSchema = z
  .strictObject({
    category: z.string().describe("DocCategory id (e.g. 'option', 'builtin', 'conditional_op')."),
    id: z.string().describe('Record id within the category.'),
    score: z
      .number()
      .describe(
        'Positive score = desired match, negative = regression to penalize. Magnitude = importance.'
      )
  })
  .describe('One expected record: present (positive score) or absent (negative score) in the top results.');
export type QaExpected = z.infer<typeof QaExpectedSchema>;

export const QaEntrySchema = z
  .strictObject({
    query: z.string().min(1).describe('Natural-language query to search for.'),
    category: z.string().optional().describe('Optional category to restrict search to.'),
    limit: positiveInt
      .default(DEFAULT_LIMIT)
      .describe(`How many results to fetch (default ${DEFAULT_LIMIT}).`),
    topN: positiveInt
      .optional()
      .describe('Score expected records against the first topN results. Defaults to limit.'),
    weight: z
      .number()
      .min(0)
      .default(DEFAULT_WEIGHT)
      .describe(`Per-entry weight in aggregate score (default ${DEFAULT_WEIGHT.toFixed(1)}).`),
    expected: z
      .array(QaExpectedSchema)
      .min(1)
      .describe(
        'Records expected to appear (positive score) or not appear (negative score) in top results.'
      )
  })
  .describe('A query with its expected record matches.');
export type QaEntry = z.infer<typeof QaEntrySchema>;

// Loose at the root only: the YAML carries a `$schema: ./schema.json` editor
// hint beside `entries`; entries and expected items are strict.
export const QaCorpusSchema = z
  .object({
    entries: z.array(QaEntrySchema).describe('Corpus entries, each a query with expected record matches.')
  })
  .meta({
    title: 'NLP QA Corpus',
    description:
      'A corpus of natural-language queries with expected record matches and scores for steering NLP retrieval quality.'
  });
export type QaCorpus = z.infer<typeof QaCorpusSchema>;

/** The corpus, validated; defaults (`limit`, `weight`) filled in. */
export async function loadQaCorpus(path: string = PATHS.qaCorpus): Promise<QaCorpus> {
  return QaCorpusSchema.parse(parseYaml(await readFile(path, 'utf8')));
}

/** The editor schema for the YAML: the input side, defaulted fields optional. */
export function qaCorpusJsonSchema(): JsonSchema {
  return z.toJSONSchema(QaCorpusSchema, { target: 'draft-2020-12', io: 'input' });
}
