/**
 * @module
 * Render-quality heuristics over the rendered markdown corpus. Each entry
 * is a shape-detector returning the prose / fence-open lines that matched
 * in a given record body. A drift test pins the matched set against a
 * frozen `DocPieceId` offender list.
 *
 * No structural distinction between "zero-tolerance" and "calibrated"
 * patterns: a heuristic with no listed offenders is zero-tolerance by
 * virtue of the empty list. New offender → test fails; resolved offender
 * no longer matching → test also fails (positive drift prompts list shrink).
 */

import { moduleNames } from "../../docs/taxonomy.ts"
import { proseLines, stripInlineCode } from "../../render/prose-walk.ts"

/** One render-quality heuristic. `detects` returns matched lines (or snippets). */
export interface Heuristic {
  readonly name: string
  readonly describe: string
  readonly detects: (md: string) => readonly string[]
}

// --- bug-shaped detectors (zero-tolerance: offender list is `[]`) ---------

/**
 * Stranded "see ." / "described in ." in prose — Yodl's `noderef()` failed
 * substitution and left the surrounding sentence with an empty target.
 */
const emptyRef = {
  name: "empty-ref",
  describe: 'stranded "See ." / "described in ." — failed noderef substitution',
  detects(md) {
    const re = /\b(?:See|see|described in|noted in) (?:\\ )?\./
    return [...proseLines(md)].filter(l => re.test(l))
  },
} satisfies Heuristic

/**
 * Prose line ending in a backslash — Yodl line continuation that escaped the
 * parse-time `\<newline>` stripping pass.
 */
const danglingContinuation = {
  name: "dangling-continuation",
  describe: "prose line ends with backslash continuation",
  detects(md) {
    return [...proseLines(md)].filter(l => /\\$/.test(l))
  },
} satisfies Heuristic

/**
 * Unprocessed Yodl macro marker visible in prose (e.g. `tt(`, `noderef(`).
 * Always a render-pipeline bug.
 */
