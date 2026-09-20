// MIRRORED-IN: zshref-rs/src/corpus.rs

import { isEmpty } from "@carlwr/typescript-extra"

import { renderRecord } from "../render/md.ts"
import { displayPattern, idPattern } from "./brands.ts"
import type { DocCorpus } from "./corpus.ts"
import type { WithMarkdown } from "./json-types.ts"
import type { DocCategory, DocRecordMap } from "./taxonomy.ts"
import type { DocRecordBase } from "./types.ts"

/**
 * Project the records of `cat` as JSON consumers see them: each augmented
 * with its `RenderedRecord` fields. Generated fields are `_`-prefixed
 * (`_mdBody` included): a namespace apart from the records' own field
 * names (`id`, `display`, `subKind`).
 */
export function projectRecords<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
): readonly WithMarkdown<DocRecordMap[K]>[] {
  return [...corpus[cat].values()].map(rec => {
    const { title, mdBody } = renderRecord(corpus, cat, rec)
    return { ...rec, _mdBody: mdBody, _title: title }
  })
}

/**
 * `id`/`display` must be shell-safe ASCII (`idPattern`, `displayPattern`) —
 * the Rust crate's fuzzy scorer is ASCII-only, and non-ASCII silently
 * degrades search for those records. Mirrors the corpus-load test on the
 * Rust side.
 */
export function assertShellSafeIdentity(
  cat: DocCategory,
  records: readonly DocRecordBase<DocCategory>[],
): void {
  const violations: string[] = []
  for (const { id, display } of records) {
    if (!idPattern.test(id)) violations.push(`${cat}: id ${JSON.stringify(id)}`)
    if (!displayPattern.test(display))
      violations.push(`${cat}: display ${JSON.stringify(display)}`)
  }
  if (!isEmpty(violations)) {
    throw new Error(
      `id/display outside printable ASCII (Rust fuzzy scorer is ASCII-only):\n  ${violations.join("\n  ")}`,
    )
  }
}
