// MIRRORED-IN: zshref-rs/src/tools/record_fields.rs

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
 * Augment each record with `mdBody` plus projected identity fields for
 * out-of-process consumers (the Rust CLI). Underscore-prefixed
 * `_id`/`_display`/`_title`/`_subKind` avoid collisions with existing record
 * fields (`display` on ZshOption, `subKind` on ParamExpnDoc). `_title` (the
 * rendered record title) is split out of `mdBody` so each consumer decides
 * whether to show it.
 */
export function augmentWithMarkdown<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
): readonly WithMarkdown<DocRecordMap[K]>[] {
  return [...corpus[cat].values()].map(rec => {
    const subKind = subKindOf(cat, rec)
    return {
      ...rec,
      mdBody: renderRecord(corpus, cat, rec),
      _id: idOf(cat, rec) as string,
      _display: docDisplay(cat, rec),
      _title: recordTitle(cat, rec),
      ...(isDefined(subKind) ? { _subKind: subKind } : {}),
    }
  })
}

/**
 * `_id`/`_display` must be ASCII — the Rust CLI's fuzzy scorer is
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
