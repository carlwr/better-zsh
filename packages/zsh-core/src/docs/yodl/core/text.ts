import {
  asNodes,
  isMacro,
  macroArg,
  type YNode,
  type YNodeSeq,
  type YodlSrc,
} from "./nodes.ts"

export interface YodlToken {
  kind: "tt" | "var"
  text: string
}

type RenderMode = "text" | "code"

const SPECIAL_MACROS: Readonly<Record<string, string>> = {
  AMP: "&",
  DASH: "-",
  HASH: "#",
  LPAR: "(",
  LSQUARE: "[",
  PIPE: "|",
  PLUS: "+",
  RPAR: ")",
  RSQUARE: "]",
  SP: " ",
  SPACES: " ",
}

/**
 * Render Yodl nodes to a flat string.
 *
 * The `mode` argument controls how `tt(...)` and `var(...)` are rendered:
 *
 * - `"code"` (default) — emit the inner content bare, no markup. Matches
 *   the name "stripYodl": markup is *stripped*. Used when the result
 *   feeds a fenced code block, an external backtick wrapper, an
 *   identifier slot, or a regex that expects plain text.
 * - `"text"` — emit markdown markup. `tt(x)` becomes `` `x` ``, `var(x)`
 *   becomes `` `x` `` (single token) or `*x*` (multi-token phrase). Used
 *   by `normalizeBody` for body prose that ends up rendered as
 *   markdown. Sentinel chars are emitted internally; consumers must
 *   subsequently pipe the result through `normalizeDoc` so the
 *   sentinels become real backticks.
 */
export function stripYodl(src: YodlSrc, mode: RenderMode = "code"): string {
  return finishPlain(renderSeq(asNodes(src), mode))
}

/**
 * Normalize a yodl-derived header to a single trimmed line. Bare-mode —
 * headers feed sig fields, IDs, and code-block lines, none of which
 * want embedded markdown markup.
 */
export function normalizeHeader(src: YodlSrc): string {
  return stripYodl(src).replace(/\s+/g, " ").trim()
}

export function normalizeBody(src: YodlSrc): string {
  // Renderer-side shape inference: an `em(...)` macro that stands alone in
  // its paragraph (blank-line bounded) is treated as a section heading. The
  // upstream zsh manual uses this pattern as a fake `subsect()` inside item
  // bodies; promoting to a real markdown heading restores the structure.
  // Chained `em(...)tt(...)em(...)` (mid-paragraph emphasis) is left as
  // bare text via the default `renderNode` path.
  return normalizeDoc(
    stripYodl(promoteEmHeadings(foldAliasItems(asNodes(src))), "text"),
  )
}

/**
 * Fold body-internal `xitem(...)` / `sxitem(...)` alias headers into the
 * next `item`/`sitem` that carries a body — the upstream Yodl convention
 * is that header-only entries declare aliases for the following entry.
 *
 * The default `renderNode` path emits a body-less `xitem`/`sxitem` as the
 * bare marker text, which surfaces as a stranded backticked paragraph
 * (e.g. `` `C` `` between bullets) instead of joining the next entry's
 * signature. This pre-pass collapses the run by synthesizing a combined
 * marker `[alias1, ", ", alias2, ", ", main]` and dropping the original
 * alias nodes plus intervening whitespace.
 *
 * Operates universally over body sequences; the top-level
 * `collectAliasedEntries` pipeline in `core/doc.ts` already handles
 * alias-by-extraction, so this pass only fires for aliases that appear
 * inside another item's body (where extractors don't reach).
 */
function foldAliasItems(nodes: YNodeSeq): YNodeSeq {
  const out: YNode[] = []
  let aliasRun: YNode[] = []
  const flushRun = () => {
    out.push(...aliasRun)
    aliasRun = []
  }

  for (const node of nodes) {
    if (node.kind !== "macro") {
      if (aliasRun.length > 0 && !/\S/.test(node.text)) {
        aliasRun.push(node)
      } else {
        flushRun()
        out.push(node)
      }
      continue
    }
    if ((node.name === "sxitem" || node.name === "xitem") && node.args[0]) {
      aliasRun.push(node)
      continue
    }
    if (
      (node.name === "sitem" || node.name === "item") &&
      aliasRun.length > 0 &&
      node.args.length >= 2 &&
      node.args[0]
    ) {
      const newMarker: YNode[] = []
      for (const alias of aliasRun) {
        if (alias.kind === "macro" && alias.args[0]) {
          newMarker.push(...alias.args[0], { kind: "text", text: ", " })
        }
      }
      newMarker.push(...node.args[0])
      out.push({ ...node, args: [newMarker, ...node.args.slice(1)] })
      aliasRun = []
      continue
    }
    flushRun()
    out.push(node)
  }
  flushRun()
  return out
}

