import {
  activeText,
  continuedLineBlock,
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
  if (!head || head.precmds.includes("command")) return false
  const text = lines
    .slice(block.start, block.end + 1)
    .map((text) =>
      activeText(text)
        .replace(/\\\s*$/, "")
        .trim(),
    )
    .join(" ")
    .trim()
  return isSetoptCommandText(text.slice(head.span.start))
}
