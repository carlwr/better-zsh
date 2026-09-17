/** Pure request builders and response parsers for talking to a zsh process. */
import type { ZshRunReq } from "./exec"

/** Base args for all zsh invocations: `-f` (NO_RCS) to skip user rc files. */
const ZSH_BASE_ARGS = ["-f"] as const

/**
 * Syntax-check `text` without executing it (`zsh -n`). A file, not stdin:
 * zsh reports line numbers for named scripts only, and `/dev/stdin` cannot
 * stand in — Node's child stdio is a socket, which Linux will not reopen.
 */
export function syntaxCheckReq(text: string): ZshRunReq {
  return { args: [...ZSH_BASE_ARGS, "-n"], scriptFile: text }
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
