import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  collectAliasedItems,
  extractItemList,
  extractItems,
  extractSectionBody,
  extractSections,
  findBalancedClose,
  normalizeDoc,
  stripYodl,
} from "../../yodl/parse"

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

describe("findBalancedClose", () => {
  test.each([
    ["(abc)", 0, 4],
    ["(a(b)c)", 0, 6],
    ["(abc", 0, -1],
  ])("%s from %i → %i", (s, start, exp) => {
    expect(findBalancedClose(s, start)).toBe(exp)
  })
})

describe("extractSections", () => {
  test("extracts sect and subsect", () => {
    const yo = "sect(Main)\nsome text\nsubsect(Sub One)\nmore text"
    const secs = extractSections(yo)
    expect(secs).toEqual([
      { level: "sect", name: "Main", line: 0 },
      { level: "subsect", name: "Sub One", line: 2 },
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
    expect(items[0]?.header).toBe("tt(FOO)")
    expect(items[0]?.body).toBe("body text\n")
    expect(items[0]?.section).toBe("Cat")
  })

  test("extracts xitem (no body)", () => {
    const yo = `subsect(Cat)
xitem(tt(BAR))`
    const items = extractItems(yo)
    expect(items).toHaveLength(1)
    expect(items[0]?.header).toBe("tt(BAR)")
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
    expect(extractItems(yo).map((item) => item.header)).toEqual(["tt(outer)"])
    expect(extractItemList(yo).map((item) => item.header)).toEqual([
      "tt(outer)",
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
    expect(extractSectionBody(yo, "Two")).toBe("b")
  })
})

describe("collectAliasedItems", () => {
  test("groups xitems with the following item", () => {
    const grouped = collectAliasedItems(
      extractItems(`xitem(tt(alias))\nitem(tt(main))(desc)`),
      (header) => stripYodl(header),
    )
    expect(grouped).toEqual([
      {
        head: "main",
        aliases: ["alias"],
        item: { header: "tt(main)", body: "desc", section: "" },
      },
    ])
  })
})
