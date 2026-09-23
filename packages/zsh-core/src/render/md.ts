import { isSingle, mapNonEmpty, type NonEmpty } from "@carlwr/typescript-extra"
import type { DocCorpus } from "../docs/corpus.ts"
import { flipOptFlagSign } from "../docs/normalize-option.ts"
import { resolve } from "../docs/resolver.ts"
import type { DocCategory, DocRecordMap } from "../docs/taxonomy.ts"
import { categoryOf, docCategoryLabels, subKindOf } from "../docs/taxonomy.ts"
import type {
  AlternateForm,
  ArithOpDoc,
  BuiltinDoc,
  ComplexCommandDoc,
  CompUtilityDoc,
  CondOpDoc,
  Emulation,
  FlagGroup,
  ItemEntry,
  KeymapDoc,
  MathfuncDoc,
  OptFlagAlias,
  ParamExpnDoc,
  PromptEscapeDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SpecialFunctionDoc,
  ZleDefaultBinding,
  ZleWidgetDoc,
  ZshOption,
} from "../docs/types.ts"
import { mdInlineCode } from "../docs/yodl/core/text.ts"
import { splitInlineCode, walkProseLines } from "./prose-walk.ts"

/**
 * Fenced executable form (or docopt template) that opens a record's body;
 * no-head categories have none.
 */
export interface DocHead {
  readonly lang: string
  readonly lines: NonEmpty<string>
}

/**
 * A record rendered: what the JSON projection ships as `_title` / `_mdBody`
 * and the zshref tools return as `title` / `mdBody`.
 */
