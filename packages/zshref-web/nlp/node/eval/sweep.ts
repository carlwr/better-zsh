// One-knob-at-a-time rank-time tuning sweep, and the `BZ_TUNE_BASE`
// override syntax it shares with the dashboard and the diff. Rank-time
// knobs never re-embed, so the curated and mechanical queries are embedded
// and their score inputs cached once (`loadBench`), then regraded per
// variant. The objective is the dashboard's combined blend; `holdout` is
// printed as the overfit watch, never optimized. The greedy loop: sweep,
// fold the best row into `BZ_TUNE_BASE`, repeat (one knob at a time misses
// interactions).

import { trim } from "@carlwr/typescript-extra"

import type { Tuning } from "../../core/rules"
import type { EvalAssets } from "./assets"
import { type ItemRes, itemsOf, renderDiffReport, signed } from "./diff"
import {
  buildMechanical,
  combinedTotal,
  evalMechanicalGraded,
} from "./mechanical"
import {
  embedQuerySet,
  evalQuerySet,
  gradeQuerySet,
  type QuerySet,
} from "./query-set"
import { loadSentenceFixture } from "./sentence-fixture"
import { withTuning } from "./tune"

type KnobKind = "float" | "int"

/** The keys of `S` holding a number. */
type NumberKey<S> = { [K in keyof S]: S[K] extends number ? K : never }[keyof S]

interface Knob {
  kind: KnobKind
  /** The sweep's points, each replacing the base value. */
  points: readonly number[]
  get: (t: Tuning) => number
  /** Sets the knob on a private copy of the tuning. */
  set: (t: Tuning, v: number) => void
}

/** A knob is one numeric `field` of a `section` of the tuning: `get` and `set` share the address. */
const knob = <S extends object>(
  kind: KnobKind,
  points: readonly number[],
  section: (t: Tuning) => S,
  field: NumberKey<S>,
): Knob => ({
  kind,
  points,
  get: t => section(t)[field] as number,
  set: (t, v) => {
    section(t)[field] = v as S[NumberKey<S>]
  },
})
const range = (lo: number, hi: number): number[] =>
  Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)

const sw = (t: Tuning) => t.semantic_weights
const boosts = (t: Tuning) => t.boosts

/** The rank-time knobs by `BZ_TUNE_BASE` key, in sweep order; each names one `tuning.yaml` field. */
export const KNOBS = {
  body: knob("float", [0.55, 0.6, 0.65, 0.7, 0.75, 0.8], sw, "body"),
  structured: knob(
    "float",
    [0.05, 0.1, 0.15, 0.2, 0.25, 0.3],
    sw,
    "structured",
  ),
  sb_strength: knob(
    "float",
    [0, 0.06, 0.12, 0.18, 0.24, 0.3],
    t => sw(t).short_body,
    "strength",
  ),
  sb_length: knob(
    "float",
    [8, 16, 24, 32, 48, 64],
    t => sw(t).short_body,
    "length_scale",
  ),
  cat: knob("float", [0, 0.01, 0.02, 0.04, 0.06, 0.1], boosts, "category"),
  exact_inc: knob(
    "float",
    [0, 0.02, 0.04, 0.06, 0.08, 0.12],
    boosts,
    "exact_word_increment",
  ),
  wo_scale: knob(
    "float",
    [0.1, 0.2, 0.3, 0.4, 0.5],
    t => boosts(t).word_overlap,
    "scale",
  ),
  wo_halfsat: knob(
    "float",
    [1, 2, 4, 6, 10, 16],
    t => boosts(t).word_overlap,
    "half_sat",
  ),
  rarity: knob(
    "float",
    [0, 0.01, 0.03, 0.06, 0.1, 0.16],
    t => t.penalties,
    "category_rarity_max",
  ),
  disc_len: knob(
    "int",
    range(2, 6),
    t => t.lexical,
    "min_discriminating_word_len",
  ),
  sig_len: knob("int", range(1, 4), t => t.lexical, "min_significant_word_len"),
} satisfies Record<string, Knob>
export type KnobKey = keyof typeof KNOBS
export const KNOB_KEYS = Object.keys(KNOBS) as KnobKey[]

