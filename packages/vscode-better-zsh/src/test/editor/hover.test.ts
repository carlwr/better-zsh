import { type DocCorpus, loadCorpus } from "@carlwr/zsh-core"
import { renderDocWithTitle } from "@carlwr/zsh-core/render"
import { type DocCategory, mkPieceId } from "@carlwr/zsh-core/taxonomy"
import type {
  BuiltinDoc,
  ComplexCommandDoc,
  Documented,
  ReservedWordDoc,
  ShellParamDoc,
  ZshOption,
} from "@carlwr/zsh-core/types"
import { mkDocumented, mkOptFlag } from "@carlwr/zsh-core/types"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import type * as vscode from "vscode"
import { activeEnd } from "../../document/words"
import { HoverProvider } from "../../editor/hover"
import { by, emptyCorpus, pos, wordDoc } from "../test-util"

// --- fixtures ---------------------------------------------------------------

const b = (name: string, desc: string): BuiltinDoc => ({
  name: mkDocumented("builtin", name),
  synopsis: [name],
  desc,
})

const o = (name: string, section: ZshOption["section"]): ZshOption => ({
  name: mkDocumented("option", name),
  display: name,
  flags: [{ char: mkOptFlag("f"), on: "+", emulations: ["csh", "zsh"] }],
  defaultIn: ["zsh"],
  section,
  desc: "",
})

