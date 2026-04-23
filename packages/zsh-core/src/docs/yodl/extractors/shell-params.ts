import { mkDocumented } from "../../brands.ts"
import type { ShellParamDoc, ShellParamSection } from "../../types.ts"
import {
  extractFirstList,
  extractItemList,
  extractSectBody,
  extractSectionBody,
} from "../core/doc.ts"
import type { YNodeSeq } from "../core/nodes.ts"
import { extractTokens, normalizeBody, stripYodl } from "../core/text.ts"

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
    parseParamSection(extractSectionBody(yo, long), short),
  )
}

/**
 * Parse ZLE widget-local parameters from `zle.yo` §"User-Defined Widgets".
 *
 * Widget params (BUFFER, CURSOR, CONTEXT, ...) share `ShellParamDoc`'s shape
 * but come from a different manual section and never carry `tied`. Exposed as
 * a separate entrypoint so `loadCorpus` can compose both passes into a single
 * `shell_param` map without coupling the extractors to a multi-file loader.
 */
export function parseWidgetParams(
  yo: string | YNodeSeq,
): readonly ShellParamDoc[] {
  const body = extractSectBody(yo, "User-Defined Widgets")
  // `extractSectBody` spans subsections, but `extractFirstList` finds the
  // first outer startitem() after the preamble prose. `extractItemList` is
  // depth=1, filtering the nested CONTEXT list entries out.
  const list = extractFirstList(body, "item")
  if (!list) return []
  return emitParams(extractItemList(list), "zle-widget", { allowTied: false })
}

function parseParamSection(
  body: YNodeSeq,
  section: ShellParamSection,
): ShellParamDoc[] {
  const list = extractFirstList(body, "item")
  if (!list) return []
  return emitParams(extractItemList(list), section, { allowTied: true })
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
        name: mkDocumented("shell_param", head.name),
        sig: head.name,
        desc,
        section,
        ...(head.tied && { tied: mkDocumented("shell_param", head.tied) }),
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
  const names = extractTokens(header)
    .filter(tok => tok.kind === "tt")
    .map(tok => tok.text.trim())
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
