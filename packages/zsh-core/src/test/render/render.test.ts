import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  dumpFile,
  dumpText,
  refDocs,
  writeRefDump,
} from "../../../scripts/ref-dump"
import { identity, mkDocumented } from "../../docs/brands"
import { docCategoryPreamble } from "../../docs/category-preamble"
import type { DocCorpus } from "../../docs/corpus"
import * as zd from "../../docs/corpus"
import type { DocCategory, DocRecordMap } from "../../docs/taxonomy"
import {
  docCategories,
  docCategoryLabels,
  subKindOf,
} from "../../docs/taxonomy"
import type {
  ArithOpDoc,
  BuiltinDoc,
  ComplexCommandDoc,
  CompUtilityDoc,
  CondOpDoc,
  JobSpecDoc,
  KeymapDoc,
  MathfuncDoc,
  ParamExpnDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  PromptEscapeDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SpecialFunctionDoc,
  ZleWidgetDoc,
  ZshOption,
} from "../../docs/types"
import {
  categoryFooter,
  defaultStateIn,
  fmtOptRefsInMd,
  isDocoptSig,
  isSynonymList,
  renderRecord,
} from "../../render/md"
import { withTmpDirAsync } from "../tmp-dir"

// --- fixtures ---------------------------------------------------------------

const cd: ZshOption = {
  ...identity("option", "AUTO_CD", "AUTO_CD"),
  flags: [{ char: "J", on: "-", emulations: ["csh", "zsh"] }],
  defaultIn: ["csh", "ksh", "sh", "zsh"],
  subKind: "Changing Directories",
  desc: "d:o",
}
// An option whose name is also a category-label word (`ZLE widget`).
const zleOpt: ZshOption = {
  ...identity("option", "ZLE", "ZLE"),
  flags: [],
  defaultIn: ["zsh"],
  subKind: "Zle",
  desc: "d:zle",
}

const cond = <A extends CondOpDoc["subKind"]>(
  subKind: A,
  op: string,
  operands: Extract<CondOpDoc, { subKind: A }>["operands"],
  desc: string,
): CondOpDoc =>
  ({
    ...identity("conditional_op", op),
    operands,
    desc,
    subKind,
  }) as CondOpDoc

const cu = cond("unary", "-a", ["file"], "d:u")
const cb = cond("binary", "-nt", ["left", "right"], "d:b")

const bi: BuiltinDoc = {
  ...identity("builtin", "echo"),
  synopsis: ["echo [ -n ] [ arg ... ]"],
  desc: "d:bi",
}
const pc: PrecmdDoc = {
  ...identity("precmd_modifier", "noglob"),
  synopsis: ["noglob command arg ..."],
  desc: "d:pc",
}
const rd: RedirDoc = {
  ...identity("redirection", ">>_word", ">> word"),
  groupOp: ">>",
  sig: ">> word",
  desc: "d:r",
}
const sub: ProcessSubstDoc = {
  ...identity("process_subst", "<(...)"),
  sig: "<(list)",
  desc: "d:ps",
}
const px: ParamExpnDoc = {
  ...identity("param_expn", "${name:-word}"),
  sig: "${name:-word}",
  groupSigs: ["${name-word}", "${name:-word}"],
  orderInGroup: 1,
  subKind: "default",
  placeholders: ["name", "word"],
  desc: "d:px",
}
const word: ReservedWordDoc = {
  ...identity("reserved_word", "if"),
  sig: "if list then list fi",
  desc: "d:rw",
  subKind: "command",
}
const cc: ComplexCommandDoc = {
  ...identity("complex_command", "if"),
  sig: "if list then list fi",
  desc: "d:cc",
  alternateForms: [{ template: "if list { list }", keywords: [] }],
  bodyKeywords: ["then", "fi"],
}
const sec: ShellParamDoc = {
  ...identity("special_param", "SECONDS"),
  desc: "d:p",
  subKind: "shell-set",
}
// Sig-shaped fixtures; `extra` carries the category's own fields, so the
// result is only claimed to be `K`-shaped.
const stub = <K extends DocCategory>(
  cat: K,
  value: string,
  extra: object = {},
): DocRecordMap[K] =>
  ({
    ...identity(cat, value),
    args: [],
    sig: value,
    desc: "",
    ...extra,
  }) as unknown as DocRecordMap[K]

