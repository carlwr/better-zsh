// The tuning dashboard: every rank-time signal the manual tuning loop
// watches, in one report (`Dashboard`); holdout and QA are overfit watches.
// Every number comes from the same metric the evals use, over the cached
// grading a test pins to the reference (`query-set.ts`); the QA row too is
// computed in-process (`qa-score.ts`), over the dashboard's own
// tuning.
//
// Tiers: `fast` skips the mechanical layer and the QA (both embed thousands
// of queries) and renders their rows as skipped; `cap` keeps every layer but
// cuts each input to its first entries, so the reporter smoke runs the whole
// path in seconds.

import type { Tuning } from "../../core/rules"
import { byteOrder } from "../../core/text"
import { type BareEval, buildLookupContract, evalBare } from "../contract"
import {
  buildSanityFixture,
  renderSanity,
  type SanityFixture,
} from "../fixtures"
import type { EvalAssets } from "./assets"
import { boxTable, label, num } from "./box-table"
import { type Churn, churn, itemsOf, signed } from "./diff"
import {
  buildMechanical,
  combinedTotal,
  evalMechanicalGraded,
  LAMBDA,
  type MechanicalEval,
  type SliceStat,
} from "./mechanical"
import type { EvalResult } from "./metric"
import { loadQaCorpus } from "./qa-corpus"
import {
  hardChecks,
  type QaSummary,
  scoreHardChecks,
  scoreQaCorpus,
  summaryJson,
} from "./qa-score"
import {
  embedQuerySet,
  evalQuerySet,
  gradeQuerySet,
  type QuerySet,
} from "./query-set"
import type { RankAssets } from "./sentence"
import { loadSentenceFixture } from "./sentence-fixture"

/** `assets` ranking with `tuning` in place of the loaded one. */
export const withTuning = <A extends RankAssets>(
  assets: A,
  tuning: Tuning,
): A => ({
  ...assets,
  rules: { ...assets.rules, tuning },
})

/**
 * The tuning with every lexical-boost term and the rarity penalty zeroed,
 * leaving the semantic channel (and the promote) alone. Bypasses the
 * load-time range checks, as the sweep's overrides do.
 */
export function zeroBoosts(t: Tuning): Tuning {
  return {
    ...t,
    boosts: {
      ...t.boosts,
      category: 0,
      exact_word_increment: 0,
      word_overlap: { ...t.boosts.word_overlap, scale: 0 },
    },
    penalties: { ...t.penalties, category_rarity_max: 0 },
  }
}

/** A metric under the live tuning, with the embedder off, with the boosts off. */
export type Ablation = [full: number, noEmbed: number, noBoost: number]

/** Embedder-vs-boosts decomposition; the lookup-map promote stays on in every column. */
export interface Components {
  train: Ablation
  holdout: Ablation
  /** Null in the fast tier. */
  mech: Ablation | null
}

export interface Dashboard {
  /** The curated eval; its `train` total is one half of the combined blend. */
  sentence: EvalResult
  sanity: SanityFixture
  bare: BareEval
  /** Null in the fast tier. */
  mechanical: MechanicalEval | null
  /** Null in the fast tier. */
  qa: QaSummary | null
  components: Components
  /** Churn of the candidate vs the committed tuning; null without a candidate. Mechanical: full tier only. */
  churn: { curated: Churn; mechanical: Churn | null } | null
}

export interface DashboardOptions {
  /** `tuning` is a candidate (the committed one with overrides): diff it against `assets.rules.tuning`. */
  candidate: boolean
  /** Skip the mechanical layer and the QA. */
  fast?: boolean
  /**
   * Smoke tier: every eval input cut to its first `cap` entries — the
   * curated fixture, the mechanical set, the hard checks, the QA corpus.
   * The report then has the dashboard's shape and none of its meaning.
   */
  cap?: number
}

/** The full tier's extra signals: the mechanical layer, its ablation and churn, and the QA. */
interface FullTier {
  mechanical: MechanicalEval
  mech: Ablation
  churn: Churn | null
  qa: QaSummary
}

/** The tunings a set is graded under. */
interface Tunings {
  /** The committed tuning: the churn baseline. */
  committed: EvalAssets
  live: EvalAssets
  noBoosts: EvalAssets
}

