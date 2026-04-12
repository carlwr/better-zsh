import { mkCondOp } from "../../types/brand.ts"
import type { CondOpDoc } from "../../types/zsh-data.ts"
import { extractItems, flattenAliasedEntries } from "../core/doc.ts"
import { extractTokens } from "../core/text.ts"

interface ParsedUnaryHeader {
  op: string
  operands: readonly [string]
  arity: "unary"
}

interface ParsedBinaryHeader {
  op: string
  operands: readonly [string, string]
  arity: "binary"
}

type ParsedCondHeader = ParsedUnaryHeader | ParsedBinaryHeader

/** Parse cond.yo → CondOpDoc[] */
export function parseCondOps(yo: string): CondOpDoc[] {
  return flattenAliasedEntries(extractItems(yo), parseHeader, (parsed, desc) =>
    parsed.arity === "unary"
      ? {
          op: mkCondOp(parsed.op),
          operands: parsed.operands,
          desc,
          arity: "unary",
        }
      : {
          op: mkCondOp(parsed.op),
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
    (tok) => tok.kind === "tt" && /^(?:[-=!<>~|&]|\w)/.test(tok.text),
  )
  if (opIdx === -1) return undefined
  const op = tokens[opIdx]?.text
  if (!op) return undefined

  const operands = tokens
    .filter((tok) => tok.kind === "var")
    .map((tok) => tok.text)
  return tokens.slice(0, opIdx).some((tok) => tok.kind === "var")
    ? parseBinaryHeader(op, operands)
    : parseUnaryHeader(op, operands)
}

function parseUnaryHeader(
  op: string,
  operands: string[],
): ParsedUnaryHeader | undefined {
  const [arg] = operands
  return arg ? { op, operands: [arg], arity: "unary" } : undefined
}

function parseBinaryHeader(
  op: string,
  operands: string[],
): ParsedBinaryHeader | undefined {
  const [left, right] = operands
  return left && right
    ? { op, operands: [left, right], arity: "binary" }
    : undefined
}
