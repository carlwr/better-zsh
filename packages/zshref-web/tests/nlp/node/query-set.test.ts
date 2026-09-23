// `gradeQuerySet` against `gradeEntries`, the reference over `rank`: equal
// graded items under every knob point, the ablations and the promote paths
// — over the parity fixture's miniature index with synthetic vectors (no
// model), over generated indexes, entries, lookups and tunings, and over a
// capped slice of the real bench when staged.

import { loadCorpus } from "@carlwr/zsh-core"
import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { LookupMapSchema, lookupIndex } from "../../../nlp/core/lookup-map"
import type { Tuning } from "../../../nlp/core/rules"
import { DIMS, type VectorIndex } from "../../../nlp/core/types"
import { syntheticVec } from "../../../nlp/core/vec"
import { loadEvalAssets } from "../../../nlp/node/eval/assets"
import { buildMechanical } from "../../../nlp/node/eval/mechanical"
import { buildQuerySet, gradeQuerySet } from "../../../nlp/node/eval/query-set"
import {
  embedEntries,
  gradeEntries,
  type RankAssets,
} from "../../../nlp/node/eval/sentence"
import {
  loadSentenceFixture,
  type SentenceEntry,
} from "../../../nlp/node/eval/sentence-fixture"
import {
  KNOB_KEYS,
  KNOBS,
  type KnobKey,
  withKnob,
} from "../../../nlp/node/eval/sweep"
import { withTuning, zeroBoosts } from "../../../nlp/node/eval/tune"
import { buildLookupMap } from "../../../nlp/node/lookup-map-build"
import { loadRulesYaml } from "../../../nlp/node/rules-load"
import {
  arbIndex,
  arbLookup,
  arbQuery,
  arbRecordIds,
  arbSplit,
  arbTuning,
} from "../../_arbs"
import { artifactGate, parityRankAssets, STAGED } from "../../_helpers"

const corpus = loadCorpus()
const rules = await loadRulesYaml()

type Labelled = [label: string, tuning: Tuning]
const point = (base: Tuning, key: KnobKey, v: number): Labelled => [
  `${key}=${v}`,
  withKnob(base, key, v),
]

/** The committed tuning, the boosts zeroed, and every knob point. */
const everyTuning = (base: Tuning): Labelled[] => [
  ["committed", base],
  ["zeroBoosts", zeroBoosts(base)],
  ...KNOB_KEYS.flatMap(key => KNOBS[key].points.map(v => point(base, key, v))),
]

/** The committed tuning, the boosts zeroed, and both lexical thresholds at an extreme. */
const fewTunings = (base: Tuning): Labelled[] => [
  ["committed", base],
  ["zeroBoosts", zeroBoosts(base)],
  point(base, "sig_len", 1),
  point(base, "disc_len", 6),
]

const zeroed = (vecs: ReadonlyMap<string, Float32Array>) =>
  new Map([...vecs.keys()].map(k => [k, new Float32Array(DIMS)]))

/** Both gradings, under each tuning, with and without the embedder. */
function expectSameGrading(
  entries: readonly SentenceEntry[],
  vecs: ReadonlyMap<string, Float32Array>,
  assets: RankAssets,
  tunings: (base: Tuning) => Labelled[],
): void {
  const set = buildQuerySet(entries, vecs, assets)
  for (const [label, tuning] of tunings(assets.rules.tuning)) {
    const under = withTuning(assets, tuning)
    expect(gradeQuerySet(set, under), label).toEqual(
      gradeEntries(entries, vecs, under),
    )
    expect(gradeQuerySet(set, under, { noEmbed: true }), label).toEqual(
      gradeEntries(entries, zeroed(vecs), under),
    )
  }
}

