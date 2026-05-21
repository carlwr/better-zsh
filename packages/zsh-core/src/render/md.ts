import type { DocCorpus } from "../docs/corpus.ts"
import { resolve } from "../docs/resolver.ts"
import type { DocCategory, DocPieceId, DocRecordMap } from "../docs/taxonomy.ts"
import type {
  ArithOpDoc,
  BuiltinDoc,
  ComplexCommandDoc,
  CompUtilityDoc,
  CondOpDoc,
  Emulation,
  GlobFlagDoc,
  GlobOpDoc,
  GlobQualifierDoc,
  HistoryDoc,
  JobSpecDoc,
  KeymapDoc,
  MathfuncDoc,
  OptFlagAlias,
  OptState,
  ParamExpnDoc,
  ParamFlagDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  PromptEscapeDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SpecialFunctionDoc,
  SubscriptFlagDoc,
  ZleWidgetDoc,
  ZshOption,
} from "../docs/types.ts"
import { flipOptFlagSign } from "../docs/types.ts"
import { splitInlineCode, walkProseLines } from "./prose-walk.ts"

// --- formatting primitives --------------------------------------------------

const bt = (s: string) => `\`${s}\``
const codeBlock = (lang: string, ...lines: readonly string[]) =>
  [`\`\`\`${lang}`, ...lines, "```"].join("\n")
const docBlock = (...parts: readonly string[]) => parts.join("\n\n")

/** `[fn(x)]` if `x` is defined, otherwise `[]`. For value-gated optional parts. */
const maybe = <T>(x: T | undefined, fn: (x: T) => string): readonly string[] =>
  x === undefined ? [] : [fn(x)]

/** `[s]` if `s` is a non-empty string, otherwise `[]`. For passing through optional prose. */
const nonEmpty = (s: string | undefined): readonly string[] => (s ? [s] : [])

/** `items` when `cond`, otherwise `[]`. Eager — see `maybe` for value-gated parts. */
const when = (cond: boolean, ...items: readonly string[]): readonly string[] =>
  cond ? items : []

/** `_Module:_ \`mod\`` line — present iff the record carries a module tag. */
const modulePart = (mod: string | undefined): readonly string[] =>
  maybe(mod, m => `_Module:_ ${bt(m)}`)

// --- nested member-list helpers --------------------------------------------

/**
 * Item in a depth-1 nested bullet list. Renders as
 * `- \`sig\`: <first paragraph of desc>` with subsequent paragraphs indented
 * by 2 spaces (CommonMark list-item continuation). `subItems`, when present,
 * render as a depth-2 nested bullet list under this item.
 */
interface MemberItem {
  readonly sig: string
  readonly desc: string
  readonly subItems?: readonly { readonly sig: string; readonly desc: string }[]
}

function renderMemberList(
  intro: string,
  members: readonly MemberItem[] | undefined,
  outro?: string,
): string {
  const items = (members ?? []).filter(m => m.sig).map(renderMemberBullet)
  return docBlock(
    ...nonEmpty(intro),
    ...when(items.length > 0, items.join("\n\n")),
    ...nonEmpty(outro),
  )
}

function renderMemberBullet(m: MemberItem): string {
  const head = `- ${bt(m.sig)}`
  // subItems hold {sig, desc} only (no deeper nesting); passing them through
  // renderMemberBullet renders them as leaf bullets.
  const subBlock = (m.subItems ?? [])
    .filter(s => s.sig)
    .map(renderMemberBullet)
    .join("\n\n")
  const body = !subBlock
    ? m.desc
    : m.desc.trim()
      ? `${m.desc}\n\n${subBlock}`
      : subBlock
  if (!body.trim()) return head
  const [first = "", ...rest] = body.split(/\n{2,}/)
  const lines = [`${head}: ${first}`]
  for (const para of rest) {
    lines.push("")
    for (const line of para.split("\n")) lines.push(`  ${line}`)
  }
  return lines.join("\n")
}

/**
 * Body composed of `desc` (intro) + sibling flag groups (each: optional intro
 * + bullet list of flags) + optional `outro`. When `groups` is empty/missing,
 * returns just `desc`. Used by builtins and comp utilities, which can
 * document multiple sibling flag sections.
 */
function renderFlagGroupBody(
  desc: string,
  groups:
    | readonly {
        readonly intro: string
        readonly flags: readonly MemberItem[]
      }[]
    | undefined,
  outro?: string,
): string {
  if (!groups?.length) return desc
  return docBlock(
    ...nonEmpty(desc),
    ...groups.flatMap(g => [
      ...nonEmpty(g.intro),
      renderMemberList("", g.flags),
    ]),
    ...nonEmpty(outro),
  )
}

// --- option-ref bolding -----------------------------------------------------

