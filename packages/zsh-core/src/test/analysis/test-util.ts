import type { DocLike } from "../../analysis/facts"

export function mockDoc(lines: readonly string[]): DocLike {
  return {
    lineAt: (i: number) => ({ text: lines[i] ?? "" }),
    lineCount: lines.length,
  }
}
