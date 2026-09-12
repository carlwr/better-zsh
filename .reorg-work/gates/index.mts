// S3b gate (nlp-move.md §"Before/after gates", row "index.json"): the TS-built
// packages/zshref-web/static/artifacts/index.json against the Rust oracle
// .aux/nlp-move/rust/index.json — header fields equal, same record count and
// order, `text` exact per record, every vector within cosine 0.9999 (and how
// many are f32-identical: the same ONNX model on the same runtime reproduces
// fastembed bit for bit, so most are). `corpus_hash` is reported either way:
// nlp-move.md expected the reimplementation to differ; it turned out to
// reproduce Rust's bytes (same inputs, same compact JSON). Then the rest of
// the artifact set: categories.json and lookup-map.json against the committed
// files, rules/*.json against the capture — equal as parsed JSON.
// Step tooling, not a test.
//
//   pnpm --filter zshref-web exec tsx <repo>/.reorg-work/gates/index.mts
//
// Needs: the capture, and a prior `pnpm --filter zshref-web build:index`.

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { isDeepStrictEqual } from "node:util"

const MIN_COSINE = 0.9999
const VIEWS = ["structured", "body", "expanded"] as const
type View = (typeof VIEWS)[number]
type Index = {
  version: number
  model: string
  dims: number
  normalized: boolean
  corpus_hash: string
  records: { text: Record<string, string>; vectors: Record<View, number[]> }[]
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const captureDir = join(root, ".aux", "nlp-move", "rust")
const artifacts = join(root, "packages", "zshref-web", "static", "artifacts")
const qaDir = join(root, "packages", "zshref-web", "nlp", "data")
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"))

const rust: Index = readJson(join(captureDir, "index.json"))
const ts: Index = readJson(join(artifacts, "index.json"))
let failed = 0
const check = (ok: boolean, line: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${line}`)
  if (!ok) failed++
}

for (const f of ["version", "model", "dims", "normalized"] as const)
  check(rust[f] === ts[f], `${f}: rust ${rust[f]}, ts ${ts[f]}`)
check(
  true,
  `corpus_hash ${rust.corpus_hash === ts.corpus_hash ? "equal (TS hashing reproduces Rust's)" : "differs (reimplemented; allowed)"}: rust ${rust.corpus_hash.slice(0, 12)}…, ts ${ts.corpus_hash.slice(0, 12)}…`,
)
check(
  rust.records.length === ts.records.length,
  `records: rust ${rust.records.length}, ts ${ts.records.length}`,
)

const n = Math.min(rust.records.length, ts.records.length)
let textMismatches = 0
let identical = 0
const cosines: number[] = []
let worst = { cos: 2, at: "" }
for (let i = 0; i < n; i++) {
  const a = rust.records[i]
  const b = ts.records[i]
  if (!a || !b) break
  if (!isDeepStrictEqual(a.text, b.text)) textMismatches++
  for (const view of VIEWS) {
    const [va, vb] = [a.vectors[view], b.vectors[view]]
    let s = 0
    let same = va.length === vb.length
    for (let k = 0; k < va.length; k++) {
      s += (va[k] ?? 0) * (vb[k] ?? 0)
      same &&= Math.fround(va[k] ?? 0) === Math.fround(vb[k] ?? 0)
    }
    if (same) identical++
    const cos = va.length === vb.length ? s : Number.NaN
    cosines.push(cos)
    if (!(cos >= worst.cos))
      worst = { cos, at: `${a.text.category}/${a.text.id} ${view}` }
  }
}
check(
  textMismatches === 0,
  `text exact per record: ${textMismatches} mismatches over ${n}`,
)
cosines.sort((x, y) => x - y)
const q = (p: number) =>
  cosines[Math.min(cosines.length - 1, Math.floor(p * cosines.length))] ??
  Number.NaN
const below = cosines.filter(c => !(c >= MIN_COSINE)).length
check(
  below === 0,
  `vectors: n=${cosines.length} cos min=${q(0).toFixed(8)} p1=${q(0.01).toFixed(8)} median=${q(0.5).toFixed(8)}; below ${MIN_COSINE}: ${below} (worst: ${worst.at}); f32-identical: ${identical}`,
)

const sameJson = (label: string, ours: string, theirs: string) =>
  check(
    isDeepStrictEqual(readJson(ours), readJson(theirs)),
    `${label}: equal as parsed JSON`,
  )
sameJson(
  "categories.json",
  join(artifacts, "categories.json"),
  join(qaDir, "categories.json"),
)
sameJson(
  "lookup-map.json",
  join(artifacts, "lookup-map.json"),
  join(qaDir, "lookup-map.json"),
)
for (const f of ["tuning", "stopwords", "synonyms"])
  sameJson(
    `rules/${f}.json`,
    join(artifacts, "rules", `${f}.json`),
    join(captureDir, "rules", `${f}.json`),
  )

console.log(
  failed === 0 ? "index gate: PASS" : `index gate: FAIL (${failed} check(s))`,
)
process.exit(failed === 0 ? 0 : 1)
