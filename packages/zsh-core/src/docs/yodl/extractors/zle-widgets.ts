import { isDefined, isNonEmpty } from "@carlwr/typescript-extra"
import { identity } from "../../brands.ts"
import type {
  ZleBindingKeymap,
  ZleDefaultBinding,
  ZleWidgetDoc,
  ZleWidgetSubItem,
  ZleWidgetSubsection,
} from "../../types.ts"
import { zleWidgetSubsections } from "../../vocab.ts"
import {
  collectAliasedEntries,
  extractItems,
  extractSectBody,
  extractSectionBody,
  mkClosedUnionParser,
  splitBodyAtNestedList,
} from "../core/doc.ts"
import {
  isMacro,
  type YNode,
  type YNodeSeq,
  type YodlSrc,
} from "../core/nodes.ts"
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
    ...parseWidgetSection(extractSectBody(yo, STANDARD_SECTION)),
    ...parseWidgetSection(
      extractSectionBody(yo, SPECIAL_SECTION),
      SPECIAL_SECTION,
    ),
  ]
}

interface WidgetHead {
  readonly name: string
  readonly header: YNodeSeq
}

function parseWidgetSection(
  section: YodlSrc,
  sectionDefault = "",
): ZleWidgetDoc[] {
  const out: ZleWidgetDoc[] = []
  for (const aliased of collectAliasedEntries(
    extractItems(section, 1),
    (header): WidgetHead | undefined => {
      const name = firstTt(header)
      return name ? { name, header } : undefined
    },
  )) {
    const body = splitWidgetBody(aliased.entry.body ?? [])
    const section = parseSubsection(aliased.entry.section || sectionDefault)
    const mkDoc = (head: WidgetHead): ZleWidgetDoc => ({
      ...identity("zle_widget", head.name),
      desc: body.desc,
      subKind: section,
      defaultBindings: parseDefaultBindings(head.header, section),
      ...(body.subItems && { subItems: body.subItems }),
      ...(body.outro && { outro: body.outro }),
    })
    out.push(mkDoc(aliased.head))
    for (const alias of aliased.aliases) out.push(mkDoc(alias))
  }
  return out
}

// --- default bindings -------------------------------------------------------

/**
 * Default bindings from the parenthesised groups after `tt(name)`. Two
 * documented shapes: three groups are the `emacs`, `vicmd` and `viins`
 * bindings in that order (zle.yo §"Standard Widgets" intro); under
 * `Text Objects`, one group applies to both `viopp` and `visual` (that
 * subsection's intro). No groups → no bindings. Any other shape throws so
 * an upstream re-vendor fails loud instead of parsing silently wrong.
 */
function parseDefaultBindings(
  header: YNodeSeq,
  section: ZleWidgetSubsection,
): readonly ZleDefaultBinding[] {
  // One group's binding; `undefined` for `(unbound)`. A group carrying
  // `tt(...)` is a whitespace-separated key list — adjacent macros
  // concatenate (`tt(ESC-)tt(-)` → `ESC--`). A group without `tt(...)` is
  // prose (`self-insert`'s `printable characters`): one entry, kept whole.
  const bindingOf = (
    keymap: ZleBindingKeymap,
    group: YNodeSeq,
  ): ZleDefaultBinding | undefined => {
    const text = normalizeHeader(group)
    if (text === "unbound") return undefined
    const keys = group.some(n => isMacro(n, "tt")) ? text.split(" ") : [text]
    if (text === "" || !isNonEmpty(keys))
      throw headerError(header, "Empty group")
    return { keymap, keys }
  }
  const [first, second, third, ...rest] = parenGroups(header)
  if (first === undefined) return []
  if (second !== undefined && third !== undefined && rest.length === 0) {
    return [
      bindingOf("emacs", first),
      bindingOf("vicmd", second),
      bindingOf("viins", third),
    ].filter(isDefined)
  }
  if (second === undefined && section === "Text Objects") {
    return [bindingOf("viopp", first), bindingOf("visual", first)].filter(
      isDefined,
    )
  }
  throw headerError(header, `Unexpected group count in ${section}`)
}

const headerError = (header: YNodeSeq, why: string): Error =>
  new Error(`${why} in ZLE widget header: ${normalizeHeader(header)}`)

/**
 * Top-level `(...)` groups after the first `tt(...)` (the name), as node
 * sequences. Only text nodes open and close groups — a macro is kept whole
 * inside its group, so `tt(...)` payloads never split. Throws on unbalanced
 * parens or anything but whitespace outside a group.
 */
function parenGroups(header: YNodeSeq): readonly YNodeSeq[] {
  const nodes = header.slice(header.findIndex(n => isMacro(n, "tt")) + 1)
  const groups: YNodeSeq[] = []
  let group: YNode[] = []
  let depth = 0
  for (const node of nodes) {
    if (node.kind === "macro") {
      if (depth === 0) throw headerError(header, "Macro outside a group")
      group.push(node)
      continue
    }
    let text = ""
    const flush = () => {
      if (text) group.push({ kind: "text", text })
      text = ""
    }
    for (const ch of node.text) {
      if (ch === "(" && depth++ === 0) continue
      if (ch === ")" && --depth === 0) {
        flush()
        groups.push(group)
        group = []
        continue
      }
      if (depth < 0) throw headerError(header, "Unbalanced parens")
      if (depth > 0) text += ch
      else if (/\S/.test(ch)) throw headerError(header, "Text outside a group")
    }
    flush()
  }
  if (depth !== 0) throw headerError(header, "Unbalanced parens")
  return groups
}

// --- body -------------------------------------------------------------------

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
