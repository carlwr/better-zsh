import { cmdHeadFactsOnLine } from "./facts.ts"

/** Character span of a command-head token on a line (0-based offsets within the line). */
export interface CmdPos {
  readonly start: number
  readonly end: number
}

/** Find command-head token spans on a line, excluding comments. */
export function cmdPositions(
  line: string,
  commentAt?: number,
): readonly CmdPos[] {
  return cmdHeadFactsOnLine(line, commentAt)
    .filter((fact) => fact.kind === "cmd-head")
    .map((fact) => ({ start: fact.span.start, end: fact.span.end }))
}
