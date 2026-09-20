// QA scoring over the Node search runner: the hard checks (templated
// self-retrieval per record of a few categories, limit 1, category-weighted
// pass rate) and the scored entries of the held-out corpus (weighted
// expected sets, negatives as penalties). The report is the hard-check
// section and the summary lines; there is no per-entry section — the corpus
// is a held-out set (NLP.md) — and a warning (an expected item's absence or
// a negative's presence) is counted, never printed with its query.

import type { DocCategory, DocCorpus } from "@carlwr/zsh-core"
import { byteOrder } from "../../core/text"
import { type RecordId, recordKey, sameRecord } from "../../core/types"
import { identityOf } from "../resolver-key"
import { searchNode } from "../search-node"
import type { EvalAssets } from "./assets"
import { mean } from "./metric"
import type { QaCorpus, QaEntry } from "./qa-corpus"

export type HardCheckTemplate = (display: string) => string

// The templated categories, in report order. A templated
// question uses the record's display form (what a user types: AUTO_CD, not
// autocd) and the canonical category word, so the check tests category+id
// retrieval, not phrasing. Left out: the sig/template categories (a bare
// `>` or `${` question is meaningless) and the large, uncommon zle_widget set
// (would dominate the totals). The mechanical eval's NL questions are these
// plus a `$` variant and zle_widget.
export const hardCheckTemplates: Partial<
  Record<DocCategory, HardCheckTemplate>
> = {
  builtin: d => `what does the ${d} builtin do`,
  special_param: d => `what is the ${d} parameter`,
  option: d => `what does the ${d} option do`,
  reserved_word: d => `what does the ${d} reserved word do`,
  mathfunc: d => `what does the ${d} math function do`,
  comp_utility: d => `what does the ${d} completion function do`,
}

/** The table's categories in its order. Invariant: the literal's keys are `DocCategory` by its type. */
export const hardCheckCategories = (): DocCategory[] =>
  Object.keys(hardCheckTemplates) as DocCategory[]

export interface HardCheck extends RecordId {
  category: DocCategory
  query: string
}

/** One check per record of a templated category, corpus order within, table order across. */
export function hardChecks(corpus: DocCorpus): HardCheck[] {
  return hardCheckCategories().flatMap(category => {
    const template = hardCheckTemplates[category]
    if (template === undefined) return []
    return [...corpus[category].values()].map(rec => ({
      category,
      id: identityOf(category, rec).id,
      query: template(rec.display),
    }))
  })
}

export interface CatStat {
  passed: number
  total: number
}

export interface HardCheckResult {
  perCat: Partial<Record<DocCategory, CatStat>>
  /** The FAIL lines, in check order; corpus-derived, printable. */
  details: string[]
  passed: number
  total: number
  /** Mean over categories of their pass rate in percent; 0 without checks. */
  hardScore: number
}

/** Per-category pass rates, sorted by category. */
export function hardCheckRates(
  perCat: HardCheckResult["perCat"],
): { category: string; pct: number; passed: number; total: number }[] {
  return Object.entries(perCat)
    .sort(([a], [b]) => byteOrder(a, b))
    .map(([category, { passed, total }]) => ({
      category,
      pct: total ? (passed / total) * 100 : 0,
      passed,
      total,
    }))
}

/** Run `checks` (limit 1 each): a pass is the record itself at #1. */
export async function scoreHardChecks(
  checks: readonly HardCheck[],
  assets: EvalAssets,
): Promise<HardCheckResult> {
  const perCat: HardCheckResult["perCat"] = {}
  const details: string[] = []
  for (const check of checks) {
    const top = (await searchNode({ query: check.query, limit: 1 }, assets))
      .matches[0]?.rec
    const pc = perCat[check.category] ?? { passed: 0, total: 0 }
    perCat[check.category] = pc
    pc.total++
    if (top && sameRecord(top, check)) pc.passed++
    else
      details.push(
        `  FAIL: "${check.query}" → got ${top ? recordKey(top) : "(no results)"}, expected ${recordKey(check)}`,
      )
  }
  const rates = hardCheckRates(perCat)
  return {
    perCat,
    details,
    passed: rates.reduce((a, r) => a + r.passed, 0),
    total: checks.length,
    hardScore: mean(rates.map(r => r.pct)),
  }
}

