import { mkCondOp } from "../../types/brand.ts"
import type { CondKind, CondOpDoc } from "../../types/zsh-data.ts"
import { extractItems, flattenAliasedEntries } from "../core/doc.ts"
import { extractTokens } from "../core/text.ts"

/** Parse cond.yo → CondOpDoc[] */
export function parseCondOps(yo: string): CondOpDoc[] {
  return flattenAliasedEntries(
    extractItems(yo),
    parseHeader,
    (parsed, desc) => ({
      op: mkCondOp(parsed.op),
      operands: parsed.operands,
      desc,
      kind: parsed.kind,
    }),
  )
}

function parseHeader(
  header: Parameters<typeof extractTokens>[0],
): { op: string; operands: string[]; kind: CondKind } | undefined {
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
  const kind: CondKind = tokens
    .slice(0, opIdx)
    .some((tok) => tok.kind === "var")
    ? "binary"
    : "unary"

  return { op, operands, kind }
}