const p = (name: string, desc: string): ShellParamDoc => ({
  name: mkDocumented("special_param", name),
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

// Synthetic corpus: exercises dispatch/precedence rules with `/d:.../` markers.
const corpus: DocCorpus = {
  ...emptyCorpus(),
  // Both options carry `+f`, so `+f` is ambiguous.
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

type Hovered = { value: string; range: [number, number] } | undefined

function hoverWith(provider: HoverProvider) {
  return (text: string, line: number, char: number): Hovered => {
    // The stub `Hover` keeps `contents` as the single MarkdownString it got.
    const h = provider.provideHover(wordDoc(text), pos(line, char)) as
      | { contents: vscode.MarkdownString; range?: vscode.Range }
      | undefined
    if (!h) return undefined
    return {
      value: h.contents.value,
      range: [h.range?.start.character ?? -1, h.range?.end.character ?? -1],
    }
  }
}

const at = hoverWith(new HoverProvider(corpus))
const valueAt = (line: string, char: number) => at(line, 0, char)?.value

const real = loadCorpus()
const realAt = hoverWith(new HoverProvider(real))
const rendered = <K extends DocCategory>(cat: K, id: Documented<K>) =>
  renderDocWithTitle(real, mkPieceId(cat, id))

// --- synthetic-corpus dispatch ----------------------------------------------

describe("HoverProvider dispatch", () => {
  test.each<[string, number, RegExp | null]>([
    ["f() { echo; }", 7, /d:e/],
    ["f() { echo }", 7, /d:e/],
    ["f() echo", 4, /d:e/],
    ["if ((1)) { fc; }", 12, /d:f/],
    ["if ((1)) fc", 9, /d:f/],
    ["echo $? # $?", 10, null], // in a comment
    ["echo  hi", 4, null],
    ["echo # echo", 9, null],
    ["setopt +f", 8, null], // ambiguous short flag
    // `for` is both reserved word and complex command; richer record wins.
    ["for x in 1 2 3; do echo $x; done", 0, /d:cc-for/],
    ["for x in 1 2 3; do echo $x; done", 16, /d:rw-do/],
  ])("%s @%d", (line, char, re) => {
    const v = valueAt(line, char)
    if (re) expect(v).toMatch(re)
    else expect(v).toBeUndefined()
  })

  test("for: complex_command, not reserved_word", () => {
    expect(valueAt("for x; do :; done", 0)).not.toMatch(/d:rw-for/)
  })

  // Docstring body renders as prose (hard line breaks), not inside the code block.
  test("function docstring hover: signature + prose", () => {
    const src = "# Print a message.\n# args: none.\nmy-fun() {}"
    expect(at(src, 2, 0)?.value).toBe(
      "\n```zsh\nfunction my-fun() { ... }\n```\n\n\nPrint a message.  \nargs: none.",
    )
  })
})

// --- real-corpus token extraction -------------------------------------------
//
// Every documented entry, synthesized into a hover position: the extension's
// range extraction must reach the resolver with the right token (punctuation
// params, symbolic cond ops, redirection shapes). Content is zsh-core's.

describe("HoverProvider on the real corpus", () => {
  const mismatches = <T>(
    items: Iterable<T>,
    probe: (item: T) => [got: string | undefined, want: string] | undefined,
  ) =>
    [...items].flatMap(item => {
      const r = probe(item)
      return !r || r[0] === r[1] ? [] : [item]
    })

  test.each([
    ["$X", (name: string) => [`echo $${name}`, 6] as const],
    ["${X}", (name: string) => [`echo \${${name}}`, 7] as const],
  ])("special params as %s", (_, form) => {
    expect(
      mismatches(real.special_param.keys(), name => {
        const [line, char] = form(name)
        return [realAt(line, 0, char)?.value, rendered("special_param", name)]
      }),
    ).toEqual([])
  })

  test("conditional operators", () => {
    expect(
      mismatches(real.conditional_op.values(), cop => {
        const line =
          cop.arity === "binary" ? `[[ a ${cop.op} b ]]` : `[[ ${cop.op} a ]]`
        const value = realAt(line, 0, line.indexOf(cop.op, 3))?.value
        return [value, rendered("conditional_op", cop.op)]
      }),
    ).toEqual([])
  })

  // `<<[-] word` is the heredoc bracket-form notation — skip; not a literal sig.
  const concreteRedir = (sig: string) =>
    sig.includes("[")
      ? undefined
      : sig
          .replace(/\s+word$/, "file")
          .replace(/\s+number$/, "2")
          .replace(/\s+-$/, "-")
          .replace(/\s+p$/, "p")

  test("redirections", () => {
    expect(
      mismatches(real.redirection.values(), redir => {
        const concrete = concreteRedir(redir.sig)
        if (!concrete) return
        const value = realAt(`echo ${concrete}`, 0, 5)?.value
        return [value, rendered("redirection", redir.slug)]
      }),
    ).toEqual([])
  })

  test.each<[string, number, DocCategory, string]>([
    ["echo thing >&2", 1, "builtin", "echo"], // head wins over a trailing redir
    ["setopt no_autocd", 8, "option", "autocd"],
    ["set -e", 5, "option", "errexit"], // short flag, unique
    ["set +o pipefail", 7, "option", "pipefail"],
  ])("%s @%d -> %s %s", (line, char, cat, id) => {
    expect(realAt(line, 0, char)?.value).toBe(
      rendered(cat, mkDocumented(cat, id)),
    )
  })

  test("unknown short flag: no hover", () => {
    expect(realAt("setopt -?", 0, 8)).toBeUndefined()
  })

  // `functions` and `history` are both builtins and special parameters.
  test.each<[string, number, DocCategory, string]>([
    ["functions -t foo", 2, "builtin", "functions"],
    ["echo $functions", 8, "special_param", "functions"],
  ])("%s @%d -> %s", (line, char, cat, id) => {
    expect(realAt(line, 0, char)?.value).toBe(
      rendered(cat, mkDocumented(cat, id)),
    )
  })

  test("process substitution hovers on its opener only", () => {
    const line = "diff foo <(ls) >(cat)"
    const opener = realAt(line, 0, 9)
    expect(opener?.range).toEqual([9, 11])
    expect(realAt(line, 0, 10)).toEqual(opener)
    expect(realAt(line, 0, 15)?.value).not.toBe(opener?.value)
    expect(realAt(line, 0, 6)).toBeUndefined() // `foo`
    expect(realAt(line, 0, 12)).toBeUndefined() // `ls`
  })

  test("every redirection on a line hovers, not only the first", () => {
    const second = realAt("cmd <in >out", 0, 8)
    expect(second?.range).toEqual([8, 12])
    expect(second?.value).toBe(realAt("cmd >out", 0, 4)?.value)
  })

  // A hover's range is the whole token: every position inside it hovers alike;
  // nothing hovers inside a comment.
  test("hover is stable across its own range", () => {
    const vocab = fc.constantFrom(
      "echo",
      "noglob",
      "setopt",
      "autocd",
      "-e",
      "+f",
      "$?",
      "${#}",
      "$HOME",
      "[[",
      "]]",
      "==",
      "-f",
      "&&",
      ">&2",
      "<(",
      ")",
      "for",
      "do",
      "foo",
      '"x # y"',
      "#",
      ";",
      "|",
      "{",
      "}",
    )
    fc.assert(
      fc.property(fc.array(vocab, { maxLength: 8 }), words => {
        const line = words.join(" ")
        for (let c = 0; c < line.length; c++) {
          const h = realAt(line, 0, c)
          if (!h) continue
          expect(c).toBeLessThan(activeEnd(line))
          for (let q = h.range[0]; q < h.range[1]; q++)
            expect(realAt(line, 0, q)).toEqual(h)
        }
      }),
    )
  })
})
