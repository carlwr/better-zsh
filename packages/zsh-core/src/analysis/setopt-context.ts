import {
  activeText,
  continuedLineBlock,
  continuedText,
  type DocLike,
  readLines,
} from "./doc.ts"
import { COMMAND_PRECMD, firstCmdHeadOnLine } from "./line-facts.ts"
import { isSetoptCommandText } from "./setopt-cmd.ts"

/**
 * Line-local setopt/unsetopt position check; handles trailing-`\` continuations.
 * For fact-pipeline-based context detection, use {@link syntacticContext} (`context.ts`).
 */
export function isSetoptContext(doc: DocLike, line: number): boolean {
  const lines = readLines(doc)
  const block = continuedLineBlock(lines, line)
  const head = firstCmdHeadOnLine(activeText(lines[block.start] ?? ""))
  if (!head || head.precmds.includes(COMMAND_PRECMD)) return false
  const text = continuedText(lines, block.start, block.end)
  return isSetoptCommandText(text.slice(head.span.start))
}
