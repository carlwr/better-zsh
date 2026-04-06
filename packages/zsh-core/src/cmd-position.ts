import { cmdHeadFactsOnLine } from "./analysis"

export interface CmdPos {
  start: number
  end: number
}

export function cmdPositions(line: string, commentAt?: number): CmdPos[] {
  return cmdHeadFactsOnLine(line, commentAt)
    .filter((fact) => fact.kind === "cmd-head")
    .map((fact) => ({ start: fact.span.start, end: fact.span.end }))
}
