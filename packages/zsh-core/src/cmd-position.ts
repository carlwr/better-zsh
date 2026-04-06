import { cmdHeadFactsOnLine } from "./analysis.ts"

export interface CmdPos {
  start: number
  end: number
}

/** Find command-head token spans on a line, excluding comments. */
export function cmdPositions(line: string, commentAt?: number): CmdPos[] {
  return cmdHeadFactsOnLine(line, commentAt)
    .filter((fact) => fact.kind === "cmd-head")
    .map((fact) => ({ start: fact.span.start, end: fact.span.end }))
}
