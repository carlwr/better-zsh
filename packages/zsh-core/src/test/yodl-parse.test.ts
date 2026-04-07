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
} from "../yodl/parse"

describe("stripYodl", () => {
  test("strips tt() wrapper", () => {
    expect(stripYodl("tt(foo)")).toBe("foo")
  })

  test("strips var() wrapper", () => {
    expect(stripYodl("var(file)")).toBe("file")
  })

  test("strips nested wrappers", () => {
    expect(stripYodl("tt(AUTO_CD) and var(name)")).toBe("AUTO_CD and name")
  })

  test("replaces LPAR/RPAR", () => {
    expect(stripYodl("tt(LPAR())")).toBe("(")
    expect(stripYodl("tt(RPAR())")).toBe(")")
  })

  test("replaces PLUS", () => {
    expect(stripYodl("PLUS()")).toBe("+")
  })

  test("strips em() and bf()", () => {
    expect(stripYodl("em(italic) and bf(bold)")).toBe("italic and bold")
  })

  test("strips cindex/pindex/findex entirely", () => {
    expect(stripYodl("cindex(some concept)\ntext")).toBe("text")
  })

  test("strips COMMENT()", () => {
    expect(stripYodl("COMMENT(hidden)\nvisible")).toBe("visible")
  })

  test("keeps the non-zman branch and noderef text", () => {
    expect(
      stripYodl(
        "ifzman(the section FILES in zmanref(zshmisc))ifnzman(noderef(Files))",
      ),
    ).toBe("Files")
  })

  test("strips startsitem()/endsitem() markers", () => {
    expect(stripYodl("startsitem()\nendsitem()")).toBe("")
  })

  test("strips startitem()/enditem() markers", () => {
    expect(stripYodl("startitem()\nenditem()")).toBe("")
  })

  test("converts sitem(head)(body) to list items", () => {
    expect(stripYodl("sitem(tt(\\a))(bell character)")).toBe(
      "- \\a: bell character",
    )
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
  test("renders yodl code quotes as markdown", () => {
    expect(normalizeDoc("code followed by `&&' `||' does not trigger")).toBe(
      "code followed by `&&` `||` does not trigger",
    )
  })

  test("joins continued prose lines", () => {
    expect(
      normalizeDoc("Arithmetic Evaluation\\\n\nhas an explicit list."),
    ).toBe("Arithmetic Evaluation has an explicit list.")
  })
})

describe("findBalancedClose", () => {
  test("simple parens", () => {
    expect(findBalancedClose("(abc)", 0)).toBe(4)
  })

  test("nested parens", () => {
    expect(findBalancedClose("(a(b)c)", 0)).toBe(6)
  })

  test("unbalanced returns -1", () => {
    expect(findBalancedClose("(abc", 0)).toBe(-1)
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
