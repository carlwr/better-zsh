import { type TextDoc, textDoc } from "../../analysis/facts"

export const mockDoc = (lines: readonly string[]): TextDoc =>
  textDoc(lines.join("\n"))
