import { mkOptLookupName, type OptName } from "../types/brand.ts"
import type {
  BuiltinDoc,
  CondOpDoc,
  Emulation,
  GlobbingFlagDoc,
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
} from "../types/zsh-data.ts"
import type { RefKind } from "./refs.ts"

/** Known markdown/rendering regression marker for QA. */
export interface MdRegression {
  readonly kind: RefKind
  readonly id: string
  readonly note: string
}

/** Shared formatter context for markdown generation. */
export interface MdCtx {
  readonly optNames: ReadonlySet<OptName>
}

/** Known markdown/rendering regressions tracked for QA (add entries as they are discovered). */
export const mdRegressions: readonly MdRegression[] = []

const emptyMdCtx: Readonly<{ optNames: ReadonlySet<OptName> }> = {
  optNames: Object.freeze(new Set<OptName>()),
}
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

/** Build formatter context from the available option set. */
export function mkMdCtx(options: readonly ZshOption[] = []): MdCtx {
  return { optNames: new Set(options.map((opt) => opt.name)) }
}

/** Emphasize option references inside markdown prose, skipping fenced code. */
export function fmtOptRefsInMd(
  md: string,
  optNames: ReadonlySet<OptName>,
): string {
  if (optNames.size === 0) return md

  let fenced = false
  return md
    .split("\n")
    .map((line) => {
      if (line.startsWith("```")) {
        fenced = !fenced
        return line
      }
      return fenced ? line : fmtOptRefsInLine(line, optNames)
    })
    .join("\n")
}

/** Render one option doc block as markdown. */
export function mdOpt(opt: ZshOption, ctx: MdCtx = emptyMdCtx): string {
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
    fmtOptRefsInMd(opt.desc, ctx.optNames),
    `_Option category:_ ${opt.category}`,
  )
}

/** Render a compact signature line for a conditional operator. */
export function sigCond(cop: CondOpDoc): string {
  return cop.arity === "unary"
    ? `${mdFmt.code(cop.op as string)} *${cop.operands[0]}*`
    : `*${cop.operands[0]}* ${mdFmt.code(cop.op as string)} *${cop.operands[1]}*`
}

/** Render one conditional-operator doc block as markdown. */
export function mdCondOp(cop: CondOpDoc, ctx: MdCtx = emptyMdCtx): string {
  return docBlock(sigCond(cop), fmtOptRefsInMd(cop.desc, ctx.optNames))
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

/** Render one parameter-expansion flag doc block as markdown. */
export function mdParamFlag(_doc: ParamFlagDoc): string {
  return TBD
}

/** Render one subscript flag doc block as markdown. */
export function mdSubscriptFlag(_doc: SubscriptFlagDoc): string {
  return TBD
}

/** Render one history-expansion doc block as markdown. */
export function mdHistory(_doc: HistoryDoc): string {
  return TBD
}

/** Render one globbing-operator doc block as markdown. */
export function mdGlobOp(_doc: GlobOpDoc): string {
  return TBD
}

/** Render one globbing-flag doc block as markdown. */
export function mdGlobFlag(_doc: GlobbingFlagDoc): string {
  return TBD
}

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

function fmtOptRefsInLine(
  line: string,
  optNames: ReadonlySet<OptName>,
): string {
  return line
    .split(inlineCodeRe)
    .map((part, i) => (i % 2 === 1 ? part : fmtOptRefsInText(part, optNames)))
    .join("")
}

function fmtOptRefsInText(
  text: string,
  optNames: ReadonlySet<OptName>,
): string {
  return text.replace(OPT_REF_RE, (raw, offset, whole) => {
    if (isShellParameterRef(whole, offset)) return raw
    return optNames.has(mkOptLookupName(raw)) ? mdFmt.optRef(raw) : raw
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
