/** Pure request builders and response parsers for talking to a zsh process. */
import type { ZshRunReq } from "./zsh-exec"

/** Base args for all zsh invocations: `-f` (NO_RCS) to skip user rc files. */
const ZSH_BASE_ARGS = ["-f"] as const

// Read all of stdin, then (Z+Cn+): split into shell tokens (Z), treating
// newlines as tokens (C) and keeping null tokens from adjacent delimiters (n)
// — one token per output line. Stdin, not an env var: Linux caps a single
// env string at 128 KiB.
const TOKENIZE_SCRIPT = `\
emulate -LR zsh
IFS= read -rd '' SRC
print -l -- "\${(Z+Cn+)SRC}"\
`

/** Ask zsh to print its version banner. */
export const versionReq: ZshRunReq = { args: ["--version"] }

/**
 * Syntax-check `text` without executing it (`zsh -n`). A file, not stdin:
 * zsh reports line numbers for named scripts only, and `/dev/stdin` cannot
 * stand in — Node's child stdio is a socket, which Linux will not reopen.
 */
export function syntaxCheckReq(text: string): ZshRunReq {
  return { args: [...ZSH_BASE_ARGS, "-n"], scriptFile: text }
}

/** Tokenize `text` via a live zsh under `emulate -LR zsh`. */
export function tokenizeReq(text: string): ZshRunReq {
  return { args: [...ZSH_BASE_ARGS, "-c", TOKENIZE_SCRIPT], stdin: text }
}

/** Split newline-delimited `print -l` output, dropping empty lines. */
export function splitLines(stdout: string): readonly string[] {
  return stdout.split("\n").filter(Boolean)
}

export interface ZshError {
  readonly line: number
  readonly msg: string
}

/** Parse zsh's `<script>:<line>: <msg>` stderr; anything else lands on line 1. */
export function parseZshError(stderr: string): ZshError | undefined {
  if (!stderr.trim()) return undefined
  const m = stderr.match(/^.*?:(\d+):\s*(.+)$/m)
  if (m) return { line: Number(m[1]), msg: m[2] ?? "" }
  return { line: 1, msg: stderr.trim() }
}
