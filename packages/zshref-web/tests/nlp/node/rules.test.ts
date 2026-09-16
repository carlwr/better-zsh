// The committed YAML is the positive control; every negative case asserts
// the reason it fails.

import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { escapeRegExp, isSingle } from "@carlwr/typescript-extra"
import { rm_rf } from "@carlwr/typescript-extra/node"
import { describe, expect, it } from "vitest"
import { parse as parseYaml } from "yaml"
import type { z } from "zod"
import {
  exactWordBoost,
  MAX_SCORE_TERM,
  RULE_FILES,
  RULE_SCHEMAS,
  SynonymsSchema,
  TuningSchema,
} from "../../../nlp/core/rules"
import { emitRulesJson, loadRulesYaml } from "../../../nlp/node/rules-load"
import {
  ruleSchemaFile,
  rulesJsonSchemas,
} from "../../../nlp/node/rules-schema"
import { assertCommittedJson, PATHS } from "../../_helpers"

/** The single issue of a rejected parse — the loader reports the first
 * violation only. */
function rejection(schema: z.ZodType, yaml: string): z.core.$ZodIssue {
  const r = schema.safeParse(parseYaml(yaml))
  if (r.success)
    throw new Error(`expected a rejection, got ${JSON.stringify(r.data)}`)
  const { issues } = r.error
  if (!isSingle(issues))
    throw new Error(`expected one issue: ${r.error.message}`)
  return issues[0]
}

describe("committed rules", () => {
  it("embedded_yaml_parses", async () => {
    const rules = await loadRulesYaml()
    // The product form: every synonym term normalized (port note: a phrase
    // term like `process ID` never matches the lowercased haystack raw).
    const { index_groups, query_expansions } = rules.synonyms
    const terms = [
      ...index_groups.flat(),
      ...query_expansions.flatMap(e => [...e.when, e.add]),
    ]
    expect(terms.length).toBeGreaterThan(0)
    expect(terms.every(t => t === t.trim().toLowerCase())).toBe(true)
    const exactWord = exactWordBoost(rules.tuning.boosts)
    expect(rules.tuning.boosts.category).toBeLessThanOrEqual(exactWord)
    expect(exactWord).toBeLessThanOrEqual(MAX_SCORE_TERM)
  })

  it("emit_rules_json_round_trips", async () => {
    const rules = await loadRulesYaml()
    const dir = await mkdtemp(join(tmpdir(), "zshref-rules-"))
    try {
      await emitRulesJson(dir, rules)
      for (const f of RULE_FILES) {
        const text = await readFile(join(dir, `${f}.json`), "utf8")
        expect(text.endsWith("}\n")).toBe(true)
        expect(RULE_SCHEMAS[f].parse(JSON.parse(text))).toEqual(rules[f])
      }
    } finally {
      await rm_rf(dir)
    }
  })

  it("emits draft 2020-12 strict schemas, one per rule file", () => {
    const schemas = rulesJsonSchemas()
    for (const f of RULE_FILES) {
      const s = schemas[ruleSchemaFile(f)]
      expect(s.$schema).toBe("https://json-schema.org/draft/2020-12/schema")
      expect(s.additionalProperties).toBe(false)
      expect(s.title).toBeTypeOf("string")
    }
  })

  it("schemas_match_committed_files", async () => {
    for (const [file, schema] of Object.entries(rulesJsonSchemas())) {
      await assertCommittedJson(
        join(PATHS.rulesSchemaDir, file),
        schema,
        "UPDATE_SCHEMAS",
      )
    }
  })
})

