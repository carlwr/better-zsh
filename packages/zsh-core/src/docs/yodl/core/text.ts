import { parseNodes, type YNode, type YNodeSeq } from "./nodes.ts"

export interface YodlToken {
  kind: "tt" | "var"
  text: string
}

type RenderMode = "text" | "code"

const SPECIAL_MACROS: Record<string, string> = {
  AMP: "&",
  DASH: "-",
  HASH: "#",
  LPAR: "(",
  LSQUARE: "[",
  PIPE: "|",
  PLUS: "+",
  RPAR: ")",
  RSQUARE: "]",
  SPACES: " ",
}

export function stripYodl(src: string | YNodeSeq): string {
  return finishPlain(renderSeq(asNodes(src)))
}

export function normalizeHeader(src: string | YNodeSeq): string {
  return stripYodl(src).replace(/\s+/g, " ").trim()
}

export function normalizeBody(src: string | YNodeSeq): string {
  return normalizeDoc(stripYodl(src))
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

export function extractTokens(src: string | YNodeSeq): YodlToken[] {
  const out: YodlToken[] = []
  walkTokens(asNodes(src), out)
  return out
}

function asNodes(src: string | YNodeSeq): YNodeSeq {
  return typeof src === "string" ? parseNodes(src) : src
}

function renderSeq(nodes: YNodeSeq, mode: RenderMode = "text"): string {
  return nodes.map(node => renderNode(node, mode)).join("")
}

function renderNode(node: YNode, mode: RenderMode): string {
  if (node.kind === "text") return node.text

  if (node.name in SPECIAL_MACROS) return SPECIAL_MACROS[node.name] ?? ""

  switch (node.name) {
    case "tt":
    case "var":
      return renderSeq(node.args[0] ?? [], "code")
    case "COMMENT":
    case "cindex":
    case "findex":
    case "pindex":
    case "vindex":
    case "chapter":
    case "texinode":
    case "startitem":
    case "enditem":
    case "startsitem":
    case "endsitem":
    case "startmenu":
    case "endmenu":
      return ""
    case "example":
      return `\n\n\`\`\`zsh\n${finishPlain(renderSeq(node.args[0] ?? [], "code"))}\n\`\`\`\n\n`
    default: {
      const inner = node.args.map(arg => renderSeq(arg, mode))
      const [a = "", b = ""] = inner
      if (mode === "code" && hasEmptyArg(node)) return `${node.name}()`
      switch (node.name) {
        case "ifnzman":
          return a
        case "ifzman":
          return ""
        case "manref":
          return `${a}(${b})`
        case "sitem":
          return node.args.length >= 2 ? `- ${a}: ${b}` : a
        case "item":
        case "xitem":
          return inner.join("")
        default:
          return inner.join("")
      }
    }
  }
}

function hasEmptyArg(node: Extract<YNode, { kind: "macro" }>): boolean {
  return node.args.length === 1 && (node.args[0]?.length ?? 0) === 0
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

function renderInlineMd(s: string): string {
  let out = s
  out = out.replace(/`([^`\n]+?)'/g, (_m, code) => `\`${code}\``)
  return tightenPunctuation(out)
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
  return tightenPunctuation(
    s.replace(
      /(\b(?:see|in|described in|noted in))\n\n([A-Z][^\n]+)/gi,
      "$1 $2",
    ),
  )
}

function tightenPunctuation(s: string): string {
  return s
    .replace(/\s+([,;:!?])/g, "$1")
    .replace(/\s+\.(?=$|[\s)\]}>"'])/g, ".")
}
