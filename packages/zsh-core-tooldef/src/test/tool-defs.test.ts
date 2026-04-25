import {
  classifyOrder,
  docCategories,
  docCategoryLabels,
  loadCorpus,
  ZSH_UPSTREAM,
} from "@carlwr/zsh-core"
import { describe, expect, test } from "vitest"
import {
  BRIEF_MAX_LEN,
  type DocsResult,
  docsToolDef,
  FLAG_BRIEF_MAX_LEN,
  type ListResult,
  listToolDef,
  type SearchResult,
  searchToolDef,
  TOOL_SUITE_PREAMBLE,
  toolDefs,
} from "../../index.ts"

const corpus = loadCorpus()

describe("toolDefs metadata", () => {
  test("names are stable, unique, snake_case, zsh_-prefixed", () => {
    const names = toolDefs.map(def => def.name)
    expect(names).toEqual(["zsh_docs", "zsh_search", "zsh_list"])
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toMatch(/^zsh_[a-z][a-z0-9_]*$/)
  })

  test("inputSchema is always a JSON object schema", () => {
    for (const def of toolDefs) {
      expect(def.inputSchema).toMatchObject({ type: "object" })
    }
  })

  test.each([
    ["zsh_docs", docsToolDef, ["raw"]],
    ["zsh_search", searchToolDef, ["query"]],
  ] as const)("%s declares required=%j", (_n, def, required) => {
    expect(def.inputSchema).toMatchObject({ required })
  })

  test("zsh_list has no required fields", () => {
    expect(
      (listToolDef.inputSchema as { required?: readonly string[] }).required,
    ).toBeUndefined()
  })

  test("execute wires corpus through", () => {
    const d = docsToolDef.execute(corpus, { raw: "echo" }) as DocsResult
    expect(d.matches[0]?.category).toBe("builtin")
    expect(d.matches[0]?.markdown.length).toBeGreaterThan(0)

    const s = searchToolDef.execute(corpus, {
      query: "echo",
      category: "builtin",
      limit: 3,
    }) as SearchResult
    expect(s.matches.length).toBeGreaterThan(0)
    expect(s.matches[0]?.id).toBe("echo")

    const l = listToolDef.execute(corpus, {
      category: "precmd",
      limit: 100,
    }) as ListResult
    for (const m of l.matches) expect(m.category).toBe("precmd")
    expect(l.matches.length).toBeGreaterThan(0)
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

  test("zsh_docs mentions every DocCategory (via branded string)", () => {
    const d = docsToolDef.description + JSON.stringify(docsToolDef.inputSchema)
    for (const cat of classifyOrder) expect(d).toContain(`'${cat}'`)
  })

  test("zsh_docs description mentions option negation semantics", () => {
    const d = docsToolDef.description
    expect(d).toMatch(/negat/i)
    expect(d).toContain("NO_")
  })

  test("zsh_docs warns about multi-match without `category`", () => {
    const d = docsToolDef.description
    expect(d).toMatch(/more than one match/i)
  })

  test("zsh_search lists every DocCategory (via branded string)", () => {
    const d =
      searchToolDef.description + JSON.stringify(searchToolDef.inputSchema)
    for (const cat of docCategories) expect(d).toContain(`'${cat}'`)
  })

  test("zsh_search mentions ranking/limit and points at follow-up", () => {
    const d = searchToolDef.description
    expect(d).toMatch(/fuzzy/i)
    expect(d).toMatch(/limit/i)
    expect(d).toContain("zsh_docs")
  })

  test("zsh_search and zsh_list describe matchesReturned/matchesTotal truncation signal", () => {
    for (const def of [searchToolDef, listToolDef]) {
      expect(def.description).toContain("matchesReturned")
      expect(def.description).toContain("matchesTotal")
    }
  })

  test("zsh_list lists every DocCategory (via branded string)", () => {
    const d = listToolDef.description + JSON.stringify(listToolDef.inputSchema)
    for (const cat of docCategories) expect(d).toContain(`'${cat}'`)
  })

  test("zsh_list points at zsh_docs for the markdown body", () => {
    expect(listToolDef.description).toContain("zsh_docs")
  })

  // Sanity: human-readable category labels make it into the docs description.
  test("zsh_docs surfaces human-readable category labels", () => {
    const d = docsToolDef.description
    for (const cat of classifyOrder) expect(d).toContain(docCategoryLabels[cat])
  })

  // See the "Corpus-tag naming convention" comment in `tool-defs.ts`:
  // entry-point tools name the tag; follow-ups don't.
  test("entry-point tools name the vendored zsh tag", () => {
    expect(docsToolDef.description).toContain(ZSH_UPSTREAM.tag)
    expect(searchToolDef.description).toContain(ZSH_UPSTREAM.tag)
  })
  test("zsh_list does NOT repeat the vendored zsh tag", () => {
    expect(listToolDef.description).not.toContain(ZSH_UPSTREAM.tag)
  })
})

// The preamble is single-sourced but rendered into two surfaces (MCP
// handshake instructions + CLI `--help`). Every `zsh_*` mention must
// resolve to a real tool, otherwise the CLI's `cli_prose()` leaves a
// stale name in terminal output. Tone/length drift is on reviewers;
// this guards only the mechanically-checkable part.
describe("TOOL_SUITE_PREAMBLE", () => {
  test("only references real tool names", () => {
    const mentioned = new Set<string>()
    for (const m of TOOL_SUITE_PREAMBLE.matchAll(/\bzsh_[a-z][a-z0-9_]*\b/g)) {
      mentioned.add(m[0])
    }
    const known = new Set(toolDefs.map(d => d.name))
    for (const name of mentioned) {
      expect(
        known.has(name),
        `preamble references ${name} which is not a tool`,
      ).toBe(true)
    }
    expect(mentioned.size).toBeGreaterThan(0)
  })
})
