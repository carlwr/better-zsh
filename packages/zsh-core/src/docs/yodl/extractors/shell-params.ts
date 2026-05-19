import { mkDocumented } from "../../brands.ts"
import {
  mkShellParamKeyName,
  type ShellParamDoc,
  type ShellParamKey,
  type ShellParamScope,
} from "../../types.ts"
import {
  extractFirstList,
  extractItemList,
  extractSectBody,
  extractSectionBody,
} from "../core/doc.ts"
import { isMacro, type YNodeSeq } from "../core/nodes.ts"
import {
  type extractTokens,
  normalizeBody,
  stripYodl,
  ttTexts,
} from "../core/text.ts"

// Upstream section name → typed scope. Scope is what record consumers
// read; the upstream-section string is only used to find the section in
// the Yodl.
const PARAM_SECTIONS: Readonly<Record<string, ShellParamScope>> = {
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
 * `extractSectBody` spans subsections; the depth=1 `extractItemList` inside
 * `parseParamSection` filters out the nested CONTEXT list.
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
 * §"Completion Special Parameters".
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
  scope: ShellParamScope,
  opts: { readonly allowTied: boolean },
): ShellParamDoc[] {
  const list = extractFirstList(body, "item")
  if (!list) return []
  return emitParams(extractItemList(list), scope, opts)
}

function emitParams(
  items: ReturnType<typeof extractItemList>,
  scope: ShellParamScope,
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

    const { desc, keys } = splitBody(item.body)
    for (const head of [...heads, ...pending]) {
      out.push({
        name: mkDocumented("special_param", head.name),
        sig: head.name,
        desc,
        scope,
        ...(head.tied && { tied: mkDocumented("special_param", head.tied) }),
        ...(keys && { keys }),
      })
    }
    pending = []
  }

  return out
}

/**
 * Split a parameter's item-body into intro prose and (if present) an
 * enumerated nested key-list. Keys are emitted only when the body contains
 * a depth-1 `startitem()`/`enditem()` block — i.e. the upstream documents
 * a closed set of named members inline (e.g. an assoc-array's keys, the
 * enumerated values of a colon-list parameter).
 *
 * Deeper Yodl nesting inside a member's body (depth >= 2 below the param)
 * flattens through `normalizeBody` as before — only the immediate level is
 * structured.
 */
function splitBody(body: YNodeSeq): {
  desc: string
  keys?: readonly ShellParamKey[]
} {
  const split = findNestedList(body)
  if (!split) return { desc: normalizeBody(body) }
  const keyEntries = extractItemList(body.slice(split.start, split.end + 1))
  const keys: ShellParamKey[] = []
  for (const entry of keyEntries) {
    const rawName = ttTexts(entry.header)
      .map(t => t.trim())
      .filter(Boolean)[0]
    if (!rawName || !entry.body) continue
    keys.push({
      name: mkShellParamKeyName(rawName),
      desc: normalizeBody(entry.body),
    })
  }
  const intro = body.slice(0, split.start)
  return keys.length > 0
    ? { desc: normalizeBody(intro), keys }
    : { desc: normalizeBody(body) }
}

/** Find the outermost `startitem()`/`enditem()` pair in `body`; undefined if none. */
function findNestedList(
  body: YNodeSeq,
): { start: number; end: number } | undefined {
  let depth = 0
  let start = -1
  for (let i = 0; i < body.length; i++) {
    const node = body[i]
    if (isMacro(node, "startitem")) {
      if (depth === 0) start = i
      depth++
      continue
    }
    if (isMacro(node, "enditem") && depth > 0) {
      depth--
      if (depth === 0 && start !== -1) return { start, end: i }
    }
  }
  return undefined
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
