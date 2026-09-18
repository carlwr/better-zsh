import {
  isSingle,
  mapNonEmpty,
  type NonEmpty,
  nonEmpty,
  trim,
} from "@carlwr/typescript-extra"
import type { DocCorpus } from "../docs/corpus.ts"
import { resolve } from "../docs/resolver.ts"
import type { DocCategory, DocPieceId, DocRecordMap } from "../docs/taxonomy.ts"
import { docCategoryLabels, recordOf, subKindOf } from "../docs/taxonomy.ts"
import type {
  AlternateForm,
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
  ZleDefaultBinding,
  ZleWidgetDoc,
  ZshOption,
} from "../docs/types.ts"
import { flipOptFlagSign } from "../docs/types.ts"
import { mdInlineCode } from "../docs/yodl/core/text.ts"
import { splitInlineCode, walkProseLines } from "./prose-walk.ts"

/**
 * Fenced executable form (or docopt template) immediately following the
 * record title. Constructed via {@link headFor}; no-head categories yield
 * `undefined`.
 */
export interface DocHead {
  readonly lang: string
  readonly lines: NonEmpty<string>
}

// --- formatting primitives --------------------------------------------------

const bt = (s: string) => `\`${s}\``
const codeBlock = (lang: string, ...lines: readonly string[]) =>
  [`\`\`\`${lang}`, ...lines, "```"].join("\n")
const docBlock = (...parts: readonly string[]) => parts.join("\n\n")

/** `[fn(x)]` if `x` is defined, otherwise `[]`. Value-gated optional parts. */
const maybe = <T>(x: T | undefined, fn: (x: T) => string): readonly string[] =>
  x === undefined ? [] : [fn(x)]

/** `[s]` if `s` is non-empty, otherwise `[]`. Pass-through for optional prose. */
const prose = (s: string | undefined): readonly string[] => (s ? [s] : [])

/** `items` when `cond`, otherwise `[]`. Eager — see `maybe` for value-gated. */
const when = (cond: boolean, ...items: readonly string[]): readonly string[] =>
  cond ? items : []

const modulePart = (mod: string | undefined): readonly string[] =>
  maybe(mod, m => `_Module:_ ${bt(m)}`)

// --- docopt-shape sig detection --------------------------------------------

const IDENT = /^[A-Za-z_][A-Za-z0-9_-]*$/

/**
 * Comma-separated list of bare identifiers (e.g. ZLE-widget synonym groups
 * like `history-incremental-search-backward, …`). Carve-out so these don't
 * trip the bracket-/whitespace-based docopt-shape detector.
 */
export function isSynonymList(sig: string): boolean {
  const parts = sig.split(",").map(trim)
  return parts.length >= 2 && parts.every(p => IDENT.test(p))
}

/**
 * True iff `sig` looks like a man-page synopsis fragment (brackets, braces,
 * alternation bars, ellipses, `*meta*` placeholders, or whitespace
 * separators) rather than a bare flag / key / escape. Renderer switches the
 * bullet head from inline `` `sig` `` to a fenced `docopt` block when true —
 * synopsis fragments read as code, not as a label.
 */
export function isDocoptSig(sig: string): boolean {
  if (isSynonymList(sig)) return false
  if (/[[\]{}|]/.test(sig)) return true
  if (/\.\.\.|…/.test(sig)) return true
  if (/\*[A-Za-z][A-Za-z0-9_-]*\*/.test(sig)) return true
  if (/\s/.test(sig)) return true
  return false
}

// --- nested member-list helpers --------------------------------------------

/**
 * Item in a depth-1 nested bullet list. Inline form
 * `- \`s1\`, \`s2\`: <desc>`; any docopt-shaped sig promotes all sigs to a
 * fenced block. Continuation paragraphs use 2-space indent; `subItems`
 * render as depth-2 leaf bullets.
 *
 * Multi-sig folding consolidates upstream `xitem(form-a) item(form-b)(body)`
 * chains so each shared body renders once; see `[[FlagEntry]]`.
 */
interface MemberItem {
  readonly sigs: NonEmpty<string>
  readonly desc: string
  readonly subItems?: readonly { readonly sig: string; readonly desc: string }[]
}