export interface RenderedRecord {
  /** Short inline markdown (e.g. the backticked record name); not repeated in `mdBody`. */
  readonly title: string
  /** Body markdown; the category is not in it (see {@link categoryFooter}). Empty for a record without prose. */
  readonly mdBody: string
  /** The fenced block `mdBody` opens with, as structure — for one-line uses; never prepend it. */
  readonly head?: DocHead
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

/**
 * True iff `sig` looks like a man-page synopsis fragment (brackets, braces,
 * alternation bars, ellipses, `*meta*` placeholders, or whitespace
 * separators) rather than a bare flag / key / escape. Renderer switches the
 * bullet head from inline `` `sig` `` to a fenced `docopt` block when true —
 * synopsis fragments read as code, not as a label.
 */
export function isDocoptSig(sig: string): boolean {
  if (/[[\]{}|]/.test(sig)) return true
  if (/\.\.\.|…/.test(sig)) return true
  if (/\*[A-Za-z][A-Za-z0-9_-]*\*/.test(sig)) return true
  if (/\s/.test(sig)) return true
  return false
}

// --- nested member-list helpers --------------------------------------------

/** A depth-1 bullet-list item; `subItems` render as depth-2 leaf bullets. */
interface MemberItem extends ItemEntry {
  readonly subItems?: NonEmpty<ItemEntry>
}

function renderMemberList(
  intro: string,
  members: NonEmpty<MemberItem> | undefined,
  outro?: string,
): string {
  return docBlock(
    ...prose(intro),
    ...maybe(members, ms => ms.map(renderMemberBullet).join("\n\n")),
    ...prose(outro),
  )
}

function renderMemberBullet(m: MemberItem): string {
  const subBlock = (m.subItems ?? []).map(renderMemberBullet).join("\n\n")
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
 * absent. For records (builtins, comp utilities) with multiple
 * sibling flag sections.
 */
function renderFlagGroupBody(
  desc: string,
  groups: NonEmpty<FlagGroup> | undefined,
  outro?: string,
): string {
  if (!groups) return desc
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
 * Record titles that are not the backticked `display`: a composite like
 * `*lhs* \`op\` *rhs*` for cond-ops, or the manual's sig (`(#i)`,
 * `%D{string}`) where the id is a bare letter. Renderers omit the title
 * from their body; `renderRecord` pairs it with the body as `title`.
 * Dump output supplies its own `## heading`.
 */
const titleOverrides: {
  readonly [K in DocCategory]?: (doc: DocRecordMap[K]) => string
} = {
  conditional_op: sigCond,
  redirection: doc => bt(doc.groupOp),
  param_expn: paramExpnTitle,
  glob_flag: doc => bt(doc.sig),
  glob_qualifier: doc => bt(doc.sig),
  prompt_escape: doc => bt(doc.sig),
}

/** Title line for a doc record: the category's override, else its backticked `display`. */
function recordTitle<K extends DocCategory>(doc: DocRecordMap[K]): string {
  const override = titleOverrides[categoryOf(doc)] as
    | ((doc: DocRecordMap[K]) => string)
    | undefined
  return override ? override(doc) : bt(doc.display)
}

/**
 * The `form N of M` index is content, not decoration: grouped forms share
 * one manual paragraph that says "in the first form", "in the second form"
 * — without the index the prose has no referent. Never drop it (the
 * `# <- this form` marker in {@link paramExpnHead} serves the same reader).
 */
function paramExpnTitle(doc: ParamExpnDoc): string {
  const n = doc.groupSigs.length
  const formIdx = n > 1 ? `, form ${doc.orderInGroup + 1} of ${n}` : ""
  return `${bt(doc.sig)}    _(${doc.subKind}${formIdx})_`
}

function sigCond(cop: CondOpDoc): string {
  const op = bt(cop.id)
  return cop.subKind === "unary"
    ? `${op} *${cop.operands[0]}*`
    : `*${cop.operands[0]}* ${op} *${cop.operands[1]}*`
}

// --- head construction (per-category dispatch) -----------------------------

/** Render a {@link DocHead} as a fenced code block, or empty when absent. */
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
  return cop.subKind === "unary"
    ? `[[ ${cop.id} ${cop.operands[0]} ]]`
    : `[[ ${cop.operands[0]} ${cop.id} ${cop.operands[1]} ]]`
}

function canonicalArithForm(doc: ArithOpDoc): NonEmpty<string> {
  const op = doc.id
  switch (doc.subKind) {
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
  if (doc.subKind === "trap-literal") return `${doc.id}() { ... }`
  // `TRAPNAL`'s name is itself a template — replace the trailing `NAL` with
  // `INT` (a concrete, ubiquitous signal name) so the head is a runnable
  // form rather than a meta-name.
  if (doc.subKind === "trap-template")
    return `${doc.id.replace(/NAL$/, "INT")}() { ... }`
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
  builtin: doc => builtinSynopsisHead(doc.synopsis, doc.id),
  precmd_modifier: doc => builtinSynopsisHead(doc.synopsis, doc.id),
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
  comp_utility: doc => builtinSynopsisHead(doc.synopsis, doc.id),
}

/**
 * Per-category {@link DocHead} for a doc record, or `undefined` when the
 * category emits no head (or this particular record suppresses it). Prefer
 * over indexing `headBuilders` directly under a generic `K`.
 */
function headFor<K extends DocCategory>(
  doc: DocRecordMap[K],
): DocHead | undefined {
  return (
    headBuilders[categoryOf(doc)] as (d: DocRecordMap[K]) => DocHead | undefined
  )(doc)
}

// --- per-category renderers ------------------------------------------------
// What follows the head: `renderRecord` prepends the head (`headFor`) and
// applies option-ref bolding. No title, no category line — see `RenderedRecord`.

function mdOpt(opt: ZshOption, corpus: DocCorpus): string {
  return docBlock(
    `**Default in zsh: ${bt(defaultStateIn(opt, "zsh"))}**`,
    fmtOptRefsInMd(opt.desc, corpus),
    ...maybe(
      opt.aliasOf,
      a => `_Alias of:_ ${bt(aliasTargetDisplay(a, corpus))}`,
    ),
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

function mdCondOp(cop: CondOpDoc, corpus: DocCorpus): string {
  return docBlock(fmtOptRefsInMd(cop.desc, corpus), ...modulePart(cop.module))
}

function mdShellParam(doc: ShellParamDoc): string {
  const keys =
    doc.keys &&
    mapNonEmpty(
      doc.keys,
      ({ values, ...key }): MemberItem =>
        values ? { ...key, subItems: values } : key,
    )
  return docBlock(
    renderMemberList(doc.desc, keys, doc.outro),
    ...maybe(doc.tied, t => `_Tied with:_ ${bt(t)}`),
    ...modulePart(doc.module),
  )
}

/** Desc, plus an `_Args:_` line for flag records with operand slots. */
function mdSigDoc(
  doc: { readonly desc: string; readonly args?: readonly string[] },
  corpus: DocCorpus,
): string {
  return docBlock(fmtOptRefsInMd(doc.desc, corpus), ...argsPart(doc.args))
}

const argsPart = (args: readonly string[] | undefined): readonly string[] =>
  args?.length ? [`_Args:_ ${args.join(", ")}`] : []

function mdBuiltin(doc: BuiltinDoc): string {
  return docBlock(
    renderFlagGroupBody(doc.desc, doc.flagGroups, doc.outro),
    ...maybe(
      doc.aliasOf,
      a => `_Alias of:_ ${bt([a.target, ...(a.args ?? [])].join(" "))}`,
    ),
    ...when(
      doc.deprecated === true,
      "_Deprecated:_ not recommended for new code",
    ),
    ...modulePart(doc.module),
  )
}

const mdDesc = (doc: { readonly desc: string }): string => doc.desc

/**
 * Empty for the desc-less reserved words: `for`, `[[`, ... — each is also a
 * complex command, and that record carries the prose.
 */
function mdReservedWord(doc: ReservedWordDoc): string {
  return doc.desc ?? ""
}

function mdComplexCommand(doc: ComplexCommandDoc, corpus: DocCorpus): string {
  return docBlock(
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

function mdKeymap(doc: KeymapDoc): string {
  return docBlock(
    doc.desc,
    ...when(doc.subKind === "special", "_Special:_ cannot be altered"),
    ...when(
      doc.linkedFrom.length > 0,
      `_Linked from:_ ${doc.linkedFrom.map(bt).join(", ")}`,
    ),
  )
}

function mdZleWidget(doc: ZleWidgetDoc): string {
  return docBlock(
    ...defaultBindingsPart(doc.defaultBindings),
    renderMemberList(doc.desc, doc.subItems, doc.outro),
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

function mdCompUtility(doc: CompUtilityDoc): string {
  return renderFlagGroupBody(doc.desc, doc.flagGroups, doc.outro)
}

function mdMathfunc(doc: MathfuncDoc): string {
  return docBlock(doc.desc, ...modulePart(doc.module))
}

// --- option-rendering helpers ----------------------------------------------

type OptState = "on" | "off"

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
  precmd_modifier: mdDesc,
  special_param: mdShellParam,
  complex_command: mdComplexCommand,
  reserved_word: mdReservedWord,
  redirection: mdDesc,
  process_subst: mdDesc,
  param_expn: mdDesc,
  subscript_flag: mdSigDoc,
  param_expn_flag: mdSigDoc,
  history_expn: mdSigDoc,
  glob_op: mdSigDoc,
  glob_flag: mdSigDoc,
  glob_qualifier: mdSigDoc,
  prompt_escape: mdDesc,
  zle_widget: mdZleWidget,
  keymap: mdKeymap,
  job_spec: mdDesc,
  arith_op: mdDesc,
  mathfunc: mdMathfunc,
  special_function: mdDesc,
  comp_utility: mdCompUtility,
}

/**
 * The record's category as a markdown paragraph: `_Category:_ <label>`, plus
 * ` (<subKind>)` for categories that have one — label and subKind from the
 * taxonomy. Not part of {@link renderRecord}: the record's `category` field
 * is the structured form, so bodies never encode it. A consumer that shows
 * a body and nothing structured beside it — an editor hover — appends this
 * line itself. Plain markdown; append it after any option-ref bolding (a
 * label word can be an option name: `ZLE`).
 */
export function categoryFooter<K extends DocCategory>(
  doc: DocRecordMap[K],
): string {
  const sub = subKindOf(doc)
  const label = docCategoryLabels[categoryOf(doc)]
  return `_Category:_ ${sub === undefined ? label : `${label} (${sub})`}`
}

/**
 * Render a doc record: title, and the body as head + per-category prose
 * with option-ref bolding. The category line is not included (see
 * {@link categoryFooter}). A consumer showing title and body composes
 * them, skipping an empty body.
 */
export function renderRecord<K extends DocCategory>(
  corpus: DocCorpus,
  doc: DocRecordMap[K],
): RenderedRecord {
  const render = mdRenderer[categoryOf(doc)] as (
    d: DocRecordMap[K],
    corpus: DocCorpus,
  ) => string
  const head = headFor(doc)
  const body = docBlock(...headBlock(head), render(doc, corpus))
  return {
    title: recordTitle(doc),
    mdBody: fmtOptRefsInMd(body, corpus),
    ...(head && { head }),
  }
}
