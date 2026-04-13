import type {
  BuiltinName,
  CondOp,
  GlobbingFlag,
  GlobOp,
  HistoryKey,
  OptName,
  ParamFlag,
  RedirSig,
  ReservedWord,
  ShellParamName,
  SubscriptFlag,
} from "../types/brand.ts"
import type {
  BuiltinDoc,
  CondOpDoc,
  GlobbingFlagDoc,
  GlobOpDoc,
  HistoryDoc,
  ParamFlagDoc,
  PrecmdDoc,
  PrecmdName,
  ProcessSubstDoc,
  ProcessSubstOp,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SubscriptFlagDoc,
  ZshOption,
} from "../types/zsh-data.ts"
import {
  mdBuiltin,
  mdCondOp,
  mdGlobFlag,
  mdGlobOp,
  mdHistory,
  mdOpt,
  mdParamFlag,
  mdPrecmd,
  mdProcessSubst,
  mdRedir,
  mdReservedWord,
  mdShellParam,
  mdSubscriptFlag,
  mkMdCtx,
} from "./md.ts"

export type RefKind =
  | "option"
  | "cond-op"
  | "shell-param"
  | "builtin"
  | "precmd"
  | "redir"
  | "process-subst"
  | "reserved-word"
  | "subscript-flag"
  | "param-flag"
  | "history"
  | "glob-op"
  | "glob-flag"

export interface RefDocBase<K extends RefKind, I extends string> {
  readonly kind: K
  readonly id: I
  /** Display heading used in dump output; may differ from the typed `id`. */
  readonly heading: string
  readonly md: string
}

/** Rendered reference markdown for one logical zsh item. */
export type RefDoc =
  | RefDocBase<"option", OptName>
  | RefDocBase<"cond-op", CondOp>
  | RefDocBase<"shell-param", ShellParamName>
  | RefDocBase<"builtin", BuiltinName>
  | RefDocBase<"precmd", PrecmdName>
  | RefDocBase<"redir", RedirSig>
  | RefDocBase<"process-subst", ProcessSubstOp>
  | RefDocBase<"reserved-word", ReservedWord>
  | RefDocBase<"subscript-flag", SubscriptFlag>
  | RefDocBase<"param-flag", ParamFlag>
  | RefDocBase<"history", HistoryKey>
  | RefDocBase<"glob-op", GlobOp>
  | RefDocBase<"glob-flag", GlobbingFlag>

export interface RefDocArgs {
  readonly options: readonly ZshOption[]
  readonly condOps: readonly CondOpDoc[]
  readonly shellParams: readonly ShellParamDoc[]
  readonly builtins: readonly BuiltinDoc[]
  readonly precmds: readonly PrecmdDoc[]
  readonly redirs: readonly RedirDoc[]
  readonly processSubsts: readonly ProcessSubstDoc[]
  readonly reservedWords: readonly ReservedWordDoc[]
  readonly subscriptFlags: readonly SubscriptFlagDoc[]
  readonly paramFlags: readonly ParamFlagDoc[]
  readonly history: readonly HistoryDoc[]
  readonly globOps: readonly GlobOpDoc[]
  readonly globFlags: readonly GlobbingFlagDoc[]
}

// Keep corpus assembly separate from markdown rendering so consumers can compose
// the rendered reference corpus independently.
function mkRefDocs<K extends RefKind, T, I extends string>(
  kind: K,
  docs: readonly T[],
  idOf: (doc: T) => I,
  headingOf: (doc: T) => string,
  render: (doc: T) => string,
): RefDocBase<K, I>[] {
  return docs.map((doc) => ({
    kind,
    id: idOf(doc),
    heading: headingOf(doc),
    md: render(doc),
  })) as RefDocBase<K, I>[]
}

const byName = <T extends { name: string }>(doc: T): T["name"] => doc.name
const byDisplay = <T extends { display: string }>(doc: T): T["display"] =>
  doc.display
const byFlag = <T extends { flag: string }>(doc: T): T["flag"] => doc.flag
const byOp = <T extends { op: string }>(doc: T): T["op"] => doc.op
const byKey = <T extends { key: string }>(doc: T): T["key"] => doc.key
const bySig = <T extends { sig: string }>(doc: T): T["sig"] => doc.sig

/** Generate the full static reference corpus from normalized zsh data. */
export function refDocs({
  options,
  condOps,
  shellParams,
  builtins,
  precmds,
  redirs,
  processSubsts,
  reservedWords,
  subscriptFlags,
  paramFlags,
  history,
  globOps,
  globFlags,
}: RefDocArgs): readonly RefDoc[] {
  const ctx = mkMdCtx(options)
  return [
    ...mkRefDocs<"option", ZshOption, OptName>(
      "option",
      options,
      byName,
      byDisplay,
      (opt) => mdOpt(opt, ctx),
    ),
    ...mkRefDocs<"cond-op", CondOpDoc, CondOp>(
      "cond-op",
      condOps,
      byOp,
      byOp,
      (cop) => mdCondOp(cop, ctx),
    ),
    ...mkRefDocs<"shell-param", ShellParamDoc, ShellParamName>(
      "shell-param",
      [...shellParams].sort((a, b) => a.name.localeCompare(b.name)),
      byName,
      byName,
      mdShellParam,
    ),
    ...mkRefDocs<"builtin", BuiltinDoc, BuiltinName>(
      "builtin",
      builtins,
      byName,
      byName,
      mdBuiltin,
    ),
    ...mkRefDocs<"precmd", PrecmdDoc, PrecmdName>(
      "precmd",
      precmds,
      byName,
      byName,
      mdPrecmd,
    ),
    ...mkRefDocs<"redir", RedirDoc, RedirSig>(
      "redir",
      redirs,
      bySig,
      bySig,
      mdRedir,
    ),
    ...mkRefDocs<"process-subst", ProcessSubstDoc, ProcessSubstOp>(
      "process-subst",
      processSubsts,
      byOp,
      byOp,
      mdProcessSubst,
    ),
    ...mkRefDocs<"reserved-word", ReservedWordDoc, ReservedWord>(
      "reserved-word",
      reservedWords,
      byName,
      byName,
      mdReservedWord,
    ),
    ...mkRefDocs<"subscript-flag", SubscriptFlagDoc, SubscriptFlag>(
      "subscript-flag",
      subscriptFlags,
      byFlag,
      byFlag,
      mdSubscriptFlag,
    ),
    ...mkRefDocs<"param-flag", ParamFlagDoc, ParamFlag>(
      "param-flag",
      paramFlags,
      byFlag,
      byFlag,
      mdParamFlag,
    ),
    ...mkRefDocs<"history", HistoryDoc, HistoryKey>(
      "history",
      history,
      byKey,
      byKey,
      mdHistory,
    ),
    ...mkRefDocs<"glob-op", GlobOpDoc, GlobOp>(
      "glob-op",
      globOps,
      byOp,
      byOp,
      mdGlobOp,
    ),
    ...mkRefDocs<"glob-flag", GlobbingFlagDoc, GlobbingFlag>(
      "glob-flag",
      globFlags,
      byFlag,
      byFlag,
      mdGlobFlag,
    ),
  ]
}
