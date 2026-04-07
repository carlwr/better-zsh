import { commentStart } from "./comment.ts"
import { advanceQuote, isQuoted, mkQuoteState } from "./quote-state.ts"
import type { BuiltinName } from "./types/brand.ts"
import { mkBuiltinName, mkTextOffset } from "./types/brand.ts"
import type { PrecmdName } from "./types/zsh-data.ts"

export interface DocLike {
  lineAt(i: number): { text: string }
  lineCount: number
}

/** Half-open text span in absolute document offsets. */
export interface TextSpan {
  start: number
  end: number
}

export type AnalysisStrength = "hard" | "heuristic"
export type AnalysisCtx = "setopt" | "cond" | "arith"
export type AnalysisKind = "ctx" | "cmd-head" | "precmd" | "func-decl"

/** Shared fields for document-analysis facts. */
export interface BaseFact {
  kind: AnalysisKind
  span: TextSpan
  strength: AnalysisStrength
}

/** Context fact covering a region that should be interpreted specially. */
export interface CtxFact extends BaseFact {
  kind: "ctx"
  ctx: AnalysisCtx
}

/** Heuristic command-head fact for a command-like word. */
export interface CmdHeadFact extends BaseFact {
  kind: "cmd-head"
  text: string
  name: BuiltinName
  precmds: readonly PrecmdName[]
}

/** Hard fact for a recognized precommand modifier. */
export interface PrecmdFact extends BaseFact {
  kind: "precmd"
  text: string
  name: PrecmdName
}

/** Hard fact for a shell function declaration head. */
export interface FuncDeclFact extends BaseFact {
  kind: "func-decl"
  name: string
  nameSpan: TextSpan
}

export type AnalysisFact = CtxFact | CmdHeadFact | PrecmdFact | FuncDeclFact
export type CmdFact = CmdHeadFact | PrecmdFact

const TRANSPARENT = new Set([
  "do",
  "then",
  "else",
  "elif",
  "!",
  "{",
  "if",
  "while",
  "until",
  "time",
])

const RESERVED = new Set([
  "if",
  "then",
  "else",
  "elif",
  "fi",
  "for",
  "in",
  "while",
  "until",
  "do",
  "done",
  "case",
  "esac",
  "select",
  "coproc",
  "function",
  "!",
  "{",
  "}",
  "[[",
  "]]",
  "time",
])

const PRECMDS = new Set<PrecmdName>([
  "-",
  "builtin",
  "command",
  "exec",
  "nocorrect",
  "noglob",
])

const FUNC_DECL = /^(\s*)([\w][\w-]*)\s*\(\)/
const FUNC_KW = /^(\s*)function\s+([\w][\w-]*)/

/** Analyze a whole document and return coarse zsh syntax facts. */
export function analyzeDoc(doc: DocLike): AnalysisFact[] {
  const lines = readLines(doc)
  const starts = lineStarts(lines)
  const facts: AnalysisFact[] = []

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? ""
    const base = starts[i] ?? 0
    const decl = funcDeclAtLine(text)
    if (decl) {
      facts.push({
        kind: "func-decl",
        span: absSpan(base, { start: 0, end: text.length }),
        name: decl.name,
        nameSpan: absSpan(base, {
          start: decl.start,
          end: decl.start + decl.name.length,
        }),
        strength: "hard",
      })
    }

    for (const fact of cmdHeadFactsOnLine(text, commentStart(text))) {
      facts.push({ ...fact, span: absSpan(base, fact.span) })
    }
  }

  facts.push(...ctxFacts(lines, starts))
  facts.push(...setoptCtxFacts(lines, starts))

  return facts
}

/** Return analysis facts covering the given document position. */
export function factsAt(
  doc: DocLike,
  line: number,
  char: number,
): AnalysisFact[] {
  const starts = lineStarts(readLines(doc))
  const off = (starts[line] ?? 0) + char
  return analyzeDoc(doc).filter((fact) =>
    hasOffset(fact.span, off, fact.kind === "ctx"),
  )
}

