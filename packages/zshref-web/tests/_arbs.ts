// fast-check arbitraries over the NLP's shapes, shared by the property tests.
// Pure; excluded from the test glob (not *.test.ts).

import fc from "fast-check"

import { type LookupIndex, lookupIndex } from "../nlp/core/lookup-map"
import type { Tuning } from "../nlp/core/rules"
import type { IndexedRecord, RecordId, VectorIndex } from "../nlp/core/types"
import { syntheticVec } from "../nlp/core/vec"
import { makeRecordText, syntheticIndexOf, syntheticVectors } from "./_fixtures"

// --- records and indexes --------------------------------------------------------

const CATEGORIES = [
  { category: "option", category_label: "option" },
  { category: "builtin", category_label: "builtin" },
  { category: "special_param", category_label: "special parameter" },
]
const IDENTITIES = [
  { id: "aliases", display: "ALIASES" },
  { id: "autocd", display: "AUTO_CD" },
  { id: "setopt", display: "setopt" },
  { id: "echo", display: "echo" },
  { id: "?", display: "?" },
  { id: ">>_word", display: ">> word" },
]
// Discriminating words, stopwords (`that`, `with`), category names, a
// too-short word, and the symbols the lexical path special-cases.
const WORDS = [
  "alias",
  "expand",
  "glob",
  "history",
  "prompt",
  "complete",
  "redirect",
  "file",
  "output",
  "that",
  "with",
  "option",
  "builtin",
  "special",
  "parameter",
  "autocd",
  "setopt",
  "to",
  "$?",
  ">>",
  '"$0"',
  "<<<",
]

export const arbText = (max: number): fc.Arbitrary<string> =>
  fc
    .array(fc.constantFrom(...WORDS), { maxLength: max })
    .map(ws => ws.join(" "))

/** A query of corpus-like words, then some ASCII noise. */
export const arbQuery: fc.Arbitrary<string> = fc
  .tuple(arbText(6), fc.string({ unit: "grapheme-ascii", maxLength: 6 }))
  .map(([words, noise]) => `${words} ${noise}`)

export const arbRecord: fc.Arbitrary<IndexedRecord> = fc
  .record({
    cat: fc.constantFrom(...CATEGORIES),
    ident: fc.constantFrom(...IDENTITIES),
    structured: arbText(6),
    body: arbText(30),
    expanded: arbText(6),
  })
  .map(({ cat, ident, structured, body, expanded }) => ({
    text: makeRecordText({
      ...cat,
      ...ident,
      title: "",
      md_body: "",
      structured,
      body,
      expanded,
    }),
    vectors: syntheticVectors(cat.category, ident.id),
  }))

/** Identities unique, as in a real index: the sort is total only then. */
export const arbIndex: fc.Arbitrary<VectorIndex> = fc
  .uniqueArray(arbRecord, {
    minLength: 1,
    maxLength: 7,
    selector: r => `${r.text.category}\0${r.text.id}`,
  })
  .map(syntheticIndexOf)

/** A query and its synthetic vector over an index. */
export const arbRanking = fc
  .record({ index: arbIndex, query: arbQuery })
  .map(({ index, query }) => ({
    index,
    query,
    queryVec: syntheticVec(["query", query]),
  }))

/** Some of the index's identities, and some it lacks. */
export const arbRecordIds = (index: VectorIndex): fc.Arbitrary<RecordId[]> =>
  fc.array(
    fc
      .oneof(
        {
          weight: 3,
          arbitrary: fc.constantFrom(...index.records.map(r => r.text)),
        },
        fc
          .constantFrom(...CATEGORIES, { category: "absent" })
          .chain(c =>
            fc
              .constantFrom(...IDENTITIES, { id: "missing" })
              .map(i => ({ category: c.category, id: i.id })),
          ),
      )
      .map(({ category, id }) => ({ category, id })),
    { maxLength: 4 },
  )

/** A lookup over `index`: a few of its records under raw forms the queries may hit, plus one it lacks. */
export const arbLookup = (index: VectorIndex): fc.Arbitrary<LookupIndex> =>
  fc
    .uniqueArray(
      fc
        .tuple(
          fc.constantFrom(...index.records.map(r => r.text), {
            category: "builtin",
            id: "missing",
          }),
          fc.constantFrom("", "the ", "Option "),
        )
        .map(([rec, prefix]) => ({
          raw: `${prefix}${rec.id}`,
          category: rec.category,
          id: rec.id,
        })),
      { maxLength: 4, selector: e => e.raw },
    )
    .map(entries => lookupIndex({ version: 1, entries }))

// --- tuning -------------------------------------------------------------------

export type SemanticWeights = Tuning["semantic_weights"]
export type BoostWeights = Tuning["boosts"]

const unit = fc.double({ min: 0, max: 1, noNaN: true })

/** structured ≤ 1 − body, as the range check admits. */
export const arbSemanticWeights: fc.Arbitrary<SemanticWeights> = fc
  .record({
    body: unit,
    frac: unit,
    strength: unit,
    length_scale: fc.double({ min: 1, max: 100, noNaN: true }),
  })
  .map(({ body, frac, strength, length_scale }) => ({
    body,
    structured: (1 - body) * frac,
    short_body: { strength, length_scale },
  }))

/** Boost weights on a 1e-3 grid. */
const grid = (max: number): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: max * 1000 }).map(i => i / 1000)
export const arbBoostWeights: fc.Arbitrary<BoostWeights> = fc.record({
  category: grid(0.3),
  exact_word_increment: grid(0.1),
  word_overlap: fc.record({
    scale: grid(0.5),
    half_sat: fc.integer({ min: 1, max: 16 }),
  }),
})

/** A whole tuning; the sweep's knob ranges, not the load-time range checks. */
export const arbTuning: fc.Arbitrary<Tuning> = fc.record({
  semantic_weights: arbSemanticWeights,
  boosts: arbBoostWeights,
  penalties: fc.record({ category_rarity_max: grid(0.2) }),
  lexical: fc.record({
    min_discriminating_word_len: fc.integer({ min: 1, max: 6 }),
    min_significant_word_len: fc.integer({ min: 1, max: 4 }),
  }),
})
