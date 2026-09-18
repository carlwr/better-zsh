import type { TextDoc } from "../../analysis/facts"

export function mockDoc(lines: readonly string[]): TextDoc {
  return {
    lineAt: (i: number) => ({ text: lines[i] ?? "" }),
    lineCount: lines.length,
  }
}

export function doc(text: string): TextDoc {
  return mockDoc(text.split("\n"))
}
