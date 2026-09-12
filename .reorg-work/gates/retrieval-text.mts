// Gate for the "NLP moves to zshref-web" step (nlp-move.md §"Before/after
// gates", rows "retrieval text" and "record order"): the TS retrieval text
// against the Rust oracle .aux/nlp-move/rust/index.json — record count, order
// (category/id by position) and every field of every record, exact.
//
//   pnpm --filter zshref-web exec tsx .reorg-work/gates/retrieval-text.mts
//
// Bare specifiers resolve from the package, so zsh-core is reached through
// zshref-web's package.json; the index-time synonym groups are the captured
// rules JSON (what the Rust build read). Exit 1 on any mismatch.

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import type { RecordText } from "../../packages/zshref-web/nlp/retrieval-text.ts"
import { corpusTexts } from "../../packages/zshref-web/nlp/retrieval-text.ts"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const captureDir = join(root, ".aux", "nlp-move", "rust")
const req = createRequire(join(root, "packages", "zshref-web", "package.json"))
const zshCore = await import(
  pathToFileURL(req.resolve("@carlwr/zsh-core").replace(/\.js$/, ".mjs")).href
)

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"))
const oracle: RecordText[] = readJson(
  join(captureDir, "index.json"),
).records.map((r: { text: RecordText }) => r.text)
const indexGroups: string[][] = readJson(
  join(captureDir, "rules", "synonyms.json"),
).index_groups
const ours = corpusTexts(zshCore.loadCorpus(), indexGroups)

const FIELDS = [
  "category",
  "category_label",
  "id",
  "display",
  "sub_kind",
  "title",
  "md_body",
  "structured",
  "body",
  "expanded",
] as const satisfies readonly (keyof RecordText)[]

const key = (r: RecordText) => `${r.category}/${r.id}`
const n = Math.min(oracle.length, ours.length)
let orderMismatches = 0
const perField = new Map<string, number>(FIELDS.map(f => [f, 0]))
const firstMismatches: string[] = []
let shown = 0

/** The first differing line, windowed around the first differing column, ±1 line. */
function context(lines: string[], at: number, col: number): string {
  const clip = (s: string | undefined, n: number) =>
    s === undefined ? undefined : s.length > n ? `${s.slice(0, n)}…` : s
  const line = lines[at] ?? ""
  const from = Math.max(0, col - 60)
  const to = col + 100
  const focus = `${from > 0 ? "…" : ""}${line.slice(from, to)}${to < line.length ? "…" : ""}`
  return [clip(lines[at - 1], 60), focus, clip(lines[at + 1], 60)]
    .filter(s => s !== undefined)
    .join(" ⏎ ")
}

for (let i = 0; i < n; i++) {
  const a = oracle[i]
  const b = ours[i]
  if (a === undefined || b === undefined) break
  if (key(a) !== key(b)) orderMismatches++
  for (const f of FIELDS) {
    const va = f in a ? a[f] : undefined
    const vb = f in b ? b[f] : undefined
    if (va === vb) continue
    perField.set(f, (perField.get(f) ?? 0) + 1)
    if (shown >= 3) continue
    shown++
    const la = (va ?? "").split("\n")
    const lb = (vb ?? "").split("\n")
    let at = 0
    while (at < Math.max(la.length, lb.length) && la[at] === lb[at]) at++
    const ra = la[at] ?? ""
    const rb = lb[at] ?? ""
    let col = 0
    while (col < Math.min(ra.length, rb.length) && ra[col] === rb[col]) col++
    const presence =
      va === undefined || vb === undefined
        ? ` (rust ${va === undefined ? "absent" : "present"}, ts ${vb === undefined ? "absent" : "present"})`
        : ""
    firstMismatches.push(
      `  #${i} ${key(a)} ${f} — line ${at + 1} col ${col + 1}${presence}`,
      `    rust: ${context(la, at, col)}`,
      `    ts:   ${context(lb, at, col)}`,
    )
  }
}

const fieldMismatches = [...perField.values()].reduce((s, c) => s + c, 0)
const failed =
  oracle.length !== ours.length || orderMismatches > 0 || fieldMismatches > 0

console.log(`records: rust ${oracle.length}, ts ${ours.length}`)
console.log(`order mismatches (category/id by position): ${orderMismatches}`)
console.log(
  `field mismatches: ${[...perField].map(([f, c]) => `${f}=${c}`).join(" ")}`,
)
if (firstMismatches.length > 0) {
  console.log("first mismatches:")
  for (const line of firstMismatches) console.log(line)
}
console.log(
  failed
    ? `FAIL: ${fieldMismatches} field mismatches over ${n} compared records`
    : `OK: all ${n} records match on every field (structured, body, expanded exact)`,
)
process.exit(failed ? 1 : 0)
