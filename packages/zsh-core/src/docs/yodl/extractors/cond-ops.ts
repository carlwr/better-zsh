import { mkDocumented } from "../../brands.ts"
import type { CondOpDoc } from "../../types.ts"
import { extractItems, flattenAliasedEntries } from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { extractTokens } from "../core/text.ts"

type ParsedHeader =
  | { op: string; operands: readonly [string]; arity: "unary" }
  | { op: string; operands: readonly [string, string]; arity: "binary" }

/** Parse cond.yo → CondOpDoc[] */
export function parseCondOps(yo: YodlSrc): readonly CondOpDoc[] {
  return flattenAliasedEntries(
    extractItems(yo),
    parseHeader,
    (parsed, desc) => {
      const op = mkDocumented("conditional_op", parsed.op)
      return parsed.arity === "unary"
        ? { op, operands: parsed.operands, desc, arity: "unary" }
        : { op, operands: parsed.operands, desc, arity: "binary" }
    },
  )
}

function parseHeader(header: YodlSrc): ParsedHeader | undefined {
  const tokens = extractTokens(header)
  const opIdx = tokens.findIndex(
    tok => tok.kind === "tt" && /^(?:[-=!<>~|&]|\w)/.test(tok.text),
  )
  const op = opIdx === -1 ? undefined : tokens[opIdx]?.text
  if (!op) return undefined

  const operands = tokens.filter(tok => tok.kind === "var").map(tok => tok.text)
  const isBinary = tokens.slice(0, opIdx).some(tok => tok.kind === "var")
  if (isBinary) {
    const [left, right] = operands
    return left && right
      ? { op, operands: [left, right], arity: "binary" }
      : undefined
  }
  const [arg] = operands
  return arg ? { op, operands: [arg], arity: "unary" } : undefined
}