const sf = stub("subscript_flag", "w", { desc: "d:sf", args: ["string"] })
const pf = stub("param_expn_flag", "U", { desc: "d:pf" })
const hi = stub("history_expn", "!!", {
  subKind: "event-designator",
  desc: "d:hi",
})
const go = stub("glob_op", "*", { subKind: "standard", desc: "d:go" })
const gf = stub("glob_flag", "i", { desc: "d:gf", args: ["expr"] })
const gq = stub("glob_qualifier", "@", { desc: "d:gq", args: [] })

const pe: PromptEscapeDoc = {
  ...identity("prompt_escape", "%n"),
  sig: "%n",
  desc: "d:pe",
  subKind: "Login information",
}
const zw: ZleWidgetDoc = {
  ...identity("zle_widget", "backward-kill-word"),
  desc: "d:zw",
  subKind: "Modifying Text",
  defaultBindings: [{ keymap: "emacs", keys: ["^W", "ESC-^H", "ESC-^?"] }],
}
const km: KeymapDoc = {
  ...identity("keymap", "emacs"),
  sig: "emacs",
  desc: "d:km",
  subKind: "regular",
  linkedFrom: ["main"],
}
const js: JobSpecDoc = {
  ...identity("job_spec", "%%"),
  sig: "%%",
  desc: "d:js",
  subKind: "current",
}
const ao: ArithOpDoc = {
  ...identity("arith_op", "+"),
  sig: "+",
  desc: "d:ao",
  subKind: "overloaded",
}
const sfn: SpecialFunctionDoc = {
  ...identity("special_function", "chpwd"),
  sig: "chpwd",
  desc: "d:sfn",
  subKind: "hook",
  hookArray: "chpwd_functions",
}
const cuu: CompUtilityDoc = {
  ...identity("comp_utility", "_all_labels"),
  synopsis: ["_all_labels [ -x ] [ -12VJ ] tag name descr [ command arg ... ]"],
  desc: "d:cuu",
}
const mf: MathfuncDoc = {
  ...identity("mathfunc", "sin"),
  synopsis: ["sin(x)"],
  desc: "d:mf",
  module: "zsh/mathfunc",
}

// --- corpus builder ---------------------------------------------------------

type DocArrays = { readonly [K in DocCategory]: readonly DocRecordMap[K][] }

const baseArrays: DocArrays = {
  option: [cd],
  conditional_op: [cu],
  builtin: [bi],
  precmd_modifier: [pc],
  special_param: [sec],
  complex_command: [cc],
  reserved_word: [word],
  redirection: [rd],
  process_subst: [sub],
  param_expn: [px],
  subscript_flag: [sf],
  param_expn_flag: [pf],
  history_expn: [hi],
  glob_op: [go],
  glob_flag: [gf],
  glob_qualifier: [gq],
  prompt_escape: [pe],
  zle_widget: [zw],
  keymap: [km],
  job_spec: [js],
  arith_op: [ao],
  mathfunc: [mf],
  special_function: [sfn],
  comp_utility: [cuu],
}

function mkTestCorpus(overrides: Partial<DocArrays> = {}): DocCorpus {
  const all = { ...baseArrays, ...overrides }
  const out: Record<string, unknown> = {}
  for (const k of docCategories) {
    out[k] = new Map(all[k].map(d => [d.id, d]))
  }
  return out as unknown as DocCorpus
}

const corpus = (o: Partial<DocArrays> = {}) => refDocs(mkTestCorpus(o))

const containsAll = (text: string | undefined, parts: readonly string[]) => {
  for (const p of parts) expect(text).toContain(p)
}

