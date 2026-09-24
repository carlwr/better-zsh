import * as fcu from "@carlwr/fastcheck-utils"
import type { BuiltinDoc, DocCorpus, ReservedWordDoc } from "@carlwr/zsh-core"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { SemanticTokensProvider } from "../../editor/semantic-tokens"
import { tokenModifiers, tokenTypes } from "../../manifest/semantic-tokens"
import {
  by,
  emptyCorpus,
  expectStrictlyAscending,
  ident,
  lineDoc,
} from "../test-util"
import type { RawToken } from "../vscode-stub"

const KEYWORD = tokenTypes.indexOf("keyword")
const FUNCTION = tokenTypes.indexOf("function")
const DEFAULT_LIBRARY = 1 << tokenModifiers.indexOf("defaultLibrary")

/** The provider reads two name sets; a corpus holding just those. */
function provider(
  builtins: readonly string[],
  reservedWords: readonly string[],
) {
  const b = (name: string): BuiltinDoc => ({
    ...ident("builtin", name),
    synopsis: [name],
    desc: "",
  })
  const rw = (name: string): ReservedWordDoc => ({
    ...ident("reserved_word", name),
    subKind: "command",
    sig: name,
  })
  const corpus: DocCorpus = {
    ...emptyCorpus(),
    builtin: by(builtins.map(b)),
    reserved_word: by(reservedWords.map(rw)),
  }
  return new SemanticTokensProvider(corpus)
}

const rawTokens = (
  text: string,
  builtins: readonly string[],
  reservedWords: readonly string[],
) =>
  provider(builtins, reservedWords).provideDocumentSemanticTokens(lineDoc(text))
    .data as unknown as RawToken[]

function tokens(
  text: string,
  builtins: readonly string[],
  reservedWords: readonly string[] = [],
) {
  const lines = text.split("\n")
  return rawTokens(text, builtins, reservedWords).map(t => ({
    word: lines[t.line]?.slice(t.start, t.start + t.length) ?? "",
    type: t.type,
    modifiers: t.modifiers,
  }))
}

const kw = (word: string) => ({ word, type: KEYWORD, modifiers: 0 })
const bi = (word: string) => ({
  word,
  type: FUNCTION,
  modifiers: DEFAULT_LIBRARY,
})

describe("SemanticTokensProvider", () => {
  test.each<
    [string, readonly string[], readonly string[], ReturnType<typeof kw>[]]
  >([
    // extension painting policy on top of the analyzer's facts
    ["echo hi\nread var", ["echo", "read"], [], [bi("echo"), bi("read")]],
    ["[ -d /tmp ] && echo OK", ["[", "echo"], [], [bi("echo")]], // `[` never painted
    ["noglob builtin echo hi", ["builtin", "echo"], [], [bi("echo")]],
    ["command echo hi", ["command", "echo"], [], []], // `command` head: external by intent
    [
      "if true; then echo hi; fi",
      ["echo"],
      [],
      [kw("if"), kw("then"), bi("echo"), kw("fi")],
    ],
    ["f() { echo; }", ["echo"], [], [bi("echo")]], // delimiter reserved words filtered
    ["(( x++ ))", [], [], []],
    ["[[ a && b ]]", [], [], []],
    // multi-line offsets, including a quoted region spanning lines
    [
      'f -u2 "\nprint x\n"\necho after',
      ["f", "print", "echo"],
      [],
      [bi("f"), bi("echo")],
    ],
    // manual reserved words the analyzer treats as command heads are painted
    // as keywords from the corpus list — also when they are builtins
    ["declare foo=bar", [], ["declare"], [kw("declare")]],
    ["export PATH=/x", ["export"], ["export"], [kw("export")]],
  ])("%s", (text, builtins, reservedWords, want) => {
    expect(tokens(text, builtins, reservedWords)).toEqual(want)
  })

  test("tokens never span a line end, ascend, and paint only listed names", () => {
    const listed = fc.subarray(["echo", "read", "declare", "export"])
    const line = fc
      .array(
        fcu.element([
          "echo",
          "read",
          "declare",
          "export",
          "if",
          "then",
          "fi",
          "{",
          "}",
          "((",
          "))",
          "[[",
          "]]",
          "[",
          "command",
          "noglob",
          "foo",
          '"str # x"',
          "'#'",
          ";",
          "&&",
        ]),
        { maxLength: 6 },
      )
      .map(ws => ws.join(" "))
    fc.assert(
      fc.property(
        fcu.nonEmptyArray(line, { maxLength: 5 }),
        listed,
        listed,
        (lines, builtins, reservedWords) => {
          const raw = rawTokens(lines.join("\n"), builtins, reservedWords)
          for (const t of raw) {
            const text = lines[t.line] ?? ""
            expect(t.start + t.length).toBeLessThanOrEqual(text.length)
            const word = text.slice(t.start, t.start + t.length)
            if (t.type === FUNCTION) expect(builtins).toContain(word)
            else expect([...reservedWords, "if", "then", "fi"]).toContain(word)
          }
          expectStrictlyAscending(raw.map(t => [t.line, t.start]))
        },
      ),
    )
  })
})
