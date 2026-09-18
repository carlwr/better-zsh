import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  dumpFile,
  dumpText,
  refDocs,
  writeRefDump,
} from "../../../scripts/ref-dump"
import { mkDocumented } from "../../docs/brands"
import { docCategoryPreamble } from "../../docs/category-preamble"
import type { DocCorpus } from "../../docs/corpus"
import * as zd from "../../docs/corpus"
import type { DocCategory, DocRecordMap } from "../../docs/taxonomy"
import {
  docCategories,
  docCategoryLabels,
  idOf,
  mkPieceId,
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
import { mkOptFlag, mkRedirOp, mkShellParamKeyName } from "../../docs/types"
import {
  defaultStateIn,
  fmtOptRefsInMd,
  headFor,
  isDocoptSig,
  isSynonymList,
  mdArithOp,
  mdBuiltin,
  mdComplexCommand,
  mdCompUtility,
  mdCondOp,
  mdGlobFlag,
  mdGlobOp,
  mdGlobQualifier,
  mdHistory,
  mdJobSpec,
  mdKeymap,
  mdOpt,
  mdParamExpn,
  mdParamFlag,
  mdPrecmd,
  mdProcessSubst,
  mdPromptEscape,
  mdRedir,
  mdReservedWord,
  mdShellParam,
  mdSpecialFunction,
  mdSubscriptFlag,
  mdZleWidget,
  recordTitle,
  renderDocWithTitle,
  renderRecord,
} from "../../render/md"
import { withTmpDirAsync } from "../tmp-dir"

// --- fixtures ---------------------------------------------------------------
// `section` is required by the types but, the option `_Section:_` line and
// subKinds aside, unused by renderers.

const cd: ZshOption = {
  name: mkDocumented("option", "AUTO_CD"),
  display: "AUTO_CD",
  flags: [{ char: mkOptFlag("J"), on: "-", emulations: ["csh", "zsh"] }],
  defaultIn: ["csh", "ksh", "sh", "zsh"],
  section: "Changing Directories",
  desc: "d:o",
}
// An option whose name is also a category-label word (`ZLE widget`).
const zleOpt: ZshOption = {
  name: mkDocumented("option", "ZLE"),
  display: "ZLE",
  flags: [],
  defaultIn: ["zsh"],
  section: "Zle",
  desc: "d:zle",
}

const cond = <A extends CondOpDoc["arity"]>(
  arity: A,
  op: string,
  operands: Extract<CondOpDoc, { arity: A }>["operands"],
  desc: string,
): CondOpDoc =>
  ({
    op: mkDocumented("conditional_op", op),
    operands,
    desc,
    arity,
  }) as CondOpDoc

const cu = cond("unary", "-a", ["file"], "d:u")
const cb = cond("binary", "-nt", ["left", "right"], "d:b")

const bi: BuiltinDoc = {
  name: mkDocumented("builtin", "echo"),
  synopsis: ["echo [ -n ] [ arg ... ]"],
  desc: "d:bi",
}
const pc: PrecmdDoc = {
  name: "noglob",
  synopsis: ["noglob command arg ..."],
  desc: "d:pc",
}
const rd: RedirDoc = {
  groupOp: mkRedirOp(">>"),
  slug: mkDocumented("redirection", ">>_word"),
  sig: ">> word",
  desc: "d:r",
  section: "",
}
const sub: ProcessSubstDoc = {
  op: "<(...)",
  sig: "<(list)",
  desc: "d:ps",
  section: "",
}
const px: ParamExpnDoc = {
  sig: mkDocumented("param_expn", "${name:-word}"),
  groupSigs: ["${name-word}", "${name:-word}"],
  orderInGroup: 1,
  subKind: "default",
  placeholders: ["name", "word"],
  desc: "d:px",
  section: "Parameter Expansion",
}
const word: ReservedWordDoc = {
  name: mkDocumented("reserved_word", "if"),
  sig: "if list then list fi",
  desc: "d:rw",
  section: "",
  pos: "command",
}
const cc: ComplexCommandDoc = {
  name: mkDocumented("complex_command", "if"),
  sig: "if list then list fi",
  desc: "d:cc",
  section: "Complex Commands",
  alternateForms: [{ template: "if list { list }", keywords: [] }],
  bodyKeywords: ["then", "fi"],
}
const sec: ShellParamDoc = {
  name: mkDocumented("special_param", "SECONDS"),
  desc: "d:p",
  scope: "shell-set",
}
// Flag/key/op-shaped fixtures: TS can't propagate K↔idField through a computed key.
const stub = <K extends DocCategory>(
  cat: K,
  idField: "flag" | "key" | "op",
  value: string,
  extra: object = {},
): DocRecordMap[K] =>
  ({
    [idField]: mkDocumented(cat, value),
    args: [],
    sig: value,
    desc: "",
    section: "",
    ...extra,
  }) as unknown as DocRecordMap[K]

const sf = stub("subscript_flag", "flag", "w", {
  desc: "d:sf",
  args: ["string"],
})
const pf = stub("param_expn_flag", "flag", "U", { desc: "d:pf" })
const hi = stub("history_expn", "key", "!!", {
  kind: "event-designator",
  desc: "d:hi",
})
const go = stub("glob_op", "op", "*", { kind: "standard", desc: "d:go" })
const gf = stub("glob_flag", "flag", "i", { desc: "d:gf", args: ["expr"] })
const gq = stub("glob_qualifier", "flag", "@", { desc: "d:gq", args: [] })

const pe: PromptEscapeDoc = {
  key: mkDocumented("prompt_escape", "%n"),
  sig: "%n",
  desc: "d:pe",
  section: "Login information",
}
const zw: ZleWidgetDoc = {
  name: mkDocumented("zle_widget", "backward-kill-word"),
  desc: "d:zw",
  section: "Modifying Text",
  kind: "standard",
  defaultBindings: [{ keymap: "emacs", keys: ["^W", "ESC-^H", "ESC-^?"] }],
}
const km: KeymapDoc = {
  name: mkDocumented("keymap", "emacs"),
  sig: "emacs",
  desc: "d:km",
  section: "Keymaps",
  isSpecial: false,
  linkedFrom: ["main"],
}
const js: JobSpecDoc = {
  key: mkDocumented("job_spec", "%%"),
  sig: "%%",
  desc: "d:js",
  section: "Jobs",
  kind: "current",
}
const ao: ArithOpDoc = {
  op: mkDocumented("arith_op", "+"),
  sig: "+",
  desc: "d:ao",
  section: "Arithmetic Evaluation",
  arity: "overloaded",
}
const sfn: SpecialFunctionDoc = {
  name: mkDocumented("special_function", "chpwd"),
  sig: "chpwd",
  desc: "d:sfn",
  section: "Hook Functions",
  kind: "hook",
  hookArray: "chpwd_functions",
}
const cuu: CompUtilityDoc = {
  name: mkDocumented("comp_utility", "_all_labels"),
  synopsis: ["_all_labels [ -x ] [ -12VJ ] tag name descr [ command arg ... ]"],
  desc: "d:cuu",
  section: "Utility Functions",
}
const mf: MathfuncDoc = {
  name: mkDocumented("mathfunc", "sin"),
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
    out[k] = new Map(all[k].map(d => [idOf(k, d), d]))
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

// Title is composed downstream by `recordTitle` — body assertions below
// deliberately exclude the title line. See the `recordTitle` and
// `renderDocWithTitle` tests further down for title-related coverage.

// Per-category bodies: no category footer here (`renderRecord` appends it —
// see the footer tests).
const renderedMarkdownCases = [
  ["special_param", mdShellParam(sec), ["d:p"]],
  ["builtin", mdBuiltin(bi), ["```docopt", "echo [ -n ] [ arg ... ]", "d:bi"]],
  [
    "precmd_modifier",
    mdPrecmd(pc),
    ["```docopt", "noglob command arg ...", "d:pc"],
  ],
  ["redirection", mdRedir(rd), ["```docopt", ">> word", "d:r"]],
  ["process_subst", mdProcessSubst(sub), ["d:ps"]],
  [
    "param_expn",
    mdParamExpn(px),
    ["```zsh", "${name-word}", "${name:-word}    # <- this form", "d:px"],
  ],
  ["reserved_word", mdReservedWord(word), ["d:rw"]],
  [
    "complex_command",
    mdComplexCommand(cc, noOpts),
    [
      "```docopt",
      "if list then list fi",
      "d:cc",
      "_Alternate forms:_",
      "if list { list }",
      "_Body keywords:_ `then` `fi`",
    ],
  ],
  ["prompt_escape", mdPromptEscape(pe), ["```zsh", "print -P '%n'", "d:pe"]],
  [
    "zle_widget",
    mdZleWidget(zw),
    ["_Default bindings:_ emacs `^W` `ESC-^H` `ESC-^?`", "d:zw"],
  ],
  ["keymap", mdKeymap(km), ["d:km", "_Linked from:_ `main`"]],
  ["job_spec", mdJobSpec(js), ["d:js"]],
  ["arith_op", mdArithOp(ao), ["d:ao"]],
  [
    "special_function",
    mdSpecialFunction(sfn),
    ["d:sfn", "```zsh", "chpwd_functions=( funcname1 funcname2 ... )"],
  ],
  [
    "subscript_flag",
    mdSubscriptFlag(sf, noOpts),
    ["```zsh", "${name[(w)exp]}", "d:sf", "_Args:_ string"],
  ],
  [
    "param_expn_flag",
    mdParamFlag(pf, noOpts),
    ["```zsh", "${(U)spec}", "d:pf"],
  ],
  ["history_expn", mdHistory(hi, noOpts), ["d:hi"]],
  ["glob_op", mdGlobOp(go, noOpts), ["d:go"]],
  [
    "glob_flag",
    mdGlobFlag(gf, noOpts),
    ["```zsh", "(#i)pat", "d:gf", "_Args:_ expr"],
  ],
  ["glob_qualifier", mdGlobQualifier(gq, noOpts), ["```zsh", "*(@)", "d:gq"]],
  ["comp_utility", mdCompUtility(cuu), ["d:cuu"]],
] as const

// --- tests ------------------------------------------------------------------

describe("render markdown", () => {
  test("option markdown", () => {
    containsAll(mdOpt(cd, noOpts), [
      "```zsh",
      "setopt auto_cd",
      "unsetopt auto_cd",
      "set -J",
      "set +J",
      "**Default in zsh: `on`**",
      "_Section:_ Changing Directories",
    ])
  })

  // A letter from the sh/ksh table only is not plain-zsh syntax: rendered
  // after the plain-zsh flags (whatever the record order) and annotated.
  test("option head — sh/ksh-only flags last, annotated", () => {
    const opt: ZshOption = {
      ...cd,
      flags: [
        { char: mkOptFlag("b"), on: "-", emulations: ["ksh", "sh"] },
        { char: mkOptFlag("5"), on: "-", emulations: ["csh", "zsh"] },
      ],
    }
    expect(headFor("option", opt)?.lines.join("\n")).toBe(
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

  test.each([
    [cu, "```zsh\n[[ -a file ]]\n```\n\nd:u"],
    [cb, "```zsh\n[[ left -nt right ]]\n```\n\nd:b"],
  ] as const)("cond op markdown — body only ($arity)", (op, want) => {
    expect(mdCondOp(op, noOpts)).toBe(want)
  })

  test.each([
    [
      cu,
      "```zsh\n[[ -a file ]]\n```\n\nd:u\n\n_Category:_ conditional operator (unary)",
    ],
    [
      cb,
      "```zsh\n[[ left -nt right ]]\n```\n\nd:b\n\n_Category:_ conditional operator (binary)",
    ],
  ] as const)("cond op record — body + footer ($arity)", (op, want) => {
    expect(renderRecord(noOpts, "conditional_op", op)).toBe(want)
  })

  test.each(renderedMarkdownCases)("%s markdown", (_, md, parts) => {
    containsAll(md, parts)
  })

  // --- category footer -----------------------------------------------------

  const lastParagraph = (md: string) => md.split("\n\n").at(-1) ?? ""

  // Every record ends with the taxonomy's label (+ subKind when the category
  // has one); the per-category strings this replaced are gone.
  test.each(docCategories)("%s record ends with the category footer", cat => {
    const doc = baseArrays[cat][0]
    if (doc === undefined) throw new Error(`no fixture for ${cat}`)
    const sub = subKindOf(cat, doc)
    const label = docCategoryLabels[cat]
    const want = sub === undefined ? label : `${label} (${sub})`
    const md = renderRecord(noOpts, cat, doc)
    expect(lastParagraph(md)).toBe(`_Category:_ ${want}`)
    expect(md).not.toMatch(/^_(Role|Subsection|Option category):_/m)
  })

  test("footer subKind — reserved word position", () => {
    expect(renderRecord(noOpts, "reserved_word", { ...word, pos: "any" })).toBe(
      "d:rw\n\n_Category:_ reserved word (any)",
    )
  })

  test("footer alone — desc-less reserved word", () => {
    const bare: ReservedWordDoc = {
      name: mkDocumented("reserved_word", "for"),
      sig: "for",
      section: "Reserved Words",
      pos: "command",
    }
    expect(renderRecord(noOpts, "reserved_word", bare)).toBe(
      "_Category:_ reserved word (command)",
    )
  })

  // The footer is composed after option-ref bolding: `ZLE` is an option, and
  // a body-side footer would come out as `_Category:_ **`ZLE`** widget`.
  test.each([
    ["zle_widget", zw, "ZLE widget (standard:Modifying Text)"],
    ["keymap", km, "ZLE keymap (regular)"],
  ] as const)("footer never bolded — %s", (cat, doc, want) => {
    const withZle = mkTestCorpus({ option: [cd, zleOpt] })
    expect(fmtOptRefsInMd(`_Category:_ ${want}`, withZle)).toContain("**")
    const footer = lastParagraph(renderRecord(withZle, cat, doc))
    expect(footer).toBe(`_Category:_ ${want}`)
    expect(footer).not.toContain("**")
  })

  // Typed extras stay in the body, before the footer, and still pass through
  // bolding (the alias target is an option reference).
  test("typed extras precede the footer", () => {
    const alias: ZshOption = {
      ...cd,
      name: mkDocumented("option", "CDABLE_VARS"),
      display: "CDABLE_VARS",
      aliasOf: { target: cd.name, negated: false },
    }
    const opt = renderRecord(cdCorpus, "option", alias)
    expect(opt).toContain("_Alias of:_ **`AUTO_CD`**")
    expect(opt).toMatch(
      /_Section:_ Changing Directories\n\n_Category:_ option$/,
    )

    const tied = renderRecord(noOpts, "special_param", {
      ...sec,
      tied: mkDocumented("special_param", "path"),
    })
    expect(tied).toMatch(
      /_Tied with:_ `path`\n\n_Category:_ special parameter \(shell-set\)$/,
    )

    const deprecated = renderRecord(noOpts, "builtin", {
      ...bi,
      deprecated: true,
      module: "zsh/files",
    })
    expect(deprecated).toMatch(
      /_Deprecated:_ not recommended for new code\n\n_Module:_ `zsh\/files`\n\n_Category:_ builtin$/,
    )

    const special = renderRecord(noOpts, "keymap", {
      ...km,
      isSpecial: true,
      linkedFrom: [],
    })
    expect(special).toMatch(
      /_Special:_ cannot be altered\n\n_Category:_ ZLE keymap \(special\)$/,
    )

    expect(renderRecord(noOpts, "glob_flag", gf)).toMatch(
      /_Args:_ expr\n\n_Category:_ glob flag$/,
    )
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

  test("recordTitle — per-category formatting", () => {
    expect(recordTitle("option", cd)).toBe("`AUTO_CD`")
    expect(recordTitle("conditional_op", cu)).toBe("`-a` *file*")
    expect(recordTitle("conditional_op", cb)).toBe("*left* `-nt` *right*")
    expect(recordTitle("builtin", bi)).toBe("`echo`")
    expect(recordTitle("precmd_modifier", pc)).toBe("`noglob`")
    expect(recordTitle("special_param", sec)).toBe("`SECONDS`")
    expect(recordTitle("complex_command", cc)).toBe("`if`")
    expect(recordTitle("reserved_word", word)).toBe("`if`")
    expect(recordTitle("redirection", rd)).toBe("`>>`")
    expect(recordTitle("process_subst", sub)).toBe("`<(...)`")
    expect(recordTitle("param_expn", px)).toBe(
      "`${name:-word}`    _(default, form 2 of 2)_",
    )
    expect(recordTitle("subscript_flag", sf)).toBe("`w`")
    expect(recordTitle("param_expn_flag", pf)).toBe("`U`")
    expect(recordTitle("history_expn", hi)).toBe("`!!`")
    expect(recordTitle("glob_op", go)).toBe("`*`")
    expect(recordTitle("glob_flag", gf)).toBe("`i`")
    expect(recordTitle("glob_qualifier", gq)).toBe("`@`")
    expect(recordTitle("prompt_escape", pe)).toBe("`%n`")
    expect(recordTitle("zle_widget", zw)).toBe("`backward-kill-word`")
    expect(recordTitle("keymap", km)).toBe("`emacs`")
    expect(recordTitle("job_spec", js)).toBe("`%%`")
    expect(recordTitle("arith_op", ao)).toBe("`+`")
    expect(recordTitle("special_function", sfn)).toBe("`chpwd`")
    expect(recordTitle("comp_utility", cuu)).toBe("`_all_labels`")
  })

  test("recordTitle — param_expn solo sig drops form-index decoration", () => {
    const solo: ParamExpnDoc = {
      ...px,
      sig: mkDocumented("param_expn", "${name}"),
      groupSigs: ["${name}"],
      orderInGroup: 0,
    }
    expect(recordTitle("param_expn", solo)).toBe("`${name}`    _(default)_")
  })

  test("renderDocWithTitle — composes title + body", () => {
    const docs = mkTestCorpus()
    const pid = mkPieceId("builtin", bi.name)
    const out = renderDocWithTitle(docs, pid)
    // Title is on the first line, body follows after a blank line.
    expect(out).toMatch(/^`echo`\n\n/)
    expect(out).toContain("d:bi")
  })

  test("headFor — returns structured head for head-emitting categories", () => {
    const builtinHead = headFor("builtin", bi)
    expect(builtinHead).toEqual({
      lang: "docopt",
      lines: ["echo [ -n ] [ arg ... ]"],
    })
    const condHead = headFor("conditional_op", cu)
    expect(condHead).toEqual({ lang: "zsh", lines: ["[[ -a file ]]"] })
    const arithHead = headFor("arith_op", ao)
    expect(arithHead).toEqual({
      lang: "zsh",
      lines: ["$(( + a ))", "$(( a + b ))"],
    })
  })

  test("headFor — head-less categories return undefined", () => {
    expect(headFor("keymap", km)).toBeUndefined()
    expect(headFor("job_spec", js)).toBeUndefined()
    expect(headFor("process_subst", sub)).toBeUndefined()
    expect(headFor("zle_widget", zw)).toBeUndefined()
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
      const md = mdZleWidget({ ...zw, defaultBindings })
      expect(md.startsWith(`${want}\n\nd:zw`)).toBe(true)
    },
  )

  test("zle widget bindings paragraph — absent when empty", () => {
    expect(mdZleWidget({ ...zw, defaultBindings: [] })).toBe("d:zw")
  })

  test("renderDocWithTitle — missing record throws, naming category and id", () => {
    const docs = mkTestCorpus({ builtin: [] })
    const pid = mkPieceId("builtin", mkDocumented("builtin", "missing"))
    expect(() => renderDocWithTitle(docs, pid)).toThrow(/builtin.*"missing"/)
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
    const md = mdComplexCommand(docWithReq, mkTestCorpus({ option: [] }))
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
      name: mkDocumented("special_param", "PSEUDO"),
      desc: "intro",
      keys: [
        {
          name: mkShellParamKeyName("[ key ] ..."),
          desc: "first para\n\nsecond para",
        },
        { name: mkShellParamKeyName("plainkey"), desc: "leaf desc" },
      ],
    }
    containsAll(mdShellParam(doc), [
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

    // Vendored-option lookup that throws on miss; mdOpt rendered inline.
    const renderOpt = (name: string): string => {
      const opt = vendored.option.get(mkDocumented("option", name))
      if (!opt) throw new Error(`no vendored option: ${name}`)
      return mdOpt(opt, vendored)
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
