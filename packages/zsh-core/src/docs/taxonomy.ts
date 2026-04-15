import type {
  BuiltinDoc,
  Candidate,
  CondOpDoc,
  GlobFlagDoc,
  GlobOpDoc,
  HistoryDoc,
  ParamFlagDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  Proven,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SubscriptFlagDoc,
  ZshOption,
} from "./types.ts"

export const docCategories = [
  "option",
  "cond_op",
  "builtin",
  "precmd",
  "shell_param",
  "reserved_word",
  "redir",
  "process_subst",
  "subscript_flag",
  "param_flag",
  "history",
  "glob_op",
  "glob_flag",
] as const

export type DocCategory = (typeof docCategories)[number]

export interface DocRecordMap {
  option: ZshOption
  cond_op: CondOpDoc
  builtin: BuiltinDoc
  precmd: PrecmdDoc
  shell_param: ShellParamDoc
  reserved_word: ReservedWordDoc
  redir: RedirDoc
  process_subst: ProcessSubstDoc
  subscript_flag: SubscriptFlagDoc
  param_flag: ParamFlagDoc
  history: HistoryDoc
  glob_op: GlobOpDoc
  glob_flag: GlobFlagDoc
}

/**
 * Discriminated-union identity for a known (proven) documented element.
 * `category` narrows `id` to the corresponding proven brand.
 * The only sanctioned way to obtain a `DocPieceId` is from `resolve()` or
 * from iterating `DocCorpus` internally.
 */
export type DocPieceId = {
  [K in DocCategory]: { readonly category: K; readonly id: Proven<K> }
}[DocCategory]

/**
 * Discriminated-union identity for a lookup candidate derived from user code.
 * `category` narrows `id` to the corresponding candidate brand. Not a proof
 * of corpus membership; must pass through `resolve()` to become a
 * `DocPieceId`.
 */
export type CandidateDocPieceId = {
  [K in DocCategory]: { readonly category: K; readonly id: Candidate<K> }
}[DocCategory]

/**
 * Construct a `DocPieceId` from a category and a proven id. Centralizes the
 * correlated-union cast that TS cannot propagate through a generic helper.
 */
export const mkPieceId = <K extends DocCategory>(
  category: K,
  id: Proven<K>,
): DocPieceId => ({ category, id }) as DocPieceId

/**
 * Construct a `CandidateDocPieceId` from a category and a candidate id.
 * Centralizes the correlated-union cast.
 */
export const mkCandPieceId = <K extends DocCategory>(
  category: K,
  id: Candidate<K>,
): CandidateDocPieceId => ({ category, id }) as CandidateDocPieceId

export const docId: {
  [K in DocCategory]: (doc: DocRecordMap[K]) => Proven<K>
} = {
  option: d => d.name,
  cond_op: d => d.op,
  builtin: d => d.name,
  precmd: d => d.name as Proven<"precmd">,
  shell_param: d => d.name,
  reserved_word: d => d.name,
  redir: d => d.sig,
  process_subst: d => d.op as Proven<"process_subst">,
  subscript_flag: d => d.flag,
  param_flag: d => d.flag,
  history: d => d.key,
  glob_op: d => d.op,
  glob_flag: d => d.flag,
}

/** Display heading for a doc record; may differ from the id (e.g. options show `display`). */
export const docDisplay = <K extends DocCategory>(
  cat: K,
  doc: DocRecordMap[K],
): string =>
  cat === "option"
    ? (doc as ZshOption).display
    : (docId[cat](doc as never) as string)
