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
  BuiltinName,
  CondOp,
  OptName,
  RedirSig,
  ReservedWord,
  ShellParamName,
} from "./types/brand.ts"
import type {
  BuiltinDoc,
  CondOpDoc,
  PrecmdDoc,
  PrecmdName,
  ProcessSubstDoc,
  ProcessSubstOp,
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

export interface HoverDocBase<K extends HoverKind, I extends string> {
  readonly kind: K
  readonly id: I
  /** Display heading used in hover dump output; may differ from the typed `id`. */
  readonly heading: string
  readonly md: string
}

/** Rendered hover/reference markdown for one logical zsh item. */
export type HoverDoc =
  | HoverDocBase<"option", OptName>
  | HoverDocBase<"cond-op", CondOp>
  | HoverDocBase<"param", ShellParamName>
  | HoverDocBase<"builtin", BuiltinName>
  | HoverDocBase<"precmd", PrecmdName>
  | HoverDocBase<"redir", RedirSig>
  | HoverDocBase<"process-subst", ProcessSubstOp>
  | HoverDocBase<"reserved-word", ReservedWord>

export interface HoverDocArgs {
  readonly options: readonly ZshOption[]
  readonly condOps: readonly CondOpDoc[]
  readonly params: readonly ShellParamDoc[]
  readonly builtins: readonly BuiltinDoc[]
  readonly precmds: readonly PrecmdDoc[]
  readonly redirs: readonly RedirDoc[]
  readonly processSubsts: readonly ProcessSubstDoc[]
  readonly reservedWords: readonly ReservedWordDoc[]
}

// Keep corpus assembly separate from markdown rendering so live hover helpers
// stay focused and dump/dev tooling can compose the corpus independently.
function mkHoverDocs<K extends HoverKind, T, I extends string>(
  kind: K,
  docs: readonly T[],
  idOf: (doc: T) => I,
  headingOf: (doc: T) => string,
  render: (doc: T) => string,
): HoverDocBase<K, I>[] {
  return docs.map((doc) => ({
    kind,
    id: idOf(doc),
    heading: headingOf(doc),
    md: render(doc),
  }))
}

/** Generate the full static hover corpus from normalized zsh data. */
export function hoverDocs({
  options,
  condOps,
  params,
  builtins,
  precmds,
  redirs,
  processSubsts,
  reservedWords,
}: HoverDocArgs): readonly HoverDoc[] {
  const ctx = mkHoverMdCtx(options)
  return [
    ...mkHoverDocs(
      "option",
      options,
      (opt) => opt.name,
      (opt) => opt.display,
      (opt) => mdOpt(opt, ctx),
    ),
    ...mkHoverDocs(
      "cond-op",
      condOps,
      (cop) => cop.op,
      (cop) => cop.op,
      (cop) => mdCond(cop, ctx),
    ),
    ...mkHoverDocs(
      "param",
      [...params].sort((a, b) => a.name.localeCompare(b.name)),
      (param) => param.name,
      (param) => param.name,
      mdParam,
    ),
    ...mkHoverDocs(
      "builtin",
      builtins,
      (builtin) => builtin.name,
      (builtin) => builtin.name,
      mdBuiltin,
    ),
    ...mkHoverDocs(
      "precmd",
      precmds,
      (precmd) => precmd.name,
      (precmd) => precmd.name,
      mdPrecmd,
    ),
    ...mkHoverDocs(
      "redir",
      redirs,
      (redir) => redir.sig,
      (redir) => redir.sig,
      mdRedir,
    ),
    ...mkHoverDocs(
      "process-subst",
      processSubsts,
      (processSubst) => processSubst.op,
      (processSubst) => processSubst.op,
      mdProcessSubst,
    ),
    ...mkHoverDocs(
      "reserved-word",
      reservedWords,
      (reservedWord) => reservedWord.name,
      (reservedWord) => reservedWord.name,
      mdReservedWord,
    ),
  ]
}