describe("synonyms.yaml", () => {
  it.each<[what: string, yaml: string, issue: object]>([
    [
      "a single-member index group",
      "index_groups:\n  - [parameter]\n",
      {
        code: "too_small",
        path: ["index_groups", 0],
        message: "a group needs at least 2 members",
      },
    ],
    [
      "an empty `when`",
      "query_expansions:\n  - { when: [], add: option }\n",
      { code: "too_small", path: ["query_expansions", 0, "when"] },
    ],
    [
      "a blank `add`",
      "query_expansions:\n  - { when: [setting], add: '  ' }\n",
      {
        path: ["query_expansions", 0, "add"],
        message: "value must not be empty",
      },
    ],
    [
      "an unknown field",
      "index_groups: []\nextra: nope\n",
      { code: "unrecognized_keys", keys: ["extra"] },
    ],
  ])("rejects %s", (_, yaml, issue) => {
    expect(rejection(SynonymsSchema, yaml)).toMatchObject(issue)
  })

  it("uppercase and phrase terms are normalized to lowercase", () => {
    const src =
      "index_groups:\n  - [parameter, Variable]\n" +
      "query_expansions:\n  - { when: [PID], add: 'process ID' }\n"
    const syn = SynonymsSchema.parse(parseYaml(src))
    expect(syn.index_groups[0]).toEqual(["parameter", "variable"])
    expect(syn.query_expansions[0]).toEqual({
      when: ["pid"],
      add: "process id",
    })
  })

  it("both_lists_may_be_omitted", () => {
    expect(SynonymsSchema.parse(parseYaml("{}\n"))).toEqual({
      index_groups: [],
      query_expansions: [],
    })
  })
})

describe("tuning.yaml", () => {
  const exceedsMax = (name: string) =>
    expect.stringMatching(
      new RegExp(
        `^${escapeRegExp(name)}: .* exceeds MAX_SCORE_TERM ${escapeRegExp(String(MAX_SCORE_TERM))} `,
      ),
    )

  // The committed file is the positive control (`embedded_yaml_parses`); each
  // case mutates one token of it so the structural priors it encodes (simplex
  // sum, ordered boost chain, positive saturation denominator) stay covered
  // branch-by-branch.
  it.each<
    [from: string, to: string, path: (string | number)[], message: unknown]
  >([
    [
      "body: 0.70",
      "body: -0.1",
      ["semantic_weights"],
      "body/structured must be non-negative",
    ],
    [
      "structured: 0.20",
      "structured: 0.50",
      ["semantic_weights"],
      expect.stringMatching(/^body \+ structured must be ≤ 1/),
    ],
    [
      "length_scale: 24",
      "length_scale: 0",
      ["semantic_weights", "short_body", "length_scale"],
      "must be positive",
    ],
    [
      "strength: 0.24",
      "strength: -0.1",
      ["semantic_weights", "short_body", "strength"],
      "must be non-negative",
    ],
    [
      "exact_word_increment: 0.06",
      "exact_word_increment: -0.1",
      ["boosts", "exact_word_increment"],
      expect.stringMatching(/^must be non-negative/),
    ],
    [
      "category: 0.01",
      "category: -0.1",
      ["boosts"],
      "category/word_overlap.scale must be non-negative",
    ],
    [
      "scale: 0.30",
      "scale: -0.1",
      ["boosts"],
      "category/word_overlap.scale must be non-negative",
    ],
    [
      "half_sat: 4.0",
      "half_sat: 0",
      ["boosts", "word_overlap", "half_sat"],
      "must be positive",
    ],
    [
      "category: 0.01",
      "category: 0.9",
      ["boosts", "category"],
      exceedsMax("boosts.category"),
    ],
    [
      "scale: 0.30",
      "scale: 0.9",
      ["boosts", "word_overlap", "scale"],
      exceedsMax("boosts.word_overlap.scale"),
    ],
    [
      "category_rarity_max: 0.0",
      "category_rarity_max: 0.9",
      ["penalties", "category_rarity_max"],
      exceedsMax("penalties.category_rarity_max"),
    ],
    // The bound is on the effective term (category + increment): a large
    // increment trips it while each stored scalar looks small.
    [
      "exact_word_increment: 0.06",
      "exact_word_increment: 0.9",
      ["boosts"],
      exceedsMax("boosts effective exact_word"),
    ],
  ])("rejects `%s` → `%s`", async (from, to, path, message) => {
    const src = await readFile(PATHS.tuning, "utf8")
    const mutated = src.replace(from, to)
    expect(mutated, "the replacement matched nothing").not.toBe(src)
    expect(rejection(TuningSchema, mutated)).toMatchObject({ path, message })
  })
})
