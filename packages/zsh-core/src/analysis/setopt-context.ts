import { mkCandidate } from "../docs/types.ts"
import {
  activeText,
  continuedLineBlock,
  continuedText,
  type DocLike,
  readLines,
} from "./doc.ts"
import { firstCmdHeadOnLine } from "./line-facts.ts"
import { isSetoptCommandText } from "./setopt-cmd.ts"

/**
 * Lightweight setopt/unsetopt position check (line-local, no full-doc analysis).
 * Handles line continuations (trailing backslash).
 *
 * For richer context detection, use {@link syntacticContext} from `context.ts`,
 * which builds on the fact-based analysis pipeline.
 */
export function isSetoptContext(doc: DocLike, line: number): boolean {
  const lines = readLines(doc)
  const block = continuedLineBlock(lines, line)
  const head = firstCmdHeadOnLine(activeText(lines[block.start] ?? ""))
  if (!head || head.precmds.includes(mkCandidate("precmd", "command")))
    return false
  const text = continuedText(lines, block.start, block.end)
  return isSetoptCommandText(text.slice(head.span.start))
}
