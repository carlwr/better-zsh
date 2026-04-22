import { mkDocumented } from "../../brands.ts"
import type { CondOpDoc } from "../../types.ts"
import { extractItems, flattenAliasedEntries } from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { extractTokens } from "../core/text.ts"

interface ParsedUnary {
  op: string
  operands: readonly [string]
  arity: "unary"
}

interface ParsedBinary {
  op: string
  operands: readonly [string, string]
  arity: "binary"
}

type ParsedCondHeader = ParsedUnary | ParsedBinary

/** Parse cond.yo → CondOpDoc[] */
export function parseCondOps(yo: string | YNodeSeq): readonly CondOpDoc[] {
  return flattenAliasedEntries(extractItems(yo), parseHeader, (parsed, desc) =>
    parsed.arity === "unary"
      ? {
          op: mkDocumented("cond_op", parsed.op),
          operands: parsed.operands,
          desc,
          arity: "unary",
        }
      : {
          op: mkDocumented("cond_op", parsed.op),
          operands: parsed.operands,
          desc,
          arity: "binary",
        },
  )
}

function parseHeader(
  header: Parameters<typeof extractTokens>[0],
): ParsedCondHeader | undefined {
  const tokens = extractTokens(header)
  const opIdx = tokens.findIndex(
    tok => tok.kind === "tt" && /^(?:[-=!<>~|&]|\w)/.test(tok.text),
  )
  if (opIdx === -1) return undefined
  const op = tokens[opIdx]?.text
  if (!op) return undefined

  const operands = tokens.filter(tok => tok.kind === "var").map(tok => tok.text)
  return tokens.slice(0, opIdx).some(tok => tok.kind === "var")
    ? parseBinaryHeader(op, operands)
    : parseUnaryHeader(op, operands)
}

function parseUnaryHeader(
  op: string,
  operands: string[],
): ParsedUnary | undefined {
  const [arg] = operands
  return arg ? { op, operands: [arg], arity: "unary" } : undefined
}

function parseBinaryHeader(
  op: string,
  operands: string[],
): ParsedBinary | undefined {
  const [left, right] = operands
  return left && right
    ? { op, operands: [left, right], arity: "binary" }
    : undefined
}
