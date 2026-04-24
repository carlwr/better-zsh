import * as assert from "node:assert"
import type {
  BuiltinDoc,
  ComplexCommandDoc,
  CondOpDoc,
  DocCorpus,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  ZshOption,
} from "@carlwr/zsh-core"
import * as core from "@carlwr/zsh-core"
import { mkDocumented } from "@carlwr/zsh-core/internal"
import { vi } from "vitest"
import { by, emptyCorpus, wordDoc } from "./test-util"

vi.mock("vscode", () => ({
  MarkdownString: class {
    value: string
    constructor(v = "") {
      this.value = v
    }
    appendCodeblock(s: string) {
      this.value += s
      return this
    }
  },
  Hover: class {
    constructor(
      public contents: unknown,
      public range?: unknown,
    ) {}
  },
  Range: class {
    constructor(sl: number, sc: number, el: number, ec: number) {
      Object.assign(this, {
        start: { line: sl, character: sc },
        end: { line: el, character: ec },
      })
    }
  },
}))

import { HoverProvider } from "../hover"

// --- fixtures ---------------------------------------------------------------

const { mkOptFlag, mkRedirOp } = core

const b = (name: string, desc: string): BuiltinDoc => ({
  name: mkDocumented("builtin", name),
  synopsis: [name],
  desc,
})

const o = (name: string, category: ZshOption["category"]): ZshOption => ({
  name: mkDocumented("option", name),
  display: name,
  flags: [{ char: mkOptFlag("f"), on: "+" }],
  defaultIn: ["zsh"],
  category,
  desc: "",
})

const r = (groupOp: string, sig: string, desc: string): RedirDoc => ({
  groupOp: mkRedirOp(groupOp),
  sig: mkDocumented("redir", sig),
  desc,
  section: "",
})

const p = (name: string, desc: string): ShellParamDoc => ({
  name: mkDocumented("shell_param", name),
  sig: name,
  desc,
  section: "shell-set",
})

const c = (
  arity: CondOpDoc["arity"],
  op: string,
  operands: CondOpDoc["operands"],
  desc: string,
): CondOpDoc =>
  ({ op: mkDocumented("cond_op", op), operands, desc, arity }) as CondOpDoc

const cc = (name: string, desc: string): ComplexCommandDoc => ({
  name: mkDocumented("complex_command", name),
  sig: `${name} ...`,
  desc,
  section: "Complex Commands",
  alternateForms: [],
  bodyKeywords: [],
})

const rw = (name: string, desc: string): ReservedWordDoc => ({
  name: mkDocumented("reserved_word", name),
  sig: name,
  desc,
  section: "Reserved Words",
  pos: "command",
})

// --- corpus -----------------------------------------------------------------

const corpus: DocCorpus = {
  ...emptyCorpus(),
  option: by("name", [
    o("GLOB", "Expansion and Globbing"),
    o("RCS", "Initialisation"),
  ]),
  cond_op: by("op", [
    c("binary", "&&", ["exp1", "exp2"], "d:&"),
    c("binary", "||", ["exp1", "exp2"], "d:|"),
    c("binary", "<", ["s1", "s2"], "d:<"),
    c("binary", ">", ["s1", "s2"], "d:>"),
    c("unary", "!", ["exp"], "d:!"),
  ]),
  builtin: by("name", [b("echo", "d:e"), b("fc", "d:f")]),
  complex_command: by("name", [cc("for", "d:cc-for")]),
  reserved_word: by("name", [rw("for", "d:rw-for"), rw("do", "d:rw-do")]),
  shell_param: by("name", [p("SECONDS", "d:s")]),
  redir: by("sig", [
    r(">&", ">& number", "d:n"),
    r(">&", ">& -", "d:-"),
    r(">&", ">& p", "d:p"),
    r(">&", ">& word", "d:w"),
    r(">&!", ">&! word", "d:!"),
    r("&>", "&> word", "d:&"),
  ]),
}

// --- helpers ----------------------------------------------------------------

const provider = new HoverProvider(corpus)

function at(line: string, char: number) {
  const h = provider.provideHover(wordDoc(line, "hover"), {
    line: 0,
    character: char,
  } as import("vscode").Position)
  return (h as { contents?: { value?: string } } | undefined)?.contents?.value
}

// --- cases ------------------------------------------------------------------

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
      const v = at(line, char)
      if (re) assert.match(v ?? "", re)
      else assert.strictEqual(v, undefined)
    })
  }

  // `>&2` would match a redir doc; the builtin head takes precedence.
  test("echo thing >&2 prefers builtin", () => {
    const v = at("echo thing >&2", 1) ?? ""
    assert.match(v, /d:e/)
    assert.doesNotMatch(v, /d:w/)
  })

  // Heads that are both reserved words and complex commands must route to
  // the richer complex_command record, not the reserved-word fallback.
  test("for prefers complex_command over reserved_word", () => {
    const v = at("for x in 1 2 3; do echo $x; done", 0) ?? ""
    assert.match(v, /d:cc-for/)
    assert.doesNotMatch(v, /d:rw-for/)
  })

  // Body keywords (`do`, `done`, …) remain reserved-word only.
  test("do falls back to reserved_word", () => {
    const v = at("for x in 1 2 3; do echo $x; done", 16) ?? ""
    assert.match(v, /d:rw-do/)
  })
})