function renderMemberList(
  intro: string,
  members: readonly MemberItem[] | undefined,
  outro?: string,
): string {
  const items = (members ?? []).map(renderMemberBullet)
  return docBlock(
    ...prose(intro),
    ...when(items.length > 0, items.join("\n\n")),
    ...prose(outro),
  )
}

function renderMemberBullet(m: MemberItem): string {
  // subItems are leaf bullets (no deeper nesting) — recurse to render them.
  const subBlock = (m.subItems ?? [])
    .filter(s => s.sig)
    .map(s => renderMemberBullet({ sigs: nonEmpty(s.sig), desc: s.desc }))
    .join("\n\n")
  return m.sigs.some(isDocoptSig)
    ? renderDocoptBullet(m.sigs, m.desc, subBlock)
    : renderInlineBullet(m.sigs, m.desc, subBlock)
}

/** Inline form: `- \`s1\`, \`s2\`: <desc>` with 2-space continuation. */
function renderInlineBullet(
  sigs: NonEmpty<string>,
  desc: string,
  subBlock: string,
): string {
  const head = `- ${sigs.map(bt).join(", ")}`
  const body = composeBody(desc, subBlock)
  if (!body.trim()) return head
  const [first = "", ...rest] = body.split(/\n{2,}/)
  return [`${head}: ${first}`, ...indentParas(rest)].join("\n")
}

/**
 * Fenced form: bullet head opens a `docopt` block on the same line; sigs,
 * fence-close, desc paragraphs and any subBlock follow as 2-space-indented
 * continuation. Fence-open on the bullet-marker line is CommonMark-legal
 * (indent < 4 cols relative to the list-item content column).
 */
function renderDocoptBullet(
  sigs: NonEmpty<string>,
  desc: string,
  subBlock: string,
): string {
  const body = composeBody(desc, subBlock)
  const paras = body.trim() ? body.split(/\n{2,}/) : []
  return [
    "- ```docopt",
    ...sigs.map(s => `  ${s}`),
    "  ```",
    ...indentParas(paras),
  ].join("\n")
}

/** Indent every line by 2 spaces; blank line between paragraphs. */
const indentParas = (paras: readonly string[]): string[] =>
  paras.flatMap(p => ["", ...p.split("\n").map(l => `  ${l}`)])

function composeBody(desc: string, subBlock: string): string {
  if (!subBlock) return desc
  return desc.trim() ? `${desc}\n\n${subBlock}` : subBlock
}

/**
 * `desc` (intro) + sibling flag groups (each: optional intro + bullet list
 * of flags) + optional `outro`. Falls back to just `desc` when `groups` is
 * empty/missing. For records (builtins, comp utilities) with multiple
 * sibling flag sections.
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
    ...prose(desc),
    ...groups.flatMap(g => [...prose(g.intro), renderMemberList("", g.flags)]),
    ...prose(outro),
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
  const bolded = splitInlineCode(line)
    .map((part, i) => (i % 2 === 1 ? part : fmtOptRefsInText(part, corpus)))
    .join("")
  return bolded.replace(BACKTICKED_OPT_RE, (m, name) =>
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

// --- record-title construction (per-category dispatch) --------------------

/**
 * Per-category record-title dispatch. The "title" is the short identifier
 * line — `\`name\``, `\`sig\``, `\`op\``, or a composite like
 * `*lhs* \`op\` *rhs*` for cond-ops. Renderers omit the title from their
 * body; consumers compose via `recordTitle(cat, doc)` (or
 * {@link renderDocWithTitle}). Dump output supplies its own `## heading`.
 */
const titleBuilders: {
  [K in DocCategory]: (doc: DocRecordMap[K]) => string
} = {
  option: doc => bt(doc.display),
  conditional_op: sigCond,
  builtin: doc => bt(doc.name),
  precmd_modifier: doc => bt(doc.name),
  special_param: doc => bt(doc.name),
  complex_command: doc => bt(doc.name),
  reserved_word: doc => bt(doc.name),
  redirection: doc => bt(doc.groupOp),
  process_subst: doc => bt(doc.op),
  param_expn: paramExpnTitle,
  subscript_flag: doc => bt(doc.sig),
  param_expn_flag: doc => bt(doc.sig),
  history_expn: doc => bt(doc.sig),
  glob_op: doc => bt(doc.sig),
  glob_flag: doc => bt(doc.sig),
  glob_qualifier: doc => bt(doc.sig),
  prompt_escape: doc => bt(doc.sig),
  zle_widget: doc => bt(doc.name),
  keymap: doc => bt(doc.name),
  job_spec: doc => bt(doc.sig),
  arith_op: doc => bt(doc.op),
  mathfunc: doc => bt(doc.name),
  special_function: doc => bt(doc.name),
  comp_utility: doc => bt(doc.name),
}

