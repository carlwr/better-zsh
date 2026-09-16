// A set of eval queries with every (query, record) pair's knob-free score
// inputs computed once (`QuerySet`), so re-ranking under another tuning is
// a recombination, not a ranking pass — what makes a sweep of dozens of
// knob points affordable. `gradeQuerySet` reproduces `gradeEntries`: the
// same scoring expression (`scoreOf`), the same sort order, the same
// promote — a test pins the two equal.

import {
  categoryNamed,
  categoryPenalties,
  dot,
  isDiscriminating,
  isSignificant,
  NO_SEMANTIC,
  queryWords,
  recordTerms,
  type ScoreInputs,
  scoreOf,
  symbolExact,
  symbolTokens,
} from "../../src/lib/ranker/rank"
import type { EvalAssets } from "./assets"
import { BETA, type EvalResult, gain } from "./metric"
import {
  embedEntries,
  evalGraded,
  type GradedItem,
  type RankAssets,
} from "./sentence"
import type { SentenceEntry } from "./sentence-fixture"

/** One query's inputs over every record of the index, record-major. */
export interface PairCache {
  /** `queryWords` of the lowercased query. */
  words: string[]
  /** Per record: the structured, body and expanded view dots. */
  semantic: Float64Array
  /** Per record: `categoryNamed`. */
  named: Uint8Array
  /** Per record: `symbolExact`. */
  symbol: Uint8Array
  /** Per record, per word: bit 0 — a substring of the haystack; bit 1 — equal to the id or display. */
  hits: Uint8Array
}

export interface QuerySet {
  entries: readonly SentenceEntry[]
  /** By query string, as the entries name them. */
  cache: ReadonlyMap<string, PairCache>
}

const HIT = 1
const EQUAL = 2

function pairCache(
  query: string,
  vec: Float32Array,
  { index, rules }: RankAssets,
): PairCache {
  const q = query.toLowerCase()
  const words = queryWords(q, rules.stopwords)
  const symbols = symbolTokens(q)
  const n = index.records.length
  const w = words.length
  const semantic = new Float64Array(3 * n)
  const named = new Uint8Array(n)
  const symbol = new Uint8Array(n)
  const hits = new Uint8Array(w * n)
  index.records.forEach((rec, r) => {
    const lex = recordTerms(rec.text)
    semantic[3 * r] = dot(vec, rec.vectors.structured)
    semantic[3 * r + 1] = dot(vec, rec.vectors.body)
    semantic[3 * r + 2] = dot(vec, rec.vectors.expanded)
    named[r] = categoryNamed(lex, q) ? 1 : 0
    symbol[r] = symbolExact(lex, symbols) ? 1 : 0
    words.forEach((word, i) => {
      hits[r * w + i] =
        (lex.haystack.includes(word) ? HIT : 0) |
        (word === lex.id || word === lex.display ? EQUAL : 0)
    })
  })
  return { words, semantic, named, symbol, hits }
}

/** The set over pre-embedded queries; every entry's query must be in `vecs`. */
export function buildQuerySet(
  entries: readonly SentenceEntry[],
  vecs: ReadonlyMap<string, Float32Array>,
  assets: RankAssets,
): QuerySet {
  const cache = new Map<string, PairCache>()
  for (const { query } of entries) {
    if (cache.has(query)) continue
    const vec = vecs.get(query)
    if (!vec) throw new Error("entry query missing from the vector cache")
    cache.set(query, pairCache(query, vec, assets))
  }
  return { entries, cache }
}

/** `buildQuerySet` over freshly embedded queries. */
export async function embedQuerySet(
  entries: readonly SentenceEntry[],
  assets: EvalAssets,
): Promise<QuerySet> {
  return buildQuerySet(entries, await embedEntries(entries, assets), assets)
}

export interface GradeOptions {
  /** Score with every view dot at 0, as zero query vectors would: the boosts and the promote alone. */
  noEmbed?: boolean
}

type RecordRef = { category: string; id: string }
const refKey = (ref: RecordRef): string => `${ref.category}\0${ref.id}`

/** The index's per-record constants of one grading. */
interface Records {
  cats: string[]
  ids: string[]
  penalty: number[]
  bodyWords: number[]
  /** Record index by `refKey`. */
  at: ReadonlyMap<string, number>
}

