// The rule files as zod shapes, and as one bundle by name. The shapes are
// the source of truth: the Node side validates and normalizes the YAML with
// them and emits the JSON the browser loads through the same shapes; the
// editor schemas are generated from them. Strict: an unknown key is an
// error. Field order = emitted key order.

import { z } from "zod"

import { asciiLower } from "./text"
import { recordOver } from "./types"

const float = z.number()
const nat = z.number().int().nonnegative()

/** Ceiling on any single effective boost/penalty, in semantic-cosine units.
 * Half the cosine range: a heavier term would dominate the semantic signal. */
export const MAX_SCORE_TERM = 0.5

const TuningShape = z.strictObject({
  semantic_weights: z.strictObject({
    body: float.describe(
      "Mix over the embedding views. Only body and structured are stored; expanded is derived as 1 − body − structured (on the simplex by construction).",
    ),
    structured: float,
    short_body: z
      .strictObject({
        strength: float.describe("Max shift, at body length 0."),
        length_scale: float.describe(
          "Body length at/above which the shift is zero.",
        ),
      })
      .describe(
        "Sparse-body deformation: shifts mass body → expanded as a body shortens, so short records lean on structured/expanded text.",
      ),
  }),
  boosts: z.strictObject({
    category: float.describe(
      "Weakest signal: the query names the record's category.",
    ),
    exact_word_increment: float.describe(
      "Non-negative increment for a query word equal to id/display (exact_word = category + this, so category ≤ exact_word by construction).",
    ),
    word_overlap: z
      .strictObject({ scale: float, half_sat: float })
      .describe(
        "Smooth saturating overlap boost: asymptote `scale`, half of it at `half_sat`.",
      ),
  }),
  penalties: z.strictObject({ category_rarity_max: float }),
  lexical: z.strictObject({
    min_discriminating_word_len: nat,
    min_significant_word_len: nat,
  }),
})
export type Tuning = z.infer<typeof TuningShape>

/** The effective exact-word boost: `category` plus its increment. */
export const exactWordBoost = (b: Tuning["boosts"]): number =>
  b.category + b.exact_word_increment

interface Violation {
  path: (string | number)[]
  message: string
}
type Check = [violated: boolean, path: Violation["path"], message: string]

/** The first violated range check, in a fixed order. */
function tuningViolation(t: Tuning): Violation | null {
  const sw = t.semantic_weights
  const b = t.boosts
  // The *effective* terms (what lands on a record's score) are bounded, not
  // the stored increment — so the chained exact_word value is checked.
  const overMax = (
    name: string,
    path: Violation["path"],
    value: number,
  ): Check => [
    value > MAX_SCORE_TERM,
    path,
    `${name}: ${value} exceeds MAX_SCORE_TERM ${MAX_SCORE_TERM} (a term that large would swamp the semantic signal)`,
  ]
  const checks: Check[] = [
    [
      sw.body < 0 || sw.structured < 0,
      ["semantic_weights"],
      "body/structured must be non-negative",
    ],
    [
      sw.body + sw.structured > 1 + 1e-4,
      ["semantic_weights"],
      "body + structured must be ≤ 1 (expanded is derived as 1 − body − structured)",
    ],
    [
      sw.short_body.strength < 0,
      ["semantic_weights", "short_body", "strength"],
      "must be non-negative",
    ],
    [
      sw.short_body.length_scale <= 0,
      ["semantic_weights", "short_body", "length_scale"],
      "must be positive",
    ],
    [
      b.category < 0 || b.word_overlap.scale < 0,
      ["boosts"],
      "category/word_overlap.scale must be non-negative",
    ],
    [
      b.exact_word_increment < 0,
      ["boosts", "exact_word_increment"],
      "must be non-negative (preserves category ≤ exact_word)",
    ],
    [
      b.word_overlap.half_sat <= 0,
      ["boosts", "word_overlap", "half_sat"],
      "must be positive",
    ],
    overMax("boosts.category", ["boosts", "category"], b.category),
    overMax("boosts effective exact_word", ["boosts"], exactWordBoost(b)),
    overMax(
      "boosts.word_overlap.scale",
      ["boosts", "word_overlap", "scale"],
      b.word_overlap.scale,
    ),
    overMax(
      "penalties.category_rarity_max",
      ["penalties", "category_rarity_max"],
      t.penalties.category_rarity_max,
    ),
  ]
  const hit = checks.find(([violated]) => violated)
  return hit ? { path: hit[1], message: hit[2] } : null
}