/**
 * Title line for a doc record. Prefer over indexing `titleBuilders`
 * directly when `cat` is a generic `K`.
 */
export function recordTitle<K extends DocCategory>(
  cat: K,
  doc: DocRecordMap[K],
): string {
  return (titleBuilders[cat] as (d: DocRecordMap[K]) => string)(doc)
}

function paramExpnTitle(doc: ParamExpnDoc): string {
  const n = doc.groupSigs.length
  const formIdx = n > 1 ? `, form ${doc.orderInGroup + 1} of ${n}` : ""
  return `${bt(doc.sig)}    _(${doc.subKind}${formIdx})_`
}

function sigCond(cop: CondOpDoc): string {
  const op = bt(cop.op)
  return cop.arity === "unary"
    ? `${op} *${cop.operands[0]}*`
    : `*${cop.operands[0]}* ${op} *${cop.operands[1]}*`
}

// --- head construction (per-category dispatch) -----------------------------

/**
 * Render a {@link DocHead} as a fenced code block, or empty when absent.
 * Spread into `docBlock(...)` at the call site.
 */
const headBlock = (head: DocHead | undefined): readonly string[] =>
  maybe(head, h => codeBlock(h.lang, ...h.lines))

// Hand-curated heads for prompt-escape sigs that don't survive the
// mechanical `print -P 'SIG'` shape:
//
// - Paired toggles (`%U (%u)` etc.) — running both toggles back-to-back
//   produces no visible effect; the curated head wraps surrounding text so
//   the effect is observable.
// - Conditional `%(x.true-text.false-text)` — `x` is upstream placeholder
//   notation that errors at runtime; substitute a concrete test (`?` for
//   "last exit status was zero").
const promptEscapeOverride: Readonly<Record<string, string>> = {
  "%B (%b)": "print -P '%Bbold%b normal'",
  "%U (%u)": "print -P '%Uunderline%u normal'",
  "%S (%s)": "print -P '%Sstandout%s normal'",
  "%F (%f)": "print -P '%Fred%f default'",
  "%K (%k)": "print -P '%Kbg%k default'",
  "%(x.true-text.false-text)": "print -P '%(?.YES.NO)'",
}
// Notation-only sigs whose templates aren't literal forms — `print -P`
// produces misleading or no-op output, so the head is suppressed.
const promptEscapeNoHead: ReadonlySet<string> = new Set([
  "%{...%}",
  "%G",
  "%[xstring]",
  "%<string<",
  "%>string>",
])

// Syntactic exceptions to the mechanical `(#SIG)pat` shape: `s` and `e` are
// anchors (start/end-of-string); `q` is the glob-qualifier marker (appears
// at the end of a glob, not as a prefix) and has no concise standalone form.
const globFlagOverride: Readonly<Record<string, string>> = {
  s: "(#s)foo",
  e: "foo(#e)",
}
const globFlagNoHead: ReadonlySet<string> = new Set(["q"])

// Per-flag placeholder for the subscript content (the part after the flag,
// inside the same `[...]`). Curated from upstream prose for each flag:
//
// - pattern-matching flags (`r`/`R`/`i`/`I`/`k`/`K`) take a pattern;
// - `n:expr:` / `b:expr:` are modifier flags that compose with the above —
//   their subscript content is still a pattern;
// - `e`/`w`/`p`/`f` operate on the existing subscript, which is an `exp`;
// - `s:string:` configures the `w` flag's separator — typically composed.
//
// The full subscript-flag head therefore reads `${name[(SIG)CONTENT]}`.
const subscriptContentPlaceholder: Readonly<Record<string, string>> = {
  r: "pattern",
  R: "pattern",
  i: "pattern",
  I: "pattern",
  k: "pattern",
  K: "pattern",
  "n:expr:": "pattern",
  "b:expr:": "pattern",
  e: "exp",
  w: "exp",
  p: "exp",
  f: "exp",
  "s:string:": "exp",
}

/**
 * Synopsis is "trivial" when it's a single line containing just the record
 * name itself — the fenced block adds no information over the title line.
 */
