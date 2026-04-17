import { mkDocumented } from "../../brands.ts"
import type { ZleWidgetDoc, ZleWidgetKind } from "../../types.ts"
import {
  extractItems,
  extractSectBody,
  extractSectionBody,
  flattenAliasedEntries,
} from "../core/doc.ts"
import { extractTokens, normalizeHeader } from "../core/text.ts"

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
export function parseZleWidgets(yo: string): readonly ZleWidgetDoc[] {
  return [
    ...parseWidgetSection(extractSectBody(yo, "Standard Widgets"), "standard"),
    ...parseWidgetSection(
      extractSectionBody(yo, "Special Widgets"),
      "special",
      "Special Widgets",
    ),
  ]
}

function parseWidgetSection(
  section: Parameters<typeof extractItems>[0],
  kind: ZleWidgetKind,
  sectionDefault = "",
): ZleWidgetDoc[] {
  return flattenAliasedEntries(
    extractItems(section, 1),
    header => {
      const sig = normalizeHeader(header)
      const name = firstTt(header)
      return name ? { sig, name } : undefined
    },
    ({ sig, name }, desc, entry) => ({
      name: mkDocumented("zle_widget", name),
      sig,
      desc,
      section: entry.section || sectionDefault,
      kind,
    }),
  )
}

/** Take the first `tt(...)` token text from a Yodl node sequence. */
function firstTt(header: Parameters<typeof extractTokens>[0]): string {
  return extractTokens(header).find(tok => tok.kind === "tt")?.text ?? ""
}
