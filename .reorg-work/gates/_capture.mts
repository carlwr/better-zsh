// Shared plumbing of the S4c gates (tune-dashboard, tune-sweep, tune-diff):
// the capture paths, the report slice of a cargo-test transcript, the line
// diff, and the resolver hit AS RUST COMPUTED IT — its `zsh_docs` verdict
// from rust/docs.jsonl for every captured query (nlp-move.md §"Decided
// during execution"; the curated train split
// feeds every one of these reporters, so the same substitution applies).
// Step tooling, not a test.

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { ResolverHitSource } from "../../packages/zshref-web/nlp/oracle.ts"
import { corpusResolverHit } from "../../packages/zshref-web/nlp/oracle.ts"
import type { ResolverHit } from "../../packages/zshref-web/src/lib/ranker/types.ts"

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
export const auxDir = join(root, ".aux", "nlp-move")
export const webDir = join(root, "packages", "zshref-web")
export const evalDir = join(auxDir, "rust", "eval")

/** The capture's `src` tags whose queries the tuning reporters rank. */
export const CAPTURED_SRCS = [
  "contract-decorated",
  "nl-question",
  "sentence-train",
]

type Request = { src: string; input: { query: string } }
type Docs = { output: { matches: { category: string; id: string }[] } }

export const readJsonl = <T,>(p: string): T[] =>
  readFileSync(p, "utf8")
    .split("\n")
    .filter(l => l.trim() !== "")
    .map(l => JSON.parse(l) as T)

/** cargo-test's own lines around (and, for a long test, inside) a report. */
const isHarnessNoise = (l: string): boolean =>
  /^(test |running \d|test result:|\[skip\] |\s+(Finished|Running) )/.test(l)

/**
 * The report lines of a transcript: from the first line satisfying `from`
 * through the last satisfying `to`, harness noise dropped. `from` is
 * inclusive; the leading blank line every report starts with is not part of
 * the slice, so compare against a rendered report's `.trim()`.
 */
export function reportSlice(
  text: string,
  from: (l: string) => boolean,
  to: (l: string) => boolean,
): string[] {
  const lines = text.split("\n").filter(l => !isHarnessNoise(l))
  const start = lines.findIndex(from)
  const end = lines.findLastIndex(to)
  if (start === -1 || end < start) throw new Error("report markers not found")
  return lines.slice(start, end + 1)
}

/** `< want` / `> got` per differing position; its line count is the verdict. */
export function diffLines(want: string[], got: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < Math.max(want.length, got.length); i++) {
    if (want[i] === got[i]) continue
    if (want[i] !== undefined) out.push(`< ${want[i]}`)
    if (got[i] !== undefined) out.push(`> ${got[i]}`)
  }
  return out
}

/** Rust's resolver verdict per captured query: `matches[0]` of the `zsh_docs` response, none when empty. */
export function rustVerdicts(): Map<string, ResolverHit | null> {
  const requests = readJsonl<Request>(join(auxDir, "queries", "set.jsonl"))
  const docs = readJsonl<Docs>(join(auxDir, "rust", "docs.jsonl"))
  const out = new Map<string, ResolverHit | null>()
  requests.forEach((r, i) => {
    if (!CAPTURED_SRCS.includes(r.src)) return
    const m = docs[i]?.output.matches[0]
    out.set(r.input.query, m ? { category: m.category, id: m.id } : null)
  })
  return out
}

/** The captured verdict where there is one, the TS hit elsewhere. */
export function rustResolverHit(
  corpus: Parameters<typeof corpusResolverHit>[0],
): ResolverHitSource {
  const tsHit = corpusResolverHit(corpus)
  const verdicts = rustVerdicts()
  return (query, category) => {
    const v = verdicts.get(query)
    return v === undefined ? tsHit(query, category) : v
  }
}

/** Print the informational diff of a run that is listed, not counted. */
export function listOnly(label: string, want: string[], got: string[]): void {
  const d = diffLines(want, got)
  console.log(
    `${label}: ${d.length === 0 ? "equal" : `${d.length} lines differ — the recorded resolver-key gap; listed, not counted`}`,
  )
  for (const l of d) console.log(`  ${l}`)
}

/** The gate's verdict line; exits 1 on FAIL. */
export function verdict(gate: string, want: string[], got: string[]): void {
  const d = diffLines(want, got)
  if (d.length === 0) {
    console.log(`${gate} gate: PASS (${want.length} report lines equal)`)
    return
  }
  console.log(`${gate} gate: FAIL: ${d.length} lines differ (< rust, > ts)`)
  for (const l of d) console.log(`  ${l}`)
  process.exit(1)
}

/** Printable ASCII only — the precondition for `rustDebugString` needing no escape beyond `\"` and `\\`. */
export const isPrintableAscii = (s: string): boolean => /^[\x20-\x7e]*$/.test(s)
