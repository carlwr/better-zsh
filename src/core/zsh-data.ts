import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { cached } from "@carlwr/typescript-extra"
import type { BuiltinDoc, CondOperator, ZshOption } from "./types/zsh-data"
import { parseBuiltins } from "./yodl/builtins"
import { parseCondOps } from "./yodl/cond-ops"
import { parseOptions } from "./yodl/options"

const dataDir = resolveDataDir()

function readYo(name: string): string {
  return readFileSync(join(dataDir, name), "utf8")
}

export const getOptions = cached<ZshOption[]>(() =>
  parseOptions(readYo("options.yo")),
)

export const getCondOps = cached<CondOperator[]>(() =>
  parseCondOps(readYo("cond.yo")),
)

export const getBuiltins = cached<BuiltinDoc[]>(() =>
  parseBuiltins(readYo("builtins.yo")),
)

function resolveDataDir(): string {
  const candidates = [
    join(__dirname, "..", "data", "zsh-docs"),
    join(__dirname, "..", "src", "data", "zsh-docs"),
  ]
  const dir = candidates.find((cand) => existsSync(cand))
  if (dir) return dir
  throw new Error(`zsh docs dir not found: ${candidates.join(", ")}`)
}