/** A set's eval under the live tuning and its two ablations. */
interface Gradings {
  live: EvalResult
  noEmbed: EvalResult
  noBoosts: EvalResult
}

const gradings = (
  set: QuerySet,
  t: Tunings,
  live: EvalResult = evalQuerySet(set, t.live),
): Gradings => ({
  live,
  noEmbed: evalQuerySet(set, t.live, { noEmbed: true }),
  noBoosts: evalQuerySet(set, t.noBoosts),
})

const ablation = (g: Gradings, total: (r: EvalResult) => number): Ablation => [
  total(g.live),
  total(g.noEmbed),
  total(g.noBoosts),
]

/** Churn of the live tuning against the committed one over `set`. */
const churnOf = (set: QuerySet, t: Tunings, trainOnly: boolean): Churn =>
  churn(
    itemsOf(gradeQuerySet(set, t.committed)),
    itemsOf(gradeQuerySet(set, t.live)),
    trainOnly,
  )

async function fullTier(
  t: Tunings,
  { candidate, cap }: DashboardOptions,
): Promise<FullTier> {
  const { committed, live } = t
  // `slice(0, undefined)` is the whole array: no cap, no cut.
  const set = await embedQuerySet(
    buildMechanical(committed.corpus).slice(0, cap),
    committed,
  )
  const qa = await loadQaCorpus()
  const mechanical = evalMechanicalGraded(
    gradeQuerySet(set, live),
    set.entries.length,
  )
  return {
    mechanical,
    mech: ablation(gradings(set, t, mechanical), r => r.all.total),
    churn: candidate ? churnOf(set, t, false) : null,
    qa: summaryJson(
      await scoreHardChecks(hardChecks(committed.corpus).slice(0, cap), live),
      await scoreQaCorpus({ ...qa, entries: qa.entries.slice(0, cap) }, live),
    ),
  }
}

/**
 * Every dashboard signal for `tuning`. The curated and (full tier) the
 * mechanical queries are embedded and cached once, then graded under the
 * live tuning and its two ablations; the sanity fixture is rebuilt fresh.
 * `assets` carries the committed tuning, the churn baseline.
 */
export async function buildDashboard(
  assets: EvalAssets,
  tuning: Tuning,
  opts: DashboardOptions,
): Promise<Dashboard> {
  const { candidate, fast = false, cap } = opts
  const live = withTuning(assets, tuning)
  const t: Tunings = {
    committed: assets,
    live,
    noBoosts: withTuning(assets, zeroBoosts(tuning)),
  }

  const fixture = await loadSentenceFixture()
  const curated = await embedQuerySet(fixture.entries.slice(0, cap), assets)
  const cur = gradings(curated, t)
  const curatedChurn = candidate ? churnOf(curated, t, true) : null
  const sanity = await buildSanityFixture(live)
  const bare = evalBare(buildLookupContract(assets.corpus), assets.lookup)
  const full = fast ? null : await fullTier(t, opts)

  return {
    sentence: cur.live,
    sanity,
    bare,
    mechanical: full?.mechanical ?? null,
    qa: full?.qa ?? null,
    components: {
      train: ablation(cur, r => r.train.total),
      holdout: ablation(cur, r => r.holdout.total),
      mech: full?.mech ?? null,
    },
    churn: curatedChurn
      ? { curated: curatedChurn, mechanical: full?.churn ?? null }
      : null,
  }
}

// --- rendering --------------------------------------------------------------

const FAST_HINT = "(--fast; run `pnpm nlp:tune-dashboard` without it)"

