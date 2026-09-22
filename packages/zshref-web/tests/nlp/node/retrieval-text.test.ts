// Pure — synthetic records, no corpus, no staged assets.

import fc from "fast-check"
import { describe, expect, it } from "vitest"

import type {
  Identity,
  JsonRecord,
  JsonValue,
} from "../../../nlp/node/retrieval-text"
import {
  compactValue,
  expandedText,
  hayHasWord,
  keyWords,
  normalizeWs,
  recordText,
  stripMarkdown,
} from "../../../nlp/node/retrieval-text"

const noGroups: string[][] = []

describe("recordText", () => {
  it("uses the structured fields and the body", () => {
    const rec: JsonRecord = {
      category: "conditional_op",
      id: "-nt",
      display: "-nt",
      operands: ["file1", "file2"],
      desc: "true if file1 exists and is newer than file2.",
      _mdBody: "`-nt` *file1* `-nt` *file2*",
      subKind: "binary",
    }
    const text = recordText("conditional_op", rec, noGroups)
    expect(text.structured).toContain("category: conditional operator")
    expect(text.structured).toContain("operands: file1 file2")
    expect(text.body).toContain("newer than file2")
    // Expanded view always carries the category label for semantic anchoring.
    expect(text.expanded).toContain("conditional operator")
  })

  it("emits header lines, then fields in record order, skipping identity, desc and rendered fields", () => {
    const rec: JsonRecord = {
      category: "option",
      id: "autocd",
      display: "AUTO_CD",
      flags: { char: "J", on: "-" },
      desc: "not in structured",
      _mdBody: "body",
      _title: "`AUTO_CD`",
    }
    const text = recordText("option", rec, noGroups)
    expect(text.structured).toBe(
      "category: option\ncategory id: option\nid: autocd\ndisplay: AUTO_CD\nflags: char J on -",
    )
    expect(text.title).toBe("`AUTO_CD`")
    expect(text.md_body).toBe("body")
    expect(text.expanded).toBe("option\nautocd\nAUTO CD")
  })

  it("omits sub_kind when the record has none, and puts it after display", () => {
    const rec: JsonRecord = {
      id: "x",
      display: "x",
      subKind: "unary",
      _mdBody: "",
    }
    expect(Object.keys(recordText("glob_op", rec, noGroups))).toEqual([
      "category",
      "category_label",
      "id",
      "display",
      "sub_kind",
      "title",
      "md_body",
      "structured",
      "body",
      "expanded",
    ])
    expect(
      recordText("glob_op", { ...rec, subKind: "" }, noGroups),
    ).not.toHaveProperty("sub_kind")
    expect(recordText("glob_op", rec, noGroups).structured).toContain(
      "display: x\nsubKind: unary",
    )
  })

  it("body is desc verbatim (whitespace-normalized, markdown kept); else title + _mdBody stripped", () => {
    const withDesc: JsonRecord = {
      desc: "  keeps `code`  and\n*stars*  ",
      _mdBody: "ignored",
    }
    expect(recordText("builtin", withDesc, noGroups).body).toBe(
      "keeps `code` and *stars*",
    )
    const noDesc: JsonRecord = { _title: "`foo_bar`", _mdBody: "a *b*\n\n`c`" }
    expect(recordText("builtin", noDesc, noGroups).body).toBe("foobar a b c")
  })
})

describe("hayHasWord", () => {
  it("matches whole words, ASCII case-insensitively", () => {
    expect(hayHasWord("reading the size", "size")).toBe(true)
    expect(hayHasWord("reading the size", "SIZE")).toBe(true)
    expect(hayHasWord("reading the size", "read")).toBe(false)
    expect(hayHasWord("histsize", "size")).toBe(false)
    expect(hayHasWord("a-b", "b")).toBe(true)
  })

  it("needles with a space match as substrings", () => {
    expect(hayHasWord("the process id here", "process id")).toBe(true)
    expect(hayHasWord("the process id here", "ocess i")).toBe(true)
  })

  it("a single non-alphanumeric ASCII needle matches as a substring", () => {
    expect(hayHasWord("100%", "%")).toBe(true)
    expect(hayHasWord("a1", "1")).toBe(false)
    expect(hayHasWord("a1 1", "1")).toBe(true)
  })
})

describe("compactValue", () => {
  // JSON values with identifier-like keys, as rendered records have.
  const arbJson = fc.letrec<{ value: JsonValue }>(tie => ({
    value: fc.oneof(
      { depthSize: "small" },
      fc.constant(null),
      fc.boolean(),
      fc.integer(),
      fc.string({ unit: "grapheme", maxLength: 6 }),
      fc.array(tie("value"), { maxLength: 3 }),
      fc.dictionary(fc.stringMatching(/^[a-z_]{1,4}$/), tie("value"), {
        maxKeys: 3,
      }),
    ),
  })).value

  /** The words of every leaf and key: all a compact value may be made of. */
  const wordsOf = (value: JsonValue): string[] => {
    if (value === null) return []
    if (typeof value !== "object") return normalizeWs(String(value)).split(" ")
    if (Array.isArray(value)) return value.flatMap(wordsOf)
    return Object.entries(value).flatMap(([k, v]) => [
      ...keyWords(k).split(" "),
      ...wordsOf(v),
    ])
  }

  it("is undefined or one non-blank line of single-spaced words, each from a leaf or a key", () => {
    fc.assert(
      fc.property(arbJson, value => {
        const s = compactValue(value)
        if (s === undefined) return
        expect(s).toBe(normalizeWs(s))
        expect(s).not.toBe("")
        const allowed = new Set(wordsOf(value))
        for (const w of s.split(" ")) expect(allowed).toContain(w)
      }),
    )
  })

  it("normalizes strings and drops blanks and nulls", () => {
    expect(compactValue("  a \n b ")).toBe("a b")
    expect(compactValue("   ")).toBeUndefined()
    expect(compactValue(null)).toBeUndefined()
  })

  it("prints booleans and integers bare", () => {
    expect(compactValue(true)).toBe("true")
    expect(compactValue(0)).toBe("0")
    expect(compactValue(2)).toBe("2")
  })

  it("joins arrays with spaces, dropping blank members", () => {
    expect(compactValue(["a", " ", null, ["b", "c"]])).toBe("a b c")
    expect(compactValue([])).toBeUndefined()
    expect(compactValue([null, ""])).toBeUndefined()
  })

  it("flattens objects to key-value pairs with key words", () => {
    expect(compactValue({ default_in: "zsh", char: "J", gone: null })).toBe(
      "default in zsh char J",
    )
    expect(compactValue({ orderInGroup: 1, nested: { x: ["y"] } })).toBe(
      "orderInGroup 1 nested x y",
    )
    expect(compactValue({})).toBeUndefined()
  })
})

