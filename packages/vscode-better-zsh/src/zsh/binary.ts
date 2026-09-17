import { constants, existsSync } from "node:fs"
import { access } from "node:fs/promises"
import * as path from "node:path"
import type { Brand } from "@carlwr/zsh-core/types"

/** A zsh binary: a bare name (looked up on PATH) or an absolute path. */
export type ZshBinary = Brand<string, "ZshBinary">
export const mkZshBinary = (raw: string) => raw as ZshBinary

/** How the configuration names the binary. */
export type ZshBinaryRef =
  | { kind: "default"; binary: ZshBinary }
  | { kind: "explicit"; binary: ZshBinary }

type UnavailableCode = "ENOENT" | "EACCES"

export type ZshProbe =
  | { kind: "available"; binary: ZshBinary }
  | { kind: "unavailable"; binary: ZshBinary; errCode: UnavailableCode }

function resolveOnPath(
  binary: ZshBinary,
  env: NodeJS.ProcessEnv,
): ZshBinary | undefined {
  const dirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean)
  const exts =
    process.platform === "win32"
      ? (env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
      : [""]
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, `${binary}${ext}`)
      if (existsSync(full)) return mkZshBinary(full)
    }
  }
  return undefined
}

const canExec = (file: string) =>
  access(file, constants.X_OK).then(
    () => true,
    () => false,
  )

/** Locate `ref` on the filesystem (PATH from `env`) and check it is executable. */
export async function probeZsh(
  ref: ZshBinaryRef,
  env: NodeJS.ProcessEnv,
): Promise<ZshProbe> {
  const file =
    ref.kind === "explicit"
      ? existsSync(ref.binary)
        ? ref.binary
        : undefined
      : resolveOnPath(ref.binary, env)
  if (!file)
    return { kind: "unavailable", binary: ref.binary, errCode: "ENOENT" }
  if (!(await canExec(file)))
    return { kind: "unavailable", binary: file, errCode: "EACCES" }
  return { kind: "available", binary: file }
}
