// Standard (bindable) widgets; "Miscellaneous" is the closest fit from the
// closed-union of subsections for module-provided editing widgets. The
// module doc lists no default bindings (bare `tt(name)` headers).
import { identity } from "../../../brands.ts"
import type { ZleWidgetDoc } from "../../../types.ts"
import { collectAliasedEntries, extractItems } from "../../core/doc.ts"
import type { YodlSrc } from "../../core/nodes.ts"
import { firstTt, normalizeBody } from "../../core/text.ts"

export function extractDeltochar(yo: YodlSrc): readonly ZleWidgetDoc[] {
  return collectAliasedEntries(extractItems(yo, 1), firstTt).flatMap(
    aliased => {
      const desc = normalizeBody(aliased.entry.body ?? [])
      return [aliased.head, ...aliased.aliases].map(
        (name): ZleWidgetDoc => ({
          ...identity("zle_widget", name),
          desc,
          kind: "standard",
          section: "Miscellaneous",
          defaultBindings: [],
          module: "zsh/deltochar",
        }),
      )
    },
  )
}