export function renderDashboard(d: Dashboard): string {
  const s = d.sentence
  const m = d.mechanical
  const train = s.train.total
  const lines = [
    "\n=== nlp tuning dashboard ===",
    `[sentence]  all=${s.all.total.toFixed(3)}  train=${s.train.total.toFixed(3)}  holdout=${s.holdout.total.toFixed(3)}  (${s.nEntries} entries)`,
    renderSanity(d.sanity).trimEnd(),
    `[contract] ${d.bare.bareTotal} bare entries, ${d.bare.failures.length} failures`,
    ...(m
      ? [
          `[mechanical] ${m.all.total.toFixed(3)}  (${m.nEntries} entries)`,
          `[combined]  λ·train + (1−λ)·mech = ${LAMBDA.toFixed(3)}·${train.toFixed(3)} + ${(1 - LAMBDA).toFixed(3)}·${m.all.total.toFixed(3)} = ${combinedTotal(train, m.all.total).toFixed(3)}`,
        ]
      : [`[mechanical] skipped ${FAST_HINT}`]),
    "  holdout = overfit watch; never tune on it.",
    churnBlock(d.churn),
    renderComponents(d.components),
    "\nper category — curated split vs mechanical:",
    "  mech=mechanical  fix=cur.train  hold=cur.holdout  all=cur.both",
    perCategoryTable(s, m).trimEnd(),
    ...(m
      ? [
          "\nhard slices (mechanical; fail = expected record not #1):",
          "  cross-cutting & overlapping (a 1-char punct id is in both)",
          sliceTable(m.slices).trimEnd(),
        ]
      : ["\nhard slices: skipped (--fast)"]),
    d.qa
      ? `[qa] avg ${d.qa.avgPercent.toFixed(1)}%, hard-check score ${d.qa.hardPercent.toFixed(1)}% (held-out — never tune on this)`
      : `[qa] skipped ${FAST_HINT}`,
  ]
  return `${lines.join("\n")}\n`
}

/**
 * Gross churn of the candidate vs the committed tuning — the signal the
 * headline scores cannot carry: a candidate that flips 100 items and nets
 * +0.005 is churning, not improving.
 */
function churnBlock(c: Dashboard["churn"]): string {
  if (!c)
    return "\nchurn vs committed baseline: no candidate (set BZ_TUNE_BASE=<overrides> to diff)"
  const row = (name: string, x: Churn): string =>
    `  ${name.padEnd(13)}${String(x.moved).padStart(4)} moved │ ${String(x.up).padStart(3)} fail→pass ${String(x.down).padStart(3)} pass→fail │ Σgain Δ ${signed(x.netGain, 3)} (net)`
  return [
    "\nchurn vs committed baseline (gross counts — a small score Δ hides large churn):",
    row("curated train", c.curated),
    c.mechanical
      ? row("mechanical", c.mechanical)
      : "  mechanical   skipped (--fast)",
  ].join("\n")
}

function renderComponents({ train, holdout, mech }: Components): string {
  const row = (name: string, v: Ablation): string =>
    `  ${name.padEnd(11)}${v.map(x => x.toFixed(3).padStart(8)).join("")}`
  return [
    "\ncomponent decomposition (lookup-map ON in all rows):",
    "  −embed = embedder off (boosts only); −boost = boosts off (embedder only)",
    `  ${"".padEnd(11)}${["full", "−embed", "−boost"].map(h => h.padStart(8)).join("")}`,
    row("cur.train", train),
    row("cur.hold", holdout),
    mech ? row("mechanical", mech) : "  mechanical  skipped (--fast)",
  ].join("\n")
}

/**
 * One row per category (curated ∪ mechanical): the mechanical score beside
 * the curated split scores, then the item counts. `—` = no votes in that
 * source; `·` = the mechanical column in the fast tier.
 */
function perCategoryTable(s: EvalResult, m: MechanicalEval | null): string {
  const cats = [
    ...new Set([
      ...s.all.perCategory.keys(),
      ...(m?.all.perCategory.keys() ?? []),
    ]),
  ].sort(byteOrder)
  const score = (x: ReadonlyMap<string, number>, c: string): string => {
    const v = x.get(c)
    return v === undefined ? "—" : v.toFixed(3)
  }
  const count = (x: ReadonlyMap<string, number>, c: string): string =>
    String(x.get(c) ?? "—")
  const rows = cats.map(c => [
    c,
    m ? score(m.all.perCategory, c) : "·",
    score(s.train.perCategory, c),
    score(s.holdout.perCategory, c),
    score(s.all.perCategory, c),
    m ? count(m.perCategoryN, c) : "·",
    count(s.perCategoryN, c),
  ])
  return boxTable(
    [
      label("category"),
      ...["mech", "fix", "hold", "all", "n:mec", "n:cur"].map(num),
    ],
    rows,
  )
}

const sliceTable = (slices: readonly SliceStat[]): string =>
  boxTable(
    [label("id slice"), num("score"), num("fail/total")],
    slices.map(x => [x.label, x.meanGain.toFixed(3), `${x.fails}/${x.n}`]),
  )
