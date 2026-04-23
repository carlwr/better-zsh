import { mkDocumented } from "../../brands.ts"
import type { JobSpecDoc, JobSpecKind } from "../../types.ts"
import {
  extractFirstList,
  extractSectBody,
  extractSitemList,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { normalizeBody, normalizeHeader } from "../core/text.ts"

const SECTION = "Jobs"

// Upstream `tt(%)var(number)` etc. normalize to these keys; the numeric and
// string forms are templates. The mapping is small and closed — encode it
// directly rather than generating key+kind from the header text.
const SPEC_TABLE: readonly { key: string; kind: JobSpecKind }[] = [
  { key: "%number", kind: "number" },
  { key: "%string", kind: "string" },
  { key: "%?string", kind: "contains" },
  { key: "%%", kind: "current" },
  { key: "%+", kind: "current" },
  { key: "%-", kind: "previous" },
]

/**
 * Parse zsh job-spec forms from `jobs.yo` §"Jobs".
 *
 * Entries live in the first `startsitem()` block of the section. Header shapes
 * mix literal (`%%`, `%-`) and templated (`%)var(number)`, `%?)var(string)`)
 * forms. We map each entry to its canonical corpus key by header position —
 * the set of six forms is closed and stable.
 */
export function parseJobSpecs(yo: string | YNodeSeq): readonly JobSpecDoc[] {
  const body = extractSectBody(yo, SECTION)
  const list = extractFirstList(body, "sitem")
  if (!list) return []

  const items = extractSitemList(list)
  return items.flatMap((item, i) => {
    const entry = SPEC_TABLE[i]
    if (!entry || !item.body) return []
    return [
      {
        key: mkDocumented("job_spec", entry.key),
        sig: normalizeHeader(item.header),
        desc: normalizeBody(item.body),
        section: SECTION,
        kind: entry.kind,
      } satisfies JobSpecDoc,
    ]
  })
}
