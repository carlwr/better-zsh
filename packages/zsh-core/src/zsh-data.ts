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

function loadYo<T>(file: string, parse: (yo: string) => T): () => T {
  return cached<T>(() => parse(readFileSync(join(dataDir, file), "utf8")))
}

/** Zsh option metadata. */
export const getOptions: () => ZshOption[] = loadYo("options.yo", parseOptions)

/** `[[ ... ]]` conditional operators. */
export const getCondOps: () => CondOpDoc[] = loadYo("cond.yo", parseCondOps)

/** Builtin commands. */
export const getBuiltins: () => BuiltinDoc[] = loadYo(
  "builtins.yo",
  parseBuiltins,
)

/** Precommand modifiers. */
export const getPrecmds: () => PrecmdDoc[] = loadYo("grammar.yo", parsePrecmds)

/** Redirection operators. */
export const getRedirections: () => RedirDoc[] = loadYo(
  "redirect.yo",
  parseRedirections,
)

/** Reserved words. */
export const getReservedWords: () => ReservedWordDoc[] = loadYo(
  "grammar.yo",
  parseReservedWords,
)

/** Shell-managed parameters. */
export const getShellParams: () => ShellParamDoc[] = loadYo(
  "params.yo",
  parseShellParams,
)

/** Subscript flags. */
export const getSubscriptFlags: () => SubscriptFlagDoc[] = loadYo(
  "params.yo",
  parseSubscriptFlags,
)

/** Parameter-expansion flags. */
export const getParamFlags: () => ParamFlagDoc[] = loadYo(
  "expn.yo",
  parseParamFlags,
)

/** History expansion. */
export const getHistoryDocs: () => HistoryDoc[] = loadYo(
  "expn.yo",
  parseHistory,
)

/** Globbing operators. */
export const getGlobOps: () => GlobOpDoc[] = loadYo("expn.yo", parseGlobOps)

/** Globbing flags. */
export const getGlobbingFlags: () => GlobbingFlagDoc[] = loadYo(
  "expn.yo",
  parseGlobbingFlags,
)

/** Process substitution. */
export const getProcessSubsts: () => ProcessSubstDoc[] = loadYo(
  "expn.yo",
  parseProcessSubsts,
)
