// S4b gate (nlp-move.md §"Before/after gates", row "eval numbers"): the TS
// mechanical eval in oracle mode against .aux/nlp-move/rust/eval/
// mechanical.txt, equal at the printed precision. Step tooling, not a test.
//
//   pnpm --filter zshref-web exec tsx <repo>/.reorg-work/gates/eval-mechanical.mts
//
// Needs: the model (packages/zshref-web/scripts/fetch-model), the staged index
// (pnpm --filter zshref-web build:index) and a capture under .aux/nlp-move/.
//
// Two runs, compared on the report lines only (the `[mechanical]` header, the
// indented per-category rows and the `[combined]` line; pnpm's and cargo's own
// lines around them are dropped):
//
// - the reporter as shipped (`pnpm --filter zshref-web nlp:eval-mechanical`,
//   TS resolver hit) — informational where the recorded resolver-key mirror
//   gap (nlp-move.md §"Decided during execution": zsh-core `resolveRedir`
//   hits where Rust `resolve_redir` did not) moves a line: its diff is
//   listed, not counted;
// - the gate proper: the same eval in-process with the resolver hit AS RUST
//   COMPUTED IT — its `zsh_docs` verdict from rust/docs.jsonl for every
//   captured query the report ranks (the mechanical sources, and the curated
//   train split behind the `[combined]` line; the rest keep the TS hit).
//   The capture samples the mechanical set (every 40th decorated phrasing, a
//   thinned question set), so the gap is also reported per source: no
//   mechanical query should hit it — the gap needs a bare two-character
//   redirection operator, and every mechanical query is a decorated phrasing
//   or a question — and the captured sample is what settles it.
//
// Holdout hygiene: nothing per entry is printed beyond the corpus-derived
// mechanical gap hits; report lines are aggregates. Exit 1 on FAIL.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { embedUnique } from "../../packages/zshref-web/nlp/embedder-node.ts"
import { loadEvalAssets } from "../../packages/zshref-web/nlp/eval/assets.ts"
import {
  buildMechanical,
  evalMechanicalCached,
  renderCombined,
  renderMechanical,
} from "../../packages/zshref-web/nlp/eval/mechanical.ts"
import { evalSentenceCached } from "../../packages/zshref-web/nlp/eval/sentence.ts"
import { loadSentenceFixture } from "../../packages/zshref-web/nlp/eval/sentence-fixture.ts"
import {
  corpusResolverHit,
  type ResolverHitSource,
} from "../../packages/zshref-web/nlp/oracle.ts"
import type { ResolverHit } from "../../packages/zshref-web/src/lib/ranker/types.ts"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const auxDir = join(root, ".aux", "nlp-move")
const webDir = join(root, "packages", "zshref-web")
/** The capture's `src` tags whose queries the report ranks; the curated train split last. */
const TRAIN_SRC = "sentence-train"
const CAPTURED_SRCS = ["contract-decorated", "nl-question", TRAIN_SRC]

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
        l.startsWith("[mechanical] ") ||
        l.startsWith("[combined] ") ||
        /^ {2}[A-Za-z_]+ +\d+\.\d+ {2}\(n=\d+, #1-violations=\d+\)$/.test(l),
    )

/** `< want` / `> got` per differing position; its line count is the verdict. */
function diffLines(want: string[], got: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < Math.max(want.length, got.length); i++) {
    if (want[i] === got[i]) continue
    if (want[i] !== undefined) out.push(`< ${want[i]}`)
    if (got[i] !== undefined) out.push(`> ${got[i]}`)
  }
  return out
}

const sameHit = (a: ResolverHit | null, b: ResolverHit | null): boolean =>
  a === b ||
  (a !== null && b !== null && a.category === b.category && a.id === b.id)

const want = reportLines(
  readFileSync(join(auxDir, "rust", "eval", "mechanical.txt"), "utf8"),
)

// Rust's resolver verdict per captured query: `matches[0]` of the `zsh_docs`
// response, none when it returned nothing.
const requests = readJsonl<Request>(join(auxDir, "queries", "set.jsonl"))
const docs = readJsonl<Docs>(join(auxDir, "rust", "docs.jsonl"))
const rustVerdict = new Map<string, ResolverHit | null>()
requests.forEach((r, i) => {
  if (!CAPTURED_SRCS.includes(r.src)) return
  const m = docs[i]?.output.matches[0]
  rustVerdict.set(r.input.query, m ? { category: m.category, id: m.id } : null)
})

// 1. The reporter as shipped.
const shipped = execFileSync(
  "pnpm",
  ["--filter", "zshref-web", "nlp:eval-mechanical"],
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

// 2. The resolver gap over the captured queries, per source.
const assets = await loadEvalAssets()
const fixture = await loadSentenceFixture()
const entries = buildMechanical(assets.corpus)
const tsHit = corpusResolverHit(assets.corpus)
const show = (h: ResolverHit | null) => (h ? `${h.category}/${h.id}` : "none")
for (const src of CAPTURED_SRCS) {
  const captured = requests.filter(r => r.src === src).map(r => r.input.query)
  const hits = captured.filter(
    q => !sameHit(tsHit(q), rustVerdict.get(q) ?? null),
  )
  console.log(
    `resolver gap, ${src}: ${hits.length} of ${captured.length} captured queries`,
  )
  // Mechanical queries are corpus-derived — printable; curated ones are counted only.
  if (src !== TRAIN_SRC)
    for (const q of hits)
      console.log(
        `  ${JSON.stringify(q)}: ts=${show(tsHit(q))} rust=${show(rustVerdict.get(q) ?? null)}`,
      )
}
const uncapturedMech = entries.filter(e => !rustVerdict.has(e.query)).length
console.log(
  `note: ${uncapturedMech} of ${entries.length} mechanical entries have no captured verdict (TS hit used)`,
)

// 3. The eval with Rust's captured verdicts.
const rustHit: ResolverHitSource = (query, category) => {
  const v = rustVerdict.get(query)
  return v === undefined ? tsHit(query, category) : v
}
const mechVecs = await embedUnique(
  assets.embedder,
  entries.map(e => e.query),
  assets.rules,
)
const mech = evalMechanicalCached(entries, mechVecs, assets, rustHit)
const curatedVecs = await embedUnique(
  assets.embedder,
  fixture.entries.map(e => e.query),
  assets.rules,
)
const curated = evalSentenceCached(fixture, curatedVecs, assets, rustHit)
const got = reportLines(
  renderMechanical(mech) + renderCombined(curated.train.total, mech.all.total),
)
const diff = diffLines(want, got)
if (diff.length === 0) {
  console.log(`eval-mechanical gate: PASS (${want.length} report lines equal)`)
} else {
  console.log(
    `eval-mechanical gate: FAIL: ${diff.length} lines differ (< rust, > ts)`,
  )
  for (const l of diff) console.log(`  ${l}`)
  process.exit(1)
}
