import { mkOptName, type OptName } from "./types/brand.ts"
import type {
  BuiltinDoc,
  CondOpDoc,
  Emulation,
  OptFlagAlias,
  OptFlagSign,
  OptState,
  PrecmdDoc,
  ProcessSubstDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  ZshOption,
} from "./types/zsh-data.ts"

export type HoverKind =
  | "option"
  | "cond-op"
  | "param"
  | "builtin"
  | "precmd"
  | "redir"
  | "process-subst"
  | "reserved-word"

/** Rendered hover/reference markdown for one logical zsh item. */
export interface HoverDoc {
  kind: HoverKind
  key: string
  md: string
}

/** Known markdown/rendering regression marker for QA. */
export interface HoverRegression {
  kind: HoverKind
  key: string
  note: string
}

/** Shared formatter context for markdown generation. */
export interface HoverMdCtx {
  optNames: ReadonlySet<OptName>
}

/** Known markdown/rendering regressions tracked for QA (add entries as they are discovered). */
export const hoverMdRegressions: HoverRegression[] = []

const emptyHoverMdCtx: HoverMdCtx = { optNames: new Set<OptName>() }
const OPT_REF_RE = /\b(?:NO_?)?[A-Z][A-Z0-9_]*\b/g
const inlineCodeRe = /(`[^`\n]+`)/

function code(s: string): string {
  return `\`${s}\``
}

function strong(s: string): string {
  return `**${s}**`
}

const hoverFmt = {
  code,
  optRef: (s: string) => strong(code(s)),
}

/** Build formatter context from the available option set. */
export function mkHoverMdCtx(options: readonly ZshOption[] = []): HoverMdCtx {
  return { optNames: new Set(options.map((opt) => opt.name)) }
}

/** Emphasize option references inside markdown prose, skipping fenced code. */
export function fmtOptRefsInMd(
  md: string,
  optNames: ReadonlySet<OptName>,
): string {
  if (optNames.size === 0) return md

  const out: string[] = []
  let fenced = false

  for (const line of md.split("\n")) {
    if (line.startsWith("```")) {
      out.push(line)
      fenced = !fenced
      continue
    }
    out.push(fenced ? line : fmtOptRefsInLine(line, optNames))
  }

  return out.join("\n")
}

/** Render one option doc block as markdown. */
export function mdOpt(
  opt: ZshOption,
  ctx: HoverMdCtx = emptyHoverMdCtx,
): string {
  const title = hoverFmt.code(opt.display)
  const long = opt.display.toLowerCase()
  // Keep the preamble to executable zsh forms; status/context lines read better outside it.
  const preamble = [
    "```zsh",
    label("setopt", long, "on"),
    label("unsetopt", long, "off"),
    ...opt.flags.map(renderFlag),
    "```",
  ].join("\n")
  const defaultLine = `**Default in zsh: \`${defaultStateIn(opt, "zsh")}\`**`
  return [
    title,
    "",
    preamble,
    "",
    defaultLine,
    "",
    fmtOptRefsInMd(opt.desc, ctx.optNames),
    "",
    `_Option category:_ ${opt.category}`,
  ].join("\n")
}

/** Render a compact signature line for a conditional operator. */
export function sigCond(cop: CondOpDoc): string {
  return cop.kind === "unary"
    ? `${hoverFmt.code(cop.op as string)} *${cop.operands.join(" ")}*`
    : `*${cop.operands[0] ?? ""}* ${hoverFmt.code(cop.op as string)} *${cop.operands[1] ?? ""}*`
}

/** Render one conditional-operator doc block as markdown. */
export function mdCond(
  cop: CondOpDoc,
  ctx: HoverMdCtx = emptyHoverMdCtx,
): string {
  return `${sigCond(cop)}\n\n${fmtOptRefsInMd(cop.desc, ctx.optNames)}`
}

/** Render one shell-parameter doc block as markdown. */
export function mdParam(doc: ShellParamDoc): string {
  return [
    hoverFmt.code(doc.name),
    "",
    doc.desc,
    ...(doc.tied ? ["", `_Tied with:_ ${hoverFmt.code(doc.tied)}`] : []),
    "",
    "_Category:_ Shell Parameter",
  ].join("\n")
}

