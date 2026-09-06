import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  analyzeDoc,
  factText,
  isQuotedRegionFact,
  type QuotedRegionFact,
  quotedRegionFacts,
} from "../../analysis/facts"
import { doc, mockDoc } from "./test-util"

function texts(lines: readonly string[]): string[] {
  const text = lines.join("\n")
  return quotedRegionFacts(lines).map(fact =>
    text.slice(fact.span.start, fact.span.end),
  )
}

function quoted(lines: readonly string[]): QuotedRegionFact[] {
  return analyzeDoc(mockDoc(lines)).filter(isQuotedRegionFact)
}

function assertQuotedInvariants(lines: readonly string[]): void {
  const text = lines.join("\n")
  const facts = quotedRegionFacts(lines)

  for (const fact of facts) {
    expect(fact.span.start).toBeGreaterThanOrEqual(0)
    expect(fact.span.end).toBeLessThanOrEqual(text.length)
    expect(fact.span.start).toBeLessThan(fact.span.end)
    expect(text[fact.span.start]).toBe(fact.quote)
    expect(text[fact.span.end - 1]).toBe(fact.quote)
    expect(text.slice(fact.span.start, fact.span.end).includes("\n")).toBe(
      fact.multiline,
    )
  }

  for (let i = 1; i < facts.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee presence
    expect(facts[i - 1]!.span.end).toBeLessThanOrEqual(facts[i]!.span.start)
  }
}

describe("quotedRegionFacts", () => {
  test.each([
    [["print 'hi'"], ["'hi'"]],
    [['print "hi"'], ['"hi"']],
    [['varName="', "lines", "more lines", '"'], ['"\nlines\nmore lines\n"']],
    [
      ['<<< "', "print shop", "other establishments", '"'],
      ['"\nprint shop\nother establishments\n"'],
    ],
    [
      ['printingFunction -u2 "', "print to stderr is enabled.", '"'],
      ['"\nprint to stderr is enabled.\n"'],
    ],
    [['print "body"; echo after'], ['"body"']],
    [["a=1 'two' \"three\""], ["'two'", '"three"']],
    [["b='\"'"], ["'\"'"]],
    [['c="a double quote: "\'"\'"."'], ['"a double quote: "', "'\"'", '"."']],
    [['d=\\\\" - a slash."'], ['" - a slash."']],
  ])("%j", (lines, want) => {
    expect(texts(lines)).toEqual(want)
  })

  test.each(['a=\\"', 'print "unterminated', 'print "$(echo "'])(
    "omits unsupported or unclosed candidate: %j",
    line => {
      expect(texts([line])).toEqual([])
    },
  )

  test("recovers after unsupported but closed command substitutions", () => {
    expect(texts(['print "$(echo "inner")"', 'print "after"'])).toEqual([
      '"after"',
    ])
  })

  test("does not start quoted regions inside comments", () => {
    expect(texts(['print ok # "not code"'])).toEqual([])
  })

  test("records quote style and multiline flag", () => {
    expect(
      quoted(["'a'", '"', "b", '"']).map(fact => [fact.quote, fact.multiline]),
    ).toEqual([
      ["'", false],
      ['"', true],
    ])
  })

  test("fact text uses document offsets", () => {
    const source = doc('print "a"\nprint "b"')
    expect(
      analyzeDoc(source)
        .filter(isQuotedRegionFact)
        .map(fact => factText(source, fact.span)),
    ).toEqual(['"a"', '"b"'])
  })

  test("never throws and emits valid non-overlapping spans", () => {
    const chars = " \t#'\"\\abcdefghijklmnopqrstuvwxyz0123456789$`(){}\n"
    const charArb = fc.mapToConstant(
      ...chars.split("").map(ch => ({ num: 1, build: () => ch })),
    )
    fc.assert(
      fc.property(fc.array(charArb, { maxLength: 120 }), chars => {
        assertQuotedInvariants(chars.join("").split("\n"))
      }),
    )
  })
})
