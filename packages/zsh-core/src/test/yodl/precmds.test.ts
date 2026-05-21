import { describe, expect, test } from "vitest"
import { precmdNames } from "../../docs/types"
import { parsePrecmds } from "../../docs/yodl/extractors/precmds"
import { by, readVendoredYo } from "./test-util"

const docs = parsePrecmds(readVendoredYo("grammar.yo"))
const byName = by(docs, d => d.name)

// `synopsis: NonEmpty<string>` is type-level non-empty; no runtime check.

describe("parsePrecmds", () => {
  test("parses every documented precommand modifier", () => {
    expect(docs.map(d => d.name).sort()).toEqual([...precmdNames].sort())
  })

  test.each([
    ["command", "command [ -pvV ]", /external command/i],
    ["exec", "exec [ -cl ]", /current process/i],
  ] as const)("%s keeps synopsis and prose", (name, sig, descRe) => {
    const d = byName.get(name)
    expect(d?.synopsis[0]).toContain(sig)
    expect(d?.desc).toMatch(descRe)
  })
})
