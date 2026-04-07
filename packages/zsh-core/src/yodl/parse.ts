// Generic yodl macro parser for zsh documentation files.
// Handles the ~15 macros used across zsh docs. NOT a general yodl parser.

export interface YodlItem {
  header: string // raw header (still has tt/var markup)
  body?: string // raw body; undefined for xitem
  section: string // enclosing subsect() or sect()
}

export interface YodlSection {
  level: "sect" | "subsect"
  name: string
  line: number
}

export interface YodlTok {
  kind: "tt" | "var"
  text: string
}

export interface AliasedYodlItem<T> {
  head: T
  aliases: readonly T[]
  item: YodlItem
}

const SPECIAL_MACROS: Record<string, string> = {
  "LPAR()": "(",
  "RPAR()": ")",
  "PLUS()": "+",
  "SPACES()": " ",
  "LSQUARE()": "[",
  "RSQUARE()": "]",
  "PIPE()": "|",
  "AMP()": "&",
  "HASH()": "#",
}

/** Replace yodl special macros with their literal characters */
export function replaceSpecials(s: string): string {
  let r = s
  for (const [macro, ch] of Object.entries(SPECIAL_MACROS)) {
    while (r.includes(macro)) r = r.replace(macro, ch)
  }
  return r
}

/** Strip all yodl markup, returning plain text */
export function stripYodl(raw: string): string {
  let s = raw
  // Remove COMMENT(...) blocks
  s = stripMacro(s, "COMMENT")
  // List markers and sitem must be processed BEFORE the em()/var()/tt() loop.
  // "sitem(" contains the substring "em(" which would otherwise be consumed
  // by the em() stripping pass, producing garbled output like "sit\a(bell…)".
  s = stripListMarkers(s)
  s = replaceTwoArgMacro(s, "sitem", (head, body) => `- ${head}: ${body}`)
  s = replaceTwoArgMacro(s, "manref", (name, section) => `${name}(${section})`)
  s = replaceWrapperMacro(
    s,
    "example",
    (body) => `\n\n\`\`\`zsh\n${stripYodl(body).trim()}\n\`\`\`\n\n`,
  )
  // Hover docs should follow the prose branch, not the manpage branch.
  s = replaceWrapperMacro(s, "ifnzman", (body) => body)
  s = replaceWrapperMacro(s, "ifzman", () => "")
  // Several of these wrappers carry the only visible reference text.
  for (const m of [
    "tt",
    "var",
    "em",
    "bf",
    "sectref",
    "nmref",
    "zmanref",
    "noderef",
  ]) {
    s = stripWrapperMacro(s, m)
  }
  // Strip remaining single-arg sitem/item that weren't two-arg.
  s = stripWrapperMacro(s, "sitem")
  s = stripWrapperMacro(s, "item")
  s = stripWrapperMacro(s, "xitem")
  // Strip index macros.
  for (const m of ["cindex", "pindex", "findex", "vindex"]) {
    s = stripMacro(s, m)
  }
  // Replace special macros
  s = replaceSpecials(s)
  s = s.replace(/\\'/g, "'")
  // Clean up whitespace
  s = s.replace(/\n{3,}/g, "\n\n").trim()
  return s
}

const LIST_MARKERS = /^(start(?:s?item)|end(?:s?item))\(\)\s*$/gm

function stripListMarkers(s: string): string {
  return s.replace(LIST_MARKERS, "")
}

export function normalizeDoc(raw: string): string {
  const lines = raw.split("\n").map((line) => line.trimEnd())
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

/** Extract plain yodl `tt(...)` / `var(...)` tokens in source order. */
export function extractTokens(raw: string): YodlTok[] {
  const out: YodlTok[] = []
  let pos = 0

  while (pos < raw.length) {
    const kind = raw.startsWith("tt(", pos)
      ? "tt"
      : raw.startsWith("var(", pos)
        ? "var"
        : undefined
    if (!kind) {
      pos++
      continue
    }

    const openPos = pos + kind.length
    const close = findBalancedClose(raw, openPos)
    if (close === -1) {
      pos++
      continue
    }

    out.push({
      kind,
      text: replaceSpecials(raw.slice(openPos + 1, close)),
    })
    pos = close + 1
  }

  return out
}

export function normalizeHeader(raw: string): string {
  return stripYodl(raw).replace(/\s+/g, " ").trim()
}

export function normalizeBody(raw: string): string {
  return normalizeDoc(stripYodl(raw))
}

function renderInlineMd(s: string): string {
  let out = s
  // zsh docs often use this manpage quoting idiom for inline code.
  out = out.replace(/`([^`\n]+?)'/g, (_m, code) => `\`${code}\``)
  out = out.replace(/\s+([.,;:!?])/g, "$1")
  return out
}

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
    /\b(?:see|in|described in|noted in)$/i.test(prev)
  )
}

