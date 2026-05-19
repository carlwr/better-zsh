import { mkDocumented } from "../../brands.ts"
import type { ArithOpArity, ArithOpDoc } from "../../types.ts"
import { extractFirstSitemList, withBody } from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { firstTt, normalizeBody } from "../core/text.ts"

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
 * Uses `extractFirstSitemList` directly: the section heading lives inside an
 * `ifzman(...)` wrapper so `extractSectBody` misses it, and there is only one
 * operator table in the file anyway (the first one). Precedent: cond-ops.ts.
 */
export function parseArithOps(yo: YodlSrc): readonly ArithOpDoc[] {
  const byOp = new Map<string, { arity: ArithOpArity; desc: string }>()
  for (const item of withBody(extractFirstSitemList(yo))) {
    const ops = (firstTt(item.header) ?? "").split(/\s+/).filter(Boolean)
    if (ops.length === 0) continue
    const desc = normalizeBody(item.body)
    const arity = rowArity(desc)
    for (const op of ops) {
      const prev = byOp.get(op)
      // Same op seen twice — only true for `+` and `-` in the native table.
      // Mark as overloaded, concat descriptions for reader context.
      byOp.set(
        op,
        prev
          ? { arity: "overloaded", desc: `${prev.desc}\n\n${desc}` }
          : { arity, desc },
      )
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

function rowArity(desc: string): ArithOpArity {
  const lower = desc.toLowerCase()
  if (lower.startsWith("unary")) return "unary"
  if (lower.startsWith("ternary")) return "ternary"
  return "binary"
}
