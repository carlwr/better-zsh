// Reference dump: every corpus record rendered to markdown, split into one
// file per category plus `all.md`, for review and before/after diffing.
// Internal — outside the published surface; used by the `dump:refs` CLI and
// the render tests.

import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { docCategoryPreamble } from "../src/docs/category-preamble.ts"
import type { DocCorpus } from "../src/docs/corpus.ts"
import {
  categoryOf,
  type DocCategory,
  type DocRecordMap,
  docCategories,
  genericId,
} from "../src/docs/taxonomy.ts"
import type { Documented } from "../src/docs/types.ts"
import { renderRecord } from "../src/render/md.ts"

interface RefDocK<K extends DocCategory> {
  readonly kind: K
  readonly id: Documented<K>
  /** The record's `display`: the dump's `## heading`. */
  readonly heading: string
  readonly md: string
}

/** Rendered reference markdown for one logical zsh item. */
export type RefDoc = { [K in DocCategory]: RefDocK<K> }[DocCategory]

function mkRefDocs<K extends DocCategory>(
  docs: readonly DocRecordMap[K][],
  corpus: DocCorpus,
): RefDocK<K>[] {
  return docs.map(doc => ({
    kind: categoryOf(doc),
    id: genericId(doc),
    heading: doc.display,
    md: renderRecord(corpus, doc).mdBody,
  }))
}

/** All records rendered, in corpus order — the dump never re-sorts. */
export function refDocs(corpus: DocCorpus): readonly RefDoc[] {
  return docCategories.flatMap(
    kind => mkRefDocs([...corpus[kind].values()], corpus) as RefDoc[],
  )
}

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

/** Heading alone for a body-less record (the desc-less reserved words). */
function section(doc: RefDoc): string {
  return doc.md === "" ? `## ${doc.heading}` : `## ${doc.heading}\n\n${doc.md}`
}