const isKnobKey = (s: string): s is KnobKey => Object.hasOwn(KNOBS, s)

/** The point label: 3 decimals for a float knob, the integer for an int one. */
export const knobLabel = (kind: KnobKind, v: number): string =>
  kind === "float" ? v.toFixed(3) : String(v)

const FLOAT_LITERAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const INT_LITERAL = /^\+?\d+$/

function parseKnobValue(key: KnobKey, kind: KnobKind, raw: string): number {
  const ok = (kind === "float" ? FLOAT_LITERAL : INT_LITERAL).test(raw)
  if (!ok)
    throw new Error(
      `BZ_TUNE_BASE ${key}: ${JSON.stringify(raw)} is not a valid ${kind}`,
    )
  return Number(raw)
}

/** `tuning` with one knob at `v`; the range checks of loading do not apply. */
export function withKnob(tuning: Tuning, key: KnobKey, v: number): Tuning {
  const t = structuredClone(tuning)
  KNOBS[key].set(t, v)
  return t
}

/** One `key=value` override; an unknown key or a malformed value throws, so a typo fails loudly. */
export function applyOverride(
  tuning: Tuning,
  key: string,
  value: string,
): Tuning {
  if (!isKnobKey(key))
    throw new Error(`unknown BZ_TUNE_BASE key: ${JSON.stringify(key)}`)
  return withKnob(tuning, key, parseKnobValue(key, KNOBS[key].kind, value))
}

/**
 * The committed tuning with a `BZ_TUNE_BASE` spec folded in: comma-separated
 * `key=value` pairs, whitespace around either ignored, empty pairs skipped.
 * One definition, so a candidate reads the same in every tool.
 */
export function composedBase(
  committed: Tuning,
  spec: string | undefined,
): Tuning {
  return (spec ?? "")
    .split(",")
    .map(trim)
    .filter(kv => kv !== "")
    .reduce((t, kv) => {
      const at = kv.indexOf("=")
      if (at === -1)
        throw new Error(
          `BZ_TUNE_BASE entries are key=value, got ${JSON.stringify(kv)}`,
        )
      return applyOverride(t, kv.slice(0, at).trim(), kv.slice(at + 1).trim())
    }, committed)
}

// --- the bench -----------------------------------------------------------------

/** One variant's scores; `combined` is the optimization target. */
export interface Scores {
  train: number
  holdout: number
  mechanical: number
  combined: number
}

/** Assets plus both query sets, embedded and cached once for every variant. */
export interface Bench {
  assets: EvalAssets
  curated: QuerySet
  mechanical: QuerySet
}

/**
 * Embed and cache the curated and the mechanical queries; `progress` gets
 * the one note before the (slow) mechanical embed. `cap` cuts each set to
 * its first entries — the reporter smoke's tier, as `DashboardOptions.cap`.
 */
export async function loadBench(
  assets: EvalAssets,
  progress: (line: string) => void = () => {},
  cap?: number,
): Promise<Bench> {
  const fixture = await loadSentenceFixture()
  const curatedEntries = fixture.entries.slice(0, cap)
  const mechEntries = buildMechanical(assets.corpus).slice(0, cap)
  progress(
    `embedding ${curatedEntries.length} curated + ${mechEntries.length} mechanical queries once…`,
  )
  const curated = await embedQuerySet(curatedEntries, assets)
  const mechanical = await embedQuerySet(mechEntries, assets)
  return { assets, curated, mechanical }
}

export function scoreBench(bench: Bench, tuning: Tuning): Scores {
  const assets = withTuning(bench.assets, tuning)
  const c = evalQuerySet(bench.curated, assets)
  const m = evalMechanicalGraded(
    gradeQuerySet(bench.mechanical, assets),
    bench.mechanical.entries.length,
  )
  return {
    train: c.train.total,
    holdout: c.holdout.total,
    mechanical: m.all.total,
    combined: combinedTotal(c.train.total, m.all.total),
  }
}

// --- the sweep -----------------------------------------------------------------

export interface SweepRow {
  label: string
  scores: Scores
}

export interface KnobSweep {
  knob: KnobKey
  rows: SweepRow[]
}

export interface Sweep {
  base: Scores
  knobs: KnobSweep[]
}

