/**
 * @module
 * Walk the *prose* portions of a markdown string — the parts outside fenced
 * code blocks and inline code spans. Shared primitive so that option-ref
 * bolding and the render-quality heuristics agree on what "in code" means.
 */

// CommonMark allows ≤3 spaces of leading indent on a fence marker — that
// also covers fence blocks nested inside 2-space-indented list items.
const FENCE = /^ {0,3}```/

/**
 * Tag each line of `md` as prose, fence-marker, or inside-fence. Tagging is
 * the shared primitive behind `proseLines`, `anyProseLine`, `walkProseLines`.
 */
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

/**
 * Iterate over the lines of `md` that are NOT inside a fenced code block.
 * Fence-open / fence-close lines themselves are skipped.
 */
export function* proseLines(md: string): Generator<string> {
  for (const [line, isProse] of classifyLines(md)) if (isProse) yield line
}

/** True iff any prose line in `md` satisfies `predicate`. */
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
 * Transform every prose line of `md` with `transformLine`. Fenced lines pass
 * through unchanged. The transform sees one complete line at a time; inline
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
 * Split a line into alternating non-code (even indices) and inline-code (odd
 * indices) segments. Doubled-tick spans (`` `<x>` ``) match as one unit.
 */
export function splitInlineCode(line: string): readonly string[] {
  return line.split(INLINE_CODE_SPLIT)
}

// Capture group preserves the span at odd indices. Doubled-tick alternative
// comes first so we don't eat its outer ticks as two single-tick spans.
const INLINE_CODE_SPLIT = /(``[^\n]*?``|`[^`\n]+?`)/

/** Strip every inline-code span from `line`. */
export function stripInlineCode(line: string): string {
  return line.replace(/``[^\n]*?``/g, "").replace(/`[^`\n]+?`/g, "")
}
