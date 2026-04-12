import { commentStart } from "../comment.ts"

/** Minimal line abstraction for line-based analysis (compatible with VS Code TextDocument). */
export interface DocLine {
  readonly text: string
}

/** Minimal document abstraction for line-based analysis (compatible with VS Code TextDocument). */
export interface DocLike {
  lineAt(i: number): DocLine
  readonly lineCount: number
}

/** Half-open text span in absolute document offsets. */
export interface TextSpan {
  readonly start: number
  readonly end: number
}

export function activeText(line: string): string {
  const cut = commentStart(line) ?? line.length
  return line.slice(0, cut)
}

export function readLines(doc: DocLike): readonly string[] {
  const out: string[] = []
  for (let i = 0; i < doc.lineCount; i++) out.push(doc.lineAt(i).text)
  return out
}

// Each line separator counts as 1 char (\r\n not supported — intentional).
export function lineStarts(lines: readonly string[]): readonly number[] {
  const out: number[] = []
  let off = 0
  for (const line of lines) {
    out.push(off)
    off += line.length + 1
  }
  return out
}

export function absSpan(base: number, span: TextSpan): TextSpan {
  return { start: base + span.start, end: base + span.end }
}

export function hasOffset(
  span: TextSpan,
  off: number,
  inclusiveEnd = false,
): boolean {
  return inclusiveEnd
    ? span.start <= off && off <= span.end
    : span.start <= off && off < span.end
}

export function factText(doc: DocLike, span: TextSpan): string {
  return readLines(doc).join("\n").slice(span.start, span.end)
}

/** Join continuation lines: strips trailing `\`, trims each piece, joins with space. */
export function continuedText(
  lines: readonly string[],
  start: number,
  end: number,
): string {
  return lines
    .slice(start, end + 1)
    .map((line) =>
      activeText(line)
        .replace(/\\\s*$/, "")
        .trim(),
    )
    .join(" ")
    .trim()
}

export function continuedLineBlock(
  lines: readonly string[],
  line: number,
): { start: number; end: number } {
  let start = line
  while (start > 0 && (lines[start - 1] ?? "").trimEnd().endsWith("\\")) start--

  let end = line
  while ((lines[end] ?? "").trimEnd().endsWith("\\")) end++

  return { start, end }
}
