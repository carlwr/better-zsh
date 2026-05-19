import { mkDocumented } from "../../brands.ts"
import { escapeRegExp } from "../../regex.ts"
import {
  mkShellParamKeyName,
  type ShellParamDoc,
  type ShellParamKey,
  type ShellParamKeyValue,
  type ShellParamScope,
} from "../../types.ts"
import {
  extractFirstItemList,
  extractSectBody,
  extractSectionBody,
  splitBodyAtNestedList,
} from "../core/doc.ts"
import type { YNodeSeq, YodlSrc } from "../core/nodes.ts"
import { normalizeBody, stripYodl, trimmedTtTexts } from "../core/text.ts"

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

interface SectionOpts {
  readonly allowTied: boolean
}

/** Parse zsh shell parameters from `params.yo`. */
export function parseShellParams(yo: YodlSrc): readonly ShellParamDoc[] {
  return Object.entries(PARAM_SECTIONS).flatMap(([long, scope]) =>
    emitParams(extractSectionBody(yo, long), scope, { allowTied: true }),
  )
}

/**
 * Parse ZLE widget-local parameters from `zle.yo` §"User-Defined Widgets".
 * `extractSectBody` spans subsections; the depth=1 `extractFirstItemList`
 * inside filters out the nested CONTEXT list.
 */
export function parseWidgetParams(yo: YodlSrc): readonly ShellParamDoc[] {
  return emitParams(extractSectBody(yo, "User-Defined Widgets"), "zle-widget", {
    allowTied: false,
  })
}

/**
 * Parse completion-widget special parameters from `compwid.yo`
 * §"Completion Special Parameters".
 */
export function parseCompletionParams(yo: YodlSrc): readonly ShellParamDoc[] {
  return emitParams(
    extractSectionBody(yo, "Completion Special Parameters"),
    "completion-widget",
    { allowTied: false },
  )
}

function emitParams(
  body: YNodeSeq,
  scope: ShellParamScope,
  opts: SectionOpts,
): ShellParamDoc[] {
  const out: ShellParamDoc[] = []
  let pending: ParamHead[] = []

  for (const item of extractFirstItemList(body)) {
    const heads = parseHeads(item.header, opts.allowTied)
    if (heads.length === 0) {
      pending = []
      continue
    }
    if (!item.body) {
      pending.push(...heads)
      continue
    }

    const split = splitBody(item.body)
    for (const head of [...heads, ...pending]) {
      out.push({
        name: mkDocumented("special_param", head.name),
        sig: head.name,
        desc: split.desc,
        scope,
        ...(head.tied && { tied: mkDocumented("special_param", head.tied) }),
        ...(split.keys && { keys: split.keys }),
        ...(split.outro && { outro: split.outro }),
      })
    }
    pending = []
  }

  return out
}

/**
 * Split a parameter's item-body into intro prose, an enumerated nested
 * key-list (if present), and any post-list outro prose. Keys are emitted
 * only when the body contains a depth-1 `startitem()`/`enditem()` block.
 *
 * Records observed in the vendored corpus have only intro+list (no outro);
 * the outro path is precautionary so the renderer can place the key
 * headings between intro and outro consistently with builtins / comp-utils.
 */
function splitBody(body: YNodeSeq): {
  desc: string
  keys?: readonly ShellParamKey[]
  outro?: string
} {
  const split = splitBodyAtNestedList(body)
  if (!split) return { desc: normalizeBody(body) }
  const keys: ShellParamKey[] = []
  for (const entry of split.entries) {
    const name = trimmedTtTexts(entry.header)[0]
    if (!name || !entry.body) continue
    keys.push(buildKey(name, entry.body))
  }
  if (keys.length === 0) return { desc: normalizeBody(body) }
  const desc = normalizeBody(split.intro)
  const outro = normalizeBody(split.outro)
  return outro ? { desc, keys, outro } : { desc, keys }
}

/**
 * Build one `ShellParamKey` from a name + body. If the body contains its
 * own depth-1 nested item list (depth-2 from the param's POV — e.g.
 * `compstate.context` whose value enumerates `array_value`, ...), capture
 * the inner items as `values` and use the pre-list prose as `desc`.
 * Deeper nesting is not captured.
 */
function buildKey(rawName: string, body: YNodeSeq): ShellParamKey {
  const name = mkShellParamKeyName(rawName)
  const inner = splitBodyAtNestedList(body)
  if (!inner) return { name, desc: normalizeBody(body) }
  const values: ShellParamKeyValue[] = []
  for (const entry of inner.entries) {
    const vName = trimmedTtTexts(entry.header)[0]
    if (!vName || !entry.body) continue
    values.push({
      name: mkShellParamKeyName(vName),
      desc: normalizeBody(entry.body),
    })
  }
  if (values.length === 0) return { name, desc: normalizeBody(body) }
  return { name, desc: normalizeBody(inner.intro), values }
}

function parseHeads(header: YodlSrc, allowTied: boolean): ParamHead[] {
  const [name, tied] = trimmedTtTexts(header)
  if (!name) return []
  if (!allowTied || !tied) return [{ name }]
  // Tied form is recognized only when the upstream header explicitly groups
  // the two as `tt(name) (tt(tied))` — guards against accidental tied pairs
  // from headers that merely list two unrelated tt() tokens.
  const re = new RegExp(`\\(${escapeRegExp(tied)}(?:\\s|\\))`)
  if (!re.test(stripYodl(header, "code"))) return [{ name }]

  return [
    { name, tied },
    { name: tied, tied: name },
  ]
}
