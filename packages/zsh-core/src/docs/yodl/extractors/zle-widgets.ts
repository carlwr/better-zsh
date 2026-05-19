import { mkDocumented } from "../../brands.ts"
import {
  type ZleWidgetDoc,
  type ZleWidgetKind,
  type ZleWidgetSubItem,
  type ZleWidgetSubsection,
  zleWidgetSubsections,
} from "../../types.ts"
import {
  collectAliasedEntries,
  extractItems,
  extractSectBody,
  extractSectionBody,
  parseClosedUnion,
  splitBodyAtNestedList,
} from "../core/doc.ts"
import type { YNodeSeq, YodlSrc } from "../core/nodes.ts"
import { firstTt, normalizeBody, normalizeHeader } from "../core/text.ts"

const WIDGET_SUBSECTION_SET: ReadonlySet<string> = new Set(zleWidgetSubsections)
const STANDARD_SECTION = "Standard Widgets"
const SPECIAL_SECTION = "Special Widgets"

/**
 * Parse ZLE widget names from `zle.yo`.
 *
 * Scoping: only named widgets are surfaced — the "Standard Widgets" section
 * (bindable editing widgets, in subsections Movement / History Control / …)
 * and the "Special Widgets" subsection under "User-Defined Widgets" (shell-
 * invoked hooks like `zle-line-init`). Zle-related builtins (`zle`, `bindkey`,
 * `vared`) are already documented via `zlecmd(...)` macros picked up by the
 * builtin extractor; re-emitting them here would duplicate records.
 *
 * Each item header has shape `item(tt(widget-name) [binding-spec...])` where
 * the widget name is the first tt() token. Lookup key = widget name; sig = the
 * rendered header (including the default-bindings-per-keymap triple when
 * present).
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

/**
 * Split a widget's item-body into intro prose, an enumerated nested item
 * list (if present), and any post-list outro prose. Mirrors the pattern in
 * `shell-params.ts:splitBody` / `builtins.ts:splitBuiltinBody`: structural
 * lift only happens when upstream has a depth-1 `startitem()` block;
 * otherwise the whole body stays flat in `desc`.
 */
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

function parseSubsection(raw: string): ZleWidgetSubsection {
  return parseClosedUnion(raw, WIDGET_SUBSECTION_SET, "ZLE widget subsection")
}