describe("expandedText", () => {
  const ident: Identity = {
    category: "special_param",
    label: "special parameter",
    id: "HISTSIZE",
    display: "$HISTSIZE",
    subKind: "scalar",
  }

  it("lists label and word forms once, in order, keeping case", () => {
    expect(expandedText(ident, "the history size", noGroups)).toBe(
      "special parameter\nspecial param\nHISTSIZE\n$HISTSIZE",
    )
    expect(
      expandedText({ ...ident, id: "x_y", display: "x-y" }, "", noGroups),
    ).toBe("special parameter\nspecial param\nx y")
  })

  it("appends the other members of a synonym group hit as a whole word", () => {
    const groups = [
      ["history", "hist"],
      ["size", "length", "histsize"],
      ["unrelated", "words"],
    ]
    // "hist" is not a whole word in the hay; "histsize" is (from the id).
    expect(expandedText(ident, "the history size", groups)).toBe(
      "special parameter\nspecial param\nHISTSIZE\n$HISTSIZE\nhist\nlength",
    )
  })

  const arbWord = fc.stringMatching(/^[a-z]{1,4}$/)
  const arbGroups = fc.array(
    fc.uniqueArray(arbWord, { minLength: 2, maxLength: 3 }),
    { maxLength: 4 },
  )
  const arbBody = fc.array(arbWord, { maxLength: 8 }).map(ws => ws.join(" "))

  it("the identity's word forms first, then per group hit as a whole word its absent members; no hint twice", () => {
    fc.assert(
      fc.property(arbGroups, arbBody, (groups, body) => {
        const hints = expandedText(ident, body, groups).split("\n")
        const own = [
          "special parameter",
          "special param",
          "HISTSIZE",
          "$HISTSIZE",
        ]
        expect(hints.slice(0, own.length)).toEqual(own)
        expect(new Set(hints).size).toBe(hints.length)
        const hay = [
          ident.category,
          ident.label,
          ident.id,
          ident.display,
          ident.subKind,
          body,
        ].join(" ")
        const want = groups.flatMap(g =>
          g.some(m => hayHasWord(hay, m))
            ? g.filter(m => !hayHasWord(hay, m))
            : [],
        )
        expect(hints.slice(own.length)).toEqual([...new Set(want)])
      }),
    )
  })

  it("matches group members against the lowercased hay, phrases included", () => {
    const groups = [["process id", "pid"]]
    expect(expandedText(ident, "holds the Process ID", groups)).toContain(
      "\npid",
    )
    expect(expandedText(ident, "holds the process", groups)).not.toContain(
      "pid",
    )
  })
})

describe("string helpers", () => {
  it("keyWords replaces underscores and hyphens, leaving camelCase", () => {
    expect(keyWords("default_in-group")).toBe("default in group")
    expect(keyWords("orderInGroup")).toBe("orderInGroup")
  })

  it("normalizeWs collapses runs and trims", () => {
    expect(normalizeWs(" a\t\tb \n c ")).toBe("a b c")
    expect(normalizeWs("\n")).toBe("")
  })

  it("stripMarkdown removes backticks, asterisks and underscores only", () => {
    expect(stripMarkdown("`a` *b* _c_ -d-")).toBe("a b c -d-")
  })

  it("normalizeWs: single spaces between the words, none at the ends, idempotent", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme", maxLength: 24 }), s => {
        const n = normalizeWs(s)
        expect(n).toBe(
          n
            .split(" ")
            .filter(w => w !== "")
            .join(" "),
        )
        expect(normalizeWs(n)).toBe(n)
        // Whitespace runs and padding are immaterial.
        expect(normalizeWs(` \t${s.replace(/ /g, " \n ")}\u00a0`)).toBe(n)
      }),
    )
  })

  it("hayHasWord: a hit is a substring hit; a plain word hits itself", () => {
    const word = fc.stringMatching(/^[a-z0-9]{1,5}$/)
    fc.assert(
      fc.property(
        fc.array(word, { maxLength: 6 }).map(ws => ws.join(" ")),
        word,
        (hay, needle) => {
          if (hayHasWord(hay, needle)) expect(hay).toContain(needle)
          expect(hayHasWord(needle, needle)).toBe(true)
          expect(hayHasWord(`${hay} ${needle}`, needle)).toBe(true)
          expect(hayHasWord(`${hay} x${needle}`, needle)).toBe(
            hayHasWord(hay, needle),
          )
        },
      ),
    )
  })
})