/** Render one builtin doc block as markdown. */
export function mdBuiltin(doc: BuiltinDoc): string {
  const out = [
    hoverFmt.code(doc.name as string),
    "",
    "```zsh",
    ...doc.synopsis,
    "```",
    "",
    doc.desc,
  ]
  if (doc.aliasOf)
    out.push("", `_Alias of:_ ${hoverFmt.code(doc.aliasOf as string)}`)
  if (doc.module) out.push("", `_Module:_ ${hoverFmt.code(doc.module)}`)
  return out.join("\n")
}

/** Render one precommand doc block as markdown. */
export function mdPrecmd(doc: PrecmdDoc): string {
  return [
    hoverFmt.code(doc.name),
    "",
    "```zsh",
    ...doc.synopsis,
    "```",
    "",
    doc.desc,
    "",
    "_Role:_ precommand modifier",
  ].join("\n")
}

/** Render one redirection doc block as markdown. */
export function mdRedir(doc: RedirDoc): string {
  return [
    hoverFmt.code(doc.op),
    "",
    "```zsh",
    doc.sig,
    "```",
    "",
    doc.desc,
    "",
    "_Category:_ Redirection",
  ].join("\n")
}

/** Render one process-substitution doc block as markdown. */
export function mdProcessSubst(doc: ProcessSubstDoc): string {
  return [
    hoverFmt.code(doc.op),
    "",
    doc.desc,
    "",
    "_Category:_ Process Substitution",
  ].join("\n")
}

/** Render one reserved-word doc block as markdown. */
export function mdReservedWord(doc: ReservedWordDoc): string {
  return [
    hoverFmt.code(doc.name),
    "",
    doc.desc,
    "",
    `_Role:_ reserved word (${doc.pos === "command" ? "command position" : "any position"})`,
  ].join("\n")
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

/** Generate the full static hover corpus from normalized zsh data. */
export function hoverDocs({
  options,
  condOps,
  params,
  builtins = [],
  precmds = [],
  redirs = [],
  processSubsts = [],
  reservedWords = [],
}: {
  options: readonly ZshOption[]
  condOps: readonly CondOpDoc[]
  params: readonly ShellParamDoc[]
  builtins?: readonly BuiltinDoc[]
  precmds?: readonly PrecmdDoc[]
  redirs?: readonly RedirDoc[]
  processSubsts?: readonly ProcessSubstDoc[]
  reservedWords?: readonly ReservedWordDoc[]
}): HoverDoc[] {
  const ctx = mkHoverMdCtx(options)
  const paramDocs = [...params]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((doc) => ({
      kind: "param" as const,
      key: doc.name,
      md: mdParam(doc),
    }))

  return [
    ...options.map((opt) => ({
      kind: "option" as const,
      key: opt.display,
      md: mdOpt(opt, ctx),
    })),
    ...condOps.map((cop) => ({
      kind: "cond-op" as const,
      key: cop.op as string,
      md: mdCond(cop, ctx),
    })),
    ...paramDocs,
    ...builtins.map((builtin) => ({
      kind: "builtin" as const,
      key: builtin.name as string,
      md: mdBuiltin(builtin),
    })),
    ...precmds.map((precmd) => ({
      kind: "precmd" as const,
      key: precmd.name,
      md: mdPrecmd(precmd),
    })),
    ...redirs.map((redir) => ({
      kind: "redir" as const,
      key: redir.op,
      md: mdRedir(redir),
    })),
    ...processSubsts.map((ps) => ({
      kind: "process-subst" as const,
      key: ps.op,
      md: mdProcessSubst(ps),
    })),
    ...reservedWords.map((rw) => ({
      kind: "reserved-word" as const,
      key: rw.name,
      md: mdReservedWord(rw),
    })),
  ]
}

function fmtOptRefsInLine(
  line: string,
  optNames: ReadonlySet<OptName>,
): string {
  return line
    .split(inlineCodeRe)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(OPT_REF_RE, (raw, offset, whole) => {
            const prev = whole[offset - 1]
            const prevPrev = whole[offset - 2]
            if (prev === "$" || (prev === "{" && prevPrev === "$")) return raw
            return optNames.has(mkOptName(raw.replace(/^NO_?/, "")))
              ? hoverFmt.optRef(raw)
              : raw
          }),
    )
    .join("")
}
