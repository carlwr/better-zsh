import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { funcAt, funcDecl, funcDecls } from "../../document/funcs"
import { wordMatches } from "../../document/words"
import { lineDoc, pos, wordDoc } from "../test-util"

describe("funcDecls", () => {
  test("both declaration forms, in order; first declaration wins by name", () => {
    const doc = lineDoc(
      ["alpha() {", "}", "function beta {", "}", "alpha() { :; }"].join("\n"),
    )
    expect(
      funcDecls(doc).map(f => [f.name, f.selectionRange.start.line]),
    ).toEqual([
      ["alpha", 0],
      ["beta", 2],
      ["alpha", 4],
    ])
    expect(funcDecl(doc, "alpha")?.range.start.line).toBe(0)
    expect(funcDecl(doc, "gamma")).toBeUndefined()
  })

  test("multi-name declarations: one entry per name, at its own column", () => {
    const doc = lineDoc(
      ["# shared doc", "funcA funcB() print $0", "function d e {"].join("\n"),
    )
    expect(
      funcDecls(doc).map(f => [
        f.name,
        f.selectionRange.start.line,
        f.selectionRange.start.character,
        f.doc,
      ]),
    ).toEqual([
      ["funcA", 1, 0, "shared doc"],
      ["funcB", 1, 6, "shared doc"],
      ["d", 2, 9, undefined],
      ["e", 2, 11, undefined],
    ])
  })
})

describe("function docs", () => {
  const docOf = (src: string, name: string) => funcDecl(lineDoc(src), name)?.doc
  test.each([
    [
      "# above funcname()",
      "# does stuff\n# usage: foo arg\nfoo() {",
      "foo",
      "does stuff\nusage: foo arg",
    ],
    [
      "# above function keyword",
      "# the bar func\nfunction bar {",
      "bar",
      "the bar func",
    ],
    [
      "# below declaration",
      "my-func()\n# inline doc\n# second line",
      "my-func",
      "inline doc\nsecond line",
    ],
    ["above wins over below", "# above\nfoo()\n# below", "foo", "above"],
    ["no adjacent comment", "foo() {\n  echo hi\n}", "foo", undefined],
    [
      "blank line breaks collection",
      "# orphan comment\n\nfoo() {",
      "foo",
      undefined,
    ],
    ["dashed name", "# my docs\nmy-long-name() {", "my-long-name", "my docs"],
    [
      "shebang is not a docstring",
      "#!/usr/bin/env zsh\nfoo() {",
      "foo",
      undefined,
    ],
    [
      "$0 in text",
      "cheer()\n  # docs line1\n  # usage: $0 TITLE\n  # example: $0 Mister -> prints 'You go, Mister!'",
      "cheer",
      "docs line1\nusage: $0 TITLE\nexample: $0 Mister -> prints 'You go, Mister!'",
    ],
  ])("%s", (_, src, name, want) => {
    expect(docOf(src, name)).toBe(want)
  })

  test("each function gets its own docs", () => {
    const doc = lineDoc("# doc a\na()\n\n# doc b\nb()")
    expect(funcDecls(doc).map(f => [f.name, f.doc])).toEqual([
      ["a", "doc a"],
      ["b", "doc b"],
    ])
  })
})

describe("funcAt", () => {
  test("hits a declared function's call, not a `-`-glued word", () => {
    const doc = wordDoc("foo() {}\nfoo -foo")
    expect(funcAt(doc, pos(1, 1))?.decl.name).toBe("foo")
    expect(funcAt(doc, pos(1, 6))).toBeUndefined()
  })

  // Rename edits `wordMatches` of the hit's name: the word under the cursor
  // must be among them.
  test("a hit's range is among its name's whole-word matches", () => {
    const lineArb = fc
      .array(fcu.element(["foo", "-foo", "foo-x", "--foo", "# foo", ";"]), {
        maxLength: 5,
      })
      .map(ws => ws.join(" "))
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 3 }), lines => {
        const doc = wordDoc(["foo() {}", ...lines].join("\n"))
        lines.forEach((text, i) => {
          for (let c = 0; c <= text.length; c++) {
            const hit = funcAt(doc, pos(i + 1, c))
            if (!hit) continue
            const at = [hit.range.start.line, hit.range.start.character]
            expect(
              wordMatches(doc, hit.decl.name).map(r => [
                r.start.line,
                r.start.character,
              ]),
            ).toContainEqual(at)
          }
        })
      }),
    )
  })
})
