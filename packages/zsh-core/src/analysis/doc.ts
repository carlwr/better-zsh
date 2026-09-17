import { commentStart } from "./comment.ts"

/** Minimal line abstraction for analysis (compatible with VS Code TextDocument). */
export interface DocLine {
  readonly text: string
}

/** Minimal document abstraction for analysis (compatible with VS Code TextDocument). */
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

/**
 * Offset of each line's first character — the document's offset model: every
 * line separator counts one character (`\r\n` unsupported, by design).
 */
export function lineStarts(doc: DocLike): readonly number[] {
  const out: number[] = []
  let off = 0
  for (let i = 0; i < doc.lineCount; i++) {
    out.push(off)
    off += doc.lineAt(i).text.length + 1
  }
  return out
}

/** Offset of (`line`, `char`) under `starts` (see {@link lineStarts}). */
export function offsetAt(
  starts: readonly number[],
  line: number,
  char: number,
): number {
  return (starts[line] ?? 0) + char
}

/** Line and column at `offset` under `starts` (see {@link lineStarts}). */
export function positionAt(
  starts: readonly number[],
  offset: number,
): { line: number; char: number } {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((starts[mid] ?? Infinity) <= offset) lo = mid
    else hi = mid - 1
  }
  return { line: lo, char: offset - (starts[lo] ?? 0) }
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
    .map(line =>
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