/** Extract command/precommand facts from a single line. */
export function cmdHeadFactsOnLine(
  line: string,
  commentAt: number | undefined = commentStart(line),
): CmdFact[] {
  const len = commentAt ?? line.length
  const out: CmdFact[] = []
  let i = 0
  let expectCmd = true
  let mods: PrecmdName[] = []

  while (i < len) {
    i = skipWhitespace(line, i, len)
    if (i >= len) break

    const ch = line.charAt(i)
    if (ch === ";" || ch === "(" || ch === "\n") {
      expectCmd = true
      mods = []
      i++
      continue
    }
    if (ch === "|") {
      expectCmd = true
      mods = []
      i++
      if (i < len && line[i] === "|") i++
      continue
    }
    if (ch === "&" && i + 1 < len && line[i + 1] === "&") {
      expectCmd = true
      mods = []
      i += 2
      continue
    }

    const redirLen = matchRedirection(line, i, len)
    if (redirLen > 0) {
      i += redirLen
      i = skipWhitespace(line, i, len)
      i = skipWord(line, i, len)
      continue
    }

    const wStart = i
    i = skipWord(line, i, len)
    if (i === wStart) {
      i++
      continue
    }

    const word = line.slice(wStart, i)
    if (!expectCmd) continue

    const fnEnd = matchFuncDef(line, i, len)
    if (fnEnd !== undefined) {
      i = fnEnd
      continue
    }

    if (RESERVED.has(word)) {
      expectCmd = TRANSPARENT.has(word)
      if (!expectCmd) mods = []
      continue
    }

    if (isPrecmdName(word)) {
      out.push({
        kind: "precmd",
        span: { start: wStart, end: i },
        text: word,
        name: word,
        strength: "hard",
      })
      mods = [...mods, word]
      const parsed = skipPrecmdArgs(line, i, len, word)
      i = parsed.end
      if (parsed.stopsHead) {
        expectCmd = false
        mods = []
      }
      continue
    }

    out.push({
      kind: "cmd-head",
      span: { start: wStart, end: i },
      text: word,
      name: mkBuiltinName(word),
      precmds: mods,
      strength: "heuristic",
    })
    expectCmd = false
    mods = []
  }

  return out
}

export function factText(doc: DocLike, span: TextSpan): string {
  return readLines(doc).join("\n").slice(span.start, span.end)
}

/** Narrow an analysis fact to a context fact. */
export function isCtxFact(fact: AnalysisFact): fact is CtxFact {
  return fact.kind === "ctx"
}

/** Narrow an analysis fact to a function-declaration fact. */
export function isFuncDeclFact(fact: AnalysisFact): fact is FuncDeclFact {
  return fact.kind === "func-decl"
}

/** Narrow an analysis fact to a precommand fact. */
export function isPrecmdFact(fact: AnalysisFact): fact is PrecmdFact {
  return fact.kind === "precmd"
}

function ctxFacts(
  lines: readonly string[],
  starts: readonly number[],
): CtxFact[] {
  return [
    ...scanPairedCtx(lines, starts, "[[", "]]", "cond"),
    ...scanPairedCtx(lines, starts, "((", "))", "arith"),
    ...scanSingleBracketCtx(lines, starts),
  ]
}

function scanPairedCtx(
  lines: readonly string[],
  starts: readonly number[],
  open: string,
  close: string,
  ctx: AnalysisCtx,
): CtxFact[] {
  const out: CtxFact[] = []
  let depth = 0
  let qst = mkQuoteState()
  let start = 0

  for (let line = 0; line < lines.length; line++) {
    const text = activeText(lines[line] ?? "")
    const base = starts[line] ?? 0
    for (let i = 0; i < text.length; i++) {
      const ch = text.charAt(i)
      const prev = qst
      qst = advanceQuote(qst, ch)
      if (isQuoted(prev)) continue
      if (matchesAt(text, i, open)) {
        if (depth === 0) start = base + i
        depth++
        i++
        continue
      }
      if (matchesAt(text, i, close) && depth > 0) {
        depth--
        if (depth === 0) {
          out.push({
            kind: "ctx",
            ctx,
            span: { start, end: base + i + 2 },
            strength: "heuristic",
          })
        }
        i++
      }
    }
  }

  return out
}

function scanSingleBracketCtx(
  lines: readonly string[],
  starts: readonly number[],
): CtxFact[] {
  const out: CtxFact[] = []

  for (let line = 0; line < lines.length; line++) {
    const text = activeText(lines[line] ?? "")
    const base = starts[line] ?? 0
    for (const fact of cmdHeadFactsOnLine(text)) {
      if (fact.kind !== "cmd-head") continue
      if (fact.text !== "[" && fact.text !== "test") continue
      const end =
        fact.text === "test" ? text.length : closingBracket(text, fact.span.end)
      out.push({
        kind: "ctx",
        ctx: "cond",
        span: { start: base + fact.span.start, end: base + end },
        strength: "heuristic",
      })
    }
  }

  return out
}

