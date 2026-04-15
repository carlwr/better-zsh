import * as assert from "node:assert"
import { vi } from "vitest"
import type {
  BuiltinDoc,
  CondOpDoc,
  DocCorpus,
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
  name: core.mkProven("builtin", name),
  synopsis: [name],
  desc,
})
const o = (name: string, category: ZshOption["category"]): ZshOption => ({
  name: core.mkProven("option", name),
  display: name,
  flags: [{ char: core.mkOptFlag("f"), on: "+" }],
  defaultIn: ["zsh"],
  category,
  desc: "",
})
const r = (groupOp: string, sig: string, desc: string): RedirDoc => ({
  groupOp: core.mkRedirOp(groupOp),
  sig: core.mkProven("redir", sig),
  desc,
  section: "x",
})
const p = (name: string, desc: string): ShellParamDoc => ({
  name: core.mkProven("shell_param", name),
  sig: name,
  desc,
  section: "Parameters Set By The Shell",
})
function c(
  arity: CondOpDoc["arity"],
  op: string,
  operands: CondOpDoc["operands"],
  desc: string,
): CondOpDoc {
  return {
    op: core.mkProven("cond_op", op),
    operands,
    desc,
    arity,
  } as CondOpDoc
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

function mkTestCorpus(): DocCorpus {
  const emptyMap = new Map() as unknown as ReadonlyMap<never, never>
  return {
    option: new Map(options.map(o => [o.name, o])),
    cond_op: new Map(condOps.map(c => [c.op, c])),
    builtin: new Map(builtins.map(b => [b.name, b])),
    precmd: emptyMap as DocCorpus["precmd"],
    shell_param: new Map(params.map(p => [p.name, p])),
    reserved_word: emptyMap as DocCorpus["reserved_word"],
    redir: new Map(redirs.map(r => [r.sig, r])),
    process_subst: emptyMap as DocCorpus["process_subst"],
    subscript_flag: emptyMap as DocCorpus["subscript_flag"],
    param_flag: emptyMap as DocCorpus["param_flag"],
    history: emptyMap as DocCorpus["history"],
    glob_op: emptyMap as DocCorpus["glob_op"],
    glob_flag: emptyMap as DocCorpus["glob_flag"],
  }
}

function mk() {
  return new HoverProvider(mkTestCorpus())
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

type Case = readonly [line: string, char: number, re: RegExp | null]

const cases: readonly Case[] = [
  ["f() { echo; }", 7, /d:e/],
  ["f() { echo }", 7, /d:e/],
  ["f() echo", 4, /d:e/],
  ["if ((1)) { fc; }", 12, /d:f/],
  ["if ((1)) fc", 9, /d:f/],
  ["[[ a && b ]]", 5, /d:&/],
  ["[[ a || b ]]", 5, /d:\|/],
  ["[[ a < b ]]", 5, /d:</],
  ["[[ a > b ]]", 5, /d:>/],
  ["[[ ! -f x ]]", 3, /d:!/],
  ["print $SECONDS", 8, /d:s/],
  ["echo >&2", 6, /d:n/],
  ["echo >&-", 6, /d:-/],
  ["echo >&p", 6, /d:p/],
  ["echo >&file", 6, /d:w/],
  ["echo >&file", 8, /d:w/],
  ["echo >&!file", 8, /d:!/],
  ["echo  hi", 4, null],
  ["echo # echo", 9, null],
  ["setopt +f", 8, null],
]

suite("HoverProvider", () => {
  for (const [line, char, re] of cases) {
    test(`${line} @${char}`, () => {
      const h = at(line, char)
      if (re) assert.match(h?.value ?? "", re)
      else assert.strictEqual(h, undefined)
    })
  }

  // `>&2` would match a redir doc; the builtin head takes precedence
  test("echo thing >&2 prefers builtin", () => {
    const h = at("echo thing >&2", 1)
    assert.match(h?.value ?? "", /d:e/)
    assert.doesNotMatch(h?.value ?? "", /d:w/)
  })
})