function promoteEmHeadings(nodes: YNodeSeq): YNodeSeq {
  const out: YNode[] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as YNode
    if (isMacro(node, "em") && isParagraphStandalone(nodes, i)) {
      const heading = stripYodl(macroArg(node, 0), "text").trim()
      if (heading) {
        out.push({ kind: "text", text: `\n\n### ${heading}\n\n` })
        continue
      }
    }
    out.push(node)
  }
  return out
}

/**
 * Macros that render as the empty string and contribute no visible text;
 * they should be skipped when looking for paragraph boundaries around an
 * em() so a `cindex`/`vindex`/`COMMENT` adjacency doesn't suppress
 * heading promotion.
 */
const INVISIBLE_MACROS: ReadonlySet<string> = new Set([
  "COMMENT",
  "cindex",
  "def",
  "findex",
  "pindex",
  "redef",
  "vindex",
  "ifzman",
])

/**
 * Structural-empty macros: render empty but DO break para-bound scans
 * (list/menu delimiters and Texinfo navigation glue). Disjoint from
 * `INVISIBLE_MACROS`; both feed `EMPTY_RENDER_MACROS`.
 */
const STRUCTURAL_EMPTY_MACROS: readonly string[] = [
  "chapter",
  "texinode",
  "startitem",
  "enditem",
  "startsitem",
  "endsitem",
  "startmenu",
  "endmenu",
]

/**
 * True iff `nodes[i]` is bracketed by paragraph-break whitespace on both
 * sides — looking through invisible-macro neighbors and accumulating
 * intervening whitespace text. Reaches the sequence boundary counts as a
 * paragraph break (the start/end of an item-body is naturally a boundary).
 */
function isParagraphStandalone(nodes: YNodeSeq, i: number): boolean {
  return (
    hasParaBreak(nodes, i, -1, /\n[ \t]*\n[ \t\n]*$/) &&
    hasParaBreak(nodes, i, 1, /^[ \t]*\n[ \t]*\n/)
  )
}

function hasParaBreak(
  nodes: YNodeSeq,
  i: number,
  step: -1 | 1,
  rxEdge: RegExp,
): boolean {
  // Accumulate adjacent text content in the chosen direction, skipping
  // invisible macros. Stop on any other macro (it counts as visible content
  // that breaks the para boundary). Treat sequence edge as a para break.
  let acc = ""
  for (let j = i + step; j >= 0 && j < nodes.length; j += step) {
    const n = nodes[j] as YNode
    if (n.kind === "text") {
      acc = step < 0 ? n.text + acc : acc + n.text
      if (rxEdge.test(acc)) return true
      // Any non-whitespace char means we've passed visible content without
      // crossing a para break. Re-check just for the edge regex (already
      // covered above) and bail.
      if (/\S/.test(n.text)) return false
      continue
    }
    if (n.kind === "macro" && INVISIBLE_MACROS.has(n.name)) continue
    return false
  }
  return true
}

export function normalizeDoc(raw: string): string {
  const lines = raw.split("\n").map(line => line.trimEnd())
  const out: string[] = []
  const para: string[] = []
  let inCode = false
  let continued = false

  const flushPara = () => {
    if (para.length === 0) return
    out.push(renderInlineMd(para.join(" ").replace(/\s+/g, " ").trim()))
    para.length = 0
  }

  for (const line of lines) {
    let trimmed = line.trim()
    let lineContinues = false
    if (trimmed.startsWith("```")) {
      flushPara()
      out.push(trimmed)
      inCode = !inCode
      continued = false
      continue
    }
    if (inCode) {
      out.push(line)
      continue
    }
    if (trimmed.endsWith("\\")) {
      trimmed = trimmed.slice(0, -1).trimEnd()
      lineContinues = true
    }
    if (!trimmed) {
      if (continued) continue
      flushPara()
      if (out[out.length - 1] !== "") out.push("")
      continue
    }
    para.push(trimmed)
    continued = lineContinues
  }
  flushPara()
  while (out[0] === "") out.shift()
  while (out[out.length - 1] === "") out.pop()
  return finishDoc(mergeReferenceParas(out).join("\n"))
}

