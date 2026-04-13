import * as assert from "node:assert"
import { vi } from "vitest"
import { lineDoc } from "./test-util"

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

function tokens(text: string, builtins: readonly string[]) {
  const lines = text.split("\n")
  return (
    new SemanticTokensProvider([...builtins]).provideDocumentSemanticTokens(
      lineDoc(text),
    ) as unknown as Token[]
  ).map((t) => ({
    word: lines[t.line]?.slice(t.start, t.start + t.length) ?? "",
    type: t.type,
  }))
}

function builtinWords(text: string, builtins: readonly string[]) {
  return tokens(text, builtins)
    .filter((t) => t.type === 0)
    .map((t) => t.word)
}

const kw = (word: string) => ({ word, type: 1 })
const bi = (word: string) => ({ word, type: 0 })

suite("SemanticTokensProvider", () => {
  for (const [text, builtins, want] of [
    ["echo hi\nread var", ["echo", "read"], ["echo", "read"]],
    ["for r in one two; do echo $r; done", ["r", "echo"], ["echo"]],
    [
      "a() uname -a\nr() uname -a\ns() uname -a",
      ["r", "uname"],
      ["uname", "uname", "uname"],
    ],
    ["print ${var[(a)1]} ${var[(r)1]} ${var[(s)1]}", ["print", "r"], ["print"]],
    ["[ -d /tmp ] && echo OK", ["[", "echo"], ["echo"]],
    ["noglob builtin echo hi", ["builtin", "echo"], ["echo"]],
    ["command echo hi", ["command", "echo"], []],
    ["f() { echo }", ["echo"], ["echo"]],
    ["echo hi | read var", ["echo", "read"], ["echo", "read"]],
    ["echo hi && fc", ["echo", "fc"], ["echo", "fc"]],
    ["echo hi || fc", ["echo", "fc"], ["echo", "fc"]],
    ["if ((1)) { fc; }", ["fc"], ["fc"]],
    ["if ((1)) fc", ["fc"], ["fc"]],
  ] as const) {
    test(text, () => {
      assert.deepStrictEqual(builtinWords(text, builtins), want)
    })
  }

  for (const [text, builtins, want] of [
    [
      "if true; then echo hi; fi",
      ["echo"],
      [kw("if"), kw("then"), bi("echo"), kw("fi")],
    ],
    [
      "for x in a b; do\n  echo $x\ndone",
      ["echo"],
      [kw("for"), kw("do"), bi("echo"), kw("done")],
    ],
    ["f() { echo; }", ["echo"], [bi("echo")]],
    [
      "while true; do echo; done",
      ["echo"],
      [kw("while"), kw("do"), bi("echo"), kw("done")],
    ],
    ["if ((1)) echo", ["echo"], [kw("if"), kw("(("), kw("))"), bi("echo")]],
    ["(( x++ ))", [], [kw("(("), kw("))")]],
  ] as const) {
    test(text, () => {
      assert.deepStrictEqual(tokens(text, builtins), want)
    })
  }
})