export const TuningSchema = TuningShape.check(ctx => {
  const v = tuningViolation(ctx.value)
  if (v)
    ctx.issues.push({
      code: "custom",
      input: ctx.value,
      path: v.path,
      message: v.message,
    })
}).meta({
  title: "Tuning",
  description:
    "Rank-time scalar constants for the ranker (no re-embed on change).",
})

export const StopwordsSchema = z
  .strictObject({
    generic: z
      .array(z.string())
      .describe("Filtered from any tokenization of the query."),
    discriminating_extra: z
      .array(z.string())
      .describe(
        "Filtered additionally when deciding whether a query word is distinctive enough to qualify a record for the exact-word boost.",
      ),
  })
  .meta({ title: "Stopwords", description: "Query stopwords; rank-time." })
export type Stopwords = z.infer<typeof StopwordsSchema>

// Authors write triggers and canonical terms in natural casing (`PID`,
// `process ID`) or as phrases; the matchers compare against a lowercased
// haystack, so each term is trimmed and lowercased once at load rather than
// constraining the author.
const term = z
  .string()
  .overwrite(s => asciiLower(s.trim()))
  .min(1, "value must not be empty")

export const QueryExpansionSchema = z
  .strictObject({
    when: z
      .array(term)
      .min(1, "`when` needs at least 1 trigger")
      .describe(
        "Colloquial trigger words / phrases (matched whole word / phrase). Any casing; normalized to lowercase at load.",
      ),
    add: term.describe(
      "Canonical term appended for embedding. One term by design; any casing, normalized to lowercase at load.",
    ),
  })
  .describe(
    "One directional query rule: when any `when` trigger matches the query, the single canonical `add` term is appended to the embedded query string only (never the lexical-overlap bag — keeps short queries from being swamped).",
  )
export type QueryExpansion = z.infer<typeof QueryExpansionSchema>

export const SynonymsSchema = z
  .strictObject({
    index_groups: z
      .array(z.array(term).min(2, "a group needs at least 2 members"))
      .default([])
      .describe(
        "Symmetric, index-time. If any member matches a record (whole word / phrase), the others are appended to its expanded view before embedding. May be empty.",
      ),
    query_expansions: z
      .array(QueryExpansionSchema)
      .default([])
      .describe(
        "Directional, query-time, embedding-only. Maps colloquial query vocabulary onto the corpus's canonical term.",
      ),
  })
  .meta({
    title: "Synonyms",
    description:
      "Generic zsh/English synonym data. Two disjoint mechanisms — see synonyms.yaml for the contract.",
  })
export type Synonyms = z.infer<typeof SynonymsSchema>

// Canonical key source: file base names (`<name>.yaml`, `<name>.json`,
// `<name>.schema.json`) in emission order.
export const RULE_SCHEMAS = {
  tuning: TuningSchema,
  stopwords: StopwordsSchema,
  synonyms: SynonymsSchema,
} as const
export type RuleFile = keyof typeof RULE_SCHEMAS
export const RULE_FILES = Object.keys(RULE_SCHEMAS) as RuleFile[]

/** One value per rule file, from `f`; the keys are exactly `RULE_FILES`. */
export const byRuleFile = <T>(
  f: (file: RuleFile, at: number) => T,
): Record<RuleFile, T> => recordOver(RULE_FILES, f)

export type Rules = { [K in RuleFile]: z.output<(typeof RULE_SCHEMAS)[K]> }

/** The raw inputs by file, each validated by its schema; the cast carries the per-key output types `recordOver` cannot. */
export const loadRules = (input: Record<RuleFile, unknown>): Rules =>
  byRuleFile(f => RULE_SCHEMAS[f].parse(input[f])) as Rules
