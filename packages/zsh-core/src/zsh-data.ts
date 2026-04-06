import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cached } from "@carlwr/typescript-extra"
import { resolveZshDataDir } from "./data-dir.ts"
import type {
  BuiltinDoc,
  CondOperator,
  GlobbingFlagDoc,
  GlobOpDoc,
  HistoryDoc,
  ParamFlagDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  RedirDoc,
  ReservedWordDoc,
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
import { parseSubscriptFlags } from "./yodl/subscript-flags.ts"

const dataDir = resolveZshDataDir()

function readYo(name: string): string {
  return readFileSync(join(dataDir, name), "utf8")
}

/** Load and memoize parsed zsh option metadata. */
export const getOptions: () => ZshOption[] = cached<ZshOption[]>(() =>
  parseOptions(readYo("options.yo")),
)

/** Load and memoize parsed `[[ ... ]]` conditional operators. */
export const getCondOps: () => CondOperator[] = cached<CondOperator[]>(() =>
  parseCondOps(readYo("cond.yo")),
)

/** Load and memoize parsed builtin command docs. */
export const getBuiltins: () => BuiltinDoc[] = cached<BuiltinDoc[]>(() =>
  parseBuiltins(readYo("builtins.yo")),
)

/** Load and memoize parsed precommand modifier docs. */
export const getPrecmds: () => PrecmdDoc[] = cached<PrecmdDoc[]>(() =>
  parsePrecmds(readYo("grammar.yo")),
)

export const getRedirections: () => RedirDoc[] = cached<RedirDoc[]>(() =>
  parseRedirections(readYo("redirect.yo")),
)

export const getReservedWords: () => ReservedWordDoc[] = cached<
  ReservedWordDoc[]
>(() => parseReservedWords(readYo("grammar.yo")))

export const getSubscriptFlags: () => SubscriptFlagDoc[] = cached<
  SubscriptFlagDoc[]
>(() => parseSubscriptFlags(readYo("params.yo")))

export const getParamFlags: () => ParamFlagDoc[] = cached<ParamFlagDoc[]>(() =>
  parseParamFlags(readYo("expn.yo")),
)

export const getHistoryDocs: () => HistoryDoc[] = cached<HistoryDoc[]>(() =>
  parseHistory(readYo("expn.yo")),
)

export const getGlobOps: () => GlobOpDoc[] = cached<GlobOpDoc[]>(() =>
  parseGlobOps(readYo("expn.yo")),
)

export const getGlobbingFlags: () => GlobbingFlagDoc[] = cached<
  GlobbingFlagDoc[]
>(() => parseGlobbingFlags(readYo("expn.yo")))

export const getGlobOperators = getGlobOps

export const getGlobFlags = getGlobbingFlags

export const getProcessSubsts: () => ProcessSubstDoc[] = cached<
  ProcessSubstDoc[]
>(() => parseProcessSubsts(readYo("expn.yo")))