const rawYodlMarker = {
  name: "raw-yodl-marker",
  describe: "unprocessed yodl macro marker in prose",
  detects(md) {
    const re = /\b(?:tt|var|example|manref|noderef)\(/
    return [...proseLines(md)].filter(l => re.test(l))
  },
} satisfies Heuristic

/**
 * Prose line with an unmatched inline-code opener — usually an upstream
 * `tt(...)` that swallowed an inner `)`.
 */
const unbalancedBackticks = {
  name: "unbalanced-backticks",
  describe: "prose line contains an unmatched inline-code opener",
  detects(md) {
    return [...proseLines(md)].filter(hasUnmatchedCodeSpanOpener)
  },
} satisfies Heuristic

/**
 * Identifier immediately followed by `+(` in prose — leftover macro-shaped
 * call where the renderer should have produced backticked output.
 */
const strayPlusMacro = {
  name: "stray-plus-macro",
  describe: "identifier followed by `+(` — leftover macro-shaped call",
  detects(md) {
    const re = /[A-Za-z_][A-Za-z0-9_]+\+\(/
    return [...proseLines(md)].filter(l => re.test(l))
  },
} satisfies Heuristic

/**
 * Double comma in prose — almost always Yodl null-reference substitution
 * collapsing a list entry to empty and stranding its separator.
 */
const doubleComma = {
  name: "double-comma",
  describe: "double comma in prose — likely null-ref substitution",
  detects(md) {
    return [...proseLines(md)].filter(l => /,\s*,/.test(l))
  },
} satisfies Heuristic

/**
 * Fence-open line carries info-string content beyond the language tag —
 * e.g. ` ```zsh:foo:(...) ` instead of ` ```zsh ` followed by the content on
 * the next line. Almost always a parse-pipeline bug, not a render choice.
 */
const emptyFenceInfo = {
  name: "empty-fence-info",
  describe: "fence-open line carries trailing content (info-string overflow)",
  detects(md) {
    // A clean fence-open line is either ``` or ```<lang>. Anything else
    // means content leaked into the info string. Walk every line: fence
    // detection here is local because we explicitly want to read fence-open
    // lines themselves (the `proseLines` helper skips them).
    return md.split("\n").filter(line => /^```(?!$)(?!\w+$)/.test(line))
  },
} satisfies Heuristic

// --- calibrated detectors (offender list may be non-empty) -----------------

/**
 * Definition-list-style dead text where a lowercase identifier
 * (compstate-style key) is followed by a capitalized sentence on the same
 * line, with no visible structure. Signals a missing nested-list capture in
 * the parser, or a flat renderer for an already-captured list.
 */
const lcKeyedDefText = {
  name: "lc-keyed-deftext",
  describe:
    "lowercase identifier(s) followed by capitalized sentence — flat key-list",
  detects(md) {
    // Optional surrounding backticks accommodate upstream `tt(<key>)` markup.
    // Up to 4 leading spaces tolerate the bullet-list continuation indent:
    // flag descs are rendered as bullets so a nested flat key-list lands one
    // level deeper.
    const re =
      /^ {0,4}`?([a-z][a-z0-9_]*)`?(?: `?[a-z][a-z0-9_]*`?)? +[A-Z][^.\n]{20,}/
    return [...proseLines(md)].filter(line => re.test(line))
  },
} satisfies Heuristic

/**
 * Option-flag variant of the preceding lowercase-keyed shape: same flat
 * key-list structure with `-x` / `--flag` headers (optionally followed by
 * one arg word). Same parser/renderer split as the lowercase form.
 */
const flagKeyedDefText = {
  name: "flag-keyed-deftext",
  describe: "option-flag-like line followed by capitalized sentence",
  detects(md) {
    const re =
      /^ {0,4}`?(-{1,2}[A-Za-z][A-Za-z0-9-]*)`?(?: `?[a-z][a-z0-9-]*`?)? +[A-Z][^.\n]{20,}/
    return [...proseLines(md)].filter(line => re.test(line))
  },
} satisfies Heuristic

/**
 * Standalone paragraph that *looks like a heading*: short, starts capital,
 * no terminal punctuation, no embedded sentence structure.
 *
 * Common source: upstream Yodl uses `em(Title)` as a fake section title
 * inside an item body (Yodl has no in-body `sect()`), and the renderer
 * strips the `em(...)` wrapper to bare title-cased text. Also catches
 * "see X" reference paragraphs that text-stitching failed to join.
 *
 * Intentionally loose; some real prose flags too — those go on the
 * offender list.
 */
const titleShapePara = {
  name: "title-shape-para",
  describe: "standalone short paragraph shaped like a heading",
  detects(md) {
    // Bounded by blank lines on both sides; starts capital, ends in a letter
    // (no terminal punctuation), 4..50 chars; body has no period / `!` / `?`
    // (would imply prose, not a title).
    const re = /(?:^|\n\n)([A-Z][a-zA-Z][^.\n!?]{2,50}[a-zA-Z])\n\n/g
    return [...md.matchAll(re)].map(m => m[1] ?? "")
  },
} satisfies Heuristic

/**
 * Bare `$param` reference in prose (outside fenced/inline code). Authors of
 * zsh docs mark parameter references with `tt(...)` upstream, which renders
 * as backticks — so a naked `$param` in prose is a rendering miss. Check
 * only: this heuristic surfaces the failure but never rewrites the markdown.
 */
const paramShouldBeCoded = {
  name: "param-not-coded",
  describe: "naked `$param` reference in prose — should be backticked",
  detects(md) {
    return [...proseLines(md)].filter(line =>
      /\$\w+/.test(stripInlineCode(line)),
    )
  },
} satisfies Heuristic

// Module-path tails for the bare-prefix regex below: every entry is what
// follows `zsh/` in a canonical `ModuleName`. Multi-segment paths like
// `db/gdbm` and `net/socket` are preserved verbatim so the regex (which
// matches `/`-separated segments after `zsh/`) can hit them.
const ZSH_MODULES: ReadonlySet<string> = new Set(
  moduleNames.map(m => m.slice("zsh/".length)),
)

/**
 * Paragraph that begins with a lone terminal-punctuation character followed
 * by whitespace and a capitalized sentence — almost always a rendering bug
 * where surrounding markup ate the previous word and left its trailing
 * punctuation orphaned at the start of the next paragraph. Check-only.
 */
const orphanLeadingPunct = {
  name: "orphan-leading-punct",
  describe: "paragraph starts with orphan punctuation + capitalized sentence",
  detects(md) {
    const re = /(?:^|\n\n)([.,;:!?][ \t]+[A-Z][^\n]*)/g
    return [...md.matchAll(re)].map(m => m[1] ?? "")
  },
} satisfies Heuristic

/**
 * Prose paragraph whose entire content is one or more very-short backticked
 * tokens (e.g. `` `C` `` on its own line, or `` `c` `.` ``). Strong signal
 * that an `xitem`/`sxitem` alias header was rendered standalone instead of
 * being folded into the next entry's signature — the alias lost its body.
 *
 * Each token is restricted to 1-3 chars: alias markers in the upstream
 * corpus are single characters (`C`, `/`, `~`) or short flag forms (`-x`,
 * `--`). Excludes identifier-shape names like `compstate` or `quoted-insert`
 * which legitimately appear standalone as record-title paragraphs.
 *
 * Skips the first non-blank prose line of each record: that's the title
 * paragraph (e.g. for single-letter records like `special_param:UID` it
 * matches the regex).
 */
const strandedBacktickTokens = {
  name: "stranded-backtick-tokens",
  describe: "paragraph contains only very short backticked tokens (lost alias)",
  detects(md) {
    const re = /^(`[^`\n]{1,3}`)(?:[ \t]+`[^`\n]{1,3}`)*$/
    const matches: string[] = []
    let titleSeen = false
    for (const line of proseLines(md)) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (!titleSeen) {
        titleSeen = true
        continue
      }
      if (re.test(trimmed)) matches.push(trimmed)
    }
    return matches
  },
} satisfies Heuristic

/**
 * Bare `zsh/<modname>` reference in prose (outside fenced/inline code) where
 * `<modname>` is a known loadable zsh module. Same shape as `param-not-coded`:
 * check-only, surfaces the rendering miss but does not rewrite.
 */
const moduleShouldBeCoded = {
  name: "module-not-coded",
  describe: "naked `zsh/<module>` reference in prose — should be backticked",
  detects(md) {
    // Match the full `zsh/<tail>` form including any further `/`-separated
    // segments so multi-part canonical names like `zsh/db/gdbm`,
    // `zsh/net/socket`, `zsh/param/private` are captured intact.
    const re = /\bzsh\/([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)*)\b/g
    return [...proseLines(md)].filter(line => {
      for (const m of stripInlineCode(line).matchAll(re)) {
        if (ZSH_MODULES.has(m[1] ?? "")) return true
      }
      return false
    })
  },
} satisfies Heuristic

// --- code-span scanner (shared with `unbalanced-backticks`) -----------------

function hasUnmatchedCodeSpanOpener(line: string): boolean {
  let i = 0
  while (i < line.length) {
    if (line[i] !== "`") {
      i++
      continue
    }
    const open = countRun(line, i, "`")
    let j = i + open
    let closed = false
    while (j < line.length) {
      if (line[j] === "`") {
        const close = countRun(line, j, "`")
        if (close === open) {
          i = j + close
          closed = true
          break
        }
        j += close
      } else {
        j++
      }
    }
    if (!closed) return true
  }
  return false
}

function countRun(s: string, start: number, ch: string): number {
  let n = 0
  while (start + n < s.length && s[start + n] === ch) n++
  return n
}

// --- registry ---------------------------------------------------------------

export const heuristics = [
  emptyRef,
  danglingContinuation,
  rawYodlMarker,
  unbalancedBackticks,
  strayPlusMacro,
  doubleComma,
  emptyFenceInfo,
  lcKeyedDefText,
  flagKeyedDefText,
  titleShapePara,
  paramShouldBeCoded,
  moduleShouldBeCoded,
  orphanLeadingPunct,
  strandedBacktickTokens,
] as const satisfies readonly Heuristic[]

/** Union of declared heuristic names — keys of `knownOffenders`. */
export type HeuristicName = (typeof heuristics)[number]["name"]
