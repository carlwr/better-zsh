/**
 * @module
 * Walk prose portions of markdown — outside fenced code blocks and inline
 * code spans. Shared so option-ref bolding and render-quality heuristics
 * agree on what "in code" means.
 */

// CommonMark allows ≤3 spaces of leading indent on a fence marker — that
// also covers fence blocks nested inside 2-space-indented list items. The
// `(?:- )?` lets a fence open on the same line as a list-item marker
// (renderer produces this shape for docopt-shaped member-list bullets); the
// fence-close on a separate line is already covered by the plain indent.
const FENCE = /^ {0,3}(?:- )?```/

function* classifyLines(
  md: string,
): Generator<readonly [line: string, isProse: boolean]> {
  let inFence = false
  for (const line of md.split("\n")) {
    if (FENCE.test(line)) {
      inFence = !inFence
      yield [line, false]
      continue
    }
    yield [line, !inFence]
  }
}

/** Lines of `md` outside fenced code blocks; fence markers themselves skipped. */
export function* proseLines(md: string): Generator<string> {
  for (const [line, isProse] of classifyLines(md)) if (isProse) yield line
}

export function anyProseLine(
  md: string,
  predicate: (line: string) => boolean,
): boolean {
  for (const [line, isProse] of classifyLines(md)) {
    if (isProse && predicate(line)) return true
  }
  return false
}

/**
 * Transform every prose line; fenced lines pass through unchanged. Inline
 * code spans inside a prose line are not split — use `splitInlineCode` if
 * needed.
 */
export function walkProseLines(
  md: string,
  transformLine: (line: string) => string,
): string {
  const out: string[] = []
  for (const [line, isProse] of classifyLines(md)) {
    out.push(isProse ? transformLine(line) : line)
  }
  return out.join("\n")
}

/**
 * Split into alternating non-code (even indices) and inline-code (odd
 * indices) segments, per CommonMark within the one line: a backtick run
 * opens a span that the next run of the same length closes; a run with no
 * closer is literal text.
 */
export function splitInlineCode(line: string): readonly string[] {
  const runs = [...line.matchAll(/`+/g)]
  const out: string[] = []
  let proseStart = 0
  for (let i = 0; i < runs.length; i++) {
    const open = runs[i] as RegExpExecArray
    const j = runs.findIndex((r, k) => k > i && r[0] === open[0])
    if (j < 0) continue
    const close = runs[j] as RegExpExecArray
    out.push(
      line.slice(proseStart, open.index),
      line.slice(open.index, close.index + close[0].length),
    )
    proseStart = close.index + close[0].length
    i = j
  }
  out.push(line.slice(proseStart))
  return out
}

/** `line` without its inline-code spans. */
export function stripInlineCode(line: string): string {
  return splitInlineCode(line)
    .filter((_, i) => i % 2 === 0)
    .join("")
}