const headings = (t: string | undefined) => (t?.match(/^## /gm) ?? []).length

// --- case tables ------------------------------------------------------------

const noOpts = mkTestCorpus({ option: [] })
const cdCorpus = mkTestCorpus({ option: [cd] })

const body = <K extends DocCategory>(
  doc: DocRecordMap[K],
  corpus: DocCorpus = noOpts,
): string => renderRecord(corpus, doc).mdBody
const title = <K extends DocCategory>(doc: DocRecordMap[K]): string =>
  renderRecord(noOpts, doc).title
const head = <K extends DocCategory>(doc: DocRecordMap[K]) =>
  renderRecord(noOpts, doc).head

// Body assertions exclude the title (`title` tests further down) and the
// category line (`categoryFooter`, see its tests).
const renderedMarkdownCases = [
  ["special_param", body(sec), ["d:p"]],
  ["builtin", body(bi), ["```docopt", "echo [ -n ] [ arg ... ]", "d:bi"]],
  [
    "precmd_modifier",
    body(pc),
    ["```docopt", "noglob command arg ...", "d:pc"],
  ],
  ["redirection", body(rd), ["```docopt", ">> word", "d:r"]],
  ["process_subst", body(sub), ["d:ps"]],
  [
    "param_expn",
    body(px),
    ["```zsh", "${name-word}", "${name:-word}    # <- this form", "d:px"],
  ],
  ["reserved_word", body(word), ["d:rw"]],
  [
    "complex_command",
    body(cc),
    [
      "```docopt",
      "if list then list fi",
      "d:cc",
      "_Alternate forms:_",
      "if list { list }",
      "_Body keywords:_ `then` `fi`",
    ],
  ],
  ["prompt_escape", body(pe), ["```zsh", "print -P '%n'", "d:pe"]],
  [
    "zle_widget",
    body(zw),
    ["_Default bindings:_ emacs `^W` `ESC-^H` `ESC-^?`", "d:zw"],
  ],
  ["keymap", body(km), ["d:km", "_Linked from:_ `main`"]],
  ["job_spec", body(js), ["d:js"]],
  ["arith_op", body(ao), ["d:ao"]],
  [
    "special_function",
    body(sfn),
    ["d:sfn", "```zsh", "chpwd_functions=( funcname1 funcname2 ... )"],
  ],
  [
    "subscript_flag",
    body(sf),
    ["```zsh", "${name[(w)exp]}", "d:sf", "_Args:_ string"],
  ],
  ["param_expn_flag", body(pf), ["```zsh", "${(U)spec}", "d:pf"]],
  ["history_expn", body(hi), ["d:hi"]],
  ["glob_op", body(go), ["d:go"]],
  ["glob_flag", body(gf), ["```zsh", "(#i)pat", "d:gf", "_Args:_ expr"]],
  ["glob_qualifier", body(gq), ["```zsh", "*(@)", "d:gq"]],
  ["comp_utility", body(cuu), ["d:cuu"]],
] as const

// --- tests ------------------------------------------------------------------

describe("render markdown", () => {
  test("option markdown", () => {
    containsAll(body(cd), [
      "```zsh",
      "setopt auto_cd",
      "unsetopt auto_cd",
      "set -J",
      "set +J",
      "**Default in zsh: `on`**",
    ])
    expect(body(cd)).toMatch(/d:o$/)
  })

  // A letter from the sh/ksh table only is not plain-zsh syntax: rendered
  // after the plain-zsh flags (whatever the record order) and annotated.
  test("option head — sh/ksh-only flags last, annotated", () => {
    const opt: ZshOption = {
      ...cd,
      flags: [
        { char: "b", on: "-", emulations: ["ksh", "sh"] },
        { char: "5", on: "-", emulations: ["csh", "zsh"] },
      ],
    }
    expect(head(opt)?.lines.join("\n")).toBe(
      [
        "setopt auto_cd     # on",
        "unsetopt auto_cd   # off",
        "set -5             # on",
        "set +5             # off",
        "set -b             # on (sh/ksh emulation only)",
        "set +b             # off (sh/ksh emulation only)",
      ].join("\n"),
    )
  })

  // Backticked option references (e.g. from `tt(AUTO_CD)` upstream) are
  // bold-promoted the same as bare ones; fenced code and `$VAR`/`${VAR}`
  // expansions are untouched. Unknown option names pass through.
  test.each([
    [
      "prose variants",
      "AUTO_CD AUTOCD NO_AUTO_CD NOAUTOCD",
      "**`AUTO_CD`** **`AUTOCD`** **`NO_AUTO_CD`** **`NOAUTOCD`**",
    ],
    [
      "skip vars and code fences",
      "$AUTO_CD ${AUTO_CD} $NO_AUTO_CD ${NOAUTOCD}\n" +
        "`AUTO_CD` AUTO_CD\n```zsh\nAUTO_CD\n```\nAUTOCD",
      "$AUTO_CD ${AUTO_CD} $NO_AUTO_CD ${NOAUTOCD}\n" +
        "**`AUTO_CD`** **`AUTO_CD`**\n```zsh\nAUTO_CD\n```\n**`AUTOCD`**",
    ],
    ["only known", "AUTO_CD CDPATH POSIX", "**`AUTO_CD`** CDPATH POSIX"],
  ])("option refs — %s", (_label, input, want) => {
    expect(fmtOptRefsInMd(input, cdCorpus)).toBe(want)
  })

  // The record is its body: no title, no category line.
  test.each([
    [cu, "```zsh\n[[ -a file ]]\n```\n\nd:u"],
    [cb, "```zsh\n[[ left -nt right ]]\n```\n\nd:b"],
  ] as const)("cond op markdown — body only ($arity)", (op, want) => {
    expect(body(op)).toBe(want)
  })

  test.each(renderedMarkdownCases)("%s markdown", (_, md, parts) => {
    containsAll(md, parts)
  })

  // --- category line -------------------------------------------------------

  // `categoryFooter` is the taxonomy's label (+ subKind when the category has
  // one); bodies carry no category line of their own, nor any of the
  // per-category strings it replaced.
  test.each(docCategories)("%s category line; body without one", cat => {
    const doc = baseArrays[cat][0]
    if (doc === undefined) throw new Error(`no fixture for ${cat}`)
    const sub = subKindOf(doc)
    const label = docCategoryLabels[cat]
    const want = sub === undefined ? label : `${label} (${sub})`
    expect(categoryFooter(doc)).toBe(`_Category:_ ${want}`)
    expect(body(doc)).not.toMatch(
      /^_(Category|Role|Section|Subsection|Option category):_/m,
    )
  })

  test("category line subKind — reserved word position", () => {
    expect(categoryFooter({ ...word, subKind: "any" })).toBe(
      "_Category:_ reserved word (any)",
    )
  })

  // `ZLE` is an option name: composed into a body ahead of option-ref
  // bolding, the line would come out as `_Category:_ **`ZLE`** widget`.
  test.each([
    ["zle_widget", zw, "ZLE widget (Modifying Text)"],
    ["keymap", km, "ZLE keymap (regular)"],
  ] as const)("category line is a bolding hazard — %s", (_cat, doc, want) => {
    const withZle = mkTestCorpus({ option: [cd, zleOpt] })
    const line = categoryFooter(doc)
    expect(line).toBe(`_Category:_ ${want}`)
    expect(fmtOptRefsInMd(line, withZle)).toContain("**")
  })

  test("desc-less reserved word — empty body, no head", () => {
    const bare: ReservedWordDoc = {
      ...identity("reserved_word", "for"),
      sig: "for",
      subKind: "command",
    }
    expect(renderRecord(noOpts, bare)).toEqual({
      title: "`for`",
      mdBody: "",
    })
  })

  // `head` is the block `mdBody` opens with, never something to prepend.
  test.each(docCategories)("%s head opens the body", cat => {
    const doc = baseArrays[cat][0]
    if (doc === undefined) throw new Error(`no fixture for ${cat}`)
    const r = renderRecord(noOpts, doc)
    if (r.head === undefined) return
    expect(
      r.mdBody.startsWith(
        `\`\`\`${r.head.lang}\n${r.head.lines.join("\n")}\n\`\`\``,
      ),
    ).toBe(true)
  })

  // Typed extras end the body, and pass through bolding (the alias target is
  // an option reference).
  test("typed extras end the body", () => {
    const alias: ZshOption = {
      ...cd,
      ...identity("option", "CDABLE_VARS", "CDABLE_VARS"),
      aliasOf: { target: cd.id, negated: false },
    }
    const opt = body(alias, cdCorpus)
    expect(opt).toMatch(/_Alias of:_ \*\*`AUTO_CD`\*\*$/)

    const tied = body({
      ...sec,
      tied: mkDocumented("special_param", "path"),
    })
    expect(tied).toMatch(/_Tied with:_ `path`$/)

    const deprecated = body({
      ...bi,
      deprecated: true,
      module: "zsh/files",
    })
    expect(deprecated).toMatch(
      /_Deprecated:_ not recommended for new code\n\n_Module:_ `zsh\/files`$/,
    )

    const special = body({
      ...km,
      subKind: "special",
      linkedFrom: [],
    })
    expect(special).toMatch(/_Special:_ cannot be altered$/)

    expect(body(gf)).toMatch(/_Args:_ expr$/)
  })

  test("default state by emulation", () => {
    expect(defaultStateIn(cd, "zsh")).toBe("on")
    expect(defaultStateIn({ ...cd, defaultIn: ["ksh"] }, "zsh")).toBe("off")
  })

  test("typed ref-doc ids distinct from display headings", () => {
    const docs = corpus()
    const opt = docs.find(d => d.kind === "option")
    expect(opt?.id).toBe(mkDocumented("option", "AUTO_CD"))
    expect(opt?.heading).toBe("AUTO_CD")
    expect(docs.find(d => d.kind === "redirection")?.heading).toBe(">> word")
  })

  test.each([
    // brackets / braces / pipe
    "zmodload [ -is ] name ...",
    "-o [ order ]",
    "foo | bar",
    "{a,b,c}",
    // ellipses
    "name ...",
    "arg…",
    // *meta* placeholders
    "*pattern*",
    // bare whitespace separator
    "-A pat",
    "-M matchspec",
  ])("isDocoptSig accepts docopt-shaped %j", sig => {
    expect(isDocoptSig(sig)).toBe(true)
  })

  // bare flag / key / escape
  test.each(["-a", "--long", "-1", "nosort", "%n", "HOME"])(
    "isDocoptSig rejects %j",
    sig => {
      expect(isDocoptSig(sig)).toBe(false)
    },
  )

  // comma-separated bare identifiers (widget synonym lists) carve out from docopt
  test.each([
    ["foo, bar", true],
    ["history-incremental-search-backward, foo", true],
    // single item / non-identifier / brackets / spaces → not a synonym list
    ["foo", false],
    ["foo, [bar]", false],
    ["foo bar", false],
  ] as const)("isSynonymList(%j) → %s", (sig, want) => {
    expect(isSynonymList(sig)).toBe(want)
  })

  test("isDocoptSig rejects synonym list", () => {
    expect(isDocoptSig("foo, bar")).toBe(false)
  })

  test("title — per-category formatting", () => {
    expect(title(cd)).toBe("`AUTO_CD`")
    expect(title(cu)).toBe("`-a` *file*")
    expect(title(cb)).toBe("*left* `-nt` *right*")
    expect(title(bi)).toBe("`echo`")
    expect(title(pc)).toBe("`noglob`")
    expect(title(sec)).toBe("`SECONDS`")
    expect(title(cc)).toBe("`if`")
    expect(title(word)).toBe("`if`")
    expect(title(rd)).toBe("`>>`")
    expect(title(sub)).toBe("`<(...)`")
    expect(title(px)).toBe("`${name:-word}`    _(default, form 2 of 2)_")
    expect(title(sf)).toBe("`w`")
    expect(title(pf)).toBe("`U`")
    expect(title(hi)).toBe("`!!`")
    expect(title(go)).toBe("`*`")
    expect(title(gf)).toBe("`i`")
    expect(title(gq)).toBe("`@`")
    expect(title(pe)).toBe("`%n`")
    expect(title(zw)).toBe("`backward-kill-word`")
    expect(title(km)).toBe("`emacs`")
    expect(title(js)).toBe("`%%`")
    expect(title(ao)).toBe("`+`")
    expect(title(sfn)).toBe("`chpwd`")
    expect(title(cuu)).toBe("`_all_labels`")
  })

  test("title — param_expn solo sig has no form index", () => {
    const solo: ParamExpnDoc = {
      ...px,
      ...identity("param_expn", "${name}"),
      sig: "${name}",
      groupSigs: ["${name}"],
      orderInGroup: 0,
    }
    expect(title(solo)).toBe("`${name}`    _(default)_")
  })

  test("head — structured head for head-emitting categories", () => {
    expect(head(bi)).toEqual({
      lang: "docopt",
      lines: ["echo [ -n ] [ arg ... ]"],
    })
    expect(head(cu)).toEqual({
      lang: "zsh",
      lines: ["[[ -a file ]]"],
    })
    expect(head(ao)).toEqual({
      lang: "zsh",
      lines: ["$(( + a ))", "$(( a + b ))"],
    })
  })

  test("head — head-less categories have none", () => {
    expect(head(km)).toBeUndefined()
    expect(head(js)).toBeUndefined()
    expect(head(sub)).toBeUndefined()
    expect(head(zw)).toBeUndefined()
  })

  // The bindings paragraph opens the body; keymaps `; `-separated. A key
  // containing a backtick gets a double-backtick span; a prose entry (has
  // a space) stays un-coded; no paragraph at all when the manual lists none.
  const bindingCases: readonly (readonly [
    label: string,
    bindings: ZleWidgetDoc["defaultBindings"],
    want: string,
  ])[] = [
    [
      "two keymaps",
      [
        { keymap: "vicmd", keys: ["^H", "h", "^?"] },
        { keymap: "viins", keys: ["ESC-[D"] },
      ],
      "_Default bindings:_ vicmd `^H` `h` `^?`; viins `ESC-[D`",
    ],
    [
      "backtick key",
      [{ keymap: "vicmd", keys: ["`"] }],
      "_Default bindings:_ vicmd `` ` ``",
    ],
    [
      "prose entry",
      [
        { keymap: "emacs", keys: ["printable characters"] },
        {
          keymap: "viins",
          keys: ["printable characters and some control characters"],
        },
      ],
      "_Default bindings:_ emacs printable characters; viins printable characters and some control characters",
    ],
  ]

  test.each(bindingCases)(
    "zle widget bindings paragraph — %s",
    (_label, defaultBindings, want) => {
      const md = body({ ...zw, defaultBindings })
      expect(md.startsWith(`${want}\n\nd:zw`)).toBe(true)
    },
  )

  test("zle widget bindings paragraph — absent when empty", () => {
    expect(body({ ...zw, defaultBindings: [] })).toBe("d:zw")
  })

  test("alternate-form requires annotation rendered as trailing comment", () => {
    const docWithReq: ComplexCommandDoc = {
      ...cc,
      alternateForms: [
        {
          template: "if list { list }",
          keywords: [],
          requires: ["SHORT_LOOPS"],
        },
        {
          template: "repeat word sublist",
          keywords: [],
          requires: ["SHORT_LOOPS", "SHORT_REPEAT"],
        },
        { template: "plain form", keywords: [] },
      ],
    }
    const md = body(docWithReq)
    expect(md).toContain("if list { list }    # requires SHORT_LOOPS")
    expect(md).toContain(
      "repeat word sublist    # requires SHORT_LOOPS or SHORT_REPEAT",
    )
    // Forms without requires render bare — no trailing comment.
    expect(md).toMatch(/^plain form$/m)
  })

  test("member-list bullet — docopt sig becomes fenced docopt block", () => {
    // ShellParamDoc.keys feed renderMemberList; use a docopt-shaped key to
    // exercise the fenced-bullet path end to end.
    const doc: ShellParamDoc = {
      ...sec,
      ...identity("special_param", "PSEUDO"),
      desc: "intro",
      keys: [
        {
          name: "[ key ] ...",
          desc: "first para\n\nsecond para",
        },
        { name: "plainkey", desc: "leaf desc" },
      ],
    }
    containsAll(body(doc), [
      // docopt key: fenced bullet block, indented multi-paragraph desc
      "- ```docopt\n  [ key ] ...\n  ```",
      "  first para",
      "  second para",
      // plain key: inline form
      "- `plainkey`: leaf desc",
    ])
  })
})

describe("render dump", () => {
  const baseDocs = corpus()
  const refFiles = dumpText(baseDocs)
  const headingOf = (k: DocCategory) =>
    baseDocs.find(d => d.kind === k)?.heading ?? ""

  test("per-kind dump files", () => {
    const docs = corpus({ conditional_op: [cb] })
    const files = dumpText(docs)
    for (const doc of docs) {
      const h = `## ${doc.heading}`
      expect(files.get(dumpFile.forCat(doc.kind))).toContain(h)
      expect(files.get(dumpFile.all)).toContain(h)
    }
  })

  const preambleCases = docCategories.flatMap(k => {
    const p = docCategoryPreamble[k]
    return p === undefined ? [] : [[k, p] as const]
  })
  const noPreambleCats = docCategories.filter(k => !docCategoryPreamble[k])

  test.each(preambleCases)(
    "%s dump starts with the category preamble",
    (k, preamble) => {
      const body = refFiles.get(dumpFile.forCat(k)) ?? ""
      expect(body.startsWith("<!-- preamble for category -->")).toBe(true)
      expect(body).toContain(preamble)
      expect(body.indexOf(preamble)).toBeLessThan(
        body.indexOf(`## ${headingOf(k)}`),
      )
    },
  )

  test.each(preambleCases)(
    "all.md does NOT contain %s preamble",
    (_k, preamble) => {
      expect(refFiles.get(dumpFile.all)).not.toContain(preamble)
    },
  )

  test.each(noPreambleCats)("%s dump has no preamble marker", k => {
    expect(refFiles.get(dumpFile.forCat(k))).not.toContain(
      "<!-- preamble for category",
    )
  })

  test("writes dump files", async () => {
    await withTmpDirAsync("better-zsh-ref-", async dir => {
      const docs = corpus({ conditional_op: [cb] })
      await writeRefDump(dir, docs)
      const all = readFileSync(join(dir, dumpFile.all), "utf8")
      for (const doc of docs) {
        expect(all).toContain(`## ${doc.heading}`)
        expect(
          readFileSync(join(dir, dumpFile.forCat(doc.kind)), "utf8"),
        ).toContain(doc.md)
      }
    })
  })

  describe("vendored docs", () => {
    const vendored = zd.loadCorpus()
    const docs = refDocs(vendored)
    const files = dumpText(docs)

    test.each(docCategories)("%s dump covers every vendored record", kind => {
      const file = dumpFile.forCat(kind)
      const src = [...vendored[kind].values()]
      expect(docs.filter(d => d.kind === kind)).toHaveLength(src.length)
      expect(headings(files.get(file))).toBe(src.length)
    })

    test.each(docCategories)("%s ref docs preserve corpus order", kind => {
      expect(docs.filter(d => d.kind === kind).map(d => d.id)).toEqual([
        ...vendored[kind].keys(),
      ])
    })

    // Vendored-option lookup that throws on miss; body rendered inline.
    const renderOpt = (name: string): string => {
      const opt = vendored.option.get(mkDocumented("option", name))
      if (!opt) throw new Error(`no vendored option: ${name}`)
      return body(opt, vendored)
    }

    test("formats real option cross-refs but not env vars", () => {
      const out = renderOpt("CD_SILENT")
      expect(out).toContain("**`AUTO_CD`**")
      expect(out).toContain("**`PUSHD_SILENT`**")
      expect(out).toContain("**`POSIX_CD`**")
      // CDPATH is an env var (not an option), so it gets the upstream
      // `tt()` backticks but never the bold-coded option treatment.
      expect(out).not.toContain("**`CDPATH`**")
    })

    test("keeps literal pseudo-calls in vendored option prose", () => {
      const globalMd = renderOpt("GLOBAL_RCS")
      const rcsMd = renderOpt("RCS")
      // Upstream marks pseudo-call names with `tt(zprofile())` etc. and
      // dotfile names with `tt(.zshenv)` etc.; `tt()` rendering now
      // backticks them, hence the assertion shape changed from naked
      // `zprofile()` to `` `zprofile()` ``.
      expect(globalMd).toContain(
        "startup files `zprofile()`, `zshrc()`, `zlogin()` and `zlogout()` will not be run.",
      )
      expect(globalMd).not.toContain(",,")
      expect(rcsMd).toContain(
        "After `zshenv()` is sourced on startup, source the `.zshenv`, `zprofile()`, `.zprofile`, `zshrc()`, `.zshrc`, `zlogin()`, `.zlogin`, and `.zlogout` files, as described in Files.",
      )
      expect(rcsMd).toContain("the `zshenv()` file is still sourced")
      expect(rcsMd).toContain("Files")
      expect(rcsMd).not.toContain(",,")
    })
  })
})
