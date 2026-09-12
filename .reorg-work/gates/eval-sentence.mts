// S4a gate (nlp-move.md §"Before/after gates", row "eval numbers"): the TS
// sentence eval in oracle mode against .aux/nlp-move/rust/eval/sentence.txt,
// equal at the printed precision. Step tooling, not a test.
//
//   pnpm --filter zshref-web exec tsx <repo>/.reorg-work/gates/eval-sentence.mts
//
// Needs: the model (packages/zshref-web/scripts/fetch-model), the staged index
// (pnpm --filter zshref-web build:index) and a capture under .aux/nlp-move/.
//
// Two runs, compared on the report lines only (the `[sentence-fixture]`
// header and the indented per-category rows; pnpm's and cargo's own lines
// around them are dropped):
//
// - the reporter as shipped (`pnpm --filter zshref-web nlp:eval-sentence`,
//   TS resolver hit) — informational: the recorded resolver-key mirror gap
//   (nlp-move.md §"Decided during execution": zsh-core `resolveRedir` hits
//   where Rust `resolve_redir` did not) moves the row of every train query
//   that hits it, so its diff is listed, not counted;
// - the gate proper: the same eval in-process with the resolver hit AS RUST
//   COMPUTED IT — its `zsh_docs` verdict from rust/docs.jsonl for every
//   captured train query (the set holds no holdout query; those keep the TS
//   hit). Equal here means the eval chain (fixture load, rank, promote,
//   own-rank vote, metric, render) reproduces Rust, the resolver input aside.
//
// Holdout hygiene: nothing per entry is printed — report lines are
// aggregates; the diff shows report lines only. Exit 1 on FAIL.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { embedUnique } from "../../packages/zshref-web/nlp/embedder-node.ts"
import { loadEvalAssets } from "../../packages/zshref-web/nlp/eval/assets.ts"
import {
  evalSentenceCached,
  renderSentence,
} from "../../packages/zshref-web/nlp/eval/sentence.ts"
import { loadSentenceFixture } from "../../packages/zshref-web/nlp/eval/sentence-fixture.ts"
import {
  corpusResolverHit,
  type ResolverHitSource,
} from "../../packages/zshref-web/nlp/oracle.ts"
import type { ResolverHit } from "../../packages/zshref-web/src/lib/ranker/types.ts"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const auxDir = join(root, ".aux", "nlp-move")
const webDir = join(root, "packages", "zshref-web")
const TRAIN_SRC = "sentence-train"

type Request = { src: string; input: { query: string } }
type Docs = { output: { matches: { category: string; id: string }[] } }

const readJsonl = <T,>(p: string): T[] =>
  readFileSync(p, "utf8")
    .split("\n")
    .filter(l => l.trim() !== "")
    .map(l => JSON.parse(l) as T)

/** The report lines of a reporter or cargo-test transcript. */
const reportLines = (text: string): string[] =>
  text
    .split("\n")
    .filter(
      l =>
        l.startsWith("[sentence-fixture] ") ||
        /^ {2}[A-Za-z_]+ +\d+\.\d+ {2}\(n=\d+\)$/.test(l),
    )

/** Unified-ish diff: `< want` / `> got` per differing position; its line count is the verdict. */
function diffLines(want: string[], got: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < Math.max(want.length, got.length); i++) {
    if (want[i] === got[i]) continue
    if (want[i] !== undefined) out.push(`< ${want[i]}`)
    if (got[i] !== undefined) out.push(`> ${got[i]}`)
  }
  return out
}

const want = reportLines(
  readFileSync(join(auxDir, "rust", "eval", "sentence.txt"), "utf8"),
)

// Rust's resolver verdict per captured train query: `matches[0]` of the
// `zsh_docs` response, none when it returned nothing.
const requests = readJsonl<Request>(join(auxDir, "queries", "set.jsonl"))
const docs = readJsonl<Docs>(join(auxDir, "rust", "docs.jsonl"))
const rustVerdict = new Map<string, ResolverHit | null>()
requests.forEach((r, i) => {
  if (r.src !== TRAIN_SRC) return
  const m = docs[i]?.output.matches[0]
  rustVerdict.set(r.input.query, m ? { category: m.category, id: m.id } : null)
})

// 1. The reporter as shipped.
const shipped = execFileSync(
  "pnpm",
  ["--filter", "zshref-web", "nlp:eval-sentence"],
  {
    cwd: webDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
)
const shippedDiff = diffLines(want, reportLines(shipped))
console.log(
  `reporter (TS resolver hit): ${shippedDiff.length === 0 ? "equal" : `${shippedDiff.length} lines differ — the recorded resolver-key gap; listed, not counted`}`,
)
for (const l of shippedDiff) console.log(`  ${l}`)

// 2. The eval with Rust's captured verdicts.
const assets = await loadEvalAssets()
const fixture = await loadSentenceFixture()
const tsHit = corpusResolverHit(assets.corpus)
const uncaptured = fixture.entries.filter(
  e => e.split === "train" && !rustVerdict.has(e.query),
).length
if (uncaptured > 0)
  console.log(
    `note: ${uncaptured} train entries have no captured verdict (TS hit used)`,
  )
const rustHit: ResolverHitSource = (query, category) => {
  const v = rustVerdict.get(query)
  return v === undefined ? tsHit(query, category) : v
}
const vecs = await embedUnique(
  assets.embedder,
  fixture.entries.map(e => e.query),
  assets.rules,
)
const got = reportLines(
  renderSentence(evalSentenceCached(fixture, vecs, assets, rustHit)),
)
const diff = diffLines(want, got)
if (diff.length === 0) {
  console.log(`eval-sentence gate: PASS (${want.length} report lines equal)`)
} else {
  console.log(
    `eval-sentence gate: FAIL: ${diff.length} lines differ (< rust, > ts)`,
  )
  for (const l of diff) console.log(`  ${l}`)
  process.exit(1)
}
