// MIRRORED-IN: zshref-rs/src/corpus.rs

import { isDefined, isEmpty } from "@carlwr/typescript-extra"

import { recordTitle, renderRecord } from "../render/md.ts"
import type { DocCorpus } from "./corpus.ts"
import type { WithMarkdown } from "./json-types.ts"
import {
  type DocCategory,
  type DocRecordMap,
  docDisplay,
  idOf,
  subKindOf,
} from "./taxonomy.ts"

/**
 * Project the records of `cat` as JSON consumers see them: each augmented
 * with its rendered markdown body plus identity fields. Generated fields are
 * `_`-prefixed (`_mdBody` included): a namespace apart from the records' own
 * field names (`display` on ZshOption, `subKind` on ParamExpnDoc).
 */
export function projectRecords<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
): readonly WithMarkdown<DocRecordMap[K]>[] {
  return [...corpus[cat].values()].map(rec => {
    const subKind = subKindOf(cat, rec)
    return {
      ...rec,
      _mdBody: renderRecord(corpus, cat, rec),
      _id: idOf(cat, rec) as string,
      _display: docDisplay(cat, rec),
      _title: recordTitle(cat, rec),
      ...(isDefined(subKind) ? { _subKind: subKind } : {}),
    }
  })
}

/**
 * `_id`/`_display` must be ASCII — the Rust crate's fuzzy scorer is
 * ASCII-only, and non-ASCII silently degrades search for those records.
 * Mirrors the corpus-load test on the Rust side.
 */
export function assertAsciiIdentity(
  cat: DocCategory,
  records: readonly { readonly _id: string; readonly _display: string }[],
): void {
  const violations: string[] = []
  for (const rec of records) {
    if (!isAscii(rec._id))
      violations.push(`${cat}: _id ${JSON.stringify(rec._id)}`)
    if (!isAscii(rec._display))
      violations.push(`${cat}: _display ${JSON.stringify(rec._display)}`)
  }
  if (!isEmpty(violations)) {
    throw new Error(
      `non-ASCII _id/_display in corpus (Rust fuzzy scorer is ASCII-only):\n  ${violations.join("\n  ")}`,
    )
  }
}

function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 0x7f) return false
  }
  return true
}
