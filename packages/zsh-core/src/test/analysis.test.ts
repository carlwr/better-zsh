import { describe, expect, test } from "vitest"
import {
  analyzeDoc,
  cmdHeadFactsOnLine,
  factsAt,
  factText,
  isCtxFact,
  isFuncDeclFact,
  isPrecmdFact,
} from "../analysis"

function mockDoc(lines: string[]) {
  return {
    lineAt: (i: number) => ({ text: lines[i] ?? "" }),
    lineCount: lines.length,
  }
}

function expectCmdHeadTexts(s: string, xs: string[]): void {
  const facts = cmdHeadFactsOnLine(s)
  expect(
    facts.filter((f) => f.kind === "cmd-head").map((f) => f.text),
  ).toEqual(xs)
}

function expectPrecmdNames(s: string, xs: string[]): void {
  const facts = cmdHeadFactsOnLine(s)
  expect(facts.filter(isPrecmdFact).map((f) => f.name)).toEqual(xs)
}

function expectPrecmdTexts(s: string, xs: string[]): void {
  const facts = cmdHeadFactsOnLine(s)
  expect(facts.filter(isPrecmdFact).map((f) => f.text)).toEqual(xs)
}

describe("command/precommand analysis", () => {
  test("finds command head on plain line", () => {
    expectCmdHeadTexts("echo hi", ["echo"])
  })

  test("treats precommand modifiers separately from command head", () => {
    const s = "noglob command echo hi"
    expectPrecmdNames(s, ["noglob", "command"])
    expectPrecmdTexts(s, ["noglob", "command"])
    expectCmdHeadTexts(s, ["echo"])
  })

  test("keeps builtin head after builtin precommand modifier", () => {
    const s = "builtin read var"
    expectPrecmdNames(s, ["builtin"])
    expectCmdHeadTexts(s, ["read"])
  })

  test("command with flags does not claim lookup target is executed command", () => {
    const s = "command -v echo"
    expectPrecmdNames(s, ["command"])
    expectCmdHeadTexts(s, [])
  })

  test("exec -a skips argv0 and finds command head", () => {
    const s = "exec -a demo zsh -f"
    expectPrecmdNames(s, ["exec"])
    expectCmdHeadTexts(s, ["zsh"])
  })
})

describe("document facts", () => {
  test("reports cond context and precommand facts on the same line", () => {
    const doc = mockDoc(["if noglob [ -f $file ]; then"])
    const got = analyzeDoc(doc)
    expect(got.filter(isCtxFact).map((f) => f.ctx)).toContain("cond")
    expect(got.filter(isPrecmdFact).map((f) => f.name)).toContain("noglob")
  })

  test("reports function declaration facts", () => {
    const doc = mockDoc(["alpha() {", "  echo hi", "}"])
    const fact = analyzeDoc(doc).find(isFuncDeclFact)
    expect(fact).toBeTruthy()
    expect(fact?.name).toBe("alpha")
    expect(fact && factText(doc, fact.nameSpan)).toBe("alpha")
  })

  test("setopt context tracks command head after builtin modifier", () => {
    const doc = mockDoc(["builtin setopt extended_glob"])
    const got = factsAt(doc, 0, 18)
    expect(got.filter(isCtxFact).map((f) => f.ctx)).toContain("setopt")
  })
})
