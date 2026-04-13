import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { RefDoc, RefKind } from "./refs.ts"

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
  | "reserved-words.md"
  | "subscript-flags.md"
  | "param-flags.md"
  | "history.md"
  | "glob-ops.md"
  | "glob-flags.md"
  | "suspicious.md"

const dumpSpecs: readonly [RefKind | "all", RefDumpFile][] = [
  ["all", "all.md"],
  ["option", "options.md"],
  ["cond-op", "cond-ops.md"],
  ["shell-param", "shell-params.md"],
  ["builtin", "builtins.md"],
  ["precmd", "precmds.md"],
  ["redir", "redirs.md"],
  ["process-subst", "process-substs.md"],
  ["reserved-word", "reserved-words.md"],
  ["subscript-flag", "subscript-flags.md"],
  ["param-flag", "param-flags.md"],
  ["history", "history.md"],
  ["glob-op", "glob-ops.md"],
  ["glob-flag", "glob-flags.md"],
]

const dumpKinds: readonly RefKind[] = dumpSpecs.flatMap(([kind]) =>
  kind === "all" ? [] : [kind],
)

const suspiciousPatterns: readonly [string, RegExp][] = [
  ["empty ref", /\b(?:See|see|described in|noted in) (?:\\ )?\./],
  ["dangling continuation", /\\$/m],
  ["raw yodl marker", /\b(?:tt|var|example|manref|noderef)\(/],
]

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
  const hits = docs.flatMap((doc) => suspiciousHits(doc))
  return hits.length > 0 ? `${hits.join("\n")}\n` : ""
}

function groupByKind(docs: readonly RefDoc[]): Map<RefKind, RefDoc[]> {
  const byKind = new Map(
    dumpKinds.map((kind) => [kind, [] as RefDoc[]] as const),
  )
  for (const doc of docs) byKind.get(doc.kind)?.push(doc)
  return byKind
}

function renderDumpText(
  kind: RefKind | "all",
  docs: readonly RefDoc[],
  byKind: Map<RefKind, RefDoc[]>,
): string {
  const selected = kind === "all" ? docs : (byKind.get(kind) ?? [])
  return `${selected.map(section).join("\n\n---\n\n")}\n`
}

function suspiciousHits(doc: RefDoc): string[] {
  return suspiciousPatterns
    .filter(([, re]) => re.test(doc.md))
    .map(([name]) => `- ${doc.kind}:${doc.id} — ${name}`)
}
