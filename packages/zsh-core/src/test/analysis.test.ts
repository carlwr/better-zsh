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

describe("command/precommand analysis", () => {
  test("finds command head on plain line", () => {
    const facts = cmdHeadFactsOnLine("echo hi")
    expect(
      facts.filter((f) => f.kind === "cmd-head").map((f) => f.text),
    ).toEqual(["echo"])
  })

  test("treats precommand modifiers separately from command head", () => {
    const facts = cmdHeadFactsOnLine("noglob command echo hi")
    expect(
      facts.filter(isPrecmdFact).map((f) => `${f.name}:${f.text}`),
    ).toEqual(["noglob:noglob", "command:command"])
    expect(
      facts.filter((f) => f.kind === "cmd-head").map((f) => f.text),
    ).toEqual(["echo"])
  })

  test("keeps builtin head after builtin precommand modifier", () => {
    const facts = cmdHeadFactsOnLine("builtin read var")
    expect(facts.filter(isPrecmdFact).map((f) => f.name)).toEqual(["builtin"])
    expect(
      facts.filter((f) => f.kind === "cmd-head").map((f) => f.text),
    ).toEqual(["read"])
  })

  test("command with flags does not claim lookup target is executed command", () => {
    const facts = cmdHeadFactsOnLine("command -v echo")
    expect(facts.filter(isPrecmdFact).map((f) => f.name)).toEqual(["command"])
    expect(facts.filter((f) => f.kind === "cmd-head")).toEqual([])
  })

  test("exec -a skips argv0 and finds command head", () => {
    const facts = cmdHeadFactsOnLine("exec -a demo zsh -f")
    expect(facts.filter(isPrecmdFact).map((f) => f.name)).toEqual(["exec"])
    expect(
      facts.filter((f) => f.kind === "cmd-head").map((f) => f.text),
    ).toEqual(["zsh"])
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
