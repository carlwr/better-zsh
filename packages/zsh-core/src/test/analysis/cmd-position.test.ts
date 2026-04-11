import { describe, expect, test } from "vitest"
import { cmdPositions } from "../../analysis/cmd-position"
import { isCmdHeadFact } from "../../analysis/fact-types"
import { cmdHeadFactsOnLine } from "../../analysis/facts"

function factSpans(line: string, commentAt?: number) {
  return cmdHeadFactsOnLine(line, commentAt)
    .filter(isCmdHeadFact)
    .map((fact) => fact.span)
}

describe("cmdPositions", () => {
  test("returns bare command-head spans", () => {
    expect(cmdPositions("  echo hi")).toEqual([{ start: 2, end: 6 }])
  })

  test("respects an explicit comment boundary", () => {
    const line = "echo hi # fg"
    expect(cmdPositions(line, line.indexOf("#"))).toEqual([
      { start: 0, end: 4 },
    ])
  })

  for (const line of ["! echo hi", "2>&1 echo hi | fg"]) {
    test(`stays aligned with command-head facts for ${line}`, () => {
      expect(cmdPositions(line)).toEqual(factSpans(line))
    })
  }
})
