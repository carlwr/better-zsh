import * as fcu from "@carlwr/fastcheck-utils"
import {
  type BuiltinDoc,
  type ComplexCommandDoc,
  type DocCategory,
  type DocCorpus,
  type Documented,
  loadCorpus,
  type OptFlagAlias,
  type ReservedWordDoc,
  type ShellParamDoc,
  type ZshOption,
} from "@carlwr/zsh-core"
import { categoryFooter, renderRecord } from "@carlwr/zsh-core/render"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import type * as vscode from "vscode"
import { activeEnd } from "../../document/words"
import { HoverProvider } from "../../editor/hover"
import { by, docId, emptyCorpus, ident, pos, wordDoc } from "../test-util"

// --- fixtures ---------------------------------------------------------------

const b = (name: string, desc: string): BuiltinDoc => ({
  ...ident("builtin", name),
  synopsis: [name],
  desc,
})

const o = (
  name: string,
  desc: string,
  emulations: OptFlagAlias["emulations"],
): ZshOption => ({
  ...ident("option", name, name),
  flags: [{ char: "f", on: "+", emulations }],
  defaultIn: ["zsh"],
  subKind: "Shell State",
  desc,
})

const p = (name: string, desc: string): ShellParamDoc => ({
  ...ident("special_param", name),
  desc,
  subKind: "shell-set",
})

const cc = (name: string, desc: string): ComplexCommandDoc => ({
  ...ident("complex_command", name),
  sig: `${name} ...`,
  desc,
  alternateForms: [],
  bodyKeywords: [],
})

const rw = (name: string, desc: string): ReservedWordDoc => ({
  ...ident("reserved_word", name),
  sig: name,
  desc,
  subKind: "command",
})

// Synthetic corpus: exercises dispatch/precedence rules with `/d:.../` markers.
const corpus: DocCorpus = {
  ...emptyCorpus(),
  // Both options carry `+f`; only RCS's is in the plain-zsh letter table.
  option: by([
    o("GLOB", "d:g", ["ksh", "sh"]),
    o("RCS", "d:r", ["csh", "zsh"]),
  ]),
  builtin: by([b("echo", "d:e"), b("fc", "d:f")]),
  complex_command: by([cc("for", "d:cc-for")]),
  reserved_word: by([rw("for", "d:rw-for"), rw("do", "d:rw-do")]),
  special_param: by([p("?", "d:exit")]),
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
// What a hover shows: zsh-core's titled body, then the category line the
// editor appends (`record-markdown.ts`).
const rendered = <K extends DocCategory>(cat: K, id: Documented<K>) => {
  const doc = real[cat].get(id)
  if (doc === undefined) throw new Error(`no ${cat} record ${String(id)}`)
  const { title, mdBody } = renderRecord(real, doc)
  return `${title}\n\n${mdBody}\n\n${categoryFooter(doc)}`
}

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
    ["setopt +f", 8, /d:r/], // short flag: the plain-zsh table's owner
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

  // Facts come from the whole-document analysis: a command word inside a
  // multi-line quoted string is no hover, as it is no semantic token.
  test("no builtin hover inside a multi-line quoted string", () => {
    const src = 'echo "a\n  echo b"\necho c'
    expect(at(src, 1, 3)).toBeUndefined()
    expect(at(src, 2, 1)?.value).toMatch(/d:e/)
  })

  // The editor shows a record without its envelope, so the category line
  // travels in the markdown — last.
  test("category line ends the hover", () => {
    expect(valueAt("f() { echo; }", 7)).toMatch(/\n\n_Category:_ builtin$/)
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
          cop.subKind === "binary" ? `[[ a ${cop.id} b ]]` : `[[ ${cop.id} a ]]`
        const value = realAt(line, 0, line.indexOf(cop.id, 3))?.value
        return [value, rendered("conditional_op", cop.id)]
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
        return [value, rendered("redirection", redir.id)]
      }),
    ).toEqual([])
  })

  test.each<[string, number, DocCategory, string]>([
    ["echo thing >&2", 1, "builtin", "echo"], // head wins over a trailing redir
    ["setopt no_autocd", 8, "option", "autocd"],
    ["set -e", 5, "option", "errexit"], // short flag
    ["set +e", 5, "option", "errexit"], // its off form
    ["set +f", 5, "option", "rcs"], // GLOB only under sh/ksh emulation
    ["set -X", 5, "option", "listtypes"], // MARK_DIRS only under sh/ksh
    ["set +o pipefail", 7, "option", "pipefail"],
  ])("%s @%d -> %s %s", (line, char, cat, id) => {
    expect(realAt(line, 0, char)?.value).toBe(rendered(cat, docId(cat, id)))
  })

  test.each([
    ["setopt -?", 8], // not a flag letter
    ["set -b", 5], // sh/ksh-only letter (NOTIFY)
  ])("%s @%d: no hover", (line, char) => {
    expect(realAt(line, 0, char)).toBeUndefined()
  })

  // `functions` and `history` are both builtins and special parameters.
  test.each<[string, number, DocCategory, string]>([
    ["functions -t foo", 2, "builtin", "functions"],
    ["echo $functions", 8, "special_param", "functions"],
  ])("%s @%d -> %s", (line, char, cat, id) => {
    expect(realAt(line, 0, char)?.value).toBe(rendered(cat, docId(cat, id)))
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
    const vocab = fcu.element([
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
    ])
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