/** Emphasize option references inside markdown prose, skipping fenced code. */
export function fmtOptRefsInMd(md: string, corpus: DocCorpus): string {
  if (corpus.option.size === 0) return md
  return walkProseLines(md, line => fmtOptRefsInLine(line, corpus))
}

// Bare ALL_CAPS, optionally NO_-prefixed; `\b` anchors keep `FOO_BAR` whole.
const OPT_REF_RE = /\b(?:NO_?)?[A-Z][A-Z0-9_]*\b/g
// Backticked option ref (from upstream `tt(OPT)`). Lookbehind/-ahead skip
// cases already bolded so re-running this pass is a no-op.
const BACKTICKED_OPT_RE = /(?<!\*\*)`([A-Z][A-Z0-9_]*)`(?!\*\*)/g

function fmtOptRefsInLine(line: string, corpus: DocCorpus): string {
  // Pass 1: bare ALL_CAPS in non-code segments → bold-coded.
  // Pass 2: backticked refs already in prose (from upstream `tt(OPT)`) get
  // the same treatment, yielding a single canonical bolded form.
  const pass1 = splitInlineCode(line)
    .map((part, i) => (i % 2 === 1 ? part : fmtOptRefsInText(part, corpus)))
    .join("")
  return pass1.replace(BACKTICKED_OPT_RE, (m, name) =>
    resolve(corpus, "option", name) ? `**${m}**` : m,
  )
}

function fmtOptRefsInText(text: string, corpus: DocCorpus): string {
  return text.replace(OPT_REF_RE, (raw, offset, whole) =>
    isShellParameterRef(whole, offset) || !resolve(corpus, "option", raw)
      ? raw
      : `**${bt(raw)}**`,
  )
}

/** True iff the match at `offset` is preceded by `$` or `${` (a parameter ref). */
function isShellParameterRef(whole: string, offset: number): boolean {
  const prev = whole[offset - 1]
  return prev === "$" || (prev === "{" && whole[offset - 2] === "$")
}

// --- per-category renderers ------------------------------------------------

export function mdOpt(opt: ZshOption, corpus: DocCorpus): string {
  const long = opt.display.toLowerCase()
  // Preamble stays inside executable zsh forms; status/context lines read
  // better outside it.
  return docBlock(
    bt(opt.display),
    codeBlock(
      "zsh",
      label("setopt", long, "on"),
      label("unsetopt", long, "off"),
      ...opt.flags.map(renderFlag),
    ),
    `**Default in zsh: ${bt(defaultStateIn(opt, "zsh"))}**`,
    fmtOptRefsInMd(opt.desc, corpus),
    ...maybe(
      opt.aliasOf,
      a => `_Alias of:_ ${bt(aliasTargetDisplay(a, corpus))}`,
    ),
    `_Option category:_ ${opt.category}`,
  )
}

/**
 * Display form of an option alias's target. Uses the target option's display
 * casing when known so e.g. `NO_IGNORE_BRACES` wins over `NO_ignorebraces`.
 */
function aliasTargetDisplay(
  aliasOf: NonNullable<ZshOption["aliasOf"]>,
  corpus: DocCorpus,
): string {
  const display = corpus.option.get(aliasOf.target)?.display ?? aliasOf.target
  return aliasOf.negated ? `NO_${display}` : display
}

export function mdCondOp(cop: CondOpDoc, corpus: DocCorpus): string {
  return docBlock(
    sigCond(cop),
    fmtOptRefsInMd(cop.desc, corpus),
    ...modulePart(cop.module),
  )
}

function sigCond(cop: CondOpDoc): string {
  const op = bt(cop.op)
  return cop.arity === "unary"
    ? `${op} *${cop.operands[0]}*`
    : `*${cop.operands[0]}* ${op} *${cop.operands[1]}*`
}

export function mdShellParam(doc: ShellParamDoc): string {
  const keys = doc.keys?.map(k => ({
    sig: k.name,
    desc: k.desc,
    ...(k.values && {
      subItems: k.values.map(v => ({ sig: v.name, desc: v.desc })),
    }),
  }))
  return docBlock(
    bt(doc.name),
    renderMemberList(doc.desc, keys, doc.outro),
    ...maybe(doc.tied, t => `_Tied with:_ ${bt(t)}`),
    ...modulePart(doc.module),
    `_Category:_ Special Parameter — ${doc.scope}`,
  )
}

export function mdParamFlag(doc: ParamFlagDoc, corpus: DocCorpus): string {
  return sigBlock(
    doc,
    corpus,
    `parameter-expansion flag${argsSuffix(doc.args)}`,
  )
}

export function mdSubscriptFlag(
  doc: SubscriptFlagDoc,
  corpus: DocCorpus,
): string {
  return sigBlock(
    doc,
    corpus,
    `parameter-subscript flag${argsSuffix(doc.args)}`,
  )
}

