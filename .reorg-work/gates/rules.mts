// S2d gate (nlp-move.md §"Before/after gates", row "rules JSON"): the rules
// JSON the TS side emits equals the Rust capture as parsed JSON (Rust prints
// `24.0` where JS prints `24`), and the key order of the emitted text matches
// the Rust files' at every level. Step tooling, not a test.
//
//   pnpm --filter zshref-web exec tsx <repo>/.reorg-work/gates/rules.mts
//
// Needs: a capture under .aux/nlp-move/rust/rules/.

import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"

import { emitRulesJson } from "../../packages/zshref-web/nlp/rules-load.ts"
import { RULE_FILES } from "../../packages/zshref-web/nlp/rules-schema.ts"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const rustDir = join(root, ".aux", "nlp-move", "rust", "rules")

/** One line per object, depth-first: its path and its keys in textual order
 * (JSON.parse keeps it for non-numeric keys, which these all are). */
function keyOrder(v: unknown, at = "$"): string[] {
  if (Array.isArray(v)) return v.flatMap((x, i) => keyOrder(x, `${at}[${i}]`))
  if (v === null || typeof v !== "object") return []
  const obj = v as Record<string, unknown>
  const keys = Object.keys(obj)
  return [
    `${at}: ${keys.join(",")}`,
    ...keys.flatMap(k => keyOrder(obj[k], `${at}.${k}`)),
  ]
}

function firstDiff(a: string[], b: string[]): string {
  const i = a.findIndex((x, j) => x !== b[j])
  return i === -1
    ? `length ${a.length} vs ${b.length}`
    : `${a[i]} vs ${b[i] ?? "(none)"}`
}

const dir = await mkdtemp(join(tmpdir(), "rules-gate-"))
let failed = 0
try {
  await emitRulesJson(dir)
  for (const f of RULE_FILES) {
    const [got, want] = await Promise.all([
      readFile(join(dir, `${f}.json`), "utf8"),
      readFile(join(rustDir, `${f}.json`), "utf8"),
    ])
    const [g, w] = [JSON.parse(got), JSON.parse(want)]
    const equal = isDeepStrictEqual(g, w)
    const [gOrder, wOrder] = [keyOrder(g), keyOrder(w)]
    const sameOrder = isDeepStrictEqual(gOrder, wOrder)
    console.log(
      `${f}.json: parsed ${equal ? "equal" : "DIFFERS"}, key order ${sameOrder ? "equal" : "DIFFERS"}`,
    )
    if (!sameOrder)
      console.log(
        `  first order diff (ts vs rust): ${firstDiff(gOrder, wOrder)}`,
      )
    if (!equal || !sameOrder) failed++
  }
} finally {
  await rm(dir, { recursive: true, force: true })
}
console.log(
  failed === 0 ? "rules gate: PASS" : `rules gate: FAIL (${failed} file(s))`,
)
process.exit(failed === 0 ? 0 : 1)
