import { mkDocumented } from "../../brands.ts"
import type { ModuleName } from "../../taxonomy.ts"
import type { CondOpDoc } from "../../types.ts"
import { extractItems, flattenAliasedEntries } from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { extractTokens } from "../core/text.ts"

/**
 * Parsed cond-op header — `op` (tt-token), `operands` (var-tokens), and the
 * arity derived from the var-token position relative to `op`. Module variants
 * share the shape; the only difference is which leading chars qualify a token
 * as the operator, controlled per-call via `opCharRe`.
 */
export type CondHeader =
  | { op: string; operands: readonly [string]; arity: "unary" }
  | { op: string; operands: readonly [string, string]; arity: "binary" }

// core cond.yo: full op-char alphabet (`==`, `!=`, `<`, `~`, `|`, `&`, plus
// flag-style `-x`). Module cond.yo files only carry `-name-of-op` forms, so
// modules pass a narrower regex (`/^[-\w]/`).
const CORE_OP_CHAR_RE = /^(?:[-=!<>~|&]|\w)/

/**
 * Parse a cond-op item header. The leading-char regex selects what counts as
 * a candidate operator token; pass a narrower one to limit accepted ops.
 */
export function parseCondHeader(
  header: YodlSrc,
  opCharRe: RegExp = CORE_OP_CHAR_RE,
): CondHeader | undefined {
  const tokens = extractTokens(header)
  const opIdx = tokens.findIndex(
    tok => tok.kind === "tt" && opCharRe.test(tok.text),
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

/**
 * Build a `CondOpDoc` from a parsed header + desc, optionally tagged with a
 * module. Constructs the discriminated union member matching `parsed.arity` so
 * `operands` and `arity` stay correlated.
 */
export function buildCondOpDoc(
  parsed: CondHeader,
  desc: string,
  module?: ModuleName,
): CondOpDoc {
  const op = mkDocumented("conditional_op", parsed.op)
  return parsed.arity === "unary"
    ? {
        op,
        operands: parsed.operands,
        desc,
        arity: "unary",
        ...(module && { module }),
      }
    : {
        op,
        operands: parsed.operands,
        desc,
        arity: "binary",
        ...(module && { module }),
      }
}

/** Parse cond.yo → CondOpDoc[] */
export function parseCondOps(yo: YodlSrc): readonly CondOpDoc[] {
  return flattenAliasedEntries(extractItems(yo), parseCondHeader, (h, desc) =>
    buildCondOpDoc(h, desc),
  )
}
