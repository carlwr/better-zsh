// S3a gate (nlp-move.md §"Before/after gates", row "vectors"): every record ×
// view retrieval text of the Rust oracle .aux/nlp-move/rust/index.json,
// re-embedded with the Node embedder (`"passage: " + text`, the index build's
// chunking), against the captured fastembed vectors — cosine ≥ 0.9999 each.
// Reports n, min, p1, p5, median, the count below the bar and the 3 worst.
// Step tooling, not a test.
//
//   pnpm --filter zshref-web exec tsx <repo>/.reorg-work/gates/vectors.mts [sample-size]
//
// Default: all records (1312 × 3 views, a few minutes on CPU); a sample size
// takes every k-th record for a quick run. Needs the capture and the model
// (packages/zshref-web/scripts/fetch-model). Exit 1 below the bar.

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createNodeEmbedder } from "../../packages/zshref-web/nlp/embedder-node.ts"

const MIN_COSINE = 0.9999
const VIEWS = ["structured", "body", "expanded"] as const
type View = (typeof VIEWS)[number]
type Record_ = {
  text: { category: string; id: string } & Record<View, string>
  vectors: Record<View, number[]>
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const index: { records: Record_[] } = JSON.parse(
  readFileSync(join(root, ".aux", "nlp-move", "rust", "index.json"), "utf8"),
)
const sampleSize = Number(process.argv[2] ?? index.records.length)
const step = Math.max(1, Math.floor(index.records.length / sampleSize))
const records = index.records.filter((_, i) => i % step === 0)

function cosine(a: Float32Array, b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0)
  return s
}

type Row = { rec: string; view: View; chars: number; cos: number }
const texts = records.flatMap(r => VIEWS.map(view => `passage: ${r.text[view]}`))
const e = await createNodeEmbedder()
const t0 = Date.now()
const vectors = await e.embed(texts)
const seconds = ((Date.now() - t0) / 1000).toFixed(0)

const rows: Row[] = records.flatMap((r, ri) =>
  VIEWS.map((view, vi) => ({
    rec: `${r.text.category}/${r.text.id}`,
    view,
    chars: r.text[view].length,
    cos: cosine(vectors[ri * VIEWS.length + vi] ?? new Float32Array(), r.vectors[view]),
  })),
)
rows.sort((a, b) => a.cos - b.cos)
const q = (p: number) => rows[Math.min(rows.length - 1, Math.floor(p * rows.length))]?.cos ?? Number.NaN
const below = rows.filter(r => r.cos < MIN_COSINE).length

console.log(
  `vectors: n=${rows.length} (${records.length} records × ${VIEWS.length} views, ${seconds}s)  ` +
    `cos min=${q(0).toFixed(8)}  p1=${q(0.01).toFixed(8)}  p5=${q(0.05).toFixed(8)}  median=${q(0.5).toFixed(8)}`,
)
console.log(`below ${MIN_COSINE}: ${below}`)
for (const r of rows.slice(0, 3))
  console.log(`  worst: ${r.cos.toFixed(8)}  ${r.rec}  ${r.view}  ${r.chars} chars`)
console.log(below === 0 ? "vectors gate: PASS" : `vectors gate: FAIL (${below} below ${MIN_COSINE})`)
process.exit(below === 0 ? 0 : 1)
