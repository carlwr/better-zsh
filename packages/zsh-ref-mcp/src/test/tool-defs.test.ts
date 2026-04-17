import { describe, expect, test } from "vitest"
import { docCategories, docCategoryLabels, loadCorpus } from "zsh-core"
import {
  type ClassifyResult,
  classifyToolDef,
  type DescribeResult,
  describeToolDef,
  type LookupOptionResult,
  lookupOptionToolDef,
  type SearchResult,
  searchToolDef,
  toolDefs,
} from "../../index.ts"

const corpus = loadCorpus()

describe("toolDefs metadata", () => {
  test("names are stable, unique, snake_case, zsh_-prefixed", () => {
    const names = toolDefs.map(def => def.name)
    expect(names).toEqual([
      "zsh_classify",
      "zsh_lookup_option",
      "zsh_search",
      "zsh_describe",
    ])
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toMatch(/^zsh_[a-z][a-z0-9_]*$/)
  })

  test("inputSchema is always a JSON object schema", () => {
    for (const def of toolDefs) {
      expect(def.inputSchema).toMatchObject({ type: "object" })
    }
  })

  test.each([
    ["zsh_classify", classifyToolDef, ["raw"]],
    ["zsh_lookup_option", lookupOptionToolDef, ["raw"]],
    ["zsh_describe", describeToolDef, ["category", "id"]],
  ] as const)("%s declares required=%j", (_n, def, required) => {
    expect(def.inputSchema).toMatchObject({ required })
  })

  test("zsh_search has no required fields", () => {
    expect(
      (searchToolDef.inputSchema as { required?: readonly string[] }).required,
    ).toBeUndefined()
  })

  test("execute wires corpus through", () => {
    const c = classifyToolDef.execute(corpus, {
      raw: "echo",
    }) as ClassifyResult
    expect(c.match?.category).toBe("builtin")
    const l = lookupOptionToolDef.execute(corpus, {
      raw: "AUTO_CD",
    }) as LookupOptionResult
    expect(l.match?.id).toBe("autocd")
    const s = searchToolDef.execute(corpus, {
      query: "echo",
      category: "builtin",
      limit: 3,
    }) as SearchResult
    expect(s.matches.length).toBeGreaterThan(0)
    expect(s.matches[0]?.id).toBe("echo")
    const d = describeToolDef.execute(corpus, {
      category: "builtin",
      id: "echo",
    }) as DescribeResult
    expect(d.match?.markdown).toMatch(/echo/i)
  })
})

// Descriptions are what the LLM sees; silent drift here is costly. The
// checks below are shape guards — not a review substitute.
describe("toolDefs description shape", () => {
  test.each(
    toolDefs.map(d => [d.name, d] as const),
  )("%s has non-trivial description with trust-model language", (_name, def) => {
    expect(def.description.length).toBeGreaterThanOrEqual(80)
    expect(def.description).toMatch(/shell execution/i)
    expect(def.description).toMatch(/environment access/i)
  })

  test("zsh_classify mentions every DocCategory (via human label)", () => {
    const d = classifyToolDef.description
    for (const cat of docCategories) expect(d).toContain(docCategoryLabels[cat])
  })

  test("zsh_search lists every DocCategory (via branded string)", () => {
    const d =
      searchToolDef.description + JSON.stringify(searchToolDef.inputSchema)
    for (const cat of docCategories) expect(d).toContain(`'${cat}'`)
  })

  test("zsh_lookup_option mentions negation semantics", () => {
    const d = lookupOptionToolDef.description
    expect(d).toMatch(/negat/i)
    expect(d).toContain("NO_")
  })

  test("zsh_search mentions ranking/limit and points at follow-up", () => {
    const d = searchToolDef.description
    expect(d).toMatch(/fuzzy/i)
    expect(d).toMatch(/limit/i)
    expect(d).toMatch(/zsh_describe|zsh_classify/)
  })

  test("zsh_describe mentions canonical id", () => {
    const d = describeToolDef.description
    expect(d).toMatch(/canonical|exact/i)
    expect(d).toMatch(/markdown/i)
  })
})