function setoptCtxFacts(
  lines: readonly string[],
  starts: readonly number[],
): CtxFact[] {
  const out: CtxFact[] = []

  for (let line = 0; line < lines.length; line++) {
    if (line > 0 && (lines[line - 1] ?? "").trimEnd().endsWith("\\")) continue

    let endLine = line
    while ((lines[endLine] ?? "").trimEnd().endsWith("\\")) endLine++

    const first = activeText(lines[line] ?? "")
    const head = cmdHeadFactsOnLine(first).find(
      (fact): fact is CmdHeadFact => fact.kind === "cmd-head",
    )
    if (!head || head.precmds.includes("command")) continue
    if (!isSetoptHead(head, first)) continue

    const last = activeText(lines[endLine] ?? "")
    out.push({
      kind: "ctx",
      ctx: "setopt",
      span: {
        start: (starts[line] ?? 0) + head.span.start,
        end: (starts[endLine] ?? 0) + last.length,
      },
      strength: "heuristic",
    })
  }

  return out
}

function isSetoptHead(head: CmdHeadFact, line: string): boolean {
  if (head.text === "setopt" || head.text === "unsetopt") return true
  if (head.text !== "set") return false
  return /\s+[+-][A-Za-z0-9]/.test(line.slice(head.span.end))
}

export function funcDeclAtLine(
  line: string,
): { name: string; start: number } | undefined {
  const decl = line.match(FUNC_DECL)
  if (decl?.[2]) return { name: decl[2], start: (decl[1] ?? "").length }
  const kw = line.match(FUNC_KW)
  if (!kw?.[2]) return
  return { name: kw[2], start: line.indexOf(kw[2], (kw[1] ?? "").length) }
}

function skipPrecmdArgs(
  line: string,
  pos: number,
  len: number,
  name: PrecmdName,
): { end: number; stopsHead: boolean } {
  let i = pos

  if (name === "command") {
    let lookupOnly = false
    for (;;) {
      const next = nextWord(line, i, len)
      if (!next) return { end: i, stopsHead: lookupOnly }
      const word = line.slice(next.start, next.end)
      if (!/^-[-A-Za-z]+$/.test(word)) return { end: i, stopsHead: lookupOnly }
      if (word === "--") return { end: next.end, stopsHead: lookupOnly }
      if (!/^-[pvV]+$/.test(word)) return { end: i, stopsHead: lookupOnly }
      if (/[vV]/.test(word)) lookupOnly = true
      i = next.end
    }
  }

  if (name === "exec") {
    for (;;) {
      const next = nextWord(line, i, len)
      if (!next) return { end: i, stopsHead: false }
      const word = line.slice(next.start, next.end)
      if (!/^-[-A-Za-z]+$/.test(word)) return { end: i, stopsHead: false }
      if (word === "--") return { end: next.end, stopsHead: false }
      if (!/^-[acl]+$/.test(word)) return { end: i, stopsHead: false }
      i = next.end
      if (word.includes("a")) {
        const arg = nextWord(line, i, len)
        return arg
          ? { end: arg.end, stopsHead: false }
          : { end: i, stopsHead: false }
      }
    }
  }

  return { end: i, stopsHead: false }
}

function nextWord(
  line: string,
  pos: number,
  len: number,
): { start: number; end: number } | undefined {
  const start = skipWhitespace(line, pos, len)
  if (start >= len) return
  const end = skipWord(line, start, len)
  return end === start ? undefined : { start, end }
}

function activeText(line: string): string {
  const cut = commentStart(line) ?? line.length
  return line.slice(0, cut)
}

function readLines(doc: DocLike): string[] {
  const out: string[] = []
  for (let i = 0; i < doc.lineCount; i++) out.push(doc.lineAt(i).text)
  return out
}

function lineStarts(lines: readonly string[]): number[] {
  const out: number[] = []
  let off = 0
  for (const line of lines) {
    out.push(off)
    off += line.length + 1
  }
  return out
}

