import * as assert from "node:assert"
import { vi } from "vitest"
import type {
  BuiltinDoc,
  CondOpDoc,
  RedirDoc,
  ShellParamDoc,
  ZshOption,
} from "zsh-core"
import * as core from "zsh-core"
import { wordDoc } from "./test-util"

vi.mock("vscode", () => ({
  Position: class {
    line: number
    character: number
    constructor(line: number, character: number) {
      this.line = line
      this.character = character
    }
  },
  Range: class {
    start: { line: number; character: number }
    end: { line: number; character: number }
    constructor(
      startLine: number,
      startChar: number,
      endLine: number,
      endChar: number,
    ) {
      this.start = { line: startLine, character: startChar }
      this.end = { line: endLine, character: endChar }
    }
  },
  Hover: class {
    contents: unknown
    range?: unknown
    constructor(contents: unknown, range?: unknown) {
      this.contents = contents
      this.range = range
    }
  },
  MarkdownString: class {
    value: string
    constructor(v = "") {
      this.value = v
    }
    appendCodeblock(v: string) {
      this.value += v
      return this
    }
  },
}))

import { HoverProvider } from "../hover"

const b = (name: string, desc: string): BuiltinDoc => ({
  name: core.mkBuiltinName(name),
  synopsis: [name],
  desc,
})
const o = (name: string, category: ZshOption["category"]): ZshOption => ({
  name: core.mkOptName(name),
  display: name,
  flags: [{ char: core.mkOptFlagChar("f"), on: "+" }],
  defaultIn: ["zsh"],
  category,
  desc: "",
})
const r = (groupOp: string, sig: string, desc: string): RedirDoc => ({
  groupOp: core.mkRedirOp(groupOp),
  sig: core.mkRedirSig(sig),
  desc,
  section: "x",
})
const p = (name: string, desc: string): ShellParamDoc => ({
  name: core.mkShellParamName(name),
  sig: name,
  desc,
  section: "Parameters Set By The Shell",
})
function c(
  arity: "unary",
  op: string,
  operands: Extract<CondOpDoc, { arity: "unary" }>["operands"],
  desc: string,
): Extract<CondOpDoc, { arity: "unary" }>
function c(
  arity: "binary",
  op: string,
  operands: Extract<CondOpDoc, { arity: "binary" }>["operands"],
  desc: string,
): Extract<CondOpDoc, { arity: "binary" }>
function c(
  arity: CondOpDoc["arity"],
  op: string,
  operands: CondOpDoc["operands"],
  desc: string,
): CondOpDoc {
  return arity === "unary"
    ? ({ op: core.mkCondOp(op), operands, desc, arity } as Extract<
        CondOpDoc,
        { arity: "unary" }
      >)
    : ({ op: core.mkCondOp(op), operands, desc, arity } as Extract<
        CondOpDoc,
        { arity: "binary" }
      >)
}

const builtins = [b("echo", "d:e"), b("fc", "d:f")]
const options = [
  o("GLOB", "Expansion and Globbing"),
  o("RCS", "Initialisation"),
]
const redirs = [
  r(">&", ">& number", "d:n"),
  r(">&", ">& -", "d:-"),
  r(">&", ">& p", "d:p"),
  r(">&", ">& word", "d:w"),
  r(">&!", ">&! word", "d:!"),
  r("&>", "&> word", "d:&"),
]
const params = [p("SECONDS", "d:s")]
const condOps = [
  c("binary", "&&", ["exp1", "exp2"], "d:&"),
  c("binary", "||", ["exp1", "exp2"], "d:|"),
  c("binary", "<", ["s1", "s2"], "d:<"),
  c("binary", ">", ["s1", "s2"], "d:>"),
  c("unary", "!", ["exp"], "d:!"),
]

function mk() {
  return new HoverProvider(
    params,
    options,
    condOps,
    builtins,
    undefined,
    redirs,
  )
}

function at(line: string, char: number): { value: string } | undefined {
  const h = mk().provideHover(wordDoc(line, "hover"), {
    line: 0,
    character: char,
  } as import("vscode").Position)
  return h
    ? ((h as { contents?: { value?: string } }).contents as { value: string })
    : undefined
}

suite("HoverProvider", () => {
  for (const [line, char, re] of [
    ["f() { echo; }", 7, /d:e/],
    ["f() { echo }", 7, /d:e/],
    ["f() echo", 4, /d:e/],
    ["if ((1)) { fc; }", 12, /d:f/],
    ["if ((1)) fc", 9, /d:f/],
  ] as const) {
    test(line, () => {
      assert.match(at(line, char)?.value ?? "", re)
    })
  }

  test("echo thing >&2 prefers builtin", () => {
    const h = at("echo thing >&2", 1)
    assert.match(h?.value ?? "", /d:e/)
    assert.doesNotMatch(h?.value ?? "", /d:w/)
  })

  for (const [line, char, re] of [
    ["[[ a && b ]]", 5, /d:&/],
    ["[[ a || b ]]", 5, /d:\|/],
    ["[[ a < b ]]", 5, /d:</],
    ["[[ a > b ]]", 5, /d:>/],
    ["[[ ! -f x ]]", 3, /d:!/],
  ] as const) {
    test(line, () => {
      assert.match(at(line, char)?.value ?? "", re)
    })
  }

  test("print $SECONDS", () => {
    assert.match(at("print $SECONDS", 8)?.value ?? "", /d:s/)
  })

  for (const [line, char] of [
    ["echo  hi", 4],
    ["echo # echo", 9],
    ["setopt +f", 8],
  ] as const) {
    test(line, () => {
      assert.strictEqual(at(line, char), undefined)
    })
  }

  for (const [line, char, re] of [
    ["echo >&2", 6, /d:n/],
    ["echo >&-", 6, /d:-/],
    ["echo >&p", 6, /d:p/],
    ["echo >&file", 6, /d:w/],
    ["echo >&file", 8, /d:w/],
    ["echo >&!file", 8, /d:!/],
  ] as const) {
    test(`${line} @${char}`, () => {
      assert.match(at(line, char)?.value ?? "", re)
    })
  }
})
