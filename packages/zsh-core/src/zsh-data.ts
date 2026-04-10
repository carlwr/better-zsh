/**
 * @module
 * Memoized loaders for zsh doc records, parsing vendored Yodl sources on first access.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cached } from "@carlwr/typescript-extra"
import { resolveZshDataDir } from "./data-dir.ts"
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
export const getOptions = loadYo("options.yo", parseOptions)

/** `[[ ... ]]` conditional operators. */
export const getCondOps = loadYo("cond.yo", parseCondOps)

/** Builtin commands. */
export const getBuiltins = loadYo("builtins.yo", parseBuiltins)

/** Precommand modifiers. */
export const getPrecmds = loadYo("grammar.yo", parsePrecmds)

/** Redirection operators. */
export const getRedirections = loadYo("redirect.yo", parseRedirections)

/** Reserved words. */
export const getReservedWords = loadYo("grammar.yo", parseReservedWords)

/** Shell-managed parameters. */
export const getShellParams = loadYo("params.yo", parseShellParams)

/** Subscript flags. */
export const getSubscriptFlags = loadYo("params.yo", parseSubscriptFlags)

/** Parameter-expansion flags. */
export const getParamFlags = loadYo("expn.yo", parseParamFlags)

/** History expansion. */
export const getHistoryDocs = loadYo("expn.yo", parseHistory)

/** Globbing operators. */
export const getGlobOps = loadYo("expn.yo", parseGlobOps)

/** Globbing flags. */
export const getGlobbingFlags = loadYo("expn.yo", parseGlobbingFlags)

/** Process substitution. */
export const getProcessSubsts = loadYo("expn.yo", parseProcessSubsts)
