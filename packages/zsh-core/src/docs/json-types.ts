import type { JsonCountKey, JsonDataFile } from "./json-artifacts.ts"
import type { DocCategory, DocRecordMap } from "./taxonomy.ts"
import type { BuiltinDoc, CondOpDoc, ParamExpnDoc, PrecmdDoc } from "./types.ts"

type UnbrandTuple<T extends readonly unknown[]> = {
  readonly [K in keyof T]: Unbrand<T[K]>
}

type Unbrand<T> = T extends string & {
  readonly __documented: unknown
}
  ? string
  : T extends string & { readonly __observed: unknown }
    ? string
    : T extends string & { readonly __brand: unknown }
      ? string
      : T extends readonly [unknown, ...unknown[]]
        ? UnbrandTuple<T>
        : T extends readonly (infer U)[]
          ? readonly Unbrand<U>[]
          : T extends object
            ? { readonly [K in keyof T]: Unbrand<T[K]> }
            : T

type JsonDoc<K extends DocCategory> = Unbrand<DocRecordMap[K]>

type JsonBuiltinDoc = Omit<Unbrand<BuiltinDoc>, "synopsis"> & {
  readonly synopsis: readonly string[]
}
type JsonCondOpDoc = Omit<Unbrand<CondOpDoc>, "operands"> & {
  readonly operands: readonly string[]
}
type JsonPrecmdDoc = Omit<Unbrand<PrecmdDoc>, "synopsis"> & {
  readonly synopsis: readonly string[]
}
type JsonParamExpnDoc = Omit<Unbrand<ParamExpnDoc>, "groupSigs"> & {
  readonly groupSigs: readonly string[]
}

export type JsonRecordMap = {
  [K in Exclude<
    DocCategory,
    "builtin" | "cond_op" | "precmd" | "param_expn"
  >]: JsonDoc<K>
} & {
  builtin: JsonBuiltinDoc
  cond_op: JsonCondOpDoc
  precmd: JsonPrecmdDoc
  param_expn: JsonParamExpnDoc
}
export type JsonDocArrayMap = {
  [K in DocCategory]: readonly JsonRecordMap[K][]
}

export type OptionsJson = JsonDocArrayMap["option"]
export type CondOpsJson = JsonDocArrayMap["cond_op"]
export type BuiltinsJson = JsonDocArrayMap["builtin"]
export type PrecmdsJson = JsonDocArrayMap["precmd"]
export type ShellParamsJson = JsonDocArrayMap["shell_param"]
export type ReservedWordsJson = JsonDocArrayMap["reserved_word"]
export type RedirectionsJson = JsonDocArrayMap["redir"]
export type ProcessSubstsJson = JsonDocArrayMap["process_subst"]
export type ParamExpnsJson = JsonDocArrayMap["param_expn"]
export type SubscriptFlagsJson = JsonDocArrayMap["subscript_flag"]
export type ParamFlagsJson = JsonDocArrayMap["param_flag"]
export type HistoryJson = JsonDocArrayMap["history"]
export type GlobOperatorsJson = JsonDocArrayMap["glob_op"]
export type GlobFlagsJson = JsonDocArrayMap["glob_flag"]
export type PromptEscapesJson = JsonDocArrayMap["prompt_escape"]
export type ZleWidgetsJson = JsonDocArrayMap["zle_widget"]

export type JsonCounts = { readonly [K in JsonCountKey]: number }

export interface JsonIndex {
  readonly version: 1
  readonly packageVersion: string
  readonly zshUpstream: {
    readonly tag: string
    readonly commit: string
    readonly date: string
  }
  readonly files: readonly JsonDataFile[]
  readonly counts: JsonCounts
}
