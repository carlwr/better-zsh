// MIRRORED-IN: zshref-rs/src/tools/record_fields.rs

import { renderRecord } from "../render/md.ts"
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
 * Augment each record with its rendered markdown body (`mdBody`) and the
 * projected identity fields consumed by out-of-process consumers (the Rust
 * CLI). `_id`/`_display`/`_subKind` use underscore-prefixed names to avoid
 * collisions with existing record fields (`display` on ZshOption,
 * `subKind` on ParamExpnDoc).
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
      ...(subKind !== undefined ? { _subKind: subKind } : {}),
    }
  })
}

/**
 * Strong gate: `_id`/`_display` must be ASCII. The Rust CLI's fuzzy scorer
 * is ASCII-only — non-ASCII would silently degrade search for the
 * affected records. Mirrors the corpus-load test on the Rust side.
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
  if (violations.length > 0) {
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
