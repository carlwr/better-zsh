import { mkDocumented } from "../../brands.ts"
import { escapeRegExp } from "../../regex.ts"
import type { ShellParamDoc, ShellParamScope } from "../../types.ts"
import {
  extractFirstItemList,
  extractSectBody,
  extractSectionBody,
} from "../core/doc.ts"
import type { YNodeSeq, YodlSrc } from "../core/nodes.ts"
import { stripYodl, trimmedTtTexts } from "../core/text.ts"
import { splitParamBody } from "./param-keys.ts"

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

    const split = splitParamBody(item.body)
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
