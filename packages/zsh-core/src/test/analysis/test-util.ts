import type { DocLike } from "../../analysis/facts"

export function mockDoc(lines: readonly string[]): DocLike {
  return {
    lineAt: (i: number) => ({ text: lines[i] ?? "" }),
    lineCount: lines.length,
  }
}

export function doc(text: string): DocLike {
  return mockDoc(text.split("\n"))
}
