import { commentStart } from "../comment.ts"
import { mkBuiltinName } from "../types/brand.ts"
import { type PrecmdName, precmdNames } from "../types/precmd.ts"
import { activeText, type TextSpan } from "./doc.ts"
import {
  type CmdHeadFact,
  isCmdHeadFact,
  type LineFact,
  type PrecmdFact,
} from "./fact-types.ts"

const TRANSPARENT: ReadonlySet<string> = new Set([
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

const RESERVED: ReadonlySet<string> = new Set([
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

const PRECMDS: ReadonlySet<PrecmdName> = new Set<PrecmdName>(precmdNames)

const FUNC_DECL = /^(\s*)([\w][\w-]*)\s*\(\)/
const FUNC_KW = /^(\s*)function\s+([\w][\w-]*)/

export function cmdHeadFactsOnLine(
  line: string,
  commentAt: number | undefined = commentStart(line),
): LineFact[] {
  const len = commentAt ?? line.length
  const out: LineFact[] = []
  let i = 0
  let expectCmd = true
  let precmds: readonly PrecmdName[] = []

  // expectCmd: true when the next word should be in command position
  // precmds:   precommand modifiers accumulated before the current command head
  while (i < len) {
    i = skipWhitespace(line, i, len)
    if (i >= len) break

    const ch = line.charAt(i)
    if (
      ch === ";" ||
      (ch === "(" && !(i + 1 < len && line[i + 1] === "(")) ||
      ch === "\n"
    ) {
      expectCmd = true
      precmds = []
      i++
      continue
    }
    if (ch === "|") {
      expectCmd = true
      precmds = []
      i += i + 1 < len && line[i + 1] === "|" ? 2 : 1
      continue
    }
    if (ch === "&" && i + 1 < len && line[i + 1] === "&") {
      expectCmd = true
      precmds = []
      i += 2
      continue
    }

    const processSubstSpan = matchProcessSubst(line, i, len)
    if (processSubstSpan) {
      out.push({
        kind: "process-subst",
        text: line.slice(processSubstSpan.start, processSubstSpan.end),
        span: processSubstSpan,
        strength: "heuristic",
      })
      i = processSubstSpan.end
      continue
    }

    const redirSpan = matchRedirection(line, i, len)
    if (redirSpan) {
      out.push({
        kind: "redir",
        text: line.slice(redirSpan.start, redirSpan.end),
        span: redirSpan,
        strength: "heuristic",
      })
      i = skipWord(line, skipWhitespace(line, redirSpan.end, len), len)
      continue
    }

    const arithCondSpan = expectCmd ? matchArithCond(line, i, len) : undefined
    if (arithCondSpan) {
      // Emit (( and )) as reserved-word facts so downstream consumers can keep
      // treating them like keywords without a separate fact kind/token type.
      out.push(
        reservedWordFact(
          "((",
          { start: arithCondSpan.start, end: i + 2 },
          "heuristic",
        ),
        reservedWordFact(
          "))",
          { start: arithCondSpan.end - 2, end: arithCondSpan.end },
          "heuristic",
        ),
      )
      i = arithCondSpan.end
      continue
    }

    const wordSpan = nextWordSpan(line, i, len)
    if (!wordSpan) {
      i++
      continue
    }

    const word = line.slice(wordSpan.start, wordSpan.end)
    i = wordSpan.end
    if (!expectCmd) continue

    const fnEnd = matchFuncDef(line, i, len)
    if (fnEnd !== undefined) {
      i = fnEnd
      continue
    }

    if (RESERVED.has(word)) {
      out.push(reservedWordFact(word, wordSpan, "hard"))
      expectCmd = TRANSPARENT.has(word)
      if (!expectCmd) precmds = []
      continue
    }

    if (isPrecmdName(word)) {
      out.push(precmdFact(word, wordSpan))
      precmds = [...precmds, word]
      const parsed = skipPrecmdArgs(line, i, len, word)
      i = parsed.end
      if (parsed.stopsHead) {
        expectCmd = false
        precmds = []
      }
      continue
    }

    out.push(cmdHeadFact(word, wordSpan, precmds))
    expectCmd = false
    precmds = []
  }

  return out
}

export function firstCmdHeadOnLine(line: string): CmdHeadFact | undefined {
  return cmdHeadFactsOnLine(activeText(line)).find(isCmdHeadFact)
}

export function isSetoptHead(head: CmdHeadFact, line: string): boolean {
  if (head.text === "setopt" || head.text === "unsetopt") return true
  if (head.text !== "set") return false
  return /\s+[+-][A-Za-z0-9]/.test(line.slice(head.span.end))
}

/** Detect a function declaration at the start of a line (both `f() {}` and `function f` forms). */
export function funcDeclAtLine(
  line: string,
): { name: string; start: number } | undefined {
  const decl = line.match(FUNC_DECL)
  if (decl?.[2]) return { name: decl[2], start: (decl[1] ?? "").length }
  const kw = line.match(FUNC_KW)
  if (!kw?.[2]) return
  return { name: kw[2], start: line.indexOf(kw[2], (kw[1] ?? "").length) }
}

function cmdHeadFact(
  text: string,
  span: TextSpan,
  precmds: readonly PrecmdName[],
): CmdHeadFact {
  return {
    kind: "cmd-head",
    span,
    text,
    name: mkBuiltinName(text),
    precmds,
    strength: "heuristic",
  }
}

function precmdFact(text: PrecmdName, span: TextSpan): PrecmdFact {
  return {
    kind: "precmd",
    span,
    text,
    name: text,
    strength: "hard",
  }
}

function reservedWordFact(
  text: string,
  span: TextSpan,
  strength: "hard" | "heuristic",
): LineFact {
  return { kind: "reserved-word", text, span, strength }
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
      const next = nextWordSpan(line, i, len)
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
      const next = nextWordSpan(line, i, len)
      if (!next) return { end: i, stopsHead: false }
      const word = line.slice(next.start, next.end)
      if (!/^-[-A-Za-z]+$/.test(word)) return { end: i, stopsHead: false }
      if (word === "--") return { end: next.end, stopsHead: false }
      if (!/^-[acl]+$/.test(word)) return { end: i, stopsHead: false }
      i = next.end
      if (word.includes("a")) {
        const arg = nextWordSpan(line, i, len)
        return arg
          ? { end: arg.end, stopsHead: false }
          : { end: i, stopsHead: false }
      }
    }
  }

  return { end: i, stopsHead: false }
}

function nextWordSpan(
  line: string,
  pos: number,
  len: number,
): TextSpan | undefined {
  const start = skipWhitespace(line, pos, len)
  if (start >= len) return
  const end = skipWord(line, start, len)
  return end === start ? undefined : { start, end }
}

function isPrecmdName(word: string): word is PrecmdName {
  return PRECMDS.has(word as PrecmdName)
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
      ch === "\n" ||
      ch === ">" ||
      ch === "<"
    )
      break
    if ((ch === "{" || ch === "}") && i !== start) break
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
      i = Math.min(i + 2, len)
      continue
    }
    i++
  }
  return i
}

