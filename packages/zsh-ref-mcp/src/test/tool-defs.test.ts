import { describe, expect, test } from "vitest"
import { loadCorpus } from "zsh-core"
import {
  type ClassifyResult,
  classifyToolDef,
  type LookupOptionResult,
  lookupOptionToolDef,
  toolDefs,
} from "../../index.ts"

const corpus = loadCorpus()

describe("toolDefs metadata", () => {
  test("names are stable, unique, snake_case, zsh_-prefixed", () => {
    const names = toolDefs.map(def => def.name)
    expect(names).toEqual(["zsh_classify", "zsh_lookup_option"])
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(name).toMatch(/^zsh_[a-z][a-z0-9_]*$/)
  })

  test("inputSchema is a JSON object schema with 'raw' required", () => {
    for (const def of toolDefs) {
      expect(def.inputSchema).toMatchObject({
        type: "object",
        required: ["raw"],
      })
      const props = (def.inputSchema as { properties: Record<string, unknown> })
        .properties
      expect(props.raw).toMatchObject({ type: "string" })
    }
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

  test("zsh_classify enumerates multiple categories", () => {
    const d = classifyToolDef.description
    for (const cat of [
      "option",
      "builtin",
      "reserved word",
      "redirection",
      "parameter",
    ]) {
      expect(d).toMatch(new RegExp(cat, "i"))
    }
  })

  test("zsh_lookup_option mentions negation semantics", () => {
    const d = lookupOptionToolDef.description
    expect(d).toMatch(/negat/i)
    expect(d).toContain("NO_")
  })
})