export function mdHistory(doc: HistoryDoc, corpus: DocCorpus): string {
  return sigBlock(doc, corpus, `history ${doc.kind.replace("-", " ")}`)
}

export function mdGlobOp(doc: GlobOpDoc, corpus: DocCorpus): string {
  return sigBlock(doc, corpus, `glob operator (${doc.kind})`)
}

export function mdGlobFlag(doc: GlobFlagDoc, corpus: DocCorpus): string {
  return sigBlock(doc, corpus, `glob flag${argsSuffix(doc.args)}`)
}

export function mdGlobQualifier(
  doc: GlobQualifierDoc,
  corpus: DocCorpus,
): string {
  return sigBlock(doc, corpus, `glob qualifier${argsSuffix(doc.args)}`)
}

function sigBlock(
  doc: { readonly sig: string; readonly desc: string },
  corpus: DocCorpus,
  role: string,
): string {
  return docBlock(
    bt(doc.sig),
    fmtOptRefsInMd(doc.desc, corpus),
    `_Role:_ ${role}`,
  )
}

const argsSuffix = (args: readonly string[]): string =>
  args.length > 0 ? ` (args: ${args.join(", ")})` : ""

export function mdBuiltin(doc: BuiltinDoc): string {
  return docBlock(
    bt(doc.name),
    codeBlock("zsh", ...doc.synopsis),
    renderFlagGroupBody(doc.desc, doc.flagGroups, doc.outro),
    ...maybe(doc.aliasOf, a => `_Alias of:_ ${bt(a)}`),
    ...when(
      doc.deprecated === true,
      "_Deprecated:_ not recommended for new code",
    ),
    ...modulePart(doc.module),
  )
}

export function mdPrecmd(doc: PrecmdDoc): string {
  return docBlock(
    bt(doc.name),
    codeBlock("zsh", ...doc.synopsis),
    doc.desc,
    "_Role:_ precommand modifier",
  )
}

export function mdRedir(doc: RedirDoc): string {
  return docBlock(
    bt(doc.groupOp),
    codeBlock("zsh", doc.sig),
    doc.desc,
    "_Category:_ Redirection",
  )
}

export function mdProcessSubst(doc: ProcessSubstDoc): string {
  return docBlock(bt(doc.op), doc.desc, "_Category:_ Process Substitution")
}

/**
 * Parameter-expansion form. Grouped sigs (2+ siblings sharing one desc) get a
 * code block listing every sibling in manual order with `# <- this form` on
 * the focused row; solo sigs skip it (header already shows the sig).
 */
export function mdParamExpn(doc: ParamExpnDoc): string {
  const n = doc.groupSigs.length
  const multi = n > 1
  const subtitle = multi
    ? `_(${doc.subKind}, form ${doc.orderInGroup + 1} of ${n})_`
    : `_(${doc.subKind})_`
  return docBlock(
    `${bt(doc.sig)}    ${subtitle}`,
    ...when(
      multi,
      codeBlock(
        "zsh",
        ...doc.groupSigs.map((s, i) =>
          i === doc.orderInGroup ? `${s}    # <- this form` : s,
        ),
      ),
    ),
    doc.desc,
    "_Category:_ Parameter Expansion",
  )
}

export function mdReservedWord(doc: ReservedWordDoc): string {
  const pos = doc.pos === "command" ? "command position" : "any position"
  return docBlock(
    bt(doc.name),
    ...nonEmpty(doc.desc),
    `_Role:_ reserved word (${pos})`,
  )
}

export function mdComplexCommand(
  doc: ComplexCommandDoc,
  corpus: DocCorpus,
): string {
  return docBlock(
    bt(doc.name),
    codeBlock("zsh", doc.sig),
    fmtOptRefsInMd(doc.desc, corpus),
    ...when(
      doc.alternateForms.length > 0,
      "_Alternate forms:_",
      codeBlock("zsh", ...doc.alternateForms.map(a => a.template)),
    ),
    ...when(
      doc.bodyKeywords.length > 0,
      `_Body keywords:_ ${doc.bodyKeywords.map(bt).join(" ")}`,
    ),
    "_Role:_ complex command",
  )
}

export function mdPromptEscape(doc: PromptEscapeDoc): string {
  return docBlock(
    bt(doc.sig),
    doc.desc,
    `_Category:_ Prompt Escape — ${doc.section}`,
  )
}

export function mdKeymap(doc: KeymapDoc): string {
  return docBlock(
    bt(doc.name),
    doc.desc,
    "_Role:_ ZLE keymap",
    ...when(doc.isSpecial, "_Special:_ cannot be altered"),
    ...when(
      doc.linkedFrom.length > 0,
      `_Linked from:_ ${doc.linkedFrom.map(bt).join(", ")}`,
    ),
  )
}

