import { mkDocumented } from "../../brands.ts"
import type { ArithOpArity, ArithOpDoc } from "../../types.ts"
import { extractFirstSitemList, withBody } from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
import { firstTt, normalizeBody } from "../core/text.ts"

const SECTION = "Arithmetic Evaluation"

/**
 * `arith.yo` has two precedence tables (native, `C_PRECEDENCES`); we use the
 * first only — same operator set, no value in duplicates. Precedence numbers
 * intentionally not captured (high maintenance, low value). Section heading
 * lives inside `ifzman(...)` so `extractSectBody` misses it — go direct.
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
      // Same op seen twice — only `+` and `-` in the native table. Mark
      // overloaded, concat descriptions.
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
