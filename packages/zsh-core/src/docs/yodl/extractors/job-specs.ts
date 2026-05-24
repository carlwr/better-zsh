import { mkDocumented } from "../../brands.ts"
import type { JobSpecDoc, JobSpecKind } from "../../types.ts"
import { extractFirstSitemList, extractSectBody } from "../core/doc.ts"
import type { YodlSrc } from "../core/nodes.ts"
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

// Header shapes mix literal (`%%`, `%-`) and templated (`%)var(number)`)
// forms; map to canonical key by header position — six-form set is closed.
export function parseJobSpecs(yo: YodlSrc): readonly JobSpecDoc[] {
  return extractFirstSitemList(extractSectBody(yo, SECTION)).flatMap(
    (item, i) => {
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
    },
  )
}
