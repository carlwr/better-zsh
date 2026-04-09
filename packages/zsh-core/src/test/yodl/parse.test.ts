import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  collectAliasedEntries,
  extractItemList,
  extractItems,
  extractSectionBody,
  extractSections,
} from "../../yodl/core/doc"
import { parseNodes } from "../../yodl/core/nodes"
import { normalizeDoc, stripYodl } from "../../yodl/core/text"

describe("stripYodl", () => {
  test.each([
    ["tt()", "tt(foo)", "foo"],
    ["var()", "var(file)", "file"],
    ["nested tt+var", "tt(AUTO_CD) and var(name)", "AUTO_CD and name"],
    ["LPAR", "tt(LPAR())", "("],
    ["RPAR", "tt(RPAR())", ")"],
    ["PLUS", "PLUS()", "+"],
    ["em/bf", "em(italic) and bf(bold)", "italic and bold"],
    ["cindex", "cindex(some concept)\ntext", "text"],
    ["COMMENT", "COMMENT(hidden)\nvisible", "visible"],
    [
      "ifzman → noderef",
      "ifzman(the section FILES in zmanref(zshmisc))ifnzman(noderef(Files))",
      "Files",
    ],
    ["startsitem/endsitem", "startsitem()\nendsitem()", ""],
    ["startitem/enditem", "startitem()\nenditem()", ""],
    ["sitem", "sitem(tt(\\a))(bell character)", "- \\a: bell character"],
  ])("%s", (_label, input, expected) => {
    expect(stripYodl(input)).toBe(expected)
  })

  test("handles sitem list block without artefacts", () => {
    const input = [
      "startsitem()",
      "sitem(tt(\\a))(bell character)",
      "sitem(tt(\\n))(newline)",
      "endsitem()",
    ].join("\n")
    const result = stripYodl(input)
    expect(result).not.toContain("startsitem")
    expect(result).not.toContain("endsitem")
    expect(result).not.toContain("sitem(")
    expect(result).not.toContain("tt(")
    expect(result).not.toContain("\u0007")
    expect(result).toContain("- \\a: bell character")
    expect(result).toContain("- \\n: newline")
  })

  test("em() inside sitem is not falsely matched", () => {
    const result = stripYodl("sitem(tt(\\a))(bell character)")
    expect(result).not.toContain("sit")
    expect(result).toBe("- \\a: bell character")
  })

  test("output length ≤ input length + list markup allowance", () => {
    fc.assert(
      fc.property(fc.string(), (s: string) => {
        const sitemCount = (s.match(/sitem\(/g) ?? []).length
        expect(stripYodl(s).length).toBeLessThanOrEqual(
          s.length + sitemCount * 4,
        )
      }),
    )
  })

  test("is idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (s: string) => {
        expect(stripYodl(stripYodl(s))).toBe(stripYodl(s))
      }),
    )
  })
})

describe("normalizeDoc", () => {
  test.each([
    [
      "code quotes → markdown",
      "code followed by `&&' `||' does not trigger",
      "code followed by `&&` `||` does not trigger",
    ],
    [
      "joins continued prose lines",
      "Arithmetic Evaluation\\\n\nhas an explicit list.",
      "Arithmetic Evaluation has an explicit list.",
    ],
  ])("%s", (_label, input, expected) => {
    expect(normalizeDoc(input)).toBe(expected)
  })
})

describe("parseNodes", () => {
  test("parses adjacent macros without rescanning glitches", () => {
    expect(stripYodl(parseNodes("tt(${)var(n)PLUS()1tt(})"))).toBe("${n+1}")
  })

  test("keeps literal parens inside macro args balanced", () => {
    const items = extractItems(`item(tt(AUTO_CD) (tt(-J)))(desc)`)
    expect(stripYodl(items[0]?.header ?? [])).toBe("AUTO_CD (-J)")
  })
})

describe("extractSections", () => {
  test("extracts sect and subsect", () => {
    const yo = "sect(Main)\nsome text\nsubsect(Sub One)\nmore text"
    expect(
      extractSections(yo).map((sec) => ({
        level: sec.level,
        name: sec.name,
        body: stripYodl(sec.body),
      })),
    ).toEqual([
      { level: "sect", name: "Main", body: "some text" },
      { level: "subsect", name: "Sub One", body: "more text" },
    ])
  })
})

describe("extractItems", () => {
  test("extracts item with body", () => {
    const yo = `subsect(Cat)
item(tt(FOO))(
body text
)`
    const items = extractItems(yo)
    expect(items).toHaveLength(1)
    expect(stripYodl(items[0]?.header ?? [])).toBe("FOO")
    expect(stripYodl(items[0]?.body ?? [])).toBe("body text")
    expect(items[0]?.section).toBe("Cat")
  })

  test("extracts xitem (no body)", () => {
    const yo = `subsect(Cat)
xitem(tt(BAR))`
    const items = extractItems(yo)
    expect(items).toHaveLength(1)
    expect(stripYodl(items[0]?.header ?? [])).toBe("BAR")
    expect(items[0]?.body).toBeUndefined()
  })

  test("extracts xitem + item pair", () => {
    const yo = `subsect(Cat)
xitem(var(s) tt(=) var(p))
item(var(s) tt(==) var(p))(
desc
)`
    const items = extractItems(yo)
    expect(items).toHaveLength(2)
    expect(items[0]?.body).toBeUndefined()
    expect(items[1]?.body).toBeDefined()
  })

  test("can filter by list depth", () => {
    const yo = `startitem()
item(tt(outer))(
startitem()
item(tt(inner))(
desc
)
enditem()
)
enditem()`
    expect(extractItems(yo).map((item) => stripYodl(item.header))).toEqual([
      "outer",
    ])
    expect(extractItemList(yo).map((item) => stripYodl(item.header))).toEqual([
      "outer",
    ])
  })

  test("depth filter excludes nested bodyful items", () => {
    const yo = `startitem()
item(tt(outer))(
startitem()
item(tt(inner))(
desc
)
enditem()
)
enditem()`
    expect(extractItems(yo, 1).map((item) => stripYodl(item.header))).toEqual([
      "outer",
    ])
  })

  test("never throws on arbitrary input", () => {
    fc.assert(
      fc.property(fc.string(), (s: string) => {
        expect(() => extractItems(s)).not.toThrow()
      }),
    )
  })

  test("item count ≤ number of item( in input", () => {
    fc.assert(
      fc.property(fc.string(), (s: string) => {
        const items = extractItems(s)
        const itemCount = (s.match(/item\(/g) || []).length
        expect(items.length).toBeLessThanOrEqual(itemCount)
      }),
    )
  })
})

describe("extractSectionBody", () => {
  test("returns the lines between matching section headers", () => {
    const yo = "sect(One)\na\nsubsect(Two)\nb\nsect(Three)\nc"
    expect(stripYodl(extractSectionBody(yo, "Two"))).toBe("b")
  })
})

describe("collectAliasedEntries", () => {
  test("groups xitems with the following item", () => {
    const grouped = collectAliasedEntries(
      extractItems(`xitem(tt(alias))\nitem(tt(main))(desc)`),
      (header) => stripYodl(header),
    )
    expect(grouped).toHaveLength(1)
    expect(grouped[0]?.head).toBe("main")
    expect(grouped[0]?.aliases).toEqual(["alias"])
    expect(stripYodl(grouped[0]?.entry.header ?? [])).toBe("main")
    expect(stripYodl(grouped[0]?.entry.body ?? [])).toBe("desc")
    expect(grouped[0]?.entry.section).toBe("")
  })
})
