import * as assert from "node:assert"
import { vi } from "vitest"

type Token = {
  line: number
  start: number
  length: number
  type: number
  modifiers: number
}

vi.mock("vscode", () => ({
  SemanticTokensLegend: class {},
  SemanticTokensBuilder: class {
    private tokens: Token[] = []

    push(
      line: number,
      start: number,
      length: number,
      type: number,
      modifiers: number,
    ) {
      this.tokens.push({ line, start, length, type, modifiers })
    }

    build() {
      return this.tokens
    }
  },
}))

import { SemanticTokensProvider } from "../semantic-tokens"

function doc(text: string) {
  const lines = text.split("\n")
  return {
    lineCount: lines.length,
    lineAt(i: number) {
      return { text: lines[i] ?? "" }
    },
  } as import("vscode").TextDocument
}

function tokens(text: string, builtins: string[]) {
  const lines = text.split("\n")
  return (
    new SemanticTokensProvider(builtins).provideDocumentSemanticTokens(
      doc(text),
    ) as unknown as Token[]
  ).map((t) => ({
    word: lines[t.line]?.slice(t.start, t.start + t.length) ?? "",
    type: t.type,
  }))
}

function builtinWords(text: string, builtins: string[]) {
  return tokens(text, builtins)
    .filter((t) => t.type === 0)
    .map((t) => t.word)
}

suite("SemanticTokensProvider", () => {
  test("marks builtin commands", () => {
    assert.deepStrictEqual(
      builtinWords("echo hi\nread var", ["echo", "read"]),
      ["echo", "read"],
    )
  })

  test("skips for-loop variables even if they are builtins", () => {
    assert.deepStrictEqual(
      builtinWords("for r in one two; do echo $r; done", ["r", "echo"]),
      ["echo"],
    )
  })

  test("skips function names in definitions even if they are builtins", () => {
    assert.deepStrictEqual(
      builtinWords("a() uname -a\nr() uname -a\ns() uname -a", ["r", "uname"]),
      ["uname", "uname", "uname"],
    )
  })

  test("skips builtin names inside parameter expansion flags", () => {
    assert.deepStrictEqual(
      builtinWords("print ${var[(a)1]} ${var[(r)1]} ${var[(s)1]}", [
        "print",
        "r",
      ]),
      ["print"],
    )
  })

  test("does not mark [ as a builtin in test syntax", () => {
    assert.deepStrictEqual(
      builtinWords("[ -d /tmp ] && echo OK", ["[", "echo"]),
      ["echo"],
    )
  })

  test("marks builtin after builtin-style precommand modifiers", () => {
    assert.deepStrictEqual(
      builtinWords("noglob builtin echo hi", ["builtin", "echo"]),
      ["echo"],
    )
  })

  test("does not mark target after command precommand modifier", () => {
    assert.deepStrictEqual(
      builtinWords("command echo hi", ["command", "echo"]),
      [],
    )
  })

  test("marks reserved words as keyword tokens", () => {
    const result = tokens("if true; then echo hi; fi", ["echo"])
    assert.deepStrictEqual(result, [
      { word: "if", type: 1 },
      { word: "then", type: 1 },
      { word: "echo", type: 0 },
      { word: "fi", type: 1 },
    ])
  })

  test("marks reserved words on separate lines", () => {
    const result = tokens("for x in a b; do\n  echo $x\ndone", ["echo"])
    assert.deepStrictEqual(result, [
      { word: "for", type: 1 },
      { word: "do", type: 1 },
      { word: "echo", type: 0 },
      { word: "done", type: 1 },
    ])
  })
})