function isTrivialSynopsis(synopsis: readonly string[], name: string): boolean {
  return isSingle(synopsis) && synopsis[0].trim() === name
}

function canonicalCondForm(cop: CondOpDoc): string {
  return cop.arity === "unary"
    ? `[[ ${cop.op} ${cop.operands[0]} ]]`
    : `[[ ${cop.operands[0]} ${cop.op} ${cop.operands[1]} ]]`
}

function canonicalArithForm(doc: ArithOpDoc): NonEmpty<string> {
  const op = doc.op
  switch (doc.arity) {
    case "unary":
      // ++/-- have both pre- and postfix forms; show both.
      return op === "++" || op === "--"
        ? [`$(( ${op}a ))`, `$(( a${op} ))`]
        : [`$(( ${op} a ))`]
    case "binary":
      return [`$(( a ${op} b ))`]
    case "ternary":
      // `?` and `:` are halves of the same ternary; same head on each record.
      return [`$(( cond ? a : b ))`]
    case "overloaded":
      // `+` / `-` serve as both unary and binary; show both.
      return [`$(( ${op} a ))`, `$(( a ${op} b ))`]
  }
}

function optHead(opt: ZshOption): DocHead {
  const long = opt.display.toLowerCase()
  // Pad to the widest `cmd arg` cell — `unsetopt <name>` is always widest —
  // plus a 2-space gap before the trailing `# on`/`# off`.
  const width = `unsetopt ${long}`.length + 2
  // Plain-zsh flags first. A letter absent from the plain-zsh table comes
  // from the sh/ksh one; annotated, since in plain zsh it is another option
  // or a bad option.
  const zshFlags = opt.flags.filter(f => f.emulations.includes("zsh"))
  const kshFlags = opt.flags.filter(f => !f.emulations.includes("zsh"))
  return {
    lang: "zsh",
    lines: [
      label("setopt", long, "on", width),
      label("unsetopt", long, "off", width),
      ...zshFlags.map(f => renderFlag(f, width)),
      ...kshFlags.map(f => renderFlag(f, width, " (sh/ksh emulation only)")),
    ],
  }
}

function paramExpnHead(doc: ParamExpnDoc): DocHead | undefined {
  // Solo sigs: the title line already shows the only sig.
  if (isSingle(doc.groupSigs)) return undefined
  return {
    lang: "zsh",
    lines: mapNonEmpty(doc.groupSigs, (s, i) =>
      i === doc.orderInGroup ? `${s}    # <- this form` : s,
    ),
  }
}

function builtinSynopsisHead(
  synopsis: NonEmpty<string>,
  name: string,
): DocHead | undefined {
  if (isTrivialSynopsis(synopsis, name)) return undefined
  return { lang: "docopt", lines: synopsis }
}

function promptEscapeHead(doc: PromptEscapeDoc): DocHead | undefined {
  if (promptEscapeNoHead.has(doc.sig)) return undefined
  const line = promptEscapeOverride[doc.sig] ?? `print -P '${doc.sig}'`
  return { lang: "zsh", lines: [line] }
}

function specialFunctionHead(doc: SpecialFunctionDoc): DocHead | undefined {
  const line = specialFunctionLine(doc)
  return line ? { lang: "zsh", lines: [line] } : undefined
}

function specialFunctionLine(doc: SpecialFunctionDoc): string | undefined {
  if (doc.hookArray !== undefined)
    return `${doc.hookArray}=( funcname1 funcname2 ... )`
  if (doc.kind === "trap-literal") return `${doc.name}() { ... }`
  // `TRAPNAL`'s name is itself a template — replace the trailing `NAL` with
  // `INT` (a concrete, ubiquitous signal name) so the head is a runnable
  // form rather than a meta-name.
  if (doc.kind === "trap-template")
    return `${doc.name.replace(/NAL$/, "INT")}() { ... }`
  return undefined
}

/**
 * Per-category head dispatch. No-head categories are `() => undefined` so
 * the table stays structurally exhaustive. Internal; use {@link headFor}.
 */