/** One knob: the base with each point in turn. */
export function sweepKnob(bench: Bench, base: Tuning, key: KnobKey): KnobSweep {
  const { kind, points } = KNOBS[key]
  return {
    knob: key,
    rows: points.map(v => ({
      label: knobLabel(kind, v),
      scores: scoreBench(bench, withKnob(base, key, v)),
    })),
  }
}

/** Every knob around `base`. The reporter runs the same loop block by block, printing as it goes. */
export const runSweep = (bench: Bench, base: Tuning): Sweep => ({
  base: scoreBench(bench, base),
  knobs: KNOB_KEYS.map(key => sweepKnob(bench, base, key)),
})

/** A row whose combined is within this of the base's is the base row. */
const BASE_EPS = 1e-6

/**
 * Per row: ` ◄ best` on the highest combined (the last one on a tie), else
 * ` (base)` where the combined equals the base's, else nothing.
 */
export function sweepMarks(
  combined: readonly number[],
  baseCombined: number,
): string[] {
  const best = combined.reduce(
    (bi, c, i) => (c >= (combined[bi] ?? Number.NEGATIVE_INFINITY) ? i : bi),
    -1,
  )
  return combined.map((c, i) =>
    i === best
      ? " ◄ best"
      : Math.abs(c - baseCombined) < BASE_EPS
        ? " (base)"
        : "",
  )
}

const fixed4 = (x: number): string => x.toFixed(4)

export const renderSweepHeader = (base: Scores, spec: string): string =>
  `\n=== tuning sweep (one knob at a time) ===\nbase: combined=${fixed4(base.combined)}  train=${fixed4(base.train)}  holdout=${fixed4(base.holdout)}  mechanical=${fixed4(base.mechanical)}  (BZ_TUNE_BASE=${JSON.stringify(spec)})\n`

export function renderKnobBlock(
  { knob, rows }: KnobSweep,
  baseCombined: number,
): string {
  const marks = sweepMarks(
    rows.map(r => r.scores.combined),
    baseCombined,
  )
  const lines = rows.map(({ label, scores: s }, i) => {
    const delta = s.combined - baseCombined
    return `  ${label.padEnd(10)} comb=${fixed4(s.combined)} Δ=${signed(delta, 4)}  train=${fixed4(s.train)} hold=${fixed4(s.holdout)} mech=${fixed4(s.mechanical)}${marks[i] ?? ""}`
  })
  return `\n── ${knob} ───────────────────  (base combined=${fixed4(baseCombined)})\n${lines.join("\n")}\n`
}

export const SWEEP_FOOTER = "\n=== end sweep ===\n"

/** The whole report, as the reporter prints it block by block. */
export function renderSweep(sweep: Sweep, spec: string): string {
  return (
    renderSweepHeader(sweep.base, spec) +
    sweep.knobs.map(k => renderKnobBlock(k, sweep.base.combined)).join("") +
    SWEEP_FOOTER
  )
}

// --- the diff ------------------------------------------------------------------

/** Both sets under `tuning`, over the bench's caches. */
export const benchItems = (
  bench: Bench,
  tuning: Tuning,
): { curated: ItemRes[]; mechanical: ItemRes[] } => {
  const assets = withTuning(bench.assets, tuning)
  return {
    curated: itemsOf(gradeQuerySet(bench.curated, assets)),
    mechanical: itemsOf(gradeQuerySet(bench.mechanical, assets)),
  }
}

/**
 * Item-level diff of `cand` against `base`: which items change rank and how
 * each move feeds the aggregate — a sweep delta is trustworthy once the
 * items behind it can be named. Curated movers are the train split only;
 * the mechanical set is all train.
 */
export function renderTuneDiff(
  bench: Bench,
  base: Tuning,
  cand: Tuning,
  spec: string,
): string {
  const b = benchItems(bench, base)
  const c = benchItems(bench, cand)
  return (
    `\n=== tune diff: base vs candidate ===\ncandidate BZ_TUNE_BASE=${JSON.stringify(spec)}\n` +
    renderDiffReport("curated train", b.curated, c.curated, true) +
    renderDiffReport("mechanical", b.mechanical, c.mechanical, false)
  )
}
