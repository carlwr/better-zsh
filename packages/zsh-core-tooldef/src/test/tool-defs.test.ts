import { loadCorpus } from "@carlwr/zsh-core"
import { ZSH_UPSTREAM } from "@carlwr/zsh-core/meta"
import { docCategories, docCategoryLabels } from "@carlwr/zsh-core/taxonomy"
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
  type ToolDef,
  toolDefs,
} from "../../index.ts"

const corpus = loadCorpus()

function flagDesc(def: ToolDef, key: string): string {
  const props = def.inputSchema.properties as Record<
    string,
    { description?: string }
  >
  const desc = props[key]?.description
  if (desc === undefined) {
    throw new Error(
      `${def.name}.inputSchema.properties.${key} has no description`,
    )
  }
  return desc
}

const eachTool = test.each(toolDefs.map(d => [d.name, d] as const))

describe("toolDefs metadata", () => {
  test("names are stable, snake_case, zsh_-prefixed", () => {
    const names = toolDefs.map(def => def.name)
    // Pinned list pins order AND uniqueness; regex pins shape for future entries.
    expect(names).toEqual(["zsh_docs", "zsh_search", "zsh_list"])
    for (const name of names) expect(name).toMatch(/^zsh_[a-z][a-z0-9_]*$/)
  })

  eachTool("%s.inputSchema is a JSON object schema", (_n, def) => {
    expect(def.inputSchema).toMatchObject({ type: "object" })
  })

  eachTool("%s.outputSchema is a JSON object schema", (_n, def) => {
    expect(def.outputSchema).toMatchObject({ type: "object" })
  })

  test.each([
    ["zsh_docs", docsToolDef, ["key"]],
    ["zsh_search", searchToolDef, ["query"]],
  ] as const)("%s declares required=%j", (_n, def, required) => {
    expect(def.inputSchema).toMatchObject({ required })
  })

  test("zsh_list has no required fields", () => {
    expect(listToolDef.inputSchema).not.toHaveProperty("required")
  })

  test("execute wires corpus through", () => {
    const d = docsToolDef.execute(corpus, { key: "echo" }) as DocsResult
    expect(d.matches[0]?.category).toBe("builtin")
    expect(d.matches[0]?.mdBody.length).toBeGreaterThan(0)

    const s = searchToolDef.execute(corpus, {
      query: "echo",
      category: "builtin",
      limit: 3,
    }) as SearchResult
    expect(s.matches.length).toBeGreaterThan(0)
    expect(s.matches[0]?.id).toBe("echo")

    const l = listToolDef.execute(corpus, {
      category: "precmd_modifier",
      limit: 100,
    }) as ListResult
    for (const m of l.matches) expect(m.category).toBe("precmd_modifier")
    expect(l.matches.length).toBeGreaterThan(0)
  })
})

// `flagBriefs` are one-line CLI flag-column entries. Compile-time checks on
// `buildToolDef` enforce keys against the schema — no runtime key-match test.
// Length cap and single-line shape are still asserted at runtime.
describe("toolDefs flagBriefs shape", () => {
  eachTool(
    "%s.flagBriefs values are non-empty one-liners within the cap",
    (_n, def) => {
      for (const [key, brief] of Object.entries(def.flagBriefs)) {
        expect(brief.length).toBeGreaterThan(0)
        expect(brief.length).toBeLessThanOrEqual(FLAG_BRIEF_MAX_LEN)
        expect(brief, `${def.name}.flagBriefs.${key}`).not.toMatch(/\n/)
      }
    },
  )
})

// `brief` is what narrow rendering contexts (CLI commands-column) see;
// drift past the width cap breaks single-line rendering. Briefs are
// phrases, not sentences — lowercase-start, no trailing period.
describe("toolDefs brief shape", () => {
  eachTool("%s.brief conforms", (_n, def) => {
    expect(def.brief.length).toBeGreaterThan(0)
    expect(def.brief.length).toBeLessThanOrEqual(BRIEF_MAX_LEN)
    expect(def.brief).not.toMatch(/\n/)
    expect(def.brief).not.toMatch(/^[A-Z]/) // phrase, not sentence
    expect(def.brief).not.toMatch(/\.$/)
  })
})