const headBuilders: {
  [K in DocCategory]: (doc: DocRecordMap[K]) => DocHead | undefined
} = {
  option: optHead,
  conditional_op: cop => ({ lang: "zsh", lines: [canonicalCondForm(cop)] }),
  builtin: doc => builtinSynopsisHead(doc.synopsis, doc.name),
  precmd_modifier: doc => builtinSynopsisHead(doc.synopsis, doc.name),
  special_param: () => undefined,
  complex_command: doc => ({ lang: "docopt", lines: [doc.sig] }),
  reserved_word: () => undefined,
  redirection: doc => ({ lang: "docopt", lines: [doc.sig] }),
  process_subst: () => undefined,
  param_expn: paramExpnHead,
  subscript_flag: doc => {
    const content = subscriptContentPlaceholder[doc.sig] ?? "..."
    return { lang: "zsh", lines: [`\${name[(${doc.sig})${content}]}`] }
  },
  param_expn_flag: doc => ({ lang: "zsh", lines: [`\${(${doc.sig})spec}`] }),
  history_expn: () => undefined,
  glob_op: () => undefined,
  glob_flag: doc => {
    if (globFlagNoHead.has(doc.sig)) return undefined
    return {
      lang: "zsh",
      lines: [globFlagOverride[doc.sig] ?? `(#${doc.sig})pat`],
    }
  },
  glob_qualifier: doc => ({
    // Sigs containing man-page metasyntax brackets (e.g. `l[-|+]ct`,
    // `a[Mwhms][-|+]n`, `[beg[,end]]`) aren't executable zsh fragments — they
    // are template shapes. Fence them as docopt so the highlighter doesn't
    // mis-tokenize. The detection is local to the sig string; a sig that
    // would be valid zsh has no bare `[` or `|` outside backslashed forms.
    lang: /[[|]/.test(doc.sig) ? "docopt" : "zsh",
    lines: [`*(${doc.sig})`],
  }),
  prompt_escape: promptEscapeHead,
  zle_widget: () => undefined,
  keymap: () => undefined,
  job_spec: () => undefined,
  arith_op: doc => ({ lang: "zsh", lines: canonicalArithForm(doc) }),
  mathfunc: doc => ({ lang: "docopt", lines: doc.synopsis }),
  special_function: specialFunctionHead,
  comp_utility: doc => builtinSynopsisHead(doc.synopsis, doc.name),
}

/**
 * Per-category {@link DocHead} for a doc record, or `undefined` when the
 * category emits no head (or this particular record suppresses it). Prefer
 * over indexing `headBuilders` directly when `cat` is a generic `K`.
 */
export function headFor<K extends DocCategory>(
  cat: K,
  doc: DocRecordMap[K],
): DocHead | undefined {
  return (headBuilders[cat] as (d: DocRecordMap[K]) => DocHead | undefined)(doc)
}

// --- per-category renderers ------------------------------------------------
// Bodies only: `renderRecord` appends the generic category footer.

export function mdOpt(opt: ZshOption, corpus: DocCorpus): string {
  return docBlock(
    ...headBlock(headFor("option", opt)),
    `**Default in zsh: ${bt(defaultStateIn(opt, "zsh"))}**`,
    fmtOptRefsInMd(opt.desc, corpus),
    ...maybe(
      opt.aliasOf,
      a => `_Alias of:_ ${bt(aliasTargetDisplay(a, corpus))}`,
    ),
    `_Section:_ ${opt.section}`,
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
    ...headBlock(headFor("conditional_op", cop)),
    fmtOptRefsInMd(cop.desc, corpus),
    ...modulePart(cop.module),
  )
}

export function mdShellParam(doc: ShellParamDoc): string {
  const keys = doc.keys?.map(
    (k): MemberItem => ({
      sigs: nonEmpty(k.name),
      desc: k.desc,
      ...(k.values && {
        subItems: k.values.map(v => ({ sig: v.name, desc: v.desc })),
      }),
    }),
  )
  return docBlock(
    renderMemberList(doc.desc, keys, doc.outro),
    ...maybe(doc.tied, t => `_Tied with:_ ${bt(t)}`),
    ...modulePart(doc.module),
  )
}

export function mdParamFlag(doc: ParamFlagDoc, corpus: DocCorpus): string {
  return sigBlock(doc, corpus, headFor("param_expn_flag", doc))
}

export function mdSubscriptFlag(
  doc: SubscriptFlagDoc,
  corpus: DocCorpus,
): string {
  return sigBlock(doc, corpus, headFor("subscript_flag", doc))
}

export function mdHistory(doc: HistoryDoc, corpus: DocCorpus): string {
  return sigBlock(doc, corpus, headFor("history_expn", doc))
}

export function mdGlobOp(doc: GlobOpDoc, corpus: DocCorpus): string {
  return sigBlock(doc, corpus, headFor("glob_op", doc))
}

export function mdGlobFlag(doc: GlobFlagDoc, corpus: DocCorpus): string {
  return sigBlock(doc, corpus, headFor("glob_flag", doc))
}

export function mdGlobQualifier(
  doc: GlobQualifierDoc,
  corpus: DocCorpus,
): string {
  return sigBlock(doc, corpus, headFor("glob_qualifier", doc))
}

/** Head + desc, plus an `_Args:_` line for flag records with operand slots. */
function sigBlock(
  doc: { readonly desc: string; readonly args?: readonly string[] },
  corpus: DocCorpus,
  head: DocHead | undefined,
): string {
  return docBlock(
    ...headBlock(head),
    fmtOptRefsInMd(doc.desc, corpus),
    ...argsPart(doc.args),
  )
}

const argsPart = (args: readonly string[] | undefined): readonly string[] =>
  args?.length ? [`_Args:_ ${args.join(", ")}`] : []

export function mdBuiltin(doc: BuiltinDoc): string {
  return docBlock(
    ...headBlock(headFor("builtin", doc)),
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
  return docBlock(...headBlock(headFor("precmd_modifier", doc)), doc.desc)
}

export function mdRedir(doc: RedirDoc): string {
  return docBlock(...headBlock(headFor("redirection", doc)), doc.desc)
}

export function mdProcessSubst(doc: ProcessSubstDoc): string {
  return doc.desc
}

export function mdParamExpn(doc: ParamExpnDoc): string {
  return docBlock(...headBlock(headFor("param_expn", doc)), doc.desc)
}

/** Empty for the desc-less reserved words; the footer alone remains. */
export function mdReservedWord(doc: ReservedWordDoc): string {
  return doc.desc ?? ""
}

export function mdComplexCommand(
  doc: ComplexCommandDoc,
  corpus: DocCorpus,
): string {
  return docBlock(
    ...headBlock(headFor("complex_command", doc)),
    fmtOptRefsInMd(doc.desc, corpus),
    // Alternate forms are a body element (not a head), so render inline here.
    ...when(
      doc.alternateForms.length > 0,
      "_Alternate forms:_",
      codeBlock("docopt", ...doc.alternateForms.map(formatAlternateForm)),
    ),
    ...when(
      doc.bodyKeywords.length > 0,
      `_Body keywords:_ ${doc.bodyKeywords.map(bt).join(" ")}`,
    ),
  )
}

/**
 * Append a trailing `# requires …` comment when the form is gated by shell
 * options; the list is disjunctive — matches `AlternateForm.requires`.
 */
function formatAlternateForm(a: AlternateForm): string {
  if (!a.requires) return a.template
  return `${a.template}    # requires ${a.requires.join(" or ")}`
}

export function mdPromptEscape(doc: PromptEscapeDoc): string {
  return docBlock(...headBlock(headFor("prompt_escape", doc)), doc.desc)
}

export function mdKeymap(doc: KeymapDoc): string {
  return docBlock(
    doc.desc,
    ...when(doc.isSpecial, "_Special:_ cannot be altered"),
    ...when(
      doc.linkedFrom.length > 0,
      `_Linked from:_ ${doc.linkedFrom.map(bt).join(", ")}`,
    ),
  )
}

export function mdJobSpec(doc: JobSpecDoc): string {
  return doc.desc
}

export function mdArithOp(doc: ArithOpDoc): string {
  return docBlock(...headBlock(headFor("arith_op", doc)), doc.desc)
}

export function mdSpecialFunction(doc: SpecialFunctionDoc): string {
  return docBlock(...headBlock(headFor("special_function", doc)), doc.desc)
}

export function mdZleWidget(doc: ZleWidgetDoc): string {
  const subItems = doc.subItems?.map(
    (s): MemberItem => ({
      sigs: nonEmpty(s.sig),
      desc: s.desc,
    }),
  )
  return docBlock(
    ...defaultBindingsPart(doc.defaultBindings),
    renderMemberList(doc.desc, subItems, doc.outro),
    ...modulePart(doc.module),
  )
}

/**
 * `_Default bindings:_` paragraph: keymaps `; `-separated, each followed by
 * its keys as space-separated inline code in the manual's notation (e.g.
 * `emacs ^B ESC-[D; viins ESC-[D`). An entry containing a space is prose
 * (`self-insert`'s `printable characters`), left un-coded. Nothing when the
 * manual lists no bindings.
 */
function defaultBindingsPart(
  bindings: readonly ZleDefaultBinding[],
): readonly string[] {
  const keyMd = (key: string) => (key.includes(" ") ? key : mdInlineCode(key))
  const bindingMd = (b: ZleDefaultBinding) =>
    `${b.keymap} ${b.keys.map(keyMd).join(" ")}`
  return bindings.length === 0
    ? []
    : [`_Default bindings:_ ${bindings.map(bindingMd).join("; ")}`]
}

export function mdCompUtility(doc: CompUtilityDoc): string {
  return docBlock(
    ...headBlock(headFor("comp_utility", doc)),
    renderFlagGroupBody(doc.desc, doc.flagGroups, doc.outro),
  )
}

export function mdMathfunc(doc: MathfuncDoc): string {
  return docBlock(
    ...headBlock(headFor("mathfunc", doc)),
    doc.desc,
    ...modulePart(doc.module),
  )
}

// --- option-rendering helpers ----------------------------------------------

/** Whether an option defaults on/off under an emulation mode. */
export function defaultStateIn(opt: ZshOption, emulation: Emulation): OptState {
  return opt.defaultIn.includes(emulation) ? "on" : "off"
}

function renderFlag(flag: OptFlagAlias, width: number, note = ""): string {
  return [
    label("set", `${flag.on}${flag.char}`, "on", width, note),
    label("set", `${flipOptFlagSign(flag.on)}${flag.char}`, "off", width, note),
  ].join("\n")
}

const label = (
  cmd: string,
  arg: string,
  state: OptState,
  width: number,
  note = "",
): string => `${`${cmd} ${arg}`.padEnd(width)} # ${state}${note}`

// --- public dispatch -------------------------------------------------------

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
 * Last paragraph of every record: `_Category:_ <label>`, plus ` (<subKind>)`
 * for categories that have one. Label and subKind come from the taxonomy,
 * never from per-category strings.
 */
function categoryFooter<K extends DocCategory>(
  cat: K,
  doc: DocRecordMap[K],
): string {
  const sub = subKindOf(cat, doc)
  const label = docCategoryLabels[cat]
  return `_Category:_ ${sub === undefined ? label : `${label} (${sub})`}`
}

/**
 * Per-category body with option-ref bolding, then the generic category
 * footer; no title (see {@link recordTitle} or {@link renderDocWithTitle}).
 * The footer is composed after bolding: a label word that is also an option
 * name (`ZLE`) must stay plain.
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
  return docBlock(
    ...prose(fmtOptRefsInMd(render(doc, corpus), corpus)),
    categoryFooter(cat, doc),
  )
}

/**
 * pid-keyed {@link renderRecord}. `id` must come from `resolve()` or corpus
 * iteration; throws when the corpus has no such record.
 */
export function renderDoc(corpus: DocCorpus, id: DocPieceId): string {
  return renderRecord(corpus, id.category, mustRecordOf(corpus, id))
}

/**
 * Composed title + body. Dump output supplies its own `## heading` and
 * skips this; other consumers use this form.
 */
export function renderRecordWithTitle<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
  doc: DocRecordMap[K],
): string {
  return docBlock(recordTitle(cat, doc), renderRecord(corpus, cat, doc))
}

/** pid-keyed {@link renderRecordWithTitle}; throws on a miss like {@link renderDoc}. */
export function renderDocWithTitle(corpus: DocCorpus, id: DocPieceId): string {
  return renderRecordWithTitle(corpus, id.category, mustRecordOf(corpus, id))
}

// Considered returning `""`; picked throw because a miss means a false
// `Documented<K>` claim (trusted-constructor misuse) — the soft path is
// `recordOf` + `renderRecord`.
function mustRecordOf(
  corpus: DocCorpus,
  id: DocPieceId,
): DocRecordMap[typeof id.category] {
  const doc = recordOf(corpus, id)
  if (doc === undefined) {
    throw new Error(`no ${id.category} record with id ${JSON.stringify(id.id)}`)
  }
  return doc
}
