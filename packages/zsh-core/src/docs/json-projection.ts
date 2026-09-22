// MIRRORED-IN: zshref-rs/src/corpus.rs

import { isEmpty } from "@carlwr/typescript-extra"

import { renderRecord } from "../render/md.ts"
import { displayPattern, idPattern } from "./brands.ts"
import type { DocCorpus } from "./corpus.ts"
import type { WithMarkdown } from "./json-types.ts"
import type { DocCategory, DocRecordMap } from "./taxonomy.ts"
import type { DocRecordBase } from "./types.ts"

/**
 * The records of `cat` as the release record file carries them: each
 * augmented with `_title` / `_mdBody` (`renderRecord`'s `title` /
 * `mdBody`). Renders every record on each call.
 */
export function projectRecords<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
): readonly WithMarkdown<DocRecordMap[K]>[] {
  return [...corpus[cat].values()].map(rec => {
    const { title, mdBody } = renderRecord(corpus, rec)
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
  records: readonly DocRecordBase<DocCategory>[],
): void {
  const violations: string[] = []
  for (const { category, id, display } of records) {
    if (!idPattern.test(id))
      violations.push(`${category}: id ${JSON.stringify(id)}`)
    if (!displayPattern.test(display))
      violations.push(`${category}: display ${JSON.stringify(display)}`)
  }
  if (!isEmpty(violations)) {
    throw new Error(
      `id/display outside printable ASCII (Rust fuzzy scorer is ASCII-only):\n  ${violations.join("\n  ")}`,
    )
  }
}
