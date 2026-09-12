// S3c gate (nlp-move.md §"Before/after gates", rows "boosts", "scores" and
// "top-10"): every request of .aux/nlp-move/queries/set.jsonl through the TS
// oracle runner (nlp/oracle.ts, resolver hit as Rust computed it) against the
// same line of .aux/nlp-move/rust/batch-debug.jsonl. The index is the CAPTURED
// one, so the ranker/oracle arithmetic is isolated from vector differences;
// only the query embedding is TS (transformers.js vs fastembed).
//
//   pnpm --filter zshref-web exec tsx <repo>/.reorg-work/gates/batch.mts [--limit N]
//
// Per line: (a) matchesTotal/matchesReturned equal; over the captured top 10,
// per matched (category, id): (b) boosts exact at the capture's 6 decimals,
// (c) semantic parts and score within 1e-5, (e) the non-debug fields equal;
// (d) same top-10 set and order, except adjacent swaps of captured scores
// within 2e-5 (ties, counted apart). A line failing in oracle mode whose TS
// resolver hit Rust did not have (its docs.jsonl line has matchesTotal 0) is
// re-run in product mode: passing there, it is the recorded resolver-key
// mirror gap (nlp-move.md §"Decided during execution"), listed and not
// counted. Holdout hygiene: no query, record or number of a `sentence-train`
// line is printed — its index and src tag only. Exit 1 on any counted failure.

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { createNodeEmbedder } from "../../packages/zshref-web/nlp/embedder-node.ts"
import {
  corpusResolverHit,
  docCategory,
  noResolverHit,
  type OracleDeps,
  type OracleMatch,
  type OracleResponse,
  oracleSearch,
} from "../../packages/zshref-web/nlp/oracle.ts"
import { PATHS } from "../../packages/zshref-web/nlp/paths.ts"
import { loadRulesYaml } from "../../packages/zshref-web/nlp/rules-load.ts"
import { loadVectorIndex } from "../../packages/zshref-web/src/lib/ranker/index-loader.ts"
import {
  LookupIndex,
  LookupMapSchema,
} from "../../packages/zshref-web/src/lib/ranker/lookup-map.ts"

const SCORE_TOL = 1e-5
const TIE_TOL = 2e-5
const HOLDOUT_SRC = "sentence-train"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const auxDir = join(root, ".aux", "nlp-move")
const req = createRequire(join(root, "packages", "zshref-web", "package.json"))
const zshCore = await import(
  pathToFileURL(req.resolve("@carlwr/zsh-core").replace(/\.js$/, ".mjs")).href
)

type Request = {
  src: string
  input: { query: string; limit?: number; category?: string; debug?: boolean }
}
type Captured = { ok: boolean; output: OracleResponse }
type Docs = { ok: boolean; output: { matchesTotal: number } }

const readJsonl = <T,>(p: string): T[] =>
  readFileSync(p, "utf8")
    .split("\n")
    .filter(l => l.trim() !== "")
    .map(l => JSON.parse(l) as T)

const limitArg = process.argv.indexOf("--limit")
const limit =
  limitArg === -1
    ? Number.POSITIVE_INFINITY
    : Number(process.argv[limitArg + 1])
const requests = readJsonl<Request>(join(auxDir, "queries", "set.jsonl")).slice(
  0,
  limit,
)
const captured = readJsonl<Captured>(join(auxDir, "rust", "batch-debug.jsonl"))
const docs = readJsonl<Docs>(join(auxDir, "rust", "docs.jsonl"))

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"))
const corpus = zshCore.loadCorpus()
const deps: Omit<OracleDeps, "resolverHit"> = {
  index: loadVectorIndex(readJson(join(auxDir, "rust", "index.json"))),
  rules: await loadRulesYaml(),
  lookup: new LookupIndex(LookupMapSchema.parse(readJson(PATHS.lookupMap))),
  embedder: await createNodeEmbedder(),
}
const oracleHit = corpusResolverHit(corpus)

type Check = "a" | "b" | "c" | "d-set" | "d-order" | "e"
/** One line's verdict: per-check failure notes (empty = pass) and its tie swaps. */
type Verdict = { fails: { check: Check; note: string }[]; ties: number }

const key = (m: OracleMatch) => `${m.category.id}/${m.id}`
const FIELDS = ["title", "id", "display", "subKind", "mdBody"] as const
let maxDScore = 0
let maxDSemantic = 0

