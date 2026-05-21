import * as assert from "node:assert"
import { type DocCorpus, loadCorpus } from "@carlwr/zsh-core"
import { renderDoc } from "@carlwr/zsh-core/render"
import { mkPieceId } from "@carlwr/zsh-core/taxonomy"
import type {
  BuiltinDoc,
  ComplexCommandDoc,
  ReservedWordDoc,
  ShellParamDoc,
  ZshOption,
} from "@carlwr/zsh-core/types"
import { mkDocumented, mkOptFlag } from "@carlwr/zsh-core/types"
import { vi } from "vitest"
import { by, emptyCorpus, wordDoc } from "./test-util"

vi.mock("vscode", () => ({
  MarkdownString: class {
    value: string
    constructor(v = "") {
      this.value = v
    }
    appendCodeblock(s: string, lang = "") {
      this.value += `\n\`\`\`${lang}\n${s}\n\`\`\`\n`
      return this
    }
    appendMarkdown(s: string) {
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

import { HoverProvider } from "../editor/hover"

// --- fixtures ---------------------------------------------------------------

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

const p = (name: string, desc: string): ShellParamDoc => ({
  name: mkDocumented("special_param", name),
  sig: name,
  desc,
  scope: "shell-set",
})

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

// Synthetic corpus: exercises dispatch/precedence rules with `/d:.../` markers.
// Per-category exhaustiveness against the documented corpus is covered by the
// real-corpus iteration suites below.
const corpus: DocCorpus = {
  ...emptyCorpus(),
  option: by("name", [
    o("GLOB", "Expansion and Globbing"),
    o("RCS", "Initialisation"),
  ]),
  builtin: by("name", [b("echo", "d:e"), b("fc", "d:f")]),
  complex_command: by("name", [cc("for", "d:cc-for")]),
  reserved_word: by("name", [rw("for", "d:rw-for"), rw("do", "d:rw-do")]),
  special_param: by("name", [p("?", "d:exit")]),
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
  // `?` is the only special_param fixture; here it sits inside a comment.
  ["echo $? # $?", 10, null],
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

  // `for` is both reserved word and complex command; richer record wins.
  test("for prefers complex_command over reserved_word", () => {
    const v = at("for x in 1 2 3; do echo $x; done", 0) ?? ""
    assert.match(v, /d:cc-for/)
    assert.doesNotMatch(v, /d:rw-for/)
  })

  test("do falls back to reserved_word", () => {
    const v = at("for x in 1 2 3; do echo $x; done", 16) ?? ""
    assert.match(v, /d:rw-do/)
  })

  // Exhaustive coverage against the real corpus: synthesize hover positions
  // for every documented entry. Drift guard against dispatch and resolver
  // regressions (e.g. punctuation-named params, symbolic cond ops, redir
  // operator shapes).

  const realCorpus = loadCorpus()
  const realProvider = new HoverProvider(realCorpus)

  const hoverValueAt = (line: string, char: number) => {
    const h = realProvider.provideHover(wordDoc(line, "ex"), {
      line: 0,
      character: char,
    } as import("vscode").Position)
    return (h as { contents?: { value?: string } } | undefined)?.contents?.value
  }

  for (const name of realCorpus.special_param.keys()) {
    const expected = renderDoc(realCorpus, mkPieceId("special_param", name))
    test(`hovers $${name}`, () => {
      assert.strictEqual(hoverValueAt(`echo $${name}`, 6), expected)
    })
    test(`hovers \${${name}}`, () => {
      assert.strictEqual(hoverValueAt(`echo \${${name}}`, 7), expected)
    })
  }

  for (const cop of realCorpus.conditional_op.values()) {
    const line =
      cop.arity === "binary" ? `[[ a ${cop.op} b ]]` : `[[ ${cop.op} a ]]`
    const opStart = line.indexOf(cop.op, 3)
    test(`hovers cond ${cop.op} (${cop.arity})`, () => {
      assert.strictEqual(
        hoverValueAt(line, opStart),
        renderDoc(realCorpus, mkPieceId("conditional_op", cop.op)),
      )
    })
  }

  // `<<[-] word` is the heredoc bracket-form notation — skip; not a literal sig.
  const concreteRedir = (sig: string): string | undefined => {
    if (sig.includes("[")) return
    return sig
      .replace(/\s+word$/, "file")
      .replace(/\s+number$/, "2")
      .replace(/\s+-$/, "-")
      .replace(/\s+p$/, "p")
  }
  for (const redir of realCorpus.redirection.values()) {
    const concrete = concreteRedir(redir.sig)
    if (!concrete) continue
    test(`hovers redir ${redir.sig}`, () => {
      assert.strictEqual(
        hoverValueAt(`echo ${concrete}`, 5),
        renderDoc(realCorpus, mkPieceId("redirection", redir.slug)),
      )
    })
  }

  // Builtin head wins over a trailing redir token on the same line.
  test("echo thing >&2 prefers builtin", () => {
    const expected = renderDoc(
      realCorpus,
      mkPieceId("builtin", mkDocumented("builtin", "echo")),
    )
    assert.strictEqual(hoverValueAt("echo thing >&2", 1), expected)
  })

  // Docstring body must render as prose, not inside a code block.
  test("function docstring hover renders signature + prose", () => {
    const src = "# Print a message.\n# args: none.\nmy-fun() {}"
    const h = provider.provideHover(wordDoc(src, "fn"), {
      line: 2,
      character: 0,
    } as import("vscode").Position)
    const v = (h as { contents?: { value?: string } } | undefined)?.contents
      ?.value
    assert.ok(v, "expected a hover")
    assert.match(v, /```zsh\nfunction my-fun\(\) \{ \.\.\. \}\n```/)
    assert.match(v, /Print a message\./)
    assert.match(v, /args: none\./)
    assert.doesNotMatch(
      v,
      /```\nPrint a message/,
      "docstring must not be in a code block",
    )
  })
})
