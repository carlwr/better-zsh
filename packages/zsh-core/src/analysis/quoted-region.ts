import type { TextSpan } from "./doc.ts"
import type { QuotedRegionFact, QuoteStyle } from "./fact-types.ts"

type ScanResult =
  | { readonly kind: "closed"; readonly end: number }
  | { readonly kind: "aborted"; readonly resume: number }

const QUOTES: ReadonlySet<string> = new Set(["'", '"'])

export function quotedRegionFacts(
  lines: readonly string[],
): QuotedRegionFact[] {
  const text = lines.join("\n")
  const out: QuotedRegionFact[] = []
  let i = 0

  while (i < text.length) {
    const ch = text.charAt(i)
    if (ch === "\\") {
      i += 2
      continue
    }
    if (ch === "#") {
      i = nextLineStart(text, i)
      continue
    }
    if (!QUOTES.has(ch)) {
      i++
      continue
    }

    const scanned = scanQuoted(text, i, ch as QuoteStyle)
    if (scanned.kind === "aborted") {
      i = scanned.resume
      continue
    }
    out.push(regionFact(text, { start: i, end: scanned.end }, ch as QuoteStyle))
    i = scanned.end
  }

  return out
}

function scanQuoted(
  text: string,
  start: number,
  quote: QuoteStyle,
): ScanResult {
  return quote === "'"
    ? scanSingleQuoted(text, start)
    : scanDoubleQuoted(text, start)
}

function scanSingleQuoted(text: string, start: number): ScanResult {
  for (let i = start + 1; i < text.length; i++) {
    if (text.charAt(i) === "'") return { kind: "closed", end: i + 1 }
  }
  return { kind: "aborted", resume: text.length }
}

function scanDoubleQuoted(text: string, start: number): ScanResult {
  for (let i = start + 1; i < text.length; i++) {
    const ch = text.charAt(i)
    if (ch === '"') return { kind: "closed", end: i + 1 }
    if (ch === "\\") {
      i++
      continue
    }
    // Command substitution/backticks contain active code; omit the candidate
    // but resume after the enclosing quote when recovery is safe.
    if (ch === "`" || (ch === "$" && text.charAt(i + 1) === "(")) {
      return { kind: "aborted", resume: recoverDoubleQuoted(text, start) }
    }
    if (ch === "$" && text.charAt(i + 1) === "{") {
      const end = skipParamExpansion(text, i)
      if (end === undefined) return { kind: "aborted", resume: text.length }
      i = end - 1
    }
  }
  return { kind: "aborted", resume: text.length }
}

function recoverDoubleQuoted(text: string, start: number): number {
  return skipRecoverableDoubleQuoted(text, start) ?? text.length
}

function skipRecoverableDoubleQuoted(
  text: string,
  start: number,
): number | undefined {
  for (let i = start + 1; i < text.length; i++) {
    const ch = text.charAt(i)
    if (ch === '"') return i + 1
    if (ch === "\\") {
      i++
      continue
    }
    if (ch === "`") {
      const end = skipBackticks(text, i)
      if (end === undefined) return
      i = end - 1
      continue
    }
    if (ch === "$" && text.charAt(i + 1) === "(") {
      const end = skipCommandSubst(text, i)
      if (end === undefined) return
      i = end - 1
      continue
    }
    if (ch === "$" && text.charAt(i + 1) === "{") {
      const end = skipParamExpansion(text, i)
      if (end === undefined) return
      i = end - 1
    }
  }
}

function skipBackticks(text: string, start: number): number | undefined {
  for (let i = start + 1; i < text.length; i++) {
    const ch = text.charAt(i)
    if (ch === "`") return i + 1
    if (ch === "\\") i++
  }
}

function skipCommandSubst(text: string, start: number): number | undefined {
  let depth = 1
  for (let i = start + 2; i < text.length; i++) {
    const ch = text.charAt(i)
    if (ch === "\\") {
      i++
      continue
    }
    if (ch === "'") {
      const scanned = scanSingleQuoted(text, i)
      if (scanned.kind === "aborted") return
      i = scanned.end - 1
      continue
    }
    if (ch === '"') {
      const end = skipRecoverableDoubleQuoted(text, i)
      if (end === undefined) return
      i = end - 1
      continue
    }
    if (ch === "`") {
      const end = skipBackticks(text, i)
      if (end === undefined) return
      i = end - 1
      continue
    }
    if (ch === "$" && text.charAt(i + 1) === "{") {
      const end = skipParamExpansion(text, i)
      if (end === undefined) return
      i = end - 1
      continue
    }
    if (ch === "(") {
      depth++
      continue
    }
    if (ch === ")") {
      depth--
      if (depth === 0) return i + 1
    }
  }
}

function skipParamExpansion(text: string, start: number): number | undefined {
  let depth = 1
  for (let i = start + 2; i < text.length; i++) {
    const ch = text.charAt(i)
    if (ch === "\\") {
      i++
      continue
    }
    if (ch === "'") {
      const scanned = scanSingleQuoted(text, i)
      if (scanned.kind === "aborted") return
      i = scanned.end - 1
      continue
    }
    if (ch === '"') {
      const scanned = scanDoubleQuoted(text, i)
      if (scanned.kind === "aborted") return
      i = scanned.end - 1
      continue
    }
    if (ch === "$" && text.charAt(i + 1) === "{") {
      depth++
      i++
      continue
    }
    if (ch === "}") {
      depth--
      if (depth === 0) return i + 1
    }
  }
}

function regionFact(
  text: string,
  span: TextSpan,
  quote: QuoteStyle,
): QuotedRegionFact {
  return {
    kind: "quoted-region",
    span,
    quote,
    multiline: text.slice(span.start, span.end).includes("\n"),
    strength: "heuristic",
  }
}

function nextLineStart(text: string, pos: number): number {
  const next = text.indexOf("\n", pos)
  return next === -1 ? text.length : next + 1
}