export function mdJobSpec(doc: JobSpecDoc): string {
  return docBlock(bt(doc.sig), doc.desc, `_Role:_ job spec (${doc.kind})`)
}

export function mdArithOp(doc: ArithOpDoc): string {
  return docBlock(
    bt(doc.op),
    doc.desc,
    `_Role:_ arithmetic operator (${doc.arity})`,
  )
}

const specialFunctionRoleLabel = {
  hook: "hook function",
  "trap-literal": "trap function",
  "trap-template": "trap function (template)",
} as const

export function mdSpecialFunction(doc: SpecialFunctionDoc): string {
  return docBlock(
    bt(doc.name),
    doc.desc,
    ...maybe(doc.hookArray, h =>
      codeBlock("zsh", `${h}=( funcname1 funcname2 ... )`),
    ),
    `_Role:_ ${specialFunctionRoleLabel[doc.kind]}`,
  )
}

export function mdZleWidget(doc: ZleWidgetDoc): string {
  return docBlock(
    bt(doc.name),
    codeBlock("zsh", doc.sig),
    renderMemberList(doc.desc, doc.subItems, doc.outro),
    ...modulePart(doc.module),
    `_Role:_ ZLE ${doc.kind} widget`,
    `_Subsection:_ ${doc.section}`,
  )
}

export function mdCompUtility(doc: CompUtilityDoc): string {
  return docBlock(
    bt(doc.name),
    codeBlock("zsh", ...doc.synopsis),
    renderFlagGroupBody(doc.desc, doc.flagGroups, doc.outro),
    "_Category:_ Completion Utility",
  )
}

export function mdMathfunc(doc: MathfuncDoc): string {
  return docBlock(
    bt(doc.name),
    codeBlock("zsh", ...doc.sig),
    doc.desc,
    ...modulePart(doc.module),
  )
}

// --- option-rendering helpers ----------------------------------------------

/** Whether an option defaults on/off under an emulation mode. */
export function defaultStateIn(opt: ZshOption, emulation: Emulation): OptState {
  return opt.defaultIn.includes(emulation) ? "on" : "off"
}

function renderFlag(flag: OptFlagAlias): string {
  // Long and short forms show identical on/off semantics, even when `+x` means on.
  return [
    label("set", `${flag.on}${flag.char}`, "on"),
    label("set", `${flipOptFlagSign(flag.on)}${flag.char}`, "off"),
  ].join("\n")
}

const label = (cmd: string, arg: string, state: OptState): string =>
  `${`${cmd} ${arg}`.padEnd(20)} # ${state}`

// --- public dispatch -------------------------------------------------------

// Per-category markdown renderers, dispatched by `DocCategory`.
const mdRenderer: {
  [K in DocCategory]: (doc: DocRecordMap[K], corpus: DocCorpus) => string
} = {
  option: mdOpt,
  conditional_op: mdCondOp,
  builtin: mdBuiltin,
  precmd_modifier: mdPrecmd,
  special_param: mdShellParam,
  complex_command: mdComplexCommand,
  reserved_word: mdReservedWord,
  redirection: mdRedir,
  process_subst: mdProcessSubst,
  param_expn: mdParamExpn,
  subscript_flag: mdSubscriptFlag,
  param_expn_flag: mdParamFlag,
  history_expn: mdHistory,
  glob_op: mdGlobOp,
  glob_flag: mdGlobFlag,
  glob_qualifier: mdGlobQualifier,
  prompt_escape: mdPromptEscape,
  zle_widget: mdZleWidget,
  keymap: mdKeymap,
  job_spec: mdJobSpec,
  arith_op: mdArithOp,
  mathfunc: mdMathfunc,
  special_function: mdSpecialFunction,
  comp_utility: mdCompUtility,
}

/**
 * Render a doc record through its per-category renderer and apply the
 * option-ref bolding pass. Idempotent — re-running on already-bolded
 * markdown is a no-op.
 */
export function renderRecord<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
  doc: DocRecordMap[K],
): string {
  const render = mdRenderer[cat] as (
    d: DocRecordMap[K],
    corpus: DocCorpus,
  ) => string
  return fmtOptRefsInMd(render(doc, corpus), corpus)
}

/**
 * Render the markdown doc block for a proven documented element. `id` must
 * come from `resolve()` or corpus iteration; returns `""` if the lookup
 * misses.
 */
export function renderDoc(corpus: DocCorpus, id: DocPieceId): string {
  const doc = corpus[id.category].get(id.id as never) as
    | DocRecordMap[typeof id.category]
    | undefined
  return doc ? renderRecord(corpus, id.category, doc) : ""
}
