// The parity fixture pins the arithmetic against its past; these tests pin
// what the arithmetic must mean — unit cases, then properties over small
// synthetic indexes (`tests/_arbs.ts`).

import fc from "fast-check"
import { beforeAll, describe, expect, it } from "vitest"
import {
  categoryCounts,
  categoryPenalties,
  computeBoosts,
  overlapBoost,
  queryWords,
  rank,
  recordTerms,
  semanticWeights,
  symbolHead,
  symbolTokens,
} from "../../../nlp/core/rank"
import {
  exactWordBoost,
  MAX_SCORE_TERM,
  type Rules,
  type Tuning,
} from "../../../nlp/core/rules"
import { type RecordText, recordKey } from "../../../nlp/core/types"
import { loadRulesYaml } from "../../../nlp/node/rules-load"
import {
  arbBoostWeights,
  arbIndex,
  arbRanking,
  arbSemanticWeights,
  type SemanticWeights,
} from "../../_arbs"
import { makeRecordText } from "../../_fixtures"

let rules: Rules
beforeAll(async () => {
  rules = await loadRulesYaml()
})

const withTuning = (r: Rules, patch: (t: Tuning) => Tuning): Rules => ({
  ...r,
  tuning: patch(r.tuning),
})

// Semantic weights with a fixed length_scale of 10.
const sw = (
  body: number,
  structured: number,
  strength: number,
): SemanticWeights => ({
  body,
  structured,
  short_body: { strength, length_scale: 10 },
})

const near = (got: number, want: number): void => {
  expect(Math.abs(got - want)).toBeLessThan(1e-6)
}

const rec = (over: Partial<RecordText>): RecordText =>
  makeRecordText({
    category: "option",
    category_label: "option",
    title: "",
    md_body: "",
    ...over,
  })

describe("ranker unit tests", () => {
  it("exact_id_match_gives_lexical_boost", () => {
    const r = rec({ id: "autocd", display: "AUTO_CD" })
    expect(computeBoosts(r, "autocd", rules).lexical).toBeGreaterThan(0)
    expect(
      computeBoosts(r, "option autocd please", rules).category,
    ).toBeGreaterThan(0)
  })

  it("symbol_tokens_strip_sigil_and_keep_operators", () => {
    expect(symbolTokens("the $? param")).toEqual(["?"])
    expect(symbolTokens("redirection >>")).toEqual([">>"])
    expect(symbolTokens("$0")).toEqual(["0"]) // sigiled even if alnum after strip
    expect(symbolTokens("list all background jobs")).toEqual([])
  })

  it("symbol_head_is_the_operator_prefix", () => {
    expect(symbolHead(">> word")).toBe(">>")
    expect(symbolHead("?")).toBe("?")
    expect(symbolHead("auto_cd")).toBeNull() // leading alnum -> no symbol head
  })

  it("symbol_query_matches_param_and_operator_records", () => {
    const param = rec({
      category: "special_param",
      category_label: "special parameter",
      id: "?",
      display: "?",
    })
    const redir = {
      ...param,
      category: "redirection",
      id: ">>_word",
      display: ">> word",
    }
    // "$?" names the `?` param; ">>" names `>>_word` via its display's
    // symbolic head — both fire the lexical boost. A prose word does not.
    expect(computeBoosts(param, "the $? param", rules).lexical).toBeGreaterThan(
      0,
    )
    expect(
      computeBoosts(redir, "redirection >>", rules).lexical,
    ).toBeGreaterThan(0)
    expect(computeBoosts(param, "list background jobs", rules).lexical).toBe(0)
  })

  it("semantic_weights_derive_expanded", () => {
    // expanded = 1 − body − structured; the triple sums to 1 by construction.
    const [b, s, e] = semanticWeights(1000, sw(0.7, 0.2, 0))
    near(b, 0.7)
    near(s, 0.2)
    near(e, 0.1)
    near(b + s + e, 1)
  })

  it("short_body_shift_is_continuous_with_exact_endpoints", () => {
    const w = sw(0.7, 0.2, 0.1)
    // L ≥ length_scale: base mix, no shift.
    near(semanticWeights(10, w)[0], 0.7)
    // L = 0: full strength shift body → expanded (the old short-body triple).
    const z = semanticWeights(0, w)
    near(z[0], 0.6)
    near(z[1], 0.2)
    near(z[2], 0.2)
    // Strictly monotone across the ramp — no discontinuity.
    const a = semanticWeights(2, w)[0]
    const b = semanticWeights(7, w)[0]
    expect(0.6 < a && a < b && b < 0.7).toBe(true)
  })

  it("boosts_are_reliability_ordered", () => {
    const b = rules.tuning.boosts
    expect(b.category).toBeLessThanOrEqual(exactWordBoost(b))
  })

  it("overlap_boost_saturates_monotonically", () => {
    const b = rules.tuning.boosts
    expect(overlapBoost(0, b)).toBe(0)
    const one = overlapBoost(1, b)
    const many = overlapBoost(100, b)
    expect(one > 0 && one < many).toBe(true)
    // Smooth saturation never reaches the asymptote.
    expect(many).toBeLessThan(b.word_overlap.scale)
  })

  it("prose_overlap_beats_broad_name_containment", () => {
    const aliases = rec({
      id: "aliases",
      display: "ALIASES",
      structured: "id: aliases",
      body: "Expand aliases.",
    })
    const complete = {
      ...aliases,
      id: "completealiases",
      display: "COMPLETE_ALIASES",
      body: "Prevents aliases before completion is attempted.",
      structured: "id: completealiases",
    }
    // Query has more discriminating words in complete's body/structured
    // than in aliases's — overlap should favour complete.
    const q = "prevents expansion before completion"
    expect(computeBoosts(complete, q, rules).lexical).toBeGreaterThan(
      computeBoosts(aliases, q, rules).lexical,
    )
  })
})

