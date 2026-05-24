// Standard (bindable) widgets; "Miscellaneous" is the closest fit from the
// closed-union of subsections for module-provided editing widgets.
import { mkDocumented } from "../../../brands.ts"
import type { ZleWidgetDoc } from "../../../types.ts"
import { collectAliasedEntries, extractItems } from "../../core/doc.ts"
import type { YodlSrc } from "../../core/nodes.ts"
import { firstTt, normalizeBody, normalizeHeader } from "../../core/text.ts"

export function extractDeltochar(yo: YodlSrc): readonly ZleWidgetDoc[] {
  return collectAliasedEntries(extractItems(yo, 1), header => {
    const sig = normalizeHeader(header)
    const name = firstTt(header)
    return name ? { sig, name } : undefined
  }).flatMap(aliased => {
    const desc = normalizeBody(aliased.entry.body ?? [])
    return [aliased.head, ...aliased.aliases].map(
      (head): ZleWidgetDoc => ({
        name: mkDocumented("zle_widget", head.name),
        sig: head.sig,
        desc,
        kind: "standard",
        section: "Miscellaneous",
        module: "zsh/deltochar",
      }),
    )
  })
}
