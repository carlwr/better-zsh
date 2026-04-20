/**
 * Test-only helpers for spawning the built bin. Not picked up by vitest
 * — the config glob matches `**\/*.test.ts` only, so any `.ts` file in
 * `src/test/` that does not end in `.test.ts` is treated as a helper
 * module. Repo-wide convention; see AGENTS.md.
 */

import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe } from "vitest"

const here = dirname(fileURLToPath(import.meta.url))
export const pkgDir = join(here, "..", "..")
export const binEntry = join(pkgDir, "dist", "bin.mjs")

/**
 * `describe` that becomes `describe.skip` when the bin hasn't been built —
 * lets unit tests run in isolation without the `pretest` build step.
 */
export const describeIfBuilt = existsSync(binEntry) ? describe : describe.skip

const run = promisify(execFile)

/**
 * Spawn `node bin.mjs ...args`, capturing exit code + streams. Non-zero
 * exits surface as the rejected promise from `execFile`; we normalize to
 * `{ code, stdout, stderr }` so callers can assert on bad-input paths.
 */
export async function runBin(
  args: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [binEntry, ...args])
    return { code: 0, stdout, stderr }
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string }
    return {
      code: e.code ?? -1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    }
  }
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI ESC [...]
const ANSI_RE = /\x1b\[[0-9;]*m/g

/** Stripped-of-ANSI combined `stdout + stderr` from a spawned bin run. */
export async function renderHelp(args: readonly string[]): Promise<string> {
  const { stdout, stderr } = await runBin(args)
  return `${stdout}${stderr}`.replace(ANSI_RE, "")
}