// --- query tokenization ------------------------------------------------------

const arbAsciiText = fc.string({ unit: "grapheme-ascii", maxLength: 24 })

describe("query token properties", () => {
  it("symbol tokens: lowercased, whitespace-free, unquoted, at most one `$` peeled, each from a query token", () => {
    fc.assert(
      fc.property(arbAsciiText, q => {
        const tokens = q.split(/\s+/).filter(t => t !== "")
        for (const t of symbolTokens(q)) {
          expect(t).not.toBe("")
          expect(t).toBe(t.toLowerCase())
          expect(t).not.toMatch(/\s|^['"`]|['"`]$/)
          expect(tokens.some(tok => tok.toLowerCase().includes(t))).toBe(true)
        }
      }),
    )
  })

  it("symbol head: a non-empty prefix of the display bearing no alphanumeric or space, else null", () => {
    fc.assert(
      fc.property(arbAsciiText, display => {
        const head = symbolHead(display)
        if (head === null)
          expect(display === "" || /^[A-Za-z0-9 ]/.test(display)).toBe(true)
        else {
          expect(display.startsWith(head)).toBe(true)
          expect(head).not.toMatch(/[A-Za-z0-9 ]/)
          expect(display.slice(head.length)).toMatch(/^$|^[A-Za-z0-9 ]/)
        }
      }),
    )
  })

  it("query words: alphanumeric runs of the query, the generic stopwords dropped, order kept", () => {
    fc.assert(
      fc.property(arbAsciiText, q => {
        const words = queryWords(q.toLowerCase(), rules.stopwords)
        for (const w of words) {
          expect(w).toMatch(/^[a-z0-9]*$/)
          expect(rules.stopwords.generic).not.toContain(w)
        }
        const runs = q.toLowerCase().split(/[^a-z0-9]+/)
        expect(words).toEqual(
          runs.filter(w => w !== "" && !rules.stopwords.generic.includes(w)),
        )
      }),
    )
  })
})

// --- synthetic indexes -------------------------------------------------------

const INDEX_RUNS = { numRuns: 60 }

describe("rank properties", () => {
  it("ranks every record once, by score descending", () => {
    fc.assert(
      fc.property(arbRanking, r => {
        const ranked = rank(r.query, r.queryVec, r.index, rules)
        expect(ranked.map(m => recordKey(m.rec)).sort()).toEqual(
          r.index.records.map(x => recordKey(x.text)).sort(),
        )
        for (let i = 1; i < ranked.length; i++) {
          const [a, b] = [ranked[i - 1], ranked[i]]
          if (a && b) expect(a.score).toBeGreaterThanOrEqual(b.score)
        }
      }),
      INDEX_RUNS,
    )
  })

  it("is invariant under a permutation of the index records", () => {
    const arb = arbRanking.chain(r =>
      fc
        .shuffledSubarray(r.index.records, {
          minLength: r.index.records.length,
        })
        .map(records => ({ ...r, shuffled: { ...r.index, records } })),
    )
    fc.assert(
      fc.property(arb, r => {
        expect(rank(r.query, r.queryVec, r.shuffled, rules)).toEqual(
          rank(r.query, r.queryVec, r.index, rules),
        )
      }),
      INDEX_RUNS,
    )
  })

  it("score = weighted semantic views + Σ boosts", () => {
    // The rarity penalty is the one score term outside `debug`; off, so the
    // parts account for the whole score whatever the committed knob says.
    const noPenalty = withTuning(rules, t => ({
      ...t,
      penalties: { category_rarity_max: 0 },
    }))
    fc.assert(
      fc.property(arbRanking, r => {
        for (const m of rank(r.query, r.queryVec, r.index, noPenalty)) {
          const [bw, sw, ew] = semanticWeights(
            recordTerms(m.rec).bodyWords,
            noPenalty.tuning.semantic_weights,
          )
          const { semantic, boosts } = m.debug
          const semanticScore =
            bw * semantic.body +
            sw * semantic.structured +
            ew * semantic.expanded
          expect(m.score).toBeCloseTo(
            semanticScore + boosts.category + boosts.lexical,
            12,
          )
        }
      }),
      INDEX_RUNS,
    )
  })

  it("lexical boosts are casing-invariant for an ASCII query", () => {
    const recase = (q: string, flips: boolean[]): string =>
      [...q]
        .map((c, i) =>
          flips[i % flips.length] ? c.toUpperCase() : c.toLowerCase(),
        )
        .join("")
    fc.assert(
      fc.property(
        arbRanking,
        fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
        (r, flips) => {
          expect(
            rank(recase(r.query, flips), r.queryVec, r.index, rules),
          ).toEqual(rank(r.query, r.queryVec, r.index, rules))
        },
      ),
      INDEX_RUNS,
    )
  })
})

describe("category penalty properties", () => {
  it("0 for the largest category, at most the max, larger the rarer the category", () => {
    fc.assert(
      fc.property(
        arbIndex,
        fc.double({ min: 0, max: MAX_SCORE_TERM, noNaN: true }),
        (index, max) => {
          const r = withTuning(rules, t => ({
            ...t,
            penalties: { category_rarity_max: max },
          }))
          const counts = categoryCounts(index)
          const penalties = categoryPenalties(index, r)
          const largest = Math.max(...counts.values())
          expect([...penalties.keys()]).toEqual([...counts.keys()])
          for (const [cat, n] of counts) {
            const p = penalties.get(cat) ?? Number.NaN
            expect(p).toBeGreaterThanOrEqual(0)
            expect(p).toBeLessThanOrEqual(max)
            if (n === largest) expect(p).toBe(0)
            for (const [rarer, m] of counts)
              if (m <= n) expect(penalties.get(rarer)).toBeGreaterThanOrEqual(p)
          }
        },
      ),
      INDEX_RUNS,
    )
  })
})

// --- weights and boosts ------------------------------------------------------

const arbBodyWords = fc.nat({ max: 200 })

describe("semantic weight properties", () => {
  it("lie on the simplex: non-negative, summing to 1 within eps", () => {
    fc.assert(
      fc.property(arbSemanticWeights, arbBodyWords, (w, n) => {
        const [b, s, e] = semanticWeights(n, w)
        expect(b).toBeGreaterThanOrEqual(0)
        expect(s).toBeGreaterThanOrEqual(0)
        expect(e).toBeGreaterThanOrEqual(0)
        expect(Math.abs(b + s + e - 1)).toBeLessThanOrEqual(1e-6)
      }),
    )
  })

  it("short-body shift: exact endpoints, monotone, no jump beyond the ramp slope", () => {
    fc.assert(
      fc.property(arbSemanticWeights, arbBodyWords, (w, n) => {
        const base = semanticWeights(Number.MAX_SAFE_INTEGER, w)
        // At or past length_scale the base mix is exact; at 0 the full
        // strength moves body → expanded, capped by body.
        expect(
          semanticWeights(Math.ceil(w.short_body.length_scale), w),
        ).toEqual(base)
        const shift = Math.min(w.short_body.strength, w.body)
        expect(semanticWeights(0, w)).toEqual([
          w.body - shift,
          w.structured,
          base[2] + shift,
        ])
        const [b0, s0, e0] = semanticWeights(n, w)
        const [b1, s1, e1] = semanticWeights(n + 1, w)
        expect(b1).toBeGreaterThanOrEqual(b0)
        expect(s1).toBe(s0)
        expect(e1).toBeLessThanOrEqual(e0)
        expect(b1 - b0).toBeLessThanOrEqual(
          w.short_body.strength / w.short_body.length_scale + 1e-6,
        )
      }),
    )
  })
})

describe("boost properties", () => {
  it("overlap boost saturates monotonically, bounded by scale, half at half_sat", () => {
    fc.assert(
      fc.property(arbBoostWeights, fc.nat({ max: 1000 }), (b, n) => {
        expect(overlapBoost(0, b)).toBe(0)
        const at = overlapBoost(n, b)
        expect(at).toBeGreaterThanOrEqual(0)
        expect(at).toBeLessThanOrEqual(b.word_overlap.scale)
        expect(overlapBoost(n + 1, b)).toBeGreaterThanOrEqual(at)
        expect(
          Math.abs(
            overlapBoost(b.word_overlap.half_sat, b) - b.word_overlap.scale / 2,
          ),
        ).toBeLessThanOrEqual(1e-6)
      }),
    )
  })

  it("the exact-word boost is at least the category boost, strictly for a positive increment", () => {
    fc.assert(
      fc.property(arbBoostWeights, b => {
        expect(exactWordBoost(b)).toBeGreaterThanOrEqual(b.category)
        if (b.exact_word_increment > 0)
          expect(exactWordBoost(b)).toBeGreaterThan(b.category)
      }),
    )
  })
})