function skipSingleQuote(s: string, i: number, len: number): number {
  i++
  while (i < len && s[i] !== "'") i++
  return i < len ? i + 1 : i
}

function skipDoubleQuote(s: string, i: number, len: number): number {
  i++
  while (i < len && s[i] !== '"') {
    if (s[i] === "$" && i + 1 < len && s[i + 1] === "{") {
      i = skipParamExpansion(s, i, len)
      continue
    }
    if (s[i] === "\\") {
      i = Math.min(i + 2, len)
      continue
    }
    i++
  }
  return i < len ? i + 1 : i
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
      i = Math.min(i + 2, len)
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

function matchProcessSubst(
  s: string,
  i: number,
  len: number,
): TextSpan | undefined {
  const ch = s.charAt(i)
  if (i + 1 >= len || s[i + 1] !== "(") return
  if (ch === "=") {
    if (i > 0 && s[i - 1] !== " " && s[i - 1] !== "\t") return
  } else if (ch !== "<" && ch !== ">") {
    return
  }

  let depth = 1
  let pos = i + 2
  while (pos < len && depth > 0) {
    const next = s.charAt(pos)
    if (next === "(") depth++
    else if (next === ")") depth--
    pos++
  }
  return depth === 0 ? { start: i, end: pos } : undefined
}

function matchRedirection(
  s: string,
  i: number,
  len: number,
): TextSpan | undefined {
  let pos = i
  if (pos + 1 < len && s[pos] === "&" && s[pos + 1] === ">") {
    pos += 2
    if (pos < len && s[pos] === ">") pos++
    if (pos < len && s[pos] === "|") pos++
    return { start: i, end: pos }
  }

  if (pos < len && s.charAt(pos) >= "0" && s.charAt(pos) <= "9") {
    const next = pos + 1
    if (next < len && (s[next] === ">" || s[next] === "<")) pos = next
  }
  if (pos >= len) return

  const ch = s.charAt(pos)
  if (ch === ">") {
    pos++
    if (pos < len && s[pos] === ">") pos++
    if (pos < len && s[pos] === "|") pos++
    if (pos < len && s[pos] === "&") pos++
    return { start: i, end: pos }
  }
  if (ch === "<") {
    pos++
    if (pos < len && s[pos] === "<") {
      pos++
      if (pos < len && s[pos] === "<") pos++
    }
    if (pos < len && (s[pos] === "&" || s[pos] === ">")) pos++
    return { start: i, end: pos }
  }
}

function matchArithCond(
  s: string,
  i: number,
  len: number,
): TextSpan | undefined {
  if (i + 1 >= len || s[i] !== "(" || s[i + 1] !== "(") return
  let pos = i + 2
  while (pos + 1 < len) {
    if (s[pos] === ")" && s[pos + 1] === ")") return { start: i, end: pos + 2 }
    pos++
  }
}
