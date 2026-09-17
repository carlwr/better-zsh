import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { SemanticTokensProvider } from "../editor/semantic-tokens"
import { tokenModifiers, tokenTypes } from "../manifest"
import { lineDoc } from "./test-util"
import type { RawToken } from "./vscode-stub"

const KEYWORD = tokenTypes.indexOf("keyword")
const FUNCTION = tokenTypes.indexOf("function")
const DEFAULT_LIBRARY = 1 << tokenModifiers.indexOf("defaultLibrary")

function tokens(
  text: string,
  builtins: readonly string[],
  reservedWords: readonly string[] = [],
) {
  const lines = text.split("\n")
  const raw = new SemanticTokensProvider(
    builtins,
    reservedWords,
  ).provideDocumentSemanticTokens(lineDoc(text)).data as unknown as RawToken[]
  return raw.map(t => ({
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
    const line = fc
      .array(
        fc.constantFrom(
          "echo",
          "read",
          "declare",
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
        ),
        { maxLength: 6 },
      )
      .map(ws => ws.join(" "))
    fc.assert(
      fc.property(fc.array(line, { minLength: 1, maxLength: 5 }), lines => {
        const doc = lineDoc(lines.join("\n"))
        const raw = new SemanticTokensProvider(
          ["echo", "read"],
          ["declare"],
        ).provideDocumentSemanticTokens(doc).data as unknown as RawToken[]
        let prev: [number, number] = [-1, -1]
        for (const t of raw) {
          const text = lines[t.line] ?? ""
          expect(t.start + t.length).toBeLessThanOrEqual(text.length)
          const word = text.slice(t.start, t.start + t.length)
          if (t.type === FUNCTION) expect(["echo", "read"]).toContain(word)
          else expect(["declare", "if", "then", "fi"]).toContain(word)
          expect(
            t.line > prev[0] || (t.line === prev[0] && t.start > prev[1]),
          ).toBe(true)
          prev = [t.line, t.start]
        }
      }),
    )
  })
})
