// The curated sentence fixture (rules/sentence-fixture.yaml): hand-written
// natural-language queries, each naming the records it should surface, with
// a per-item target depth and weight. The zod shape is also the editor
// schema (nlp/rules-schema.ts emits it); loading validates and resolves each
// item's `d`/`w` against the fixture defaults, as zshref-rs/src/nlp/
// sentence_fixture.rs does. Holdout hygiene (NLP.md): nothing prints an
// entry of the holdout split; `trainOnly` is the view for anything that does.

import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { PATHS } from '../paths';
import type { Split } from './metric';

export const SENTENCE_FIXTURE_VERSION = 4;
/** The built-in fallbacks when the fixture sets no `default-weight` / `default-target-depth`. */
export const DEFAULT_WEIGHT = 1;
export const DEFAULT_TARGET_DEPTH = 3;

// The YAML as authored (the editor schema's input side); numbers as YAML
// reads them, `holdout` and the defaults optional.

const ExpectedItemShape = z
  .strictObject({
    cat: z.string(),
    id: z.string(),
    d: z.number().optional().describe('Target depth; overrides `default-target-depth`.'),
    w: z.number().optional().describe('Weight; overrides `default-weight`.')
  })
  .meta({
    title: 'ExpectedItem',
    description:
      "One scored item within an entry's `want` set. Each item is graded on its OWN rank and contributes one vote; an N-item entry carries N votes."
  });

const SentenceEntryShape = z
  .strictObject({
    query: z.string(),
    want: z.array(ExpectedItemShape),
    holdout: z
      .boolean()
      .default(false)
      .describe('Held out from tuning when `true`; absent (the default) ⇒ train. `false` is accepted but redundant.')
  })
  .meta({ title: 'SentenceEntry' });

const SentenceFixtureShape = z
  .strictObject({
    version: z.literal(SENTENCE_FIXTURE_VERSION),
    'default-weight': z
      .number()
      .default(DEFAULT_WEIGHT)
      .describe(`Weight applied to items that omit \`w\`; ${DEFAULT_WEIGHT} when the fixture omits the field too.`),
    'default-target-depth': z
      .number()
      .default(DEFAULT_TARGET_DEPTH)
      .describe(
        `Target depth applied to items that omit \`d\`; ${DEFAULT_TARGET_DEPTH} when the fixture omits the field too.`
      ),
    entries: z.array(SentenceEntryShape)
  })
  .meta({
    title: 'SentenceFixture',
    description:
      'Sentence-style queries for the natural-language search eval: hand-curated paraphrased questions, each targeting specific canonical records. Test-only.'
  });

// The resolved form every consumer sees: concrete f32 depth and weight per
// item, the split derived from the flag.

export interface SentenceItem {
  category: string;
  id: string;
  targetDepth: number;
  weight: number;
}

export interface SentenceEntry {
  query: string;
  want: SentenceItem[];
  split: Split;
}

export interface SentenceFixture {
  defaultWeight: number;
  defaultTargetDepth: number;
  entries: SentenceEntry[];
}

const f = Math.fround;
/** Of the f32 value, as Rust checks it. */
const positive = (x: number): boolean => f(x) > 0 && Number.isFinite(f(x));

/** The shape, then the load-time invariants (in the Rust order) and the
 * resolution. Messages name entries by index only — never by query. */
export const SentenceFixtureSchema = SentenceFixtureShape.transform((raw, ctx): SentenceFixture => {
  const issue = (path: (string | number)[], message: string): void => {
    ctx.issues.push({ code: 'custom', input: raw, path, message });
  };
  const defaultWeight = raw['default-weight'];
  const defaultTargetDepth = raw['default-target-depth'];
  if (!positive(defaultWeight)) {
    issue(['default-weight'], `must be positive and finite, got ${defaultWeight}`);
  }
  if (!positive(defaultTargetDepth)) {
    issue(['default-target-depth'], `must be positive and finite, got ${defaultTargetDepth}`);
  }
  const entries = raw.entries.map((e, i): SentenceEntry => {
    if (e.want.length === 0) issue(['entries', i, 'want'], `entry ${i} has an empty want-set`);
    const want = e.want.map((item, j): SentenceItem => {
      const d = item.d ?? defaultTargetDepth;
      const w = item.w ?? defaultWeight;
      if (!positive(d)) {
        issue(['entries', i, 'want', j, 'd'], `entry ${i} item ${j} has non-positive target depth ${d}`);
      }
      if (!positive(w)) issue(['entries', i, 'want', j, 'w'], `entry ${i} item ${j} has non-positive weight ${w}`);
      return { category: item.cat, id: item.id, targetDepth: f(d), weight: f(w) };
    });
    return { query: e.query, want, split: e.holdout ? 'holdout' : 'train' };
  });
  return { defaultWeight: f(defaultWeight), defaultTargetDepth: f(defaultTargetDepth), entries };
});

export const parseSentenceFixture = (yaml: string): SentenceFixture =>
  SentenceFixtureSchema.parse(parseYaml(yaml));

export async function loadSentenceFixture(path: string = PATHS.sentenceFixture): Promise<SentenceFixture> {
  return parseSentenceFixture(await readFile(path, 'utf8'));
}

/** The tune-on split: the only entries anything may print. */
export const trainOnly = (fixture: SentenceFixture): SentenceFixture => ({
  ...fixture,
  entries: fixture.entries.filter((e) => e.split === 'train')
});