function finishDoc(s: string): string {
  return s
    .replace(/(\b(?:see|in|described in|noted in))\n\n([A-Z][^\n]+)/gi, "$1 $2")
    .replace(/\s+([.,;:!?])/g, "$1")
}

/** Remove macro(content) entirely (content discarded) */
function stripMacro(s: string, name: string): string {
  let r = s
  const tag = `${name}(`
  for (;;) {
    const idx = r.indexOf(tag)
    if (idx === -1) break
    const end = findBalancedClose(r, idx + tag.length - 1)
    if (end === -1) break
    r = r.slice(0, idx) + r.slice(end + 1)
  }
  return r
}

/** Strip wrapper macro, keeping inner content: name(content) → content */
function stripWrapperMacro(s: string, name: string): string {
  return replaceWrapperMacro(s, name, (content) => content)
}

function replaceWrapperMacro(
  s: string,
  name: string,
  render: (content: string) => string,
): string {
  let r = s
  const tag = `${name}(`
  for (;;) {
    const idx = r.indexOf(tag)
    if (idx === -1) break
    const contentStart = idx + tag.length
    const end = findBalancedClose(r, idx + tag.length - 1)
    if (end === -1) break
    const content = r.slice(contentStart, end)
    r = r.slice(0, idx) + render(content) + r.slice(end + 1)
  }
  return r
}

function replaceTwoArgMacro(
  s: string,
  name: string,
  render: (a: string, b: string) => string,
): string {
  let r = s
  const tag = `${name}(`
  for (;;) {
    const idx = r.indexOf(tag)
    if (idx === -1) break
    const firstClose = findBalancedClose(r, idx + tag.length - 1)
    if (firstClose === -1 || r[firstClose + 1] !== "(") break
    const secondClose = findBalancedClose(r, firstClose + 1)
    if (secondClose === -1) break
    const a = r.slice(idx + tag.length, firstClose)
    const b = r.slice(firstClose + 2, secondClose)
    r = r.slice(0, idx) + render(a, b) + r.slice(secondClose + 1)
  }
  return r
}

/**
 * Find matching `)` for `(` at position `openPos`.
 * Tracks balanced parens. Returns index of closing `)`, or -1.
 */
