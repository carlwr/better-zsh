import { mkOptName, type OptName } from "./types/brand"
import type {
  BuiltinDoc,
  CondOperator,
  Emulation,
  OptFlagAlias,
  OptFlagSign,
  OptState,
  PrecmdDoc,
  ZshOption,
} from "./types/zsh-data"

export type HoverKind = "option" | "cond-op" | "param" | "builtin" | "precmd"

export interface HoverDoc {
  kind: HoverKind
  key: string
  md: string
}

export interface HoverRegression {
  kind: HoverKind
  key: string
  note: string
}

export interface HoverMdCtx {
  optNames: ReadonlySet<OptName>
}

// Add known markdown/render regressions here as they are discovered.
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

export function mkHoverMdCtx(options: readonly ZshOption[] = []): HoverMdCtx {
  return { optNames: new Set(options.map((opt) => opt.name)) }
}

export function fmtParamType(raw: string): string {
  const parts = raw.split("-")
  const base = parts[0] ?? raw
  const flags: string[] = []
  if (parts.includes("readonly")) flags.push("readonly")
  if (parts.includes("tied")) flags.push("tied")
  if (parts.includes("export")) flags.push("exported")
  return flags.length ? `${base} (${flags.join(", ")})` : base
}

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

export function sigCond(cop: CondOperator): string {
  return cop.kind === "unary"
    ? `${hoverFmt.code(cop.op as string)} *${cop.operands.join(" ")}*`
    : `*${cop.operands[0] ?? ""}* ${hoverFmt.code(cop.op as string)} *${cop.operands[1] ?? ""}*`
}

export function mdCond(
  cop: CondOperator,
  ctx: HoverMdCtx = emptyHoverMdCtx,
): string {
  return `${sigCond(cop)}\n\n${fmtOptRefsInMd(cop.desc, ctx.optNames)}`
}

export function mdParam(name: string, raw: string): string {
  return `${hoverFmt.code(name)}: ${fmtParamType(raw)} — zsh special parameter`
}

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

export function hoverDocs({
  options,
  condOps,
  params,
  builtins = [],
  precmds = [],
}: {
  options: readonly ZshOption[]
  condOps: readonly CondOperator[]
  params: ReadonlyMap<string, string>
  builtins?: readonly BuiltinDoc[]
  precmds?: readonly PrecmdDoc[]
}): HoverDoc[] {
  const ctx = mkHoverMdCtx(options)
  const paramDocs = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, raw]) => ({
      kind: "param" as const,
      key,
      md: mdParam(key, raw),
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
