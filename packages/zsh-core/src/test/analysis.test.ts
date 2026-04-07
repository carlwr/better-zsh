import { describe, expect, test } from "vitest"
import {
  analyzeDoc,
  cmdHeadFactsOnLine,
  factsAt,
  factText,
  isCtxFact,
  isFuncDeclFact,
  isPrecmdFact,
  isProcessSubstFact,
  isRedirFact,
  isReservedWordFact,
} from "../analysis"
import { mockDoc } from "./test-util"

function expectCmdHeadTexts(s: string, xs: string[]): void {
  const facts = cmdHeadFactsOnLine(s)
  expect(facts.filter((f) => f.kind === "cmd-head").map((f) => f.text)).toEqual(
    xs,
  )
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

describe("redirection facts", () => {
  test("emits redir fact for >", () => {
    const facts = cmdHeadFactsOnLine("echo hi > file")
    const redirs = facts.filter(isRedirFact)
    expect(redirs).toHaveLength(1)
    expect(redirs[0]?.text).toBe(">")
  })

  test("emits redir fact for >>", () => {
    const facts = cmdHeadFactsOnLine("cat >> log")
    const redirs = facts.filter(isRedirFact)
    expect(redirs).toHaveLength(1)
    expect(redirs[0]?.text).toBe(">>")
  })

  test("does not emit redir for > inside quotes", () => {
    const facts = cmdHeadFactsOnLine("echo '>'")
    expect(facts.filter(isRedirFact)).toHaveLength(0)
  })
})

describe("process substitution facts", () => {
  test("emits two process-subst facts for diff <(cmd1) <(cmd2)", () => {
    const facts = cmdHeadFactsOnLine("diff <(cmd1) <(cmd2)")
    const ps = facts.filter(isProcessSubstFact)
    expect(ps).toHaveLength(2)
    expect(ps[0]?.text).toBe("<(cmd1)")
    expect(ps[1]?.text).toBe("<(cmd2)")
  })

  test("emits process-subst fact for >(tee log)", () => {
    const facts = cmdHeadFactsOnLine("cat >(tee log)")
    const ps = facts.filter(isProcessSubstFact)
    expect(ps).toHaveLength(1)
    expect(ps[0]?.text).toBe(">(tee log)")
  })

  test("no process-subst fact inside quotes", () => {
    const facts = cmdHeadFactsOnLine('echo ">(foo)"')
    expect(facts.filter(isProcessSubstFact)).toHaveLength(0)
  })
})

describe("reserved word facts", () => {
  test("emits reserved-word facts for if/then/fi", () => {
    const facts = cmdHeadFactsOnLine("if foo; then bar; fi")
    const rws = facts.filter(isReservedWordFact).map((f) => f.text)
    expect(rws).toContain("if")
    expect(rws).toContain("then")
    expect(rws).toContain("fi")
  })

  test("emits reserved-word facts for for/do/done", () => {
    const facts = cmdHeadFactsOnLine("for x in a b; do echo; done")
    const rws = facts.filter(isReservedWordFact).map((f) => f.text)
    expect(rws).toContain("for")
    expect(rws).toContain("do")
    expect(rws).toContain("done")
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
