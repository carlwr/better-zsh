import { mkDocumented } from "../../brands.ts"
import {
  type ZleWidgetDoc,
  type ZleWidgetKind,
  type ZleWidgetSubItem,
  zleWidgetSubsections,
} from "../../types.ts"
import {
  collectAliasedEntries,
  extractItems,
  extractSectBody,
  extractSectionBody,
  mkClosedUnionParser,
  splitBodyAtNestedList,
} from "../core/doc.ts"
import type { YNodeSeq, YodlSrc } from "../core/nodes.ts"
import { firstTt, normalizeBody, normalizeHeader } from "../core/text.ts"

const parseSubsection = mkClosedUnionParser(
  zleWidgetSubsections,
  "ZLE widget subsection",
)
const STANDARD_SECTION = "Standard Widgets"
const SPECIAL_SECTION = "Special Widgets"

/**
 * Surfaces only named widgets: "Standard Widgets" (bindable editing widgets)
 * and "Special Widgets" under "User-Defined Widgets" (shell-invoked hooks
 * like `zle-line-init`). Zle-related builtins (`zle`, `bindkey`, `vared`)
 * are documented via `zlecmd(...)` macros picked up by the builtin extractor
 * — re-emitting here would duplicate.
 */
export function parseZleWidgets(yo: YodlSrc): readonly ZleWidgetDoc[] {
  return [
    ...parseWidgetSection(extractSectBody(yo, STANDARD_SECTION), "standard"),
    ...parseWidgetSection(
      extractSectionBody(yo, SPECIAL_SECTION),
      "special",
      SPECIAL_SECTION,
    ),
  ]
}

function parseWidgetSection(
  section: YodlSrc,
  kind: ZleWidgetKind,
  sectionDefault = "",
): ZleWidgetDoc[] {
  const out: ZleWidgetDoc[] = []
  for (const aliased of collectAliasedEntries(
    extractItems(section, 1),
    header => {
      const sig = normalizeHeader(header)
      const name = firstTt(header)
      return name ? { sig, name } : undefined
    },
  )) {
    const body = splitWidgetBody(aliased.entry.body ?? [])
    const section = parseSubsection(aliased.entry.section || sectionDefault)
    const mkDoc = (head: { sig: string; name: string }): ZleWidgetDoc => ({
      name: mkDocumented("zle_widget", head.name),
      sig: head.sig,
      desc: body.desc,
      section,
      kind,
      ...(body.subItems && { subItems: body.subItems }),
      ...(body.outro && { outro: body.outro }),
    })
    out.push(mkDoc(aliased.head))
    for (const alias of aliased.aliases) out.push(mkDoc(alias))
  }
  return out
}

// Structural lift only when upstream has a depth-1 `startitem()` block;
// otherwise the whole body stays flat in `desc`.
function splitWidgetBody(body: YNodeSeq): {
  desc: string
  subItems?: readonly ZleWidgetSubItem[]
  outro?: string
} {
  const split = splitBodyAtNestedList(body)
  if (!split) return { desc: normalizeBody(body) }
  const subItems: ZleWidgetSubItem[] = []
  for (const aliased of collectAliasedEntries(split.entries, header => {
    const sig = normalizeHeader(header)
    return sig.length > 0 ? sig : undefined
  })) {
    if (!aliased.entry.body) continue
    // `aliases` are the body-less `xitem` headers preceding the entry that
    // carries the body — restore source order by putting them first.
    const allHeads = [...aliased.aliases, aliased.head]
    subItems.push({
      sig: allHeads.join(", "),
      desc: normalizeBody(aliased.entry.body),
    })
  }
  if (subItems.length === 0) return { desc: normalizeBody(body) }
  const desc = normalizeBody(split.intro)
  const outro = normalizeBody(split.outro)
  return outro ? { desc, subItems, outro } : { desc, subItems }
}
