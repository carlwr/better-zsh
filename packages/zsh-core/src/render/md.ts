import type { DocCorpus } from "../docs/corpus.ts"
import { resolve } from "../docs/corpus.ts"
import type { DocCategory, DocPieceId, DocRecordMap } from "../docs/taxonomy.ts"
import type {
  BuiltinDoc,
  CondOpDoc,
  Emulation,
  GlobFlagDoc,
  GlobOpDoc,
  HistoryDoc,
  OptFlagAlias,
  OptFlagSign,
  OptState,
  ParamFlagDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SubscriptFlagDoc,
  ZshOption,
} from "../docs/types.ts"

const TBD = "TBD"
const OPT_REF_RE = /\b(?:NO_?)?[A-Z][A-Z0-9_]*\b/g
const inlineCodeRe = /(`[^`\n]+`)/

function code(s: string): string {
  return `\`${s}\``
}

function strong(s: string): string {
  return `**${s}**`
}

const mdFmt = {
  code,
  optRef: (s: string) => strong(code(s)),
}

/** Emphasize option references inside markdown prose, skipping fenced code. */
export function fmtOptRefsInMd(md: string, corpus: DocCorpus): string {
  if (corpus.option.size === 0) return md

  let fenced = false
  return md
    .split("\n")
    .map(line => {
      if (line.startsWith("```")) {
        fenced = !fenced
        return line
      }
      return fenced ? line : fmtOptRefsInLine(line, corpus)
    })
    .join("\n")
}

/** Render one option doc block as markdown. */
export function mdOpt(opt: ZshOption, corpus: DocCorpus): string {
  const title = mdFmt.code(opt.display)
  const long = opt.display.toLowerCase()
  const defaultLine = `**Default in zsh: \`${defaultStateIn(opt, "zsh")}\`**`
  // Keep the preamble to executable zsh forms; status/context lines read better outside it.
  return docBlock(
    title,
    codeBlock(
      "zsh",
      label("setopt", long, "on"),
      label("unsetopt", long, "off"),
      ...opt.flags.map(renderFlag),
    ),
    defaultLine,
    fmtOptRefsInMd(opt.desc, corpus),
    `_Option category:_ ${opt.category}`,
  )
}

function sigCond(cop: CondOpDoc): string {
  return cop.arity === "unary"
    ? `${mdFmt.code(cop.op as string)} *${cop.operands[0]}*`
    : `*${cop.operands[0]}* ${mdFmt.code(cop.op as string)} *${cop.operands[1]}*`
}

/** Render one conditional-operator doc block as markdown. */
export function mdCondOp(cop: CondOpDoc, corpus: DocCorpus): string {
  return docBlock(sigCond(cop), fmtOptRefsInMd(cop.desc, corpus))
}

/** Render one shell-parameter doc block as markdown. */
export function mdShellParam(doc: ShellParamDoc): string {
  return docBlock(
    mdFmt.code(doc.name),
    doc.desc,
    ...(doc.tied ? [`_Tied with:_ ${mdFmt.code(doc.tied)}`] : []),
    "_Category:_ Shell Parameter",
  )
}

const stubRenderer = () => TBD

/** Render one parameter-expansion flag doc block as markdown. */
export const mdParamFlag: (_doc: ParamFlagDoc) => string = stubRenderer

/** Render one subscript flag doc block as markdown. */
export const mdSubscriptFlag: (_doc: SubscriptFlagDoc) => string = stubRenderer

/** Render one history-expansion doc block as markdown. */
export const mdHistory: (_doc: HistoryDoc) => string = stubRenderer

/** Render one globbing-operator doc block as markdown. */
export const mdGlobOp: (_doc: GlobOpDoc) => string = stubRenderer

/** Render one glob-flag doc block as markdown. */
export const mdGlobFlag: (_doc: GlobFlagDoc) => string = stubRenderer

/** Render one builtin doc block as markdown. */
export function mdBuiltin(doc: BuiltinDoc): string {
  const out = [
    mdFmt.code(doc.name as string),
    codeBlock("zsh", ...doc.synopsis),
    doc.desc,
  ]
  if (doc.aliasOf) out.push(`_Alias of:_ ${mdFmt.code(doc.aliasOf as string)}`)
  if (doc.module) out.push(`_Module:_ ${mdFmt.code(doc.module)}`)
  return docBlock(...out)
}

/** Render one precommand doc block as markdown. */
export function mdPrecmd(doc: PrecmdDoc): string {
  return docBlock(
    mdFmt.code(doc.name),
    codeBlock("zsh", ...doc.synopsis),
    doc.desc,
    "_Role:_ precommand modifier",
  )
}

