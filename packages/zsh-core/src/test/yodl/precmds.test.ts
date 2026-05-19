import { describe, expect, test } from "vitest"
import { precmdNames } from "../../docs/types"
import { parsePrecmds } from "../../docs/yodl/extractors/precmds"
import { readVendoredYo } from "./test-util"

const GRAMMAR_YO = readVendoredYo("grammar.yo")

describe("parsePrecmds", () => {
  test("parses every documented precommand modifier", () => {
    expect(
      parsePrecmds(GRAMMAR_YO)
        .map(d => d.name)
        .sort(),
    ).toEqual([...precmdNames].sort())
  })

  test("command and exec keep synopsis and prose", () => {
    const docs = new Map(parsePrecmds(GRAMMAR_YO).map(d => [d.name, d]))
    expect(docs.get("command")?.synopsis[0]).toContain("command [ -pvV ]")
    expect(docs.get("command")?.desc).toMatch(/external command/i)
    expect(docs.get("exec")?.synopsis[0]).toContain("exec [ -cl ]")
    expect(docs.get("exec")?.desc).toMatch(/current process/i)
  })

  test("all precommand modifiers keep non-empty synopsis", () => {
    for (const doc of parsePrecmds(GRAMMAR_YO))
      expect(doc.synopsis.length).toBeGreaterThan(0)
  })
})