function compare(ts: OracleResponse, rust: OracleResponse): Verdict {
  const fails: Verdict["fails"] = []
  const fail = (check: Check, note: string) => fails.push({ check, note })
  if (
    ts.matchesTotal !== rust.matchesTotal ||
    ts.matchesReturned !== rust.matchesReturned
  )
    fail(
      "a",
      `total ${ts.matchesTotal}/${rust.matchesTotal} returned ${ts.matchesReturned}/${rust.matchesReturned}`,
    )

  const byKey = new Map(ts.matches.map(m => [key(m), m]))
  for (const r of rust.matches) {
    const t = byKey.get(key(r))
    if (t === undefined) continue
    for (const f of FIELDS) if (t[f] !== r[f]) fail("e", `${key(r)} ${f}`)
    if (t.category.label !== r.category.label)
      fail("e", `${key(r)} category.label`)
    if (t.debug === undefined || r.debug === undefined) {
      fail(
        "b",
        `${key(r)} debug ${t.debug === undefined ? "missing" : "unexpected"} on the TS side`,
      )
      continue
    }
    for (const b of ["category", "resolver", "lexical"] as const) {
      if (t.debug.boosts[b] !== r.debug.boosts[b])
        fail(
          "b",
          `${key(r)} boosts.${b} ts=${t.debug.boosts[b]} rust=${r.debug.boosts[b]}`,
        )
    }
    for (const s of ["structured", "body", "expanded"] as const) {
      const d = Math.abs(t.debug.semantic[s] - r.debug.semantic[s])
      maxDSemantic = Math.max(maxDSemantic, d)
      if (d > SCORE_TOL)
        fail("c", `${key(r)} semantic.${s} Δ=${d.toExponential(2)}`)
    }
    const d = Math.abs(t.score - r.score)
    maxDScore = Math.max(maxDScore, d)
    if (d > SCORE_TOL) fail("c", `${key(r)} score Δ=${d.toExponential(2)}`)
  }

  const tsKeys = ts.matches.map(key)
  const rustKeys = rust.matches.map(key)
  const missing = rustKeys.filter(k => !tsKeys.includes(k))
  const extra = tsKeys.filter(k => !rustKeys.includes(k))
  let ties = 0
  if (missing.length > 0 || extra.length > 0) {
    fail(
      "d-set",
      `rust-only [${missing.join(" ")}] ts-only [${extra.join(" ")}]`,
    )
  } else {
    for (let i = 0; i < rustKeys.length; ) {
      if (tsKeys[i] === rustKeys[i]) {
        i++
        continue
      }
      const a = rust.matches[i]
      const b = rust.matches[i + 1]
      const swapped =
        b !== undefined &&
        tsKeys[i] === rustKeys[i + 1] &&
        tsKeys[i + 1] === rustKeys[i]
      if (
        swapped &&
        a !== undefined &&
        Math.abs(a.score - b.score) <= TIE_TOL
      ) {
        ties++
        i += 2
        continue
      }
      fail("d-order", `at #${i}: ts ${tsKeys[i]} rust ${rustKeys[i]}`)
      break
    }
  }
  return { fails, ties }
}

const counts: Record<Check, number> = {
  a: 0,
  b: 0,
  c: 0,
  "d-set": 0,
  "d-order": 0,
  e: 0,
}
let ties = 0
const modulo: string[] = []
const firstMismatches: string[] = []
const t0 = Date.now()

for (const [i, r] of requests.entries()) {
  const rust = captured[i]
  const doc = docs[i]
  if (rust === undefined || doc === undefined)
    throw new Error(`capture has no line ${i}`)
  if (!rust.ok || !doc.ok)
    throw new Error(`captured line ${i} is an error response`)
  let verdict = compare(
    await oracleSearch(r.input, { ...deps, resolverHit: oracleHit }),
    rust.output,
  )
  if (verdict.fails.length > 0 && doc.output.matchesTotal === 0) {
    const category =
      r.input.category === undefined ? undefined : docCategory(r.input.category)
    if (oracleHit(r.input.query.trim(), category) !== null) {
      const product = compare(
        await oracleSearch(r.input, { ...deps, resolverHit: noResolverHit }),
        rust.output,
      )
      if (product.fails.length === 0) {
        modulo.push(`  #${i} ${r.src}`)
        ties += product.ties
        continue
      }
      verdict = product.fails.length < verdict.fails.length ? product : verdict
    }
  }
  ties += verdict.ties
  for (const f of verdict.fails) counts[f.check]++
  if (verdict.fails.length > 0 && firstMismatches.length < 5) {
    const blind = r.src === HOLDOUT_SRC
    const what = blind
      ? [...new Set(verdict.fails.map(f => `(${f.check})`))].join(" ")
      : verdict.fails
          .slice(0, 3)
          .map(f => `(${f.check}) ${f.note}`)
          .join("; ")
    const q = blind ? "" : ` ${JSON.stringify(r.input.query)}`
    firstMismatches.push(`  #${i} ${r.src}${q} — ${what}`)
  }
}

const seconds = ((Date.now() - t0) / 1000).toFixed(0)
const failed = Object.values(counts).some(c => c > 0) || modulo.length > 2
console.log(
  `requests: ${requests.length} of ${captured.length} captured (${seconds}s)`,
)
console.log(`(a) totals mismatches: ${counts.a}`)
console.log(`(b) boost mismatches: ${counts.b}`)
console.log(
  `(c) semantic/score over ${SCORE_TOL}: ${counts.c}  max |Δscore|=${maxDScore.toExponential(2)}  max |Δsemantic|=${maxDSemantic.toExponential(2)}`,
)
console.log(
  `(d) top-10 set mismatches: ${counts["d-set"]}, order mismatches: ${counts["d-order"]}, tie swaps (≤ ${TIE_TOL}): ${ties}`,
)
console.log(`(e) field mismatches: ${counts.e}`)
if (modulo.length > 0) {
  console.log(
    `documented modulo (resolver-key mirror gap; pass in product mode): ${modulo.length}`,
  )
  for (const line of modulo) console.log(line)
}
if (firstMismatches.length > 0) {
  console.log("first mismatches:")
  for (const line of firstMismatches) console.log(line)
}
console.log(failed ? "batch gate: FAIL" : "batch gate: PASS")
process.exit(failed ? 1 : 0)
