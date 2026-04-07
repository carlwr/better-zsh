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
} from "../analysis"
import { mockDoc } from "./test-util"

function cmdTexts(s: string): string[] {
  return cmdHeadFactsOnLine(s)
    .filter((f) => f.kind === "cmd-head")
    .map((f) => f.text)
}

function redirTexts(s: string): string[] {
  return cmdHeadFactsOnLine(s)
    .filter(isRedirFact)
    .map((f) => f.text)
}

function rwTexts(s: string): string[] {
  return cmdHeadFactsOnLine(s)
    .filter(isReservedWordFact)
    .map((f) => f.text)
}

// ---------------------------------------------------------------------------
// Invariant helpers
// ---------------------------------------------------------------------------

function assertFactInvariants(line: string, facts: LineFact[]): void {
  for (const f of facts) {
    expect(f.span.start).toBeGreaterThanOrEqual(0)
    expect(f.span.end).toBeLessThanOrEqual(line.length)
    expect(f.span.start).toBeLessThan(f.span.end)
    if ("text" in f) {
      expect(line.slice(f.span.start, f.span.end)).toBe(f.text)
    }
  }
  // Spans must not overlap (they may abut).
  const sorted = [...facts].sort((a, b) => a.span.start - b.span.start)
  for (let i = 1; i < sorted.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee presence
    const prev = sorted[i - 1]!,
      // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee presence
      curr = sorted[i]!
    expect(prev.span.end).toBeLessThanOrEqual(curr.span.start)
  }
}

// ---------------------------------------------------------------------------
// Command / precommand analysis
// ---------------------------------------------------------------------------

describe("command/precommand analysis", () => {
  const cases: [string, string[], string?][] = [
    ["echo hi", ["echo"]],
    ["  echo hi", ["echo"]],
    ["echo x; fg", ["echo", "fg"]],
    ["echo x && fg", ["echo", "fg"]],
    ["echo x || fg", ["echo", "fg"]],
    ["echo x | fg", ["echo", "fg"]],
    ["echo x | fg | bg", ["echo", "fg", "bg"]],
    ["(echo hi)", ["echo"]],
    ["{ echo hi }", ["echo"]],
    ["f() uname", ["uname"], "func definition body"],
    ["! echo hi", ["echo"], "negation"],
    ["time echo hi", ["echo"], "time reserved word"],
    ["if echo; then fg; fi", ["echo", "fg"]],
    ["while echo; do fg; done", ["echo", "fg"]],
    ["for x in a; do echo; done", ["echo"]],
  ]

  for (const [input, expected, desc] of cases) {
    test(desc ?? input, () => expect(cmdTexts(input)).toEqual(expected))
  }

  test("precommand modifiers before command head", () => {
    const s = "noglob command echo hi"
    const facts = cmdHeadFactsOnLine(s)
    expect(facts.filter(isPrecmdFact).map((f) => f.name)).toEqual([
      "noglob",
      "command",
    ])
    expect(cmdTexts(s)).toEqual(["echo"])
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

// ---------------------------------------------------------------------------
// Arithmetic conditions: ((..))
// ---------------------------------------------------------------------------

describe("arithmetic condition handling", () => {
  const cases: [string, string[]][] = [
    ["if ((1)) echo", ["echo"]],
    ["if ((1)) { echo; }", ["echo"]],
    ["if ((1)) { echo }", ["echo"]],
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
    const rws = rwTexts("(( x++ ))")
    expect(rws).toEqual(["((", "))"])
  })
})

// ---------------------------------------------------------------------------
// Redirections
// ---------------------------------------------------------------------------

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

  test("multiple redirections on one line", () => {
    expect(redirTexts("echo 2>&1 > file")).toEqual(["2>&", ">"])
  })
})

// ---------------------------------------------------------------------------
// Process substitution
// ---------------------------------------------------------------------------

describe("process substitution facts", () => {
  test("diff <(a) <(b)", () => {
    const ps = cmdHeadFactsOnLine("diff <(a) <(b)").filter(isProcessSubstFact)
    expect(ps.map((f) => f.text)).toEqual(["<(a)", "<(b)"])
  })

  test(">(tee log)", () => {
    const ps = cmdHeadFactsOnLine("cat >(tee log)").filter(isProcessSubstFact)
    expect(ps).toHaveLength(1)
    expect(ps[0]?.text).toBe(">(tee log)")
  })

  test("no process-subst inside quotes", () => {
    expect(
      cmdHeadFactsOnLine('echo ">(foo)"').filter(isProcessSubstFact),
    ).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Reserved words
// ---------------------------------------------------------------------------

describe("reserved word facts", () => {
  test("if/then/fi", () => {
    const rws = rwTexts("if foo; then bar; fi")
    expect(rws).toEqual(["if", "then", "fi"])
  })

  test("for/do/done", () => {
    const rws = rwTexts("for x in a b; do echo; done")
    expect(rws).toContain("for")
    expect(rws).toContain("do")
    expect(rws).toContain("done")
  })

  test("{ and } are reserved words", () => {
    const rws = rwTexts("{ echo; }")
    expect(rws).toContain("{")
  })

  test("while/until", () => {
    expect(rwTexts("while true; do echo; done")).toContain("while")
    expect(rwTexts("until false; do echo; done")).toContain("until")
  })

  test("[[", () => {
    expect(rwTexts("[[ -f x ]]")).toContain("[[")
  })
})

// ---------------------------------------------------------------------------
// Document-level facts
// ---------------------------------------------------------------------------

describe("document facts", () => {
  test("cond context and precommand on same line", () => {
    const doc = mockDoc(["if noglob [ -f $file ]; then"])
    const got = analyzeDoc(doc)
    expect(got.filter(isCtxFact).map((f) => f.ctx)).toContain("cond")
    expect(got.filter(isPrecmdFact).map((f) => f.name)).toContain("noglob")
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
    const got = factsAt(doc, 0, 18)
    expect(got.filter(isCtxFact).map((f) => f.ctx)).toContain("setopt")
  })

  test("arith condition keeps next command position", () => {
    expect(cmdTexts("if ((1)) echo")).toEqual(["echo"])
    expect(cmdTexts("if ((1)) { echo; }")).toEqual(["echo"])
  })
})

// ---------------------------------------------------------------------------
// Structural invariants (property-based)
// ---------------------------------------------------------------------------

describe("cmdHeadFactsOnLine invariants", () => {
  const SHELL_CHARS =
    " \t;|&(){}><'\"\\#abcdefghijklmnopqrstuvwxyz0123456789$!_-=+"
  const shellCharArb = fc.mapToConstant(
    ...SHELL_CHARS.split("").map((ch) => ({ num: 1, build: () => ch })),
  )
  const lineArb = fc
    .array(shellCharArb, { maxLength: 120 })
    .map((cs) => cs.join(""))

  test("never throws", () => {
    fc.assert(
      fc.property(lineArb, (line) => {
        expect(() => cmdHeadFactsOnLine(line)).not.toThrow()
      }),
    )
  })

  test("spans within bounds and non-overlapping", () => {
    fc.assert(
      fc.property(lineArb, (line) => {
        assertFactInvariants(line, cmdHeadFactsOnLine(line))
      }),
    )
  })

  test("text fields match line slices", () => {
    fc.assert(
      fc.property(lineArb, (line) => {
        for (const f of cmdHeadFactsOnLine(line)) {
          if ("text" in f) {
            expect(line.slice(f.span.start, f.span.end)).toBe(f.text)
          }
        }
      }),
    )
  })
})
