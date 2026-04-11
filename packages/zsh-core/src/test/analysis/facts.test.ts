import fc from "fast-check"
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
  type LineFact,
} from "../../analysis/facts"
import { mockDoc } from "./test-util"

function cmdTexts(line: string): string[] {
  return cmdHeadFactsOnLine(line)
    .filter((fact) => fact.kind === "cmd-head")
    .map((fact) => fact.text)
}

function redirTexts(line: string): string[] {
  return cmdHeadFactsOnLine(line)
    .filter(isRedirFact)
    .map((fact) => fact.text)
}

function rwTexts(line: string): string[] {
  return cmdHeadFactsOnLine(line)
    .filter(isReservedWordFact)
    .map((fact) => fact.text)
}

function assertFactInvariants(line: string, facts: LineFact[]): void {
  for (const fact of facts) {
    expect(fact.span.start).toBeGreaterThanOrEqual(0)
    expect(fact.span.end).toBeLessThanOrEqual(line.length)
    expect(fact.span.start).toBeLessThan(fact.span.end)
    if ("text" in fact) {
      expect(line.slice(fact.span.start, fact.span.end)).toBe(fact.text)
    }
  }

  const sorted = [...facts].sort((a, b) => a.span.start - b.span.start)
  for (let i = 1; i < sorted.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee presence
    const prev = sorted[i - 1]!,
      // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee presence
      curr = sorted[i]!
    expect(prev.span.end).toBeLessThanOrEqual(curr.span.start)
  }
}

describe("command/precommand analysis", () => {
  const cases: [string, string[], string?][] = [
    ["echo hi", ["echo"]],
    ["  echo hi", ["echo"]],
    ["echo x; fg", ["echo", "fg"]],
    ["echo x && fg", ["echo", "fg"]],
    ["echo x || fg", ["echo", "fg"]],
    ["echo x | fg | bg", ["echo", "fg", "bg"]],
    ["(echo hi)", ["echo"]],
    ["{ echo hi }", ["echo"]],
    ["f() uname", ["uname"], "func definition body"],
    ["! echo hi", ["echo"], "negation"],
    ["time echo hi", ["echo"], "time reserved word"],
    ["if echo; then fg; fi", ["echo", "fg"]],
    ["while echo; do fg; done", ["echo", "fg"]],
    ["for x in a; do echo; done", ["echo"]],
    ["echo hi # fg", ["echo"], "comment stops scan"],
    [">&2 echo hi", ["echo"], "redir before command"],
    ["2>&1 echo hi", ["echo"], "fd redir before command"],
    ["echo a > file", ["echo"], "redir does not create a new command"],
    [
      "print ${var[(a)1]} ${var[(r)1]} ${var[(s)1]}",
      ["print"],
      "parameter expansion flags stay inside words",
    ],
    ["print ${(j:_:)SECONDS}", ["print"], "joined expansion stays in one word"],
    [
      "print ${${:-x}[(r)1]}",
      ["print"],
      "nested parameter expansions stay inside words",
    ],
  ]

  for (const [input, expected, desc] of cases) {
    test(desc ?? input, () => expect(cmdTexts(input)).toEqual(expected))
  }

  test("precommand modifiers before command head", () => {
    const line = "noglob command echo hi"
    const facts = cmdHeadFactsOnLine(line)
    expect(facts.filter(isPrecmdFact).map((fact) => fact.name)).toEqual([
      "noglob",
      "command",
    ])
    expect(cmdTexts(line)).toEqual(["echo"])
  })

  test("builtin precommand keeps builtin head", () => {
    expect(cmdTexts("builtin read var")).toEqual(["read"])
  })

  test("command -v suppresses command head", () => {
    expect(cmdTexts("command -v echo")).toEqual([])
  })

  test("exec -a skips argv0", () => {
    expect(cmdTexts("exec -a demo zsh -f")).toEqual(["zsh"])
  })
})

// Known limitations — not yet handled, recorded for future improvement.
// Move to active test cases when the heuristic is extended.
//
// - Subshell command substitution: $(echo hi) — the echo inside $() is in cmd position
// - Backtick substitution: `echo hi`
// - Multi-line: while ...\n do — "do" on next line resets cmd position (line-local heuristic)

describe("arithmetic condition handling", () => {
  const cases: [string, string[]][] = [
    ["if ((1)) echo", ["echo"]],
    ["if ((1)) { echo }", ["echo"]],
    ["if ((1)) { echo; }", ["echo"]],
    ["while ((1)) { fc; }", ["fc"]],
    ["until ((1)) fc", ["fc"]],
    ["if ((x > 0)); then echo; fi", ["echo"]],
    ["if ((a + b)) && ((c)) echo", ["echo"]],
  ]

  for (const [input, expected] of cases) {
    test(input, () => expect(cmdTexts(input)).toEqual(expected))
  }

  test("emits (( and )) as reserved-word facts", () => {
    const rws = rwTexts("if ((1)) echo")
    expect(rws).toContain("((")
    expect(rws).toContain("))")
  })

  test("standalone (( )) emits delimiter facts", () => {
    expect(rwTexts("(( x++ ))")).toEqual(["((", "))"])
  })
})

