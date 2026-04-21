import {
  docCategories,
  docCategoryLabels,
  loadCorpus,
  ZSH_UPSTREAM,
} from "@carlwr/zsh-core"
import { describe, expect, test } from "vitest"
import {
  BRIEF_MAX_LEN,
  type ClassifyResult,
  classifyToolDef,
  DESCRIPTION_LINE_MAX_LEN,
  type DescribeResult,
  describeToolDef,
  FLAG_BRIEF_MAX_LEN,
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

// `flagBriefs` are one-line CLI FLAGS-column entries. Compile-time
// checks via `makeToolDef<K>` enforce that keys match the schema's
// property keys exactly — no runtime key-match test needed. We still
// runtime-check the length cap and single-line shape, since those are
// string-content invariants the builder type can't express.
describe("toolDefs flagBriefs shape", () => {
  test.each(
    toolDefs.map(d => [d.name, d] as const),
  )("%s.flagBriefs values are non-empty one-liners within the cap", (_n, def) => {
    for (const [key, brief] of Object.entries(def.flagBriefs)) {
      expect(brief.length).toBeGreaterThan(0)
      expect(brief.length).toBeLessThanOrEqual(FLAG_BRIEF_MAX_LEN)
      expect(brief, `${def.name}.flagBriefs.${key}`).not.toMatch(/\n/)
    }
  })
})

// Source-wrap discipline: every line of a description is ≤70 cols, so
// adapters that render the string verbatim (stricli) break paragraphs
// at word boundaries. Single `\n` is collapsed to whitespace by
// CommonMark renderers, so MCP/LM chat surfaces see the prose
// unchanged; cliffy's re-wrapper leaves ≤70-col lines alone.
describe("toolDefs description wrap discipline", () => {
  test.each(
    toolDefs.map(d => [d.name, d] as const),
  )(`%s.description: every line ≤ ${DESCRIPTION_LINE_MAX_LEN} cols`, (_n, def) => {
    for (const line of def.description.split("\n")) {
      expect(
        line.length,
        `overflow (${line.length} > ${DESCRIPTION_LINE_MAX_LEN}): ${line}`,
      ).toBeLessThanOrEqual(DESCRIPTION_LINE_MAX_LEN)
    }
  })
})

// `brief` is what narrow rendering contexts (CLI commands-column) see;
// drift past the width cap breaks single-line rendering. Briefs are
// phrases, not sentences — lowercase-start, no trailing period.
describe("toolDefs brief shape", () => {
  test.each(
    toolDefs.map(d => [d.name, d] as const),
  )("%s.brief conforms", (_n, def) => {
    expect(def.brief.length).toBeGreaterThan(0)
    expect(def.brief.length).toBeLessThanOrEqual(BRIEF_MAX_LEN)
    expect(def.brief).not.toMatch(/\n/)
    expect(def.brief[0]).toBe(def.brief[0]?.toLowerCase())
    expect(def.brief).not.toMatch(/\.$/)
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

  test("zsh_search describes matchesReturned/matchesTotal truncation signal", () => {
    const d = searchToolDef.description
    expect(d).toContain("matchesReturned")
    expect(d).toContain("matchesTotal")
  })

  test("zsh_describe mentions canonical id", () => {
    const d = describeToolDef.description
    expect(d).toMatch(/canonical|exact/i)
    expect(d).toMatch(/markdown/i)
  })

  // See the "Corpus-tag naming convention" comment in `tool-defs.ts`:
  // entry-point tools name the tag; follow-ups don't.
  test("entry-point tools name the vendored zsh tag", () => {
    expect(classifyToolDef.description).toContain(ZSH_UPSTREAM.tag)
    expect(searchToolDef.description).toContain(ZSH_UPSTREAM.tag)
  })
  test("follow-up tools do NOT repeat the vendored zsh tag", () => {
    expect(describeToolDef.description).not.toContain(ZSH_UPSTREAM.tag)
    expect(lookupOptionToolDef.description).not.toContain(ZSH_UPSTREAM.tag)
  })
})
