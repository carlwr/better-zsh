// Pre-extraction artifact paths.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { loadVectorIndex } from '../src/lib/ranker/index-loader';
import { loadRules } from '../src/lib/ranker/rules';
import type { VectorIndex } from '../src/lib/ranker/types';
import type { Rules } from '../src/lib/ranker/rules';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const zshrefRs = resolve(repoRoot, 'zshref-rs');

export const PATHS = {
  parityFixture: resolve(zshrefRs, 'tests/nlp-qa/parity-fixture.json'),
  sanityFixture: resolve(zshrefRs, 'tests/nlp-qa/sanity-fixture.json'),
  categoriesJson: resolve(zshrefRs, 'tests/nlp-qa/categories.json'),
  lookupMap: resolve(zshrefRs, 'tests/nlp-qa/lookup-map.json'),
  lookupContract: resolve(zshrefRs, 'tests/nlp-qa/lookup-contract.json'),
  indexJson: resolve(zshrefRs, 'data-nlp/index.json'),
  modelDir: resolve(zshrefRs, 'data-nlp/model'),
  tuning: resolve(zshrefRs, 'src/nlp/rules/tuning.yaml'),
  stopwords: resolve(zshrefRs, 'src/nlp/rules/stopwords.yaml'),
  synonyms: resolve(zshrefRs, 'src/nlp/rules/synonyms.yaml')
};

// The gitignored members of PATHS — the only ones whose absence is normal.
// Everything else PATHS names is committed, so its absence is a defect and
// must not resolve to a skip.
export const STAGED = {
  index: PATHS.indexJson,
  model: PATHS.modelDir
} as const;

/**
 * Reason for `ctx.skip(reason)`; null when everything in `needs` is staged.
 * A verbose reporter prints a ctx.skip note, whereas `it.skipIf` coerces its
 * argument to a boolean and drops the text. Throws when CI requires
 * artifacts. `needs` is per-test on purpose: gating a test on the 127M model
 * it never loads makes deleting the model silently skip it.
 */
export function artifactGate(label: string, needs: readonly string[]): string | null {
  const missing = needs.filter((p) => !existsSync(p));
  if (missing.length === 0) return null;
  const msg = `${label}: not staged locally — ${missing.join(', ')}`;
  if (process.env.BZ_REQUIRE_WEB_ARTIFACTS === '1') {
    throw new Error(`${msg} (BZ_REQUIRE_WEB_ARTIFACTS=1)`);
  }
  return msg;
}

export async function readData(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');
  return path.endsWith('.yaml') ? parseYaml(text) : JSON.parse(text);
}

export async function loadIndexFromDisk(): Promise<VectorIndex> {
  return loadVectorIndex(await readData(PATHS.indexJson));
}

export async function loadRulesFromDisk(): Promise<Rules> {
  const [tuning, stopwords, synonyms] = await Promise.all([
    readData(PATHS.tuning),
    readData(PATHS.stopwords),
    readData(PATHS.synonyms)
  ]);
  return loadRules({ tuning, stopwords, synonyms });
}

const ParityEntrySchema = z.object({
  query: z.string(),
  queryVec: z.array(z.number()),
  resolverHit: z.object({ category: z.string(), id: z.string() }).optional(),
  expected: z.array(
    z.object({ category: z.string(), id: z.string(), score: z.number() })
  )
});
export const ParityFixtureSchema = z.object({
  version: z.literal(3),
  limit: z.number().int(),
  // Through the production loader, not just its schema: whatever validation
  // a staged index gets, the fixture's embedded one gets too.
  index: z.unknown().transform(loadVectorIndex),
  entries: z.array(ParityEntrySchema)
});
export type ParityFixture = z.infer<typeof ParityFixtureSchema>;

const SanityEntrySchema = z.object({
  query: z.string(),
  topMatch: z.object({ category: z.string(), id: z.string(), score: z.number() }),
  runnerUp: z
    .object({ category: z.string(), id: z.string(), score: z.number() })
    .optional()
});
export const SanityFixtureSchema = z.object({
  version: z.literal(1),
  invariants: z.object({ absoluteFloor: z.number(), minMargin: z.number() }),
  entries: z.array(SanityEntrySchema)
});
export type SanityFixture = z.infer<typeof SanityFixtureSchema>;

export async function loadParityFixture(): Promise<ParityFixture> {
  return ParityFixtureSchema.parse(await readData(PATHS.parityFixture));
}

export async function loadSanityFixture(): Promise<SanityFixture> {
  return SanityFixtureSchema.parse(await readData(PATHS.sanityFixture));
}
