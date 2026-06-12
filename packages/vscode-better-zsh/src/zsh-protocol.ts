/**
 * Pure request builders and response parsers for talking to a zsh process.
 * Execution lives in `zsh-exec.ts`; gating in `zsh.ts`.
 */
import type { ZshRunReq } from "./zsh-exec"

/** Base args for all zsh invocations: `-f` (NO_RCS) to skip user rc files. */
export const ZSH_BASE_ARGS = ["-f"] as const

// (Z+Cn+): split SRC into shell tokens (Z), treating newlines as tokens (C) and
// keeping null tokens from adjacent delimiters (n) — yields one token per line.
const TOKENIZE_SCRIPT = 'print -l -- "${(Z+Cn+)SRC}"'

/** Ask zsh to print its version banner. */
export const versionReq: ZshRunReq = { args: ["--version"] }

/** Syntax-check `text` without executing it (`zsh -n`, source on stdin). */
export function syntaxCheckReq(text: string): ZshRunReq {
  return { args: [...ZSH_BASE_ARGS, "-n"], stdin: text }
}

/** Tokenize `text` via a live zsh under `emulate -LR zsh`. */
export function tokenizeReq(text: string): ZshRunReq {
  return {
    args: [...ZSH_BASE_ARGS, "-c", `emulate -LR zsh\n${TOKENIZE_SCRIPT}`],
    env: { SRC: text },
  }
}

/** Split newline-delimited `print -l` output, dropping empty lines. */
export function splitLines(stdout: string): readonly string[] {
  return stdout.split("\n").filter(Boolean)
}

export interface ZshError {
  readonly line: number
  readonly msg: string
}

/** Parse common zsh syntax-check stderr into a line/message pair. */
export function parseZshError(stderr: string): ZshError | undefined {
  if (!stderr.trim()) return undefined
  const m = stderr.match(/^(?:\/dev\/stdin|zsh):(\d+):\s*(.+)$/m)
  if (m) return { line: Number(m[1]), msg: m[2] ?? "" }
  return { line: 1, msg: stderr.trim() }
}