export function extractTokens(src: YodlSrc): YodlToken[] {
  const out: YodlToken[] = []
  walkTokens(asNodes(src), out)
  return out
}

/** First `tt(...)` token's raw text, or `undefined` if absent. */
export function firstTt(src: YodlSrc): string | undefined {
  return extractTokens(src).find(tok => tok.kind === "tt")?.text
}

/** All `tt(...)` token texts, in order. */
export function ttTexts(src: YodlSrc): string[] {
  return tokensOfKind(src, "tt")
}

/** All `var(...)` token texts, in order. */
export function varTexts(src: YodlSrc): string[] {
  return tokensOfKind(src, "var")
}

/**
 * `ttTexts(src)` with each entry trimmed and empties dropped — the shape
 * every extractor wants when it cares about identifier-like tt payloads
 * (option display names, parameter names, …).
 */
export function trimmedTtTexts(src: YodlSrc): string[] {
  return ttTexts(src)
    .map(t => t.trim())
    .filter(Boolean)
}

function tokensOfKind(src: YodlSrc, kind: YodlToken["kind"]): string[] {
  return extractTokens(src)
    .filter(tok => tok.kind === kind)
    .map(tok => tok.text)
}

function renderSeq(nodes: YNodeSeq, mode: RenderMode): string {
  return nodes.map(node => renderNode(node, mode)).join("")
}

/**
 * Macros that render to the empty string regardless of args — union of the
 * invisible set (above) and the structural delimiters that, unlike invisible
 * macros, DO break paragraph-bound scans around `em(...)`.
 */
const EMPTY_RENDER_MACROS: ReadonlySet<string> = new Set([
  ...INVISIBLE_MACROS,
  ...STRUCTURAL_EMPTY_MACROS,
])

function renderNode(node: YNode, mode: RenderMode): string {
  if (node.kind === "text") return node.text

  if (node.name in SPECIAL_MACROS) return SPECIAL_MACROS[node.name] ?? ""
  if (EMPTY_RENDER_MACROS.has(node.name)) return ""

  switch (node.name) {
    case "tt":
      return wrapTt(renderSeq(node.args[0] ?? [], "code"), mode)
    case "var":
      return wrapVar(renderSeq(node.args[0] ?? [], "code"), mode)
    case "example":
      return `\n\n\`\`\`zsh\n${finishPlain(renderSeq(node.args[0] ?? [], "code"))}\n\`\`\`\n\n`
    default: {
      const inner = node.args.map(arg => renderSeq(arg, mode))
      const [a = "", b = ""] = inner
      if (mode === "code" && hasEmptyArg(node)) return `${node.name}()`
      switch (node.name) {
        case "ifnzman":
          return a
        case "manref":
          return `${a}(${b})`
        case "sectref":
        case "subref":
        case "noderef":
        case "nmref":
        case "zmanref":
          return a
        case "sitem":
          return renderSitem(a, b, node.args.length)
        default:
          // item, xitem, and any unrecognized macro — concatenate inner args.
          return inner.join("")
      }
    }
  }
}

function hasEmptyArg(node: Extract<YNode, { kind: "macro" }>): boolean {
  return node.args.length === 1 && (node.args[0]?.length ?? 0) === 0
}

/**
 * Render a small-item (`sitem(marker)(content)`) as a blank-line-bounded
 * markdown list item. The surrounding `\n\n` ensures `normalizeDoc` treats
 * each item as its own paragraph — CommonMark needs this to recognize
 * consecutive items as a list rather than running them together as one
 * paragraph. Numeric markers (`1.`, `2.`, ...) become numbered-list items;
 * other markers become definition-style bullets (`- marker: content`).
 */
