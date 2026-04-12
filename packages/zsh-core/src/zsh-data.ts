/**
 * @module
 * Memoized loaders for zsh doc records, parsing vendored Yodl sources on first access.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cached } from "@carlwr/typescript-extra"
import { resolveZshDataDir } from "./data-dir.ts"
import type {
  BuiltinDoc,
  CondOpDoc,
  GlobbingFlagDoc,
  GlobOpDoc,
  HistoryDoc,
  ParamFlagDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SubscriptFlagDoc,
  ZshOption,
} from "./types/zsh-data.ts"
import { parseBuiltins } from "./yodl/docs/builtins.ts"
import { parseCondOps } from "./yodl/docs/cond-ops.ts"
import { parseGlobOps } from "./yodl/docs/glob-ops.ts"
import { parseGlobbingFlags } from "./yodl/docs/globbing-flags.ts"
import { parseHistory } from "./yodl/docs/history.ts"
import { parseOptions } from "./yodl/docs/options.ts"
import { parseParamFlags } from "./yodl/docs/param-flags.ts"
import { parsePrecmds } from "./yodl/docs/precmds.ts"
import { parseProcessSubsts } from "./yodl/docs/process-substs.ts"
import { parseRedirections } from "./yodl/docs/redirections.ts"
import { parseReservedWords } from "./yodl/docs/reserved-words.ts"
import { parseShellParams } from "./yodl/docs/shell-params.ts"
import { parseSubscriptFlags } from "./yodl/docs/subscript-flags.ts"

const dataDir = resolveZshDataDir()

function freezeValue(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object") Object.freeze(item)
    }
    Object.freeze(value)
    return
  }
  if (value && typeof value === "object") Object.freeze(value)
}

function freezeDoc<T extends object>(doc: T): Readonly<T> {
  for (const value of Object.values(doc)) freezeValue(value)
  return Object.freeze(doc)
}

function freezeDocs<T extends object>(
  docs: readonly T[],
): readonly Readonly<T>[] {
  return Object.freeze(docs.map(freezeDoc))
}

function loadYo<T extends object>(
  file: string,
  parse: (yo: string) => readonly T[],
): () => readonly Readonly<T>[] {
  return cached(() =>
    freezeDocs(parse(readFileSync(join(dataDir, file), "utf8"))),
  )
}

/** Zsh option metadata. */
export const getOptions: () => readonly ZshOption[] = loadYo(
  "options.yo",
  parseOptions,
)

/** `[[ ... ]]` conditional operators. */
export const getCondOps: () => readonly CondOpDoc[] = loadYo(
  "cond.yo",
  parseCondOps,
)

/** Builtin commands. */
export const getBuiltins: () => readonly BuiltinDoc[] = loadYo(
  "builtins.yo",
  parseBuiltins,
)

/** Precommand modifiers. */
export const getPrecmds: () => readonly PrecmdDoc[] = loadYo(
  "grammar.yo",
  parsePrecmds,
)

/** Redirection operators. */
export const getRedirections: () => readonly RedirDoc[] = loadYo(
  "redirect.yo",
  parseRedirections,
)

/** Reserved words. */
export const getReservedWords: () => readonly ReservedWordDoc[] = loadYo(
  "grammar.yo",
  parseReservedWords,
)

/** Shell-managed parameters. */
export const getShellParams: () => readonly ShellParamDoc[] = loadYo(
  "params.yo",
  parseShellParams,
)

/** Subscript flags. */
export const getSubscriptFlags: () => readonly SubscriptFlagDoc[] = loadYo(
  "params.yo",
  parseSubscriptFlags,
)

/** Parameter-expansion flags. */
export const getParamFlags: () => readonly ParamFlagDoc[] = loadYo(
  "expn.yo",
  parseParamFlags,
)

/** History expansion. */
export const getHistoryDocs: () => readonly HistoryDoc[] = loadYo(
  "expn.yo",
  parseHistory,
)

/** Globbing operators. */
export const getGlobOps: () => readonly GlobOpDoc[] = loadYo(
  "expn.yo",
  parseGlobOps,
)

/** Globbing flags. */
export const getGlobbingFlags: () => readonly GlobbingFlagDoc[] = loadYo(
  "expn.yo",
  parseGlobbingFlags,
)

/** Process substitution. */
export const getProcessSubsts: () => readonly ProcessSubstDoc[] = loadYo(
  "expn.yo",
  parseProcessSubsts,
)
