import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { docCategoryPreamble } from "../docs/category-preamble.ts"
import { type DocCategory, docCategories } from "../docs/taxonomy.ts"
import type { RefDoc } from "./refs.ts"

/** Filename variants emitted by the reference-dump writer. */
export type RefDumpFile =
  | "all.md"
  | "options.md"
  | "cond-ops.md"
  | "shell-params.md"
  | "builtins.md"
  | "precmds.md"
  | "redirs.md"
  | "process-substs.md"
  | "param-expns.md"
  | "reserved-words.md"
  | "subscript-flags.md"
  | "param-flags.md"
  | "history.md"
  | "glob-ops.md"
  | "glob-flags.md"
  | "prompt-escapes.md"
  | "zle-widgets.md"
  | "suspicious.md"

const dumpFile: { [K in DocCategory]: RefDumpFile } = {
  option: "options.md",
  cond_op: "cond-ops.md",
  builtin: "builtins.md",
  precmd: "precmds.md",
  shell_param: "shell-params.md",
  reserved_word: "reserved-words.md",
  redir: "redirs.md",
  process_subst: "process-substs.md",
  param_expn: "param-expns.md",
  subscript_flag: "subscript-flags.md",
  param_flag: "param-flags.md",
  history: "history.md",
  glob_op: "glob-ops.md",
  glob_flag: "glob-flags.md",
  prompt_escape: "prompt-escapes.md",
  zle_widget: "zle-widgets.md",
}

const dumpSpecs = [
  ["all", "all.md"] as const,
  ...docCategories.map(kind => [kind, dumpFile[kind]] as const),
] satisfies readonly (readonly [DocCategory | "all", RefDumpFile])[]

const dumpKinds: readonly DocCategory[] = docCategories

const suspiciousPatterns: readonly [string, (md: string) => boolean][] = [
  [
    "empty ref",
    md => /\b(?:See|see|described in|noted in) (?:\\ )?\./.test(md),
  ],
  ["dangling continuation", md => /\\$/m.test(md)],
  ["raw yodl marker", md => /\b(?:tt|var|example|manref|noderef)\(/.test(md)],
  ["unbalanced inline backticks", hasUnbalancedInlineBackticks],
  [
    'stray "+" before macro-shaped call',
    md => /[A-Za-z_][A-Za-z0-9_]+\+\(/.test(md),
  ],
  ["double comma (null reference substitution)", md => /,\s*,/.test(md)],
]

/**
 * True if any non-fence line has an odd number of `` ` `` characters — a
 * reliable signal of an inline-code span that never closed. Fenced code
 * blocks are excluded because backticks within them are literal text.
 *
 * The heuristic can false-positive on doubled-backtick spans (`` ``x`y`` ``),
 * but our pipeline only emits the single-backtick form, so this is tight for
 * our corpus. Extend here if we ever start rendering doubled spans.
 */
function hasUnbalancedInlineBackticks(md: string): boolean {
  let inFence = false
  for (const line of md.split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const count = (line.match(/`/g) ?? []).length
    if (count % 2 !== 0) return true
  }
  return false
}

function section(doc: RefDoc): string {
  return `## ${doc.heading}\n\n${doc.md}`
}

/** Split rendered reference docs into markdown dump files for QA/review. */
export function dumpText(
  docs: readonly RefDoc[],
): ReadonlyMap<RefDumpFile, string> {
  const byKind = groupByKind(docs)
  const entries: readonly (readonly [RefDumpFile, string])[] = [
    ...dumpSpecs.map(
      ([kind, file]) => [file, renderDumpText(kind, docs, byKind)] as const,
    ),
    ["suspicious.md", suspiciousText(docs)] as const,
  ]
  return new Map(entries)
}

/** Write reference markdown dump files to a directory. */
export async function writeRefDump(
  dir: string,
  docs: readonly RefDoc[],
): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const [file, text] of dumpText(docs)) {
    await writeFile(join(dir, file), text, "utf8")
  }
}

function suspiciousText(docs: readonly RefDoc[]): string {
  const hits = docs.flatMap(doc => suspiciousHits(doc))
  return hits.length > 0 ? `${hits.join("\n")}\n` : ""
}

function groupByKind(docs: readonly RefDoc[]): Map<DocCategory, RefDoc[]> {
  const byKind = new Map(dumpKinds.map(kind => [kind, [] as RefDoc[]] as const))
  for (const doc of docs) byKind.get(doc.kind)?.push(doc)
  return byKind
}

function renderDumpText(
  kind: DocCategory | "all",
  docs: readonly RefDoc[],
  byKind: Map<DocCategory, RefDoc[]>,
): string {
  const selected = kind === "all" ? docs : (byKind.get(kind) ?? [])
  const body = `${selected.map(section).join("\n\n---\n\n")}\n`
  // Preambles are per-category context; `all.md` intermixes categories and
  // would fragment if each section were prefixed, so only prepend for
  // per-category dumps with a preamble defined.
  if (kind === "all") return body
  const preamble = docCategoryPreamble[kind]
  if (preamble === undefined) return body
  return `<!-- preamble for category -->\n\n${preamble}\n\n---\n\n${body}`
}

// `{kind}:{id}|{heuristic}` strings known to trip a given suspicious-pattern
// check due to a pre-existing rendering-pipeline quirk predating the
// heuristic. Tracked here as a pinned list of tech debt so the checks stay
// live as regression guards; root causes are separate yodl-rendering bugs
// (notably tt(name()) content loss and noderef() empty rendering). Drop
// entries as fixes land.
const knownRenderArtifacts: ReadonlySet<string> = new Set([
  "option:globalrcs|double comma (null reference substitution)",
  "option:rcs|double comma (null reference substitution)",
])

function suspiciousHits(doc: RefDoc): string[] {
  const id = `${doc.kind}:${doc.id}`
  return suspiciousPatterns
    .filter(
      ([name, check]) =>
        check(doc.md) && !knownRenderArtifacts.has(`${id}|${name}`),
    )
    .map(([name]) => `- ${id} — ${name}`)
}