describe("redirection facts", () => {
  const cases: [string, string[]][] = [
    ["echo hi > file", [">"]],
    ["cat >> log", [">>"]],
    ["echo hi &> /dev/null", ["&>"]],
    ["echo hi &>> log", ["&>>"]],
    ["echo hi >&2", [">&"]],
    ["echo hi 2>&1", ["2>&"]],
    ["cat < in", ["<"]],
    ["cat <<< word", ["<<<"]],
    ["cat << EOF", ["<<"]],
    ["echo 2>&1 > file", ["2>&", ">"]],
  ]

  for (const [input, expected] of cases) {
    test(input, () => expect(redirTexts(input)).toEqual(expected))
  }

  test("no redir inside single quotes", () => {
    expect(redirTexts("echo '>'")).toEqual([])
  })

  test("no redir inside double quotes", () => {
    expect(redirTexts('echo ">"')).toEqual([])
  })
})

describe("process substitution facts", () => {
  const cases: [string, string[]][] = [
    ["diff <(a) <(b)", ["<(a)", "<(b)"]],
    ["cat >(tee log)", [">(tee log)"]],
  ]

  for (const [input, expected] of cases) {
    test(input, () => {
      expect(
        cmdHeadFactsOnLine(input)
          .filter(isProcessSubstFact)
          .map((fact) => fact.text),
      ).toEqual(expected)
    })
  }

  test("no process substitution inside quotes", () => {
    expect(
      cmdHeadFactsOnLine('echo ">(foo)"').filter(isProcessSubstFact),
    ).toHaveLength(0)
  })
})

describe("reserved word facts", () => {
  test("if/then/fi", () => {
    expect(rwTexts("if foo; then bar; fi")).toEqual(["if", "then", "fi"])
  })

  test("for/do/done", () => {
    const rws = rwTexts("for x in a b; do echo; done")
    expect(rws).toContain("for")
    expect(rws).toContain("do")
    expect(rws).toContain("done")
  })

  test("{ and } are reserved words", () => {
    expect(rwTexts("{ echo; }")).toContain("{")
  })

  test("while/until", () => {
    expect(rwTexts("while true; do echo; done")).toContain("while")
    expect(rwTexts("until false; do echo; done")).toContain("until")
  })

  test("[[", () => {
    expect(rwTexts("[[ -f x ]]")).toContain("[[")
  })
})

describe("document facts", () => {
  test("cond context and precommand on same line", () => {
    const doc = mockDoc(["if noglob [ -f $file ]; then"])
    const facts = analyzeDoc(doc)
    expect(facts.filter(isCtxFact).map((fact) => fact.ctx)).toContain("cond")
    expect(facts.filter(isPrecmdFact).map((fact) => fact.name)).toContain(
      "noglob",
    )
  })

  test("function declaration facts", () => {
    const doc = mockDoc(["alpha() {", "  echo hi", "}"])
    const fact = analyzeDoc(doc).find(isFuncDeclFact)
    expect(fact).toBeTruthy()
    expect(fact?.name).toBe("alpha")
    expect(fact && factText(doc, fact.nameSpan)).toBe("alpha")
  })

  test("setopt context after builtin modifier", () => {
    const doc = mockDoc(["builtin setopt extended_glob"])
    const facts = factsAt(doc, 0, 18)
    expect(facts.filter(isCtxFact).map((fact) => fact.ctx)).toContain("setopt")
  })
})

describe("cmdHeadFactsOnLine invariants", () => {
  const SHELL_CHARS =
    " \t;|&(){}><'\"\\#abcdefghijklmnopqrstuvwxyz0123456789$!_-=+"
  const shellCharArb = fc.mapToConstant(
    ...SHELL_CHARS.split("").map((ch) => ({ num: 1, build: () => ch })),
  )
  const lineArb = fc
    .array(shellCharArb, { maxLength: 120 })
    .map((chars) => chars.join(""))

  test("never throws", () => {
    fc.assert(
      fc.property(lineArb, (line) => {
        expect(() => cmdHeadFactsOnLine(line)).not.toThrow()
      }),
    )
  })

  test("emits non-overlapping facts with valid spans", () => {
    fc.assert(
      fc.property(lineArb, (line) => {
        assertFactInvariants(line, cmdHeadFactsOnLine(line))
      }),
    )
  })
})