export const runHardChecks = (assets: EvalAssets): Promise<HardCheckResult> =>
  scoreHardChecks(hardChecks(assets.corpus), assets)

export interface EntryScore {
  score: number
  expectedWeight: number
  /** Distinct positive expected items found. */
  matched: number
  /** A negative item present, or a positive one absent. */
  warnings: number
}

/**
 * Score one entry against the matches its search returned (at most
 * `limit`): over the first `topN`, a negative item earns its magnitude when
 * absent and its (negative) score when present; a positive one its score
 * when present, once per record — a duplicate expected item scores nothing
 * more but still adds to the expected weight, as every item does.
 */
export function scoreEntry(
  entry: QaEntry,
  matches: readonly RecordId[],
): EntryScore {
  const topN = entry.topN ?? entry.limit
  const weight = entry.weight
  const scorable = matches.slice(0, topN)
  const seen = new Set<string>()
  let score = 0
  let expectedWeight = 0
  let warnings = 0
  for (const exp of entry.expected) {
    const key = recordKey(exp)
    const present = scorable.some(m => sameRecord(m, exp))
    const absW = Math.abs(exp.score) * weight
    expectedWeight += absW
    if (exp.score < 0) {
      if (present) {
        score += exp.score * weight
        warnings++
      } else {
        score += absW
      }
      continue
    }
    if (!present) {
      warnings++
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    score += exp.score * weight
  }
  return { score, expectedWeight, matched: seen.size, warnings }
}

export interface QaScore {
  /** Weighted score over weighted expected weight; 0 when nothing was expected. */
  avgScore: number
  totalWeightedScore: number
  totalExpectedWeight: number
  entries: number
  warnings: number
}

export function aggregateScores(scores: readonly EntryScore[]): QaScore {
  const totalWeightedScore = scores.reduce((a, s) => a + s.score, 0)
  const totalExpectedWeight = scores.reduce((a, s) => a + s.expectedWeight, 0)
  return {
    avgScore:
      totalExpectedWeight > 0 ? totalWeightedScore / totalExpectedWeight : 0,
    totalWeightedScore,
    totalExpectedWeight,
    entries: scores.length,
    warnings: scores.reduce((a, s) => a + s.warnings, 0),
  }
}

/** One search per entry: its `limit`, and `category` when set. */
export async function scoreQaCorpus(
  corpus: QaCorpus,
  assets: EvalAssets,
): Promise<QaScore> {
  const scores: EntryScore[] = []
  for (const entry of corpus.entries) {
    const input = {
      query: entry.query,
      limit: entry.limit,
      ...(entry.category ? { category: entry.category } : {}),
    }
    const r = await searchNode(input, assets)
    scores.push(
      scoreEntry(
        entry,
        r.matches.map(m => m.rec),
      ),
    )
  }
  return aggregateScores(scores)
}

export interface QaSummary {
  avgPercent: number
  hardPercent: number
}

/** The report's machine-readable summary (`SUMMARY_JSON`); the dashboard's QA row. */
export function summaryJson(hard: HardCheckResult, scored: QaScore): QaSummary {
  return {
    avgPercent: +(scored.avgScore * 100).toFixed(1),
    hardPercent: +hard.hardScore.toFixed(1),
  }
}

/** The report: hard checks, then the summary; no per-entry section (NLP.md). */
export function renderQa(hard: HardCheckResult, scored: QaScore): string {
  const lines = [
    "=== Hard checks (per-category self-retrieval) ===",
    ...hard.details,
    "",
    ...hardCheckRates(hard.perCat).map(
      r =>
        `  ${`${r.pct.toFixed(1)}%`.padStart(6)}  ${r.category} (${r.passed}/${r.total})`,
    ),
    "",
    `Hard-check score (category-weighted): ${hard.hardScore.toFixed(1)}%  (${hard.passed}/${hard.total} raw)`,
    "",
    `Average score: ${(scored.avgScore * 100).toFixed(1)}%  (${scored.totalWeightedScore.toFixed(2)} / ${scored.totalExpectedWeight.toFixed(2)})`,
    `Entries: ${scored.entries}`,
    `Warnings: ${scored.warnings}`,
    `Hard-check score (category-weighted): ${hard.hardScore.toFixed(1)}%`,
    `SUMMARY_JSON ${JSON.stringify(summaryJson(hard, scored))}`,
  ]
  return `${lines.join("\n")}\n`
}
