// Artifact gating, on-disk loaders and fixture schemas shared by the tests.

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { PATHS } from '../nlp/paths';
import { loadVectorIndex } from '../src/lib/ranker/index-loader';
import type { Rules } from '../src/lib/ranker/rules';
import { loadRules } from '../src/lib/ranker/rules';
import type { VectorIndex } from '../src/lib/ranker/types';

export { PATHS, STAGED } from '../nlp/paths';

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

export const prettyJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Compare-or-rewrite for a committed, generated JSON file: with `envVar` set
 * the file is (re)written from `generated`; otherwise it must exist and equal
 * `generated` as parsed JSON (formatting is free to differ). `render` is the
 * writer, so a fixture with its own number printing round-trips through it
 * before the comparison.
 */
export async function assertCommittedJson(
  path: string,
  generated: unknown,
  envVar: string,
  render: (value: unknown) => string = prettyJson
): Promise<void> {
  const text = render(generated);
  if (process.env[envVar] === '1') {
    await writeFile(path, text);
    return;
  }
  if (!existsSync(path)) {
    throw new Error(`${path} is missing — generate it with ${envVar}=1`);
  }
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(JSON.parse(text));
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
