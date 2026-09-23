import * as fcu from "@carlwr/fastcheck-utils"
import { isNonEmpty } from "@carlwr/typescript-extra"
import fc from "fast-check"
import { type TextDoc, textDoc } from "../../analysis/facts"

export const mockDoc = (lines: readonly string[]): TextDoc =>
  textDoc(lines.join("\n"))

/** Strings drawn from the characters of `chars`. */
export function stringOver(chars: string, maxLength: number) {
  const units = [...chars]
  if (!isNonEmpty(units)) throw new RangeError("stringOver: no characters")
  return fc.string({ unit: fcu.element(units), maxLength })
}
