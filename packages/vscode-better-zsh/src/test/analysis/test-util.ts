import * as fcu from "@carlwr/fastcheck-utils"
import { isNonEmpty } from "@carlwr/typescript-extra"
import fc from "fast-check"
import { expect } from "vitest"
import { type TextDoc, type TextSpan, textDoc } from "../../analysis/facts"

export const mockDoc = (lines: readonly string[]): TextDoc =>
  textDoc(lines.join("\n"))

/** Each span is non-empty; together they lie in `[0, len]`, disjoint and ascending. */
export function expectOrderedSpans(spans: readonly TextSpan[], len: number) {
  for (const s of spans) expect(s.start).toBeLessThan(s.end)
  const bounds = [0, ...spans.flatMap(s => [s.start, s.end]), len]
  expect(bounds).toEqual([...bounds].sort((a, b) => a - b))
}

/** Strings drawn from the characters of `chars`. */
export function stringOver(chars: string, maxLength: number) {
  const units = [...chars]
  if (!isNonEmpty(units)) throw new RangeError("stringOver: no characters")
  return fc.string({ unit: fcu.element(units), maxLength })
}

/** Space-joined shell tokens dense in `#` and quotes: comments and quoted regions both occur often. */
export const commentyLine = fc
  .array(
    fcu.element([
      "a",
      "#",
      "#x",
      "a#b",
      "$#",
      "${#}",
      "(#",
      "'a #b'",
      '"a #b"',
      "$'#'",
      "\\#",
      "'",
      '"',
      ";",
    ]),
    { maxLength: 6 },
  )
  .map(ws => ws.join(" "))