function absSpan(base: number, span: TextSpan): TextSpan {
  return {
    start: mkTextOffset(base + span.start) as number,
    end: mkTextOffset(base + span.end) as number,
  }
}

function hasOffset(span: TextSpan, off: number, inclusiveEnd = false): boolean {
  return inclusiveEnd
    ? span.start <= off && off <= span.end
    : span.start <= off && off < span.end
}

function matchesAt(s: string, pos: number, token: string): boolean {
  return s.slice(pos, pos + token.length) === token
}

function isPrecmdName(word: string): word is PrecmdName {
  return PRECMDS.has(word as PrecmdName)
}

function closingBracket(line: string, pos: number): number {
  const m = /(^|\s)\](?=\s|$|[;|&)])/.exec(line.slice(pos))
  return m?.index !== undefined ? pos + m.index + m[0].length : line.length
}

function skipWhitespace(s: string, i: number, len: number): number {
  while (i < len && (s[i] === " " || s[i] === "\t")) i++
  return i
}

function skipWord(s: string, i: number, len: number): number {
  const start = i
  while (i < len) {
    const ch = s.charAt(i)
    if (ch === " " || ch === "\t") break
    if (
      ch === ";" ||
      ch === "|" ||
      ch === "&" ||
      ch === "(" ||
      ch === ")" ||
      ch === "\n"
    )
      break
    if (ch === ">" || ch === "<") break
    if (ch === "{" && i !== start) break
    if (ch === "}" && i !== start) break
    if (ch === "'") {
      i = skipSingleQuote(s, i, len)
      continue
    }
    if (ch === '"') {
      i = skipDoubleQuote(s, i, len)
      continue
    }
    if (ch === "$" && i + 1 < len && s[i + 1] === "{") {
      i = skipParamExpansion(s, i, len)
      continue
    }
    if (ch === "\\") {
      i += 2
      continue
    }
    i++
  }
  return i
}

function skipSingleQuote(s: string, i: number, len: number): number {
  i++
  while (i < len && s[i] !== "'") i++
  if (i < len) i++
  return i
}

function skipDoubleQuote(s: string, i: number, len: number): number {
  i++
  while (i < len && s[i] !== '"') {
    if (s[i] === "$" && i + 1 < len && s[i + 1] === "{") {
      i = skipParamExpansion(s, i, len)
      continue
    }
    if (s[i] === "\\") i++
    i++
  }
  if (i < len) i++
  return i
}

function skipParamExpansion(s: string, i: number, len: number): number {
  if (i + 1 >= len || s[i] !== "$" || s[i + 1] !== "{") return i
  i += 2
  let depth = 1
  while (i < len && depth > 0) {
    const ch = s.charAt(i)
    if (ch === "'") {
      i = skipSingleQuote(s, i, len)
      continue
    }
    if (ch === '"') {
      i = skipDoubleQuote(s, i, len)
      continue
    }
    if (ch === "\\") {
      i += 2
      continue
    }
    if (ch === "$" && i + 1 < len && s[i + 1] === "{") {
      depth++
      i += 2
      continue
    }
    if (ch === "}") {
      depth--
      i++
      continue
    }
    i++
  }
  return i
}

function matchFuncDef(s: string, i: number, len: number): number | undefined {
  let pos = i
  while (pos < len && (s[pos] === " " || s[pos] === "\t")) pos++
  if (pos + 1 >= len || s[pos] !== "(" || s[pos + 1] !== ")") return
  return pos + 2
}

function matchRedirection(s: string, i: number, len: number): number {
  let pos = i
  if (pos < len && s.charAt(pos) >= "0" && s.charAt(pos) <= "9") {
    const next = pos + 1
    if (next < len && (s[next] === ">" || s[next] === "<")) pos = next
  }
  if (pos >= len) return 0

  const ch = s.charAt(pos)
  if (ch === ">") {
    pos++
    if (pos < len && s[pos] === ">") pos++
    if (pos < len && s[pos] === "|") pos++
    if (pos < len && s[pos] === "&") pos++
    return pos - i
  }
  if (ch === "<") {
    pos++
    if (pos < len && s[pos] === "<") {
      pos++
      if (pos < len && s[pos] === "<") pos++
    }
    if (pos < len && (s[pos] === "&" || s[pos] === ">")) pos++
    return pos - i
  }
  return 0
}
