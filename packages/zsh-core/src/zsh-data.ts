import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cached } from "@carlwr/typescript-extra"
import { resolveZshDataDir } from "./data-dir.ts"
import type {
  BuiltinDoc,
  CondOperator,
  PrecmdDoc,
  ZshOption,
} from "./types/zsh-data.ts"
import { parseBuiltins } from "./yodl/builtins.ts"
import { parseCondOps } from "./yodl/cond-ops.ts"
import { parseOptions } from "./yodl/options.ts"
import { parsePrecmds } from "./yodl/precmds.ts"

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