// Descriptions are what the LLM sees; silent drift here is costly. The
// checks below are shape guards — not a review substitute.
describe("toolDefs description shape", () => {
  eachTool(
    "%s has non-trivial description with trust-model language",
    (_name, def) => {
      expect(def.description.length).toBeGreaterThanOrEqual(80)
      expect(def.description).toMatch(/shell execution/i)
      expect(def.description).toMatch(/environment access/i)
    },
  )

  // Every tool exposes the full DocCategory set on its `category` enum.
  // Driven by `categoryShape` from canonical zsh-core tables; the test
  // catches accidental hand-list drift.
  eachTool("%s.category enum equals docCategories", (_n, def) => {
    const props = def.inputSchema.properties as Record<
      string,
      { enum?: readonly string[] }
    >
    expect(props.category?.enum).toEqual([...docCategories])
  })

  test("zsh_docs description mentions option negation semantics", () => {
    const d = docsToolDef.description
    expect(d).toMatch(/negat/i)
    expect(d).toContain("NO_")
  })

  test("zsh_docs warns about multi-match without `category`", () => {
    const d = docsToolDef.description
    expect(d).toMatch(/multiple matches/i)
    expect(d).toContain("`category`")
  })

  // Tooldef prose reaches MCP/LM verbatim; CLI shows real flags.
  eachTool("%s prose has no `--option` references", (_n, td) => {
    const FLAG_RE = /--\w/
    expect(td.description).not.toMatch(FLAG_RE)
    expect(td.brief).not.toMatch(FLAG_RE)
    for (const [key, brief] of Object.entries(td.flagBriefs)) {
      expect(brief).not.toMatch(FLAG_RE)
      expect(flagDesc(td, key)).not.toMatch(FLAG_RE)
    }
  })

  test("zsh_search mentions ranking/limit and points at follow-up", () => {
    expect(searchToolDef.description).toMatch(/fuzzy/i)
    expect(flagDesc(searchToolDef, "limit")).toMatch(/limit|maximum/i)
    expect(searchToolDef.description).toContain("zsh_docs")
  })

  test("zsh_docs category help documents resolver cardinality", () => {
    const help = flagDesc(docsToolDef, "category")
    expect(help).toMatch(/At most one match/i)
    expect(help).toMatch(/one match per category/i)
  })

  test.each([
    ["zsh_search", searchToolDef],
    ["zsh_list", listToolDef],
  ] as const)("%s category help does not promise one-match output", (_n, def) => {
    expect(flagDesc(def, "category")).not.toMatch(/one match|at most/i)
  })

  test.each([
    ["zsh_search", searchToolDef],
    ["zsh_list", listToolDef],
  ] as const)("%s outputSchema declares truncation counts", (_n, def) => {
    const schema = def.outputSchema as { required?: readonly string[] }
    expect(schema.required).toEqual(
      expect.arrayContaining(["matchesReturned", "matchesTotal"]),
    )
  })

  test("zsh_list points at zsh_docs for the markdown body", () => {
    expect(listToolDef.description).toContain("zsh_docs")
  })

  // The category help surfaces a human-readable label per category.
  test("zsh_docs category help surfaces every category label", () => {
    const help = flagDesc(docsToolDef, "category")
    for (const cat of docCategories)
      expect(help).toContain(docCategoryLabels[cat])
  })

  // Entry-point tools name the vendored zsh tag; follow-ups do not.
  test.each([
    ["zsh_docs", docsToolDef, true],
    ["zsh_search", searchToolDef, true],
    ["zsh_list", listToolDef, false],
  ] as const)("%s description names vendored zsh tag: %s", (_n, def, expected) => {
    expect(def.description.includes(ZSH_UPSTREAM.tag)).toBe(expected)
  })
})

// The preamble is single-sourced but rendered into two surfaces (MCP
// handshake instructions + CLI `--help`). Every `zsh_*` mention must
// resolve to a real tool, otherwise the CLI's `prose::rewrite_refs` leaves
// a stale name in terminal output. Tone/length drift is on reviewers;
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
