import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { commentStart } from "../../analysis/comment"
import {
  analyzeDoc,
  factText,
  isQuotedRegionFact,
  type QuotedRegionFact,
  textDoc,
} from "../../analysis/facts"
import { quotedRegionFacts } from "../../analysis/quoted-region"
import {
  commentyLine,
  expectOrderedSpans,
  mockDoc,
  stringOver,
} from "./test-util"

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

  expectOrderedSpans(
    facts.map(f => f.span),
    text.length,
  )
  for (const fact of facts) {
    expect(text[fact.span.start]).toBe(fact.quote)
    expect(text[fact.span.end - 1]).toBe(fact.quote)
    expect(text.slice(fact.span.start, fact.span.end).includes("\n")).toBe(
      fact.multiline,
    )
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
    const source = textDoc('print "a"\nprint "b"')
    expect(
      analyzeDoc(source)
        .filter(isQuotedRegionFact)
        .map(fact => factText(source, fact.span)),
    ).toEqual(['"a"', '"b"'])
  })

  test("never throws and emits valid non-overlapping spans", () => {
    const chars = " \t#'\"\\abcdefghijklmnopqrstuvwxyz0123456789$`(){}\n"
    fc.assert(
      fc.property(stringOver(chars, 120), text => {
        assertQuotedInvariants(text.split("\n"))
      }),
    )
  })

  test("no comment starts inside a quoted region", () => {
    const cov = fcu.coverage({ commentAndQuoted: 5 })
    fc.assert(
      fc.property(commentyLine, line => {
        const i = commentStart(line)
        if (i === undefined) return
        const facts = quotedRegionFacts([line])
        if (facts.length > 0) cov.hit("commentAndQuoted")
        for (const { span } of facts)
          expect(i < span.start || i >= span.end).toBe(true)
      }),
      { plugins: [cov.plugin] },
    )
  })
})
