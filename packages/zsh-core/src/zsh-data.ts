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
import { parseBuiltins } from "./yodl/builtins.ts"
import { parseCondOps } from "./yodl/cond-ops.ts"
import { parseGlobOps } from "./yodl/glob-ops.ts"
import { parseGlobbingFlags } from "./yodl/globbing-flags.ts"
import { parseHistory } from "./yodl/history.ts"
import { parseOptions } from "./yodl/options.ts"
import { parseParamFlags } from "./yodl/param-flags.ts"
import { parsePrecmds } from "./yodl/precmds.ts"
import { parseProcessSubsts } from "./yodl/process-subst.ts"
import { parseRedirections } from "./yodl/redirections.ts"
import { parseReservedWords } from "./yodl/reserved-words.ts"
import { parseShellParams } from "./yodl/shell-params.ts"
import { parseSubscriptFlags } from "./yodl/subscript-flags.ts"

const dataDir = resolveZshDataDir()

function readYo(name: string): string {
  return readFileSync(join(dataDir, name), "utf8")
}

/** Zsh option metadata. */
export const getOptions: () => ZshOption[] = cached<ZshOption[]>(() =>
  parseOptions(readYo("options.yo")),
)

/** `[[ ... ]]` conditional operators. */
export const getCondOps: () => CondOpDoc[] = cached<CondOpDoc[]>(() =>
  parseCondOps(readYo("cond.yo")),
)

/** Builtin commands. */
export const getBuiltins: () => BuiltinDoc[] = cached<BuiltinDoc[]>(() =>
  parseBuiltins(readYo("builtins.yo")),
)

/** Precommand modifiers. */
export const getPrecmds: () => PrecmdDoc[] = cached<PrecmdDoc[]>(() =>
  parsePrecmds(readYo("grammar.yo")),
)

/** Redirection operators. */
export const getRedirections: () => RedirDoc[] = cached<RedirDoc[]>(() =>
  parseRedirections(readYo("redirect.yo")),
)

/** Reserved words. */
export const getReservedWords: () => ReservedWordDoc[] = cached<
  ReservedWordDoc[]
>(() => parseReservedWords(readYo("grammar.yo")))

/** Shell-managed parameters. */
export const getShellParams: () => ShellParamDoc[] = cached<ShellParamDoc[]>(
  () => parseShellParams(readYo("params.yo")),
)

/** Subscript flags. */
export const getSubscriptFlags: () => SubscriptFlagDoc[] = cached<
  SubscriptFlagDoc[]
>(() => parseSubscriptFlags(readYo("params.yo")))

/** Parameter-expansion flags. */
export const getParamFlags: () => ParamFlagDoc[] = cached<ParamFlagDoc[]>(() =>
  parseParamFlags(readYo("expn.yo")),
)

/** History expansion. */
export const getHistoryDocs: () => HistoryDoc[] = cached<HistoryDoc[]>(() =>
  parseHistory(readYo("expn.yo")),
)

/** Globbing operators. */
export const getGlobOps: () => GlobOpDoc[] = cached<GlobOpDoc[]>(() =>
  parseGlobOps(readYo("expn.yo")),
)

/** Globbing flags. */
export const getGlobbingFlags: () => GlobbingFlagDoc[] = cached<
  GlobbingFlagDoc[]
>(() => parseGlobbingFlags(readYo("expn.yo")))

/** Process substitution. */
export const getProcessSubsts: () => ProcessSubstDoc[] = cached<
  ProcessSubstDoc[]
>(() => parseProcessSubsts(readYo("expn.yo")))
