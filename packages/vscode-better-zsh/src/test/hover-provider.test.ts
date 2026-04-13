import * as assert from "node:assert"
import { vi } from "vitest"
import {
  type BuiltinDoc,
  type CondOpDoc,
  mkBuiltinName,
  mkCondOp,
  mkOptFlagChar,
  mkOptName,
  mkRedirOp,
  mkRedirSig,
  mkShellParamName,
  type RedirDoc,
  type ShellParamDoc,
  type ZshOption,
} from "zsh-core"

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

function mockDoc(line: string) {
  return {
    uri: { toString: () => `test://hover/${line}` },
    version: 1,
    lineCount: 1,
    lineAt() {
      return { text: line }
    },
    getText(range?: {
      start: { character: number }
      end: { character: number }
    }) {
      if (!range) return line
      return line.slice(range.start.character, range.end.character)
    },
    getWordRangeAtPosition(pos: { character: number }) {
      const ch = line[pos.character] ?? ""
      if (!/[\w-]/.test(ch)) return undefined
      let start = pos.character
      while (start > 0 && /[\w-]/.test(line[start - 1] ?? "")) start--
      let end = pos.character + 1
      while (end < line.length && /[\w-]/.test(line[end] ?? "")) end++
      return {
        start: { line: 0, character: start },
        end: { line: 0, character: end },
      }
    },
  } as unknown as import("vscode").TextDocument
}

const builtins = [
  { name: mkBuiltinName("echo"), synopsis: ["echo"], desc: "echo docs" },
  { name: mkBuiltinName("fc"), synopsis: ["fc"], desc: "fc docs" },
] as unknown as BuiltinDoc[]
const options = [
  {
    name: mkOptName("GLOB"),
    display: "GLOB",
    flags: [{ char: mkOptFlagChar("f"), on: "+" }],
    defaultIn: ["zsh"],
    category: "Expansion and Globbing",
    desc: "glob docs",
  },
  {
    name: mkOptName("RCS"),
    display: "RCS",
    flags: [{ char: mkOptFlagChar("f"), on: "+" }],
    defaultIn: ["zsh"],
    category: "Initialisation",
    desc: "rcs docs",
  },
] as unknown as ZshOption[]
const redirs = [
  {
    groupOp: mkRedirOp(">&"),
    sig: mkRedirSig(">& number"),
    desc: "redir number docs",
    section: "x",
  },
  {
    groupOp: mkRedirOp(">&"),
    sig: mkRedirSig(">& -"),
    desc: "redir close docs",
    section: "x",
  },
  {
    groupOp: mkRedirOp(">&"),
    sig: mkRedirSig(">& p"),
    desc: "redir coproc docs",
    section: "x",
  },
  {
    groupOp: mkRedirOp(">&"),
    sig: mkRedirSig(">& word"),
    desc: "redir word docs",
    section: "x",
  },
  {
    groupOp: mkRedirOp(">&!"),
    sig: mkRedirSig(">&! word"),
    desc: "redir force docs",
    section: "x",
  },
  {
    groupOp: mkRedirOp("&>"),
    sig: mkRedirSig("&> word"),
    desc: "redir &> docs",
    section: "x",
  },
] as unknown as RedirDoc[]
const params = [
  {
    name: mkShellParamName("SECONDS"),
    sig: "SECONDS",
    desc: "seconds docs",
    section: "Parameters Set By The Shell",
  },
] as unknown as ShellParamDoc[]
const condOps = [
  {
    op: mkCondOp("&&"),
    operands: ["exp1", "exp2"],
    desc: "and docs",
    arity: "binary",
  },
  {
    op: mkCondOp("||"),
    operands: ["exp1", "exp2"],
    desc: "or docs",
    arity: "binary",
  },
  {
    op: mkCondOp("<"),
    operands: ["s1", "s2"],
    desc: "lt docs",
    arity: "binary",
  },
  {
    op: mkCondOp(">"),
    operands: ["s1", "s2"],
    desc: "gt docs",
    arity: "binary",
  },
  {
    op: mkCondOp("!"),
    operands: ["exp"],
    desc: "not docs",
    arity: "unary",
  },
] as unknown as CondOpDoc[]

function mkProvider() {
  return new HoverProvider(
    params,
    options,
    condOps,
    builtins,
    undefined,
    redirs,
  )
}

function hoverAt(line: string, char: number): { value: string } | undefined {
  const h = mkProvider().provideHover(mockDoc(line), {
    line: 0,
    character: char,
  } as import("vscode").Position)
  return h
    ? ((h as { contents?: { value?: string } }).contents as { value: string })
    : undefined
}

suite("HoverProvider", () => {
  test("builtin hover works with semicolon delimiter", () => {
    assert.match(hoverAt("f() { echo; }", 7)?.value ?? "", /echo docs/)
  })

  test("builtin hover works in function body without semicolon", () => {
    assert.match(hoverAt("f() { echo }", 7)?.value ?? "", /echo docs/)
  })

  test("builtin hover works in bare function body", () => {
    assert.match(hoverAt("f() echo", 4)?.value ?? "", /echo docs/)
  })

  test("builtin hover wins over same-line redirection", () => {
    const h = hoverAt("echo thing >&2", 1)
    assert.match(h?.value ?? "", /echo docs/)
    assert.doesNotMatch(h?.value ?? "", /redir word docs/)
  })

  test("no hover on whitespace", () => {
    assert.strictEqual(hoverAt("echo  hi", 4), undefined)
  })

  test("no hover on comment text", () => {
    assert.strictEqual(hoverAt("echo # echo", 9), undefined)
  })

  test("builtin hover after arith condition", () => {
    assert.match(hoverAt("if ((1)) { fc; }", 12)?.value ?? "", /fc docs/)
  })

  test("builtin hover after arith condition bare form", () => {
    assert.match(hoverAt("if ((1)) fc", 9)?.value ?? "", /fc docs/)
  })

  for (const [line, char, re] of [
    ["[[ a && b ]]", 5, /and docs/],
    ["[[ a || b ]]", 5, /or docs/],
    ["[[ a < b ]]", 5, /lt docs/],
    ["[[ a > b ]]", 5, /gt docs/],
    ["[[ ! -f x ]]", 3, /not docs/],
  ] as const) {
    test(`conditional hover resolves ${line}`, () => {
      assert.match(hoverAt(line, char)?.value ?? "", re)
    })
  }

  test("shell parameter hover works from static docs", () => {
    assert.match(hoverAt("print $SECONDS", 8)?.value ?? "", /seconds docs/)
  })

  test("ambiguous short option hover stays silent", () => {
    assert.strictEqual(hoverAt("setopt +f", 8), undefined)
  })

  for (const [line, char, re] of [
    ["echo >&2", 6, /redir number docs/],
    ["echo >&-", 6, /redir close docs/],
    ["echo >&p", 6, /redir coproc docs/],
    ["echo >&file", 6, /redir word docs/],
    ["echo >&file", 8, /redir word docs/],
    ["echo >&!file", 8, /redir force docs/],
  ] as const) {
    test(`redirection hover disambiguates ${line}`, () => {
      assert.match(hoverAt(line, char)?.value ?? "", re)
    })
  }
})