describe("over the parity index", () => {
  // The real map: bare names promote ("autocd" → its record; "echo" → a
  // record the mini index lacks).
  const assets = parityRankAssets(
    corpus,
    rules,
    lookupIndex(LookupMapSchema.parse(buildLookupMap(corpus))),
  )
  const { index } = assets
  const ref = (i: number) => {
    const r = index.records[i]
    if (!r) throw new Error("parity index has 9 records")
    return {
      category: r.text.category,
      id: r.text.id,
      targetDepth: 3,
      weight: 1,
    }
  }
  const every = index.records.map((_, i) => ref(i))
  const entry = (query: string, want = every): SentenceEntry => ({
    query,
    want,
    split: "train",
  })
  const entries: SentenceEntry[] = [
    entry("autocd"),
    entry("echo"),
    entry("setopt builtin"),
    entry("Option AUTO_CD please"),
    entry(">> file"),
    entry("$? code"),
    entry("the a"),
    entry(""),
    entry("glob qualifier flags for a file that is newer than the other one"),
    entry("f"),
    // An item the index lacks: just past the end.
    entry("autocd option", [
      ...every,
      { category: "builtin", id: "echo", targetDepth: 1, weight: 2 },
    ]),
  ]
  const vecs = new Map(
    entries.map(e => [e.query, syntheticVec(["query", e.query])]),
  )

  it("grades every entry as gradeEntries does, under every knob point", () => {
    expectSameGrading(entries, vecs, assets, everyTuning)
  })

  it("covers the promote: a hit in the index, and one outside it", () => {
    expect(assets.lookup.lookup("autocd")).toMatchObject({ id: "autocd" })
    expect(assets.lookup.lookup("echo")).toMatchObject({ id: "echo" })
    expect(index.records.some(r => r.text.id === "echo")).toBe(false)
  })
})

// --- generated ------------------------------------------------------------------

const arbEntries = (index: VectorIndex) =>
  fc.array(
    fc.record({
      query: fc.oneof(
        arbQuery,
        fc.constantFrom(...index.records.map(r => r.text.id)),
        fc.constant(""),
      ),
      want: arbRecordIds(index).map(ids =>
        ids.map((id, i) => ({ ...id, targetDepth: 1 + (i % 3), weight: 1 })),
      ),
      split: arbSplit,
    }),
    { maxLength: 4 },
  )

describe("over generated inputs", () => {
  it("grades as gradeEntries does for any index, entries, lookup and tuning", () => {
    const arb = arbIndex.chain(index =>
      fc.record({
        index: fc.constant(index),
        lookup: arbLookup(index),
        entries: arbEntries(index),
        tuning: arbTuning,
        noEmbed: fc.boolean(),
      }),
    )
    fc.assert(
      fc.property(arb, ({ index, lookup, entries, tuning, noEmbed }) => {
        const assets = withTuning({ index, rules, lookup }, tuning)
        const vecs = new Map(
          entries.map(e => [e.query, syntheticVec(["query", e.query])]),
        )
        // The set caches the real dots either way: `noEmbed` must ignore them.
        const set = buildQuerySet(entries, vecs, assets)
        expect(gradeQuerySet(set, assets, { noEmbed })).toEqual(
          gradeEntries(entries, noEmbed ? zeroed(vecs) : vecs, assets),
        )
      }),
      { numRuns: 150 },
    )
  })
})

const skipReason = artifactGate("query set over the staged assets", [
  ...STAGED.index,
  ...STAGED.model,
])

/** Entries per set: a slice, not the hundreds — real vectors and real lookup hits are the point. */
const CAP = 16

describe("over the staged assets, capped", () => {
  it("grades the curated and mechanical slices as gradeEntries does", async ctx => {
    if (skipReason) ctx.skip(skipReason)
    const assets = await loadEvalAssets()
    const fixture = await loadSentenceFixture()
    // Train split only: a failure prints the items.
    const train = fixture.entries.filter(e => e.split === "train")
    for (const entries of [
      train.slice(0, CAP),
      buildMechanical(assets.corpus).slice(0, CAP),
    ]) {
      expectSameGrading(
        entries,
        await embedEntries(entries, assets),
        assets,
        fewTunings,
      )
    }
  }, 180_000)
})