function renderSitem(
  marker: string,
  content: string,
  argCount: number,
): string {
  if (argCount < 2) return marker
  const trimmedMarker = marker.trim()
  if (/^\d+\.$/.test(trimmedMarker)) {
    return `\n\n${trimmedMarker} ${content}\n\n`
  }
  return `\n\n- ${trimmedMarker}: ${content}\n\n`
}

// Sentinel chars used to mark tt()/var() boundaries during the rendering
// pipeline. Converted to literal backticks/asterisks at the *end* of
// renderInlineMd, AFTER Yodl `<x>' quoted-code processing has had its
// chance to run. The detour matters for two reasons:
//
// 1. If tt() emitted literal backticks directly, the upstream `tt(...)'
//    pattern would produce output whose Yodl `'-pair regex spans multiple
//    unrelated code spans (greedy match) and destroys nearby possessives
//    or contractions.
// 2. The same applies to multi-word var() emitting italics: a literal `*`
//    inside a `'-pair would survive the wrapping and render as a literal
//    asterisk inside a code span. With sentinels, the `'-pair handler
//    strips them along with their surrounded content and produces a
//    clean inline-code span.
//
// Two separate pairs because tt() (code) and multi-word var() (italics)
// render to different markdown shapes; the `'-pair handler strips both
// kinds uniformly.
const TT_OPEN = "\x01"
const TT_CLOSE = "\x02"
const ITAL_OPEN = "\x03"
const ITAL_CLOSE = "\x04"
// Char-class body listing every sentinel (no brackets). Reuse this in regex
// templates so adding a new sentinel pair is one edit.
const SENTINEL_CHARS = `${TT_OPEN}${TT_CLOSE}${ITAL_OPEN}${ITAL_CLOSE}`
const ALL_SENTINEL_RE = new RegExp(`[${SENTINEL_CHARS}]`, "g")

/**
 * Render `tt(...)` content as a marked-up code span in text mode; bare in
 * code mode (the result will itself be placed in a fenced block, or wrapped
 * in backticks externally). Empty content stays empty — never emits a
 * degenerate marker pair.
 */
function wrapTt(inner: string, mode: RenderMode): string {
  if (mode === "code" || inner === "") return inner
  return `${TT_OPEN}${inner}${TT_CLOSE}`
}

/**
 * Render `var(...)` content in text mode: a single-token placeholder gets
 * inline code (preserves intra-word adjacency — e.g. `var(name)d` →
 * `` `name`d ``, which markdown handles correctly); a multi-token phrase
 * gets italics (markdown emphasis disallows intra-word `*`, but multi-word
 * `var(...)` is always whitespace-bounded in the upstream). Bare in code
 * mode.
 */
function wrapVar(inner: string, mode: RenderMode): string {
  if (mode === "code" || inner === "") return inner
  if (/\s/.test(inner)) return `${ITAL_OPEN}${inner}${ITAL_CLOSE}`
  return `${TT_OPEN}${inner}${TT_CLOSE}`
}

function walkTokens(nodes: YNodeSeq, out: YodlToken[]) {
  for (const node of nodes) {
    if (node.kind !== "macro") continue
    if (node.name === "tt" || node.name === "var") {
      out.push({
        kind: node.name,
        text: renderSeq(node.args[0] ?? [], "code"),
      })
      continue
    }
    for (const arg of node.args) walkTokens(arg, out)
  }
}

