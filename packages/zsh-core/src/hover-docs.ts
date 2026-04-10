import {
  mdBuiltin,
  mdCond,
  mdOpt,
  mdParam,
  mdPrecmd,
  mdProcessSubst,
  mdRedir,
  mdReservedWord,
  mkHoverMdCtx,
} from "./hover-md.ts"
import type {
  BuiltinDoc,
  CondOpDoc,
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

export interface HoverDocArgs {
  options: readonly ZshOption[]
  condOps: readonly CondOpDoc[]
  params: readonly ShellParamDoc[]
  builtins?: readonly BuiltinDoc[]
  precmds?: readonly PrecmdDoc[]
  redirs?: readonly RedirDoc[]
  processSubsts?: readonly ProcessSubstDoc[]
  reservedWords?: readonly ReservedWordDoc[]
}

// Keep corpus assembly separate from markdown rendering so live hover helpers
// stay focused and dump/dev tooling can compose the corpus independently.
function mkHoverDocs<T>(
  kind: HoverKind,
  docs: readonly T[],
  keyOf: (doc: T) => string,
  render: (doc: T) => string,
): HoverDoc[] {
  return docs.map((doc) => ({
    kind,
    key: keyOf(doc),
    md: render(doc),
  }))
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
}: HoverDocArgs): HoverDoc[] {
  const ctx = mkHoverMdCtx(options)
  return [
    ...mkHoverDocs(
      "option",
      options,
      (opt) => opt.display,
      (opt) => mdOpt(opt, ctx),
    ),
    ...mkHoverDocs(
      "cond-op",
      condOps,
      (cop) => cop.op,
      (cop) => mdCond(cop, ctx),
    ),
    ...mkHoverDocs(
      "param",
      [...params].sort((a, b) => a.name.localeCompare(b.name)),
      (param) => param.name,
      mdParam,
    ),
    ...mkHoverDocs("builtin", builtins, (builtin) => builtin.name, mdBuiltin),
    ...mkHoverDocs("precmd", precmds, (precmd) => precmd.name, mdPrecmd),
    ...mkHoverDocs("redir", redirs, (redir) => redir.op, mdRedir),
    ...mkHoverDocs(
      "process-subst",
      processSubsts,
      (processSubst) => processSubst.op,
      mdProcessSubst,
    ),
    ...mkHoverDocs(
      "reserved-word",
      reservedWords,
      (reservedWord) => reservedWord.name,
      mdReservedWord,
    ),
  ]
}
