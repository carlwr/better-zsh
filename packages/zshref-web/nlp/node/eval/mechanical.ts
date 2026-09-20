// The corpus-derived "mechanical" sentence set (NLP.md §"Eval architecture",
// layer B): every entry is generated from the corpus, so the set is large
// and free, unlike the hand-curated fixture. Two registers:
//
// - terse decorated forms — the lookup contract's decorated phrasings
//   (`option AUTO_CD`, `setopt builtin`, …), reused verbatim;
// - NL-question forms — per-category question templates over each record's
//   display form (`nlQuestions`); `special_param` also gets a `$`-prefixed
//   variant ("what is the $# parameter").
//
// Two diagnostics ride along — reported, never gated, never tuned toward:
// the per-category count of entries whose record did not rank #1, and the
// id-shape slices.

import { isDefined } from "@carlwr/typescript-extra"
import type { DocCorpus } from "@carlwr/zsh-core"
import { type DocCategory, docCategories } from "@carlwr/zsh-core/taxonomy"

import type { RecordId } from "../../core/types"
import { buildLookupContract } from "../contract"
import { identityOf } from "../resolver-key"
import type { EvalAssets } from "./assets"
import { type EvalResult, mean } from "./metric"
import { type HardCheckTemplate, hardCheckTemplates } from "./qa-score"
import {
  countPerCategory,
  embedEntries,
  evalGraded,
  type GradedItem,
  gradeEntries,
  type RankAssets,
} from "./sentence"
import type { SentenceEntry } from "./sentence-fixture"

/** Curated/mechanical blend weight: `total = LAMBDA·curated_train + (1 − LAMBDA)·mechanical`. */
export const LAMBDA = 0.5

/** The blend; one definition for every caller. */
export const combinedTotal = (
  curatedTrain: number,
  mechanicalTotal: number,
): number => LAMBDA * curatedTrain + (1 - LAMBDA) * mechanicalTotal

/** Every item at unit depth and weight, train split: a mechanical entry
 * demands a true top-1 surface and contributes equally. */
export const TARGET_DEPTH = 1

// The QA hard-check questions plus a `$`-prefixed `special_param` form and a
// `zle_widget` form the hard checks lack. The `$NAME` form is what users
// actually type; neither the resolver (it only strips `IDENT[subscript]`)
// nor the lookup map (bare names) reaches it, so unlike a bare form it is
// never hard-promoted — genuine ranker signal for the `$NAME`-in-a-sentence
// path.
const nlQuestionExtras: Partial<Record<DocCategory, HardCheckTemplate>> = {
  special_param: d => `what is the $${d} parameter`,
  zle_widget: d => `what does the ${d} widget do`,
}

/** The NL questions over a record's display form; none for a category outside the templated ones. */
export function nlQuestions(category: DocCategory, display: string): string[] {
  return [hardCheckTemplates[category], nlQuestionExtras[category]]
    .filter(isDefined)
    .map(t => t(display))
}

const mechanicalEntry = (query: string, record: RecordId): SentenceEntry => ({
  query,
  want: [{ ...record, targetDepth: TARGET_DEPTH, weight: 1 }],
  split: "train",
})

/**
 * The full mechanical set: the contract's decorated phrasings in contract
 * order, each wanting the record it was generated from (not the contract's
 * OR-set), then the NL questions per record in corpus order.
 */
export function buildMechanical(corpus: DocCorpus): SentenceEntry[] {
  const decorated = buildLookupContract(corpus)
    .entries.filter(e => e.phrasingKind !== "bare")
    .map(e => mechanicalEntry(e.query, e.record))
  const questions = docCategories.flatMap(cat =>
    [...corpus[cat].values()].flatMap(rec => {
      const record = identityOf(cat, rec)
      if (record.id === "") return []
      return nlQuestions(cat, rec.display).map(q => mechanicalEntry(q, record))
    }),
  )
  return [...decorated, ...questions]
}

export interface Slice {
  label: string
  pred: (id: string) => boolean
}

/** Unicode alphanumeric: the `Alphabetic` property or a number category. */
const isAlphanumeric = (c: string): boolean => /[\p{Alphabetic}\p{N}]/u.test(c)
const idLength = (n: number): Slice => ({
  label: `id length ${n}`,
  pred: id => [...id].length === n,
})

/**
 * Cross-cutting "hard slice" buckets over the expected record's id, cutting
 * across categories: short and punctuation-only ids are where embedding
 * retrieval is weakest, yet they hide inside the category means. Lengths
 * count code points. Slices overlap by design (a 1-char punctuation id lands
 * in both `id length 1` and `punctuation-only`).
 */
export const SLICES: readonly Slice[] = [
  ...[1, 2, 3, 4].map(idLength),
  {
    label: "punctuation-only",
    pred: id => id !== "" && [...id].every(c => !isAlphanumeric(c)),
  },
]

/** One slice's stats. `meanGain` is a flat per-item mean (a slice is a
 * property, not a category); `fails` counts items not ranked #1. */
export interface SliceStat {
  label: string
  n: number
  fails: number
  meanGain: number
}

export interface MechanicalEval extends EvalResult {
  /** Per category: entries whose record did not rank #1. Reported, never gated. */
  violations: Map<string, number>
  slices: SliceStat[]
}

const notTop1 = (g: GradedItem): boolean => g.rank !== 1

function sliceStats(graded: readonly GradedItem[]): SliceStat[] {
  return SLICES.map(({ label, pred }) => {
    const members = graded.filter(g => pred(g.item.id))
    return {
      label,
      n: members.length,
      fails: members.filter(notTop1).length,
      meanGain: mean(members.map(g => g.gain)),
    }
  })
}

/** The mechanical eval of already-graded items from `nEntries` entries. */
export function evalMechanicalGraded(
  graded: readonly GradedItem[],
  nEntries: number,
): MechanicalEval {
  return {
    ...evalGraded(graded, nEntries),
    violations: countPerCategory(graded.filter(notTop1)),
    slices: sliceStats(graded),
  }
}

/** Rank and grade the pre-built entries against an embedded query cache, plus the diagnostics. */
export function evalMechanicalCached(
  entries: readonly SentenceEntry[],
  vecs: ReadonlyMap<string, Float32Array>,
  assets: RankAssets,
): MechanicalEval {
  return evalMechanicalGraded(
    gradeEntries(entries, vecs, assets),
    entries.length,
  )
}

/** `evalMechanicalCached` over freshly embedded queries. */
export async function evalMechanical(
  entries: readonly SentenceEntry[],
  assets: EvalAssets,
): Promise<MechanicalEval> {
  return evalMechanicalCached(
    entries,
    await embedEntries(entries, assets),
    assets,
  )
}

/** The component report: the total and, per category, the score with its
 * item count and #1-violation count. */
export function renderMechanical(r: MechanicalEval): string {
  const head = `[mechanical] total=${r.all.total.toFixed(3)}  (${r.nEntries} entries)\n`
  const rows = [...r.all.perCategory].map(
    ([cat, s]) =>
      `  ${cat.padEnd(20)} ${s.toFixed(3)}  (n=${r.perCategoryN.get(cat) ?? 0}, #1-violations=${r.violations.get(cat) ?? 0})\n`,
  )
  return head + rows.join("")
}

/** The blend line, after `renderMechanical` in the report. */
export const renderCombined = (
  curatedTrain: number,
  mechanicalTotal: number,
): string =>
  `[combined] curated_train=${curatedTrain.toFixed(3)}  mechanical=${mechanicalTotal.toFixed(3)}  λ=${LAMBDA}  total=${combinedTotal(curatedTrain, mechanicalTotal).toFixed(3)}\n`