/** Render one redirection doc block as markdown. */
export function mdRedir(doc: RedirDoc): string {
  return docBlock(
    mdFmt.code(doc.groupOp),
    codeBlock("zsh", doc.sig),
    doc.desc,
    "_Category:_ Redirection",
  )
}

/** Render one process-substitution doc block as markdown. */
export function mdProcessSubst(doc: ProcessSubstDoc): string {
  return docBlock(
    mdFmt.code(doc.op),
    doc.desc,
    "_Category:_ Process Substitution",
  )
}

/** Render one reserved-word doc block as markdown. */
export function mdReservedWord(doc: ReservedWordDoc): string {
  return docBlock(
    mdFmt.code(doc.name),
    doc.desc,
    `_Role:_ reserved word (${doc.pos === "command" ? "command position" : "any position"})`,
  )
}

/** Return whether an option defaults on/off for an emulation mode. */
export function defaultStateIn(opt: ZshOption, emulation: Emulation): OptState {
  return opt.defaultIn.includes(emulation) ? "on" : "off"
}

function renderFlag(flag: OptFlagAlias): string {
  // Long and short forms should show the same on/off semantics, even when `+x` means "on".
  const on = label("set", `${flag.on}${flag.char}`, "on")
  const off = label("set", `${flip(flag.on)}${flag.char}`, "off")
  return [on, off].join("\n")
}

function flip(sign: OptFlagSign): OptFlagSign {
  return sign === "-" ? "+" : "-"
}

function label(cmd: string, arg: string, state: OptState): string {
  return `${`${cmd} ${arg}`.padEnd(20)} # ${state}`
}

function fmtOptRefsInLine(line: string, corpus: DocCorpus): string {
  return line
    .split(inlineCodeRe)
    .map((part, i) => (i % 2 === 1 ? part : fmtOptRefsInText(part, corpus)))
    .join("")
}

function fmtOptRefsInText(text: string, corpus: DocCorpus): string {
  return text.replace(OPT_REF_RE, (raw, offset, whole) => {
    if (isShellParameterRef(whole, offset)) return raw
    return resolve(corpus, "option", raw) ? mdFmt.optRef(raw) : raw
  })
}

// Checks whether the match at `offset` in `whole` is preceded by `$` or `${`,
// i.e. is a shell parameter reference ($VAR or ${VAR}) rather than a bare option name.
// offset-1 is the char immediately before the match; offset-2 is one further back.
function isShellParameterRef(whole: string, offset: number): boolean {
  const prev = whole[offset - 1]
  const prevPrev = whole[offset - 2]
  return prev === "$" || (prev === "{" && prevPrev === "$")
}

function codeBlock(lang: string, ...lines: readonly string[]): string {
  return [`\`\`\`${lang}`, ...lines, "```"].join("\n")
}

function docBlock(...parts: readonly string[]): string {
  return parts.join("\n\n")
}

/** Per-category markdown renderers, dispatched by `DocCategory`. */
export const mdRenderer: {
  [K in DocCategory]: (doc: DocRecordMap[K], corpus: DocCorpus) => string
} = {
  option: mdOpt,
  cond_op: mdCondOp,
  builtin: mdBuiltin,
  precmd: mdPrecmd,
  shell_param: mdShellParam,
  reserved_word: mdReservedWord,
  redir: mdRedir,
  process_subst: mdProcessSubst,
  subscript_flag: mdSubscriptFlag,
  param_flag: mdParamFlag,
  history: mdHistory,
  glob_op: mdGlobOp,
  glob_flag: mdGlobFlag,
}

/**
 * Render the markdown doc block for a proven documented element.
 * `id` must come from `resolve()` or from corpus iteration; the lookup is
 * guaranteed by the static corpus, so the return type is `string`.
 * Categories with TBD rendering return `"TBD"`.
 *
 * Upgrade path: if multiple categories gain meaningful compact/signature
 * forms, add an options bag with a `level: "full" | "sig"` axis and a
 * parallel `sigRenderer` table — preserving the parametric shape. Until
 * then, short-form presentation is a consumer concern: doc record fields
 * are already public and consumers can format inline.
 */
export function renderDoc(corpus: DocCorpus, id: DocPieceId): string {
  const doc = corpus[id.category].get(id.id as never) as
    | DocRecordMap[typeof id.category]
    | undefined
  if (!doc) return ""
  const render = mdRenderer[id.category] as (
    d: DocRecordMap[typeof id.category],
    corpus: DocCorpus,
  ) => string
  return render(doc, corpus)
}
