import { mkCondOp } from "../types/brand.ts"
import type { CondKind, CondOperator } from "../types/zsh-data.ts"
import { collectAliasedItems, extractItems, normalizeBody } from "./parse.ts"

/** Parse cond.yo → CondOperator[] */
export function parseCondOps(yo: string): CondOperator[] {
  const ops: CondOperator[] = []
  for (const entry of collectAliasedItems(extractItems(yo), parseHeader)) {
    const desc = normalizeBody(entry.item.body ?? "")
    ops.push(toDoc(entry.head, desc))
    for (const alias of entry.aliases) ops.push(toDoc(alias, desc))
  }
  return ops
}

function toDoc(
  parsed: { op: string; operands: string[]; kind: CondKind },
  desc: string,
): CondOperator {
  return {
    op: mkCondOp(parsed.op),
    operands: parsed.operands,
    desc,
    kind: parsed.kind,
  }
}

function parseHeader(
  header: string,
): { op: string; operands: string[]; kind: CondKind } | undefined {
  const tokens: { type: "tt" | "var"; val: string }[] = []
  header.replace(
    /(?:tt|var)\(([^)]*(?:\([^)]*\))*[^)]*)\)/g,
    (match, content) => {
      const type = match.startsWith("tt") ? "tt" : "var"
      let val = content as string
      val = val.replace(/LPAR\(\)/g, "(")
      val = val.replace(/RPAR\(\)/g, ")")
      val = val.replace(/PLUS\(\)/g, "+")
      val = val.replace(/LSQUARE\(\)/g, "[")
      val = val.replace(/RSQUARE\(\)/g, "]")
      val = val.replace(/PIPE\(\)/g, "|")
      tokens.push({ type: type as "tt" | "var", val })
      return ""
    },
  )

  const opIdx = tokens.findIndex(
    (t) => t.type === "tt" && /^[-=!<>~|&]|^\w/.test(t.val),
  )
  if (opIdx === -1) return undefined
  // biome-ignore lint/style/noNonNullAssertion: opIdx !== -1 checked above
  const op = tokens[opIdx]!.val

  const operands = tokens.filter((t) => t.type === "var").map((t) => t.val)

  const varsBefore = tokens.slice(0, opIdx).filter((t) => t.type === "var")
  const kind: CondKind = varsBefore.length > 0 ? "binary" : "unary"

  return { op, operands, kind }
}
