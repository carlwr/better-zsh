import type { DocLike } from "../analysis"

export function mockDoc(lines: string[]): DocLike {
  return {
    lineAt: (i: number) => ({ text: lines[i] ?? "" }),
    lineCount: lines.length,
  }
}
