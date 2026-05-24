import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { docCategoryPreamble } from "../docs/category-preamble.ts"
import { type DocCategory, docCategories } from "../docs/taxonomy.ts"
import type { RefDoc } from "./refs.ts"

export const dumpFile = {
  all: "all.md",
  forCat: (cat: DocCategory): `${DocCategory}.md` => `${cat}.md`,
} as const

export type RefDumpFile =
  | typeof dumpFile.all
  | ReturnType<typeof dumpFile.forCat>

/** Split rendered reference docs into markdown dump files for QA/review. */
export function dumpText(
  docs: readonly RefDoc[],
): ReadonlyMap<RefDumpFile, string> {
  const byKind = groupByKind(docs)
  const out = new Map<RefDumpFile, string>()
  out.set(dumpFile.all, renderDumpText("all", docs, byKind))
  for (const kind of docCategories) {
    out.set(dumpFile.forCat(kind), renderDumpText(kind, docs, byKind))
  }
  return out
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

function groupByKind(docs: readonly RefDoc[]): Map<DocCategory, RefDoc[]> {
  const byKind = new Map<DocCategory, RefDoc[]>(
    docCategories.map(kind => [kind, []]),
  )
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
  // `all.md` intermixes categories — a per-category preamble would fragment it.
  if (kind === "all") return body
  const preamble = docCategoryPreamble[kind]
  if (preamble === undefined) return body
  return `<!-- preamble for category -->\n\n${preamble}\n\n---\n\n${body}`
}

function section(doc: RefDoc): string {
  return `## ${doc.heading}\n\n${doc.md}`
}
