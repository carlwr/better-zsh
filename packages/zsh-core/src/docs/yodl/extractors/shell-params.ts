import { mkDocumented } from "../../brands.ts"
import type { ShellParamDoc, ShellParamSection } from "../../types.ts"
import {
  extractFirstList,
  extractItemList,
  extractSectBody,
  extractSectionBody,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import {
  type extractTokens,
  normalizeBody,
  stripYodl,
  ttTexts,
} from "../core/text.ts"

// Upstream section name → typed short form. Short form is what record consumers
// read; long form is only used to find the section in the Yodl.
const PARAM_SECTIONS: Readonly<Record<string, ShellParamSection>> = {
  "Parameters Set By The Shell": "shell-set",
  "Parameters Used By The Shell": "shell-used",
}

interface ParamHead {
  name: string
  tied?: string
}

/** Parse zsh shell parameters from `params.yo`. */
export function parseShellParams(
  yo: string | YNodeSeq,
): readonly ShellParamDoc[] {
  return Object.entries(PARAM_SECTIONS).flatMap(([long, short]) =>
    parseParamSection(extractSectionBody(yo, long), short, { allowTied: true }),
  )
}

/**
 * Parse ZLE widget-local parameters from `zle.yo` §"User-Defined Widgets".
 * `extractSectBody` spans subsections; `extractItemList` runs depth=1 inside
 * `parseParamSection`, so the nested CONTEXT list is naturally filtered out.
 */
export function parseWidgetParams(
  yo: string | YNodeSeq,
): readonly ShellParamDoc[] {
  return parseParamSection(
    extractSectBody(yo, "User-Defined Widgets"),
    "zle-widget",
    { allowTied: false },
  )
}

/**
 * Parse completion-widget special parameters from `compwid.yo`
 * §"Completion Special Parameters". `compstate` is one record like the
 * others — its nested per-key documentation lands in `desc` as prose, in
 * keeping with how every other assoc/array parameter (`words`, `argv`,
 * `region_highlight`, ...) is handled.
 */
export function parseCompletionParams(
  yo: string | YNodeSeq,
): readonly ShellParamDoc[] {
  return parseParamSection(
    extractSectionBody(yo, "Completion Special Parameters"),
    "completion-widget",
    { allowTied: false },
  )
}

function parseParamSection(
  body: YNodeSeq,
  section: ShellParamSection,
  opts: { readonly allowTied: boolean },
): ShellParamDoc[] {
  const list = extractFirstList(body, "item")
  if (!list) return []
  return emitParams(extractItemList(list), section, opts)
}

function emitParams(
  items: ReturnType<typeof extractItemList>,
  section: ShellParamSection,
  opts: { readonly allowTied: boolean },
): ShellParamDoc[] {
  const out: ShellParamDoc[] = []
  let pending: ParamHead[] = []

  for (const item of items) {
    const heads = parseHeads(item.header, opts.allowTied)
    if (heads.length === 0) {
      pending = []
      continue
    }
    if (!item.body) {
      pending.push(...heads)
      continue
    }

    const desc = normalizeBody(item.body)
    for (const head of [...heads, ...pending]) {
      out.push({
        name: mkDocumented("special_param", head.name),
        sig: head.name,
        desc,
        section,
        ...(head.tied && { tied: mkDocumented("special_param", head.tied) }),
      })
    }
    pending = []
  }

  return out
}

function parseHeads(
  header: Parameters<typeof extractTokens>[0],
  allowTied: boolean,
): ParamHead[] {
  const names = ttTexts(header)
    .map(t => t.trim())
    .filter(Boolean)

  const [name, tied] = names
  if (!name) return []
  if (
    !allowTied ||
    !tied ||
    !new RegExp(`\\(${escapeRe(tied)}(?:\\s|\\))`).test(stripYodl(header))
  )
    return [{ name }]

  return [
    { name, tied },
    { name: tied, tied: name },
  ]
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