export function findBalancedClose(s: string, openPos: number): number {
  let depth = 1
  for (let i = openPos + 1; i < s.length; i++) {
    if (s[i] === "(") depth++
    else if (s[i] === ")") {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/** Extract item(header)(body) and xitem(header) entries */
export function extractItems(yo: string, depth?: number): YodlItem[] {
  const sections = extractSections(yo)
  const items: YodlItem[] = []
  const lines = yo.split("\n")
  const depths = lineDepths(lines)

  // Build section lookup: line number → section name
  function sectionAt(lineIdx: number): string {
    let sec = ""
    for (const s of sections) {
      if (s.line <= lineIdx) sec = s.name
    }
    return sec
  }

  // Process character by character to find item() and xitem()
  let pos = 0
  while (pos < yo.length) {
    const xi = matchAt(yo, pos, "xitem(")
    const it = matchAt(yo, pos, "item(")
    if (xi) {
      const headerClose = findBalancedClose(yo, pos + 5) // after "xitem("
      if (headerClose === -1) {
        pos++
        continue
      }
      const header = yo.slice(pos + 6, headerClose)
      const lineIdx = lineOfPos(lines, pos)
      if (depth !== undefined && depths[lineIdx] !== depth) {
        pos = headerClose + 1
        continue
      }
      items.push({ header, section: sectionAt(lineIdx) })
      pos = headerClose + 1
    } else if (it) {
      const headerClose = findBalancedClose(yo, pos + 4) // after "item("
      if (headerClose === -1) {
        pos++
        continue
      }
      const header = yo.slice(pos + 5, headerClose)
      // Check for body: item(header)(body)
      if (headerClose + 1 < yo.length && yo[headerClose + 1] === "(") {
        const bodyClose = findBalancedClose(yo, headerClose + 1)
        if (bodyClose !== -1) {
          const body = yo.slice(headerClose + 2, bodyClose)
          const lineIdx = lineOfPos(lines, pos)
          items.push({
            header,
            body: body.replace(/^\n/, ""),
            section: sectionAt(lineIdx),
          })
          pos = bodyClose + 1
          continue
        }
      }
      const lineIdx = lineOfPos(lines, pos)
      if (depth !== undefined && depths[lineIdx] !== depth) {
        pos = headerClose + 1
        continue
      }
      items.push({ header, section: sectionAt(lineIdx) })
      pos = headerClose + 1
    } else {
      pos++
    }
  }
  return items
}

/** Extract top-level `item(...)` / `xitem(...)` entries from one `startitem()` block. */
export function extractItemList(yo: string): YodlItem[] {
  return extractListEntries(yo, "item")
}

/** Extract top-level `sitem(...)` entries from one `startsitem()` block. */
export function extractSitemList(yo: string): YodlItem[] {
  return extractListEntries(yo, "sitem")
}

/** Slice one named `sect(...)` / `subsect(...)` including all text until the next section. */
export function extractSection(yo: string, name: string): string {
  const lines = yo.split("\n")
  const secs = extractSections(yo)
  const idx = secs.findIndex((sec) => sec.name === name)
  if (idx === -1) return ""
  const start = posOfLine(lines, secs[idx]?.line ?? 0)
  const end = posOfLine(lines, secs[idx + 1]?.line ?? lines.length)
  return yo.slice(start, end)
}

/** Extract the first balanced list block, including its markers. */
export function extractFirstList(
  yo: string,
  kind: "item" | "sitem",
): string | undefined {
  const open = kind === "item" ? "startitem()" : "startsitem()"
  const close = kind === "item" ? "enditem()" : "endsitem()"
  const start = yo.indexOf(open)
  if (start === -1) return undefined

  let depth = 0
  let pos = start
  while (pos < yo.length) {
    if (yo.startsWith(open, pos)) {
      depth++
      pos += open.length
      continue
    }
    if (yo.startsWith(close, pos)) {
      depth--
      pos += close.length
      if (depth === 0) return yo.slice(start, pos)
      continue
    }
    pos++
  }

  return yo.slice(start)
}

/** Collect aliased items, normalize bodies, and flatten into a single array. */
export function flattenAliased<T, U>(
  items: readonly YodlItem[],
  parseHeader: (header: string) => T | undefined,
  toDoc: (head: T, desc: string, item: YodlItem) => U,
): U[] {
  const out: U[] = []
  for (const entry of collectAliasedItems(items, parseHeader)) {
    const desc = normalizeBody(entry.item.body ?? "")
    out.push(toDoc(entry.head, desc, entry.item))
    for (const alias of entry.aliases) out.push(toDoc(alias, desc, entry.item))
  }
  return out
}

export function collectAliasedItems<T>(
  items: readonly YodlItem[],
  parse: (header: string) => T | undefined,
): AliasedYodlItem<T>[] {
  const out: AliasedYodlItem<T>[] = []
  let pending: T[] = []

  for (const item of items) {
    const head = parse(item.header)
    if (!head) {
      pending = []
      continue
    }
    if (!item.body) {
      pending.push(head)
      continue
    }
    out.push({ head, aliases: pending, item })
    pending = []
  }

  return out
}

/** Extract sect()/subsect() headers with line positions */
export function extractSections(yo: string): YodlSection[] {
  const out: YodlSection[] = []
  const lines = yo.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const sm = line.match(/^sect\((.+?)\)/)
    if (sm?.[1]) {
      out.push({ level: "sect", name: sm[1], line: i })
      continue
    }
    const ssm = line.match(/^subsect\((.+?)\)/)
    if (ssm?.[1]) {
      out.push({ level: "subsect", name: ssm[1], line: i })
    }
  }
  return out
}

export function extractSectionBody(yo: string, name: string): string {
  const lines = yo.split("\n")
  const sections = extractSections(yo)
  const idx = sections.findIndex((section) => section.name === name)
  if (idx === -1) return ""
  const start = (sections[idx]?.line ?? 0) + 1
  const end = sections[idx + 1]?.line ?? lines.length
  return lines.slice(start, end).join("\n")
}

function matchAt(s: string, pos: number, tag: string): boolean {
  if (pos + tag.length > s.length) return false
  // must be at line start or preceded by whitespace/newline
  if (
    pos > 0 &&
    s[pos - 1] !== "\n" &&
    s[pos - 1] !== " " &&
    s[pos - 1] !== "\t"
  )
    return false
  for (let i = 0; i < tag.length; i++) {
    if (s[pos + i] !== tag[i]) return false
  }
  return true
}

function lineOfPos(lines: string[], pos: number): number {
  let charCount = 0
  for (let i = 0; i < lines.length; i++) {
    charCount += (lines[i]?.length ?? 0) + 1 // +1 for \n
    if (charCount > pos) return i
  }
  return lines.length - 1
}

function lineDepths(lines: readonly string[]): number[] {
  const out: number[] = []
  let depth = 0
  for (const line of lines) {
    out.push(depth)
    const trimmed = line.trimStart()
    if (trimmed.startsWith("startitem()") || trimmed.startsWith("startsitem()"))
      depth++
    if (trimmed.startsWith("enditem()") || trimmed.startsWith("endsitem()"))
      depth = Math.max(0, depth - 1)
  }
  return out
}

function extractListEntries(yo: string, kind: "item" | "sitem"): YodlItem[] {
  const sections = extractSections(yo)
  const lines = yo.split("\n")
  const items: YodlItem[] = []
  const open = kind === "item" ? "startitem()" : "startsitem()"
  const close = kind === "item" ? "enditem()" : "endsitem()"
  const macro = kind === "item" ? "item(" : "sitem("
  let listDepth = 0
  let pos = 0

  function sectionAt(lineIdx: number): string {
    let sec = ""
    for (const s of sections) {
      if (s.line <= lineIdx) sec = s.name
    }
    return sec
  }

  while (pos < yo.length) {
    if (yo.startsWith(open, pos)) {
      listDepth++
      pos += open.length
      continue
    }
    if (yo.startsWith(close, pos)) {
      listDepth = Math.max(0, listDepth - 1)
      pos += close.length
      continue
    }

    if (kind === "item" && listDepth === 1 && matchAt(yo, pos, "xitem(")) {
      const closePos = findBalancedClose(yo, pos + 5)
      if (closePos === -1) {
        pos++
        continue
      }
      items.push({
        header: yo.slice(pos + 6, closePos),
        section: sectionAt(lineOfPos(lines, pos)),
      })
      pos = closePos + 1
      continue
    }

    if (listDepth === 1 && matchAt(yo, pos, macro)) {
      const closePos = findBalancedClose(yo, pos + macro.length - 1)
      if (closePos === -1) {
        pos++
        continue
      }
      const lineIdx = lineOfPos(lines, pos)
      const header = yo.slice(pos + macro.length, closePos)
      if (closePos + 1 < yo.length && yo[closePos + 1] === "(") {
        const bodyClose = findBalancedClose(yo, closePos + 1)
        if (bodyClose !== -1) {
          items.push({
            header,
            body: yo.slice(closePos + 2, bodyClose).replace(/^\n/, ""),
            section: sectionAt(lineIdx),
          })
          pos = bodyClose + 1
          continue
        }
      }
      items.push({ header, section: sectionAt(lineIdx) })
      pos = closePos + 1
      continue
    }

    pos++
  }

  return items
}

function posOfLine(lines: readonly string[], line: number): number {
  let pos = 0
  for (let i = 0; i < line; i++) pos += (lines[i]?.length ?? 0) + 1
  return pos
}