function recordsOf({ index, rules }: RankAssets): Records {
  const penalties = categoryPenalties(index, rules)
  const texts = index.records.map(r => r.text)
  const cats = texts.map(t => t.category)
  return {
    cats,
    ids: texts.map(t => t.id),
    penalty: cats.map(cat => penalties.get(cat) ?? 0),
    bodyWords: texts.map(t => recordTerms(t).bodyWords),
    at: new Map(texts.map((t, r) => [refKey(t), r])),
  }
}

/** Every record's score for the query, into `scores`. */
function scoreQuery(
  c: PairCache,
  recs: Records,
  rules: RankAssets["rules"],
  noEmbed: boolean,
  scores: Float64Array,
): void {
  const tuning = rules.tuning
  const w = c.words.length
  const significant = c.words.map(word => isSignificant(word, tuning))
  const discriminating = c.words.map(word => isDiscriminating(word, rules))
  for (let r = 0; r < scores.length; r++) {
    let overlap = 0
    let exactWord = c.symbol[r] === 1
    for (let i = 0; i < w; i++) {
      if (!significant[i]) continue
      const h = c.hits[r * w + i] ?? 0
      if (h & HIT) overlap++
      if (h & EQUAL && discriminating[i]) exactWord = true
    }
    const inputs: ScoreInputs = {
      semantic: noEmbed
        ? NO_SEMANTIC
        : {
            structured: c.semantic[3 * r] ?? 0,
            body: c.semantic[3 * r + 1] ?? 0,
            expanded: c.semantic[3 * r + 2] ?? 0,
          },
      categoryNamed: c.named[r] === 1,
      exactWord,
      overlap,
      bodyWords: recs.bodyWords[r] ?? 0,
    }
    scores[r] = scoreOf(inputs, tuning, recs.penalty[r] ?? 0).score
  }
}

/** Record `r`'s slot in `rank`'s order: score descending, then category, then id. */
function position(r: number, scores: Float64Array, recs: Records): number {
  const sr = scores[r] ?? 0
  const cr = recs.cats[r] ?? ""
  const ir = recs.ids[r] ?? ""
  let before = 0
  for (let j = 0; j < scores.length; j++) {
    if (j === r) continue
    const sj = scores[j] ?? 0
    const cj = recs.cats[j] ?? ""
    if (
      sj > sr ||
      (sj === sr && (cj < cr || (cj === cr && (recs.ids[j] ?? "") < ir)))
    )
      before++
  }
  return before
}

/**
 * Rank and grade every entry under `assets.rules.tuning`, as `gradeEntries`
 * does over `rank` — the same items in the same order, the same ranks.
 */
export function gradeQuerySet(
  set: QuerySet,
  assets: RankAssets,
  { noEmbed = false }: GradeOptions = {},
): GradedItem[] {
  const recs = recordsOf(assets)
  const n = recs.cats.length
  const indexOf = (ref: RecordRef): number => recs.at.get(refKey(ref)) ?? -1
  const scores = new Float64Array(n)
  return set.entries.flatMap(entry => {
    const c = set.cache.get(entry.query)
    if (!c) throw new Error("entry query missing from the query set")
    scoreQuery(c, recs, assets.rules, noEmbed, scores)
    // `promoteToTop`: the lookup hit moves to slot 0; the records it passes
    // shift one down. An item the index lacks counts as just past the end.
    const hit = assets.lookup.lookup(entry.query)
    const hitAt = hit ? indexOf(hit) : -1
    const hitPos = hitAt === -1 ? -1 : position(hitAt, scores, recs)
    const rankOf = (r: number): number => {
      if (r === -1) return n + 1
      if (r === hitAt) return 1
      const p = position(r, scores, recs)
      return p + (hitPos > p ? 1 : 0) + 1
    }
    return entry.want.map((item): GradedItem => {
      const rank = rankOf(indexOf(item))
      return { entry, item, rank, gain: gain(rank, item.targetDepth, BETA) }
    })
  })
}

/** The set's eval under `assets`' tuning. */
export const evalQuerySet = (
  set: QuerySet,
  assets: RankAssets,
  opts?: GradeOptions,
): EvalResult =>
  evalGraded(gradeQuerySet(set, assets, opts), set.entries.length)