function finishPlain(s: string): string {
  return s
    .replace(/(?<!`)\\'/g, "'") // strip escaped-apostrophe, but not inside `\' spans
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Yodl `<x>' quoted-code: backtick-open + body + closing-apostrophe. Body
// is either ordinary non-special chars OR a sentinel-wrapped tt/var span;
// apostrophes inside a sentinel span don't prematurely close the pair. The
// outer backtick wrapper subsumes both code and italics, so all sentinels
// are stripped from the capture before re-wrapping.
const YODL_QUOTED_PAIR_RE = new RegExp(
  `\`((?:[^\\n'${TT_OPEN}${ITAL_OPEN}]|${TT_OPEN}[^${TT_CLOSE}]*${TT_CLOSE}|${ITAL_OPEN}[^${ITAL_CLOSE}]*${ITAL_CLOSE})*)'`,
  "g",
)
// Coalesce two adjacent tt-spans separated by ≤8 non-whitespace, non-sentinel
// chars. Upstream writes `tt(${)LPAR()tt(SI:)var(N)tt(:)RPAR()` to compose one
// shell-syntax token from many macros; merging gives one continuous code span
// instead of a ragged backtick sequence. The 8-char cap keeps the merge
// conservative. Italics aren't merged (multi-word var() spans are
// whitespace-bounded in practice).
const TT_MERGE_RE = new RegExp(
  `${TT_CLOSE}([^${SENTINEL_CHARS}\\n\\s]{0,8})${TT_OPEN}`,
  "g",
)
const TT_PROMOTE_RE = new RegExp(
  `${TT_OPEN}([^${TT_OPEN}${TT_CLOSE}]*)${TT_CLOSE}`,
  "g",
)
const ITAL_PROMOTE_RE = new RegExp(
  `${ITAL_OPEN}([^${ITAL_OPEN}${ITAL_CLOSE}]*)${ITAL_CLOSE}`,
  "g",
)

function renderInlineMd(s: string): string {
  return tightenPunctuation(
    s
      .replace(YODL_QUOTED_PAIR_RE, (_m, inner) =>
        mdInlineCode(stripSentinels(inner)),
      )
      .replace(TT_MERGE_RE, "$1")
      .replace(TT_PROMOTE_RE, (_m, inner: string) => mdInlineCode(inner))
      .replace(ITAL_PROMOTE_RE, "*$1*"),
  )
}

function stripSentinels(s: string): string {
  return s.replace(ALL_SENTINEL_RE, "")
}

/**
 * Wrap content as a markdown inline-code span, using a longer backtick
 * fence (and one-space padding) when the content itself contains a
 * backtick — per CommonMark. Without this, `` `\\\`` `` would render as
 * three literal backticks rather than a code span containing a backtick.
 */
function mdInlineCode(content: string): string {
  if (!content.includes("`")) return `\`${content}\``
  const padded =
    content.startsWith("`") || content.endsWith("`") ? ` ${content} ` : content
  return `\`\`${padded}\`\``
}

// Reference-prose connectives that almost always continue into the next
// paragraph (the upstream manual writes things like "described in\n\nFiles"
// where the line break belongs to the source layout, not the meaning). One
// regex source; the array form anchors at end-of-string, the joined form
// captures over a paragraph break.
const REF_PROSE_WORDS = "see|in|described in|noted in"
const REF_PROSE_TAIL = new RegExp(`\\b(?:${REF_PROSE_WORDS})$`, "i")
const REF_PROSE_BREAK = new RegExp(
  `(\\b(?:${REF_PROSE_WORDS}))\\n\\n([A-Z][^\\n]+)`,
  "gi",
)

/**
 * Merge consecutive paragraphs when the first ends with a ref-prose
 * connective (`see`, `in`, …) — operates on the per-line/per-paragraph
 * intermediate before `normalizeDoc` joins back to a single string.
 * `finishDoc` runs the same fix on the joined string, catching cases the
 * paragraph-level pass missed.
 */
function mergeReferenceParas(parts: readonly string[]): string[] {
  const out: string[] = []
  for (const part of parts) {
    if (part === "") {
      if (out.at(-1) !== "") out.push(part)
      continue
    }

    const prev = out.at(-1)
    const prevPrev = out.at(-2)
    if (prev === "" && prevPrev && shouldJoinParas(prevPrev, part)) {
      out.pop()
      out[out.length - 1] = `${prevPrev} ${part}`
      continue
    }

    out.push(part)
  }
  return out
}

function shouldJoinParas(prev: string, next: string): boolean {
  return (
    !prev.startsWith("```") &&
    !next.startsWith("```") &&
    REF_PROSE_TAIL.test(prev)
  )
}

function finishDoc(s: string): string {
  return tightenPunctuation(s.replace(REF_PROSE_BREAK, "$1 $2"))
}

function tightenPunctuation(s: string): string {
  // Match only intra-line whitespace (` ` / `\t`), never `\n`. A `\n` between
  // a fence-open and its first content line is not a "space-before-colon" to
  // be tightened; consuming it merges the content into the fence info string.
  return s
    .replace(/[ \t]+([,;:!?])/g, "$1")
    .replace(/[ \t]+\.(?=$|[\s)\]}>"'])/g, ".")
}
