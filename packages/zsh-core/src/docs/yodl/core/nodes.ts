export interface YText {
  kind: "text"
  text: string
}

export interface YMacro {
  kind: "macro"
  name: string
  args: YNode[][]
}

export type YNode = YText | YMacro
export type YNodeSeq = readonly YNode[]

interface ParseResult {
  nodes: YNode[]
  pos: number
  closed: boolean
}

export function parseNodes(raw: string): YNode[] {
  return parseSeq(raw, 0).nodes
}

export function isMacro<N extends string>(
  node: YNode | undefined,
  name: N,
): node is YMacro & { name: N } {
  return node?.kind === "macro" && node.name === name
}

export function macroArg(node: YNode | undefined, idx: number): YNodeSeq {
  return node?.kind === "macro" ? (node.args[idx] ?? []) : []
}

function parseSeq(src: string, start: number, stop?: ")"): ParseResult {
  const nodes: YNode[] = []
  let text = ""
  let pos = start
  let parenDepth = 0

  const flush = () => {
    if (!text) return
    nodes.push({ kind: "text", text })
    text = ""
  }

  while (pos < src.length) {
    if (stop && src[pos] === stop && parenDepth === 0) {
      flush()
      return { nodes, pos: pos + 1, closed: true }
    }

    // Yodl uses a `+` immediately before a macro call as a separator marker
    // that the yodl renderer consumes. `tt(realpath+LPAR()3+RPAR())` renders
    // as `realpath(3)`: the `+` is eaten, LPAR/RPAR expand. Without this,
    // vendored docs leak stray `+` chars around function/manpage refs.
    if (src[pos] === "+") {
      const macro = parseMacroAt(src, pos + 1)
      if (macro) {
        flush()
        nodes.push(macro.node)
        pos = macro.pos
        continue
      }
    }

    const macro = parseMacroAt(src, pos)
    if (!macro) {
      // Vendored docs sometimes contain literal parenthesized text inside a
      // macro arg; only an unmatched outer `)` should close the arg.
      if (src[pos] === "(") parenDepth++
      if (src[pos] === ")" && parenDepth > 0) parenDepth--
      text += src[pos]
      pos++
      continue
    }

    flush()
    nodes.push(macro.node)
    pos = macro.pos
  }

  flush()
  return { nodes, pos, closed: stop === undefined }
}

function parseMacroAt(
  src: string,
  pos: number,
): { node: YMacro; pos: number } | undefined {
  // A preceding digit is allowed: the corpus contains forms like `1tt(})`.
  if (isNamePrefix(src[pos - 1])) return undefined

  const name = macroNameAt(src, pos)
  if (!name) return undefined

  let next = pos + name.length
  if (src[next] !== "(") return undefined

  const args: YNode[][] = []
  while (src[next] === "(") {
    const inner = parseSeq(src, next + 1, ")")
    if (!inner.closed) return undefined
    args.push(inner.nodes)
    next = inner.pos
  }

  return {
    node: { kind: "macro", name, args },
    pos: next,
  }
}

function macroNameAt(src: string, pos: number): string | undefined {
  const first = src[pos]
  if (!first || !/[A-Za-z]/.test(first)) return undefined

  let end = pos + 1
  while (isWordChar(src[end])) end++
  return src.slice(pos, end)
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9_]/.test(ch)
}

function isNamePrefix(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z_]/.test(ch)
}
