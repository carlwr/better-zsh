import { mkDocumented } from "../../brands.ts"
import type { ArithOpArity, ArithOpDoc } from "../../types.ts"
import { extractFirstList, extractSitemList } from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { extractTokens, normalizeBody } from "../core/text.ts"

const SECTION = "Arithmetic Evaluation"

/**
 * Parse zsh arithmetic operators from `arith.yo`.
 *
 * The file contains two precedence tables: the native-precedence one and the
 * `C_PRECEDENCES` variant. We use only the first — both define the same
 * operator set, and agents don't benefit from duplicates. Precedence numbers
 * are deliberately not captured (high maintenance, low value).
 *
 * Each `sitem(tt(OPS))(DESC)` row contains space-separated ops in the header.
 * Rows like `+ - ! ~ ++ --` list unary ops; the `+ -` row later is the binary
 * forms. `+` and `-` appear in both: we emit one record each, with
 * `arity: "overloaded"`, and concatenate the unary/binary descriptions.
 *
 * Uses `extractFirstList` directly: the section heading lives inside an
 * `ifzman(...)` wrapper so `extractSectBody` misses it, and there is only one
 * operator table in the file anyway (the first one). Precedent: cond-ops.ts.
 */
export function parseArithOps(yo: string | YNodeSeq): readonly ArithOpDoc[] {
  const list = extractFirstList(yo, "sitem")
  if (!list) return []

  const rows = extractSitemList(list).flatMap(item => {
    if (!item.body) return []
    const ops = opsInHeader(item.header)
    if (ops.length === 0) return []
    return [{ ops, desc: normalizeBody(item.body), arity: rowArity(item.body) }]
  })

  const byOp = new Map<string, { arity: ArithOpArity; desc: string }>()
  for (const row of rows) {
    for (const op of row.ops) {
      const prev = byOp.get(op)
      if (!prev) {
        byOp.set(op, { arity: row.arity, desc: row.desc })
        continue
      }
      // Same op seen twice — only true for `+` and `-` in the native table.
      // Mark as overloaded, concat descriptions for reader context.
      byOp.set(op, {
        arity: "overloaded",
        desc: `${prev.desc}\n\n${row.desc}`,
      })
    }
  }

  return [...byOp.entries()].map(([op, { arity, desc }]) => ({
    op: mkDocumented("arith_op", op),
    sig: op,
    desc,
    section: SECTION,
    arity,
  }))
}

function opsInHeader(header: Parameters<typeof extractTokens>[0]): string[] {
  const tt = extractTokens(header).find(t => t.kind === "tt")
  if (!tt) return []
  return tt.text.split(/\s+/).filter(Boolean)
}

function rowArity(body: Parameters<typeof extractTokens>[0]): ArithOpArity {
  const desc = normalizeBody(body).toLowerCase()
  if (desc.startsWith("unary")) return "unary"
  if (desc.startsWith("ternary")) return "ternary"
  return "binary"
}
