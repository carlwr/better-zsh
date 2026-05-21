/**
 * Shared helpers for module yodl extractors.
 *
 * Thin wrappers over core Yodl machinery (doc.ts / text.ts) tuned to the
 * patterns in mod_*.yo files. Per-module files stay thin by calling these.
 */
import {
  isNonEmpty,
  mapNonEmpty,
  type NonEmpty,
} from "@carlwr/typescript-extra"
import { mkDocumented } from "../../../brands.ts"
import type { ModuleName } from "../../../taxonomy.ts"
import type {
  BuiltinDoc,
  CondOpDoc,
  Documented,
  ShellParamDoc,
  ShellParamScope,
} from "../../../types.ts"
import {
  collectAliasedEntries,
  extractFirstItemList,
  extractItems,
} from "../../core/doc.ts"
import type { YNodeSeq, YodlSrc } from "../../core/nodes.ts"
import { asNodes, isMacro } from "../../core/nodes.ts"
import {
  normalizeBody,
  normalizeHeader,
  trimmedTtTexts,
} from "../../core/text.ts"
import { buildCondOpDoc, parseCondHeader } from "../cond-ops.ts"
import { splitFlagBody } from "../flag-section.ts"
import { splitParamBody } from "../param-keys.ts"

// Module cond.yo headers only carry `-name-of-op` style operators; narrower
// op-char alphabet than core cond.yo.
const MODULE_OP_CHAR_RE = /^[-\w]/

/**
 * Parse builtins from a module .yo source.
 *
 * Handles `findex(name) item(tt(sig))(body)` plus xitem continuation lines.
 * Sets `module` on every produced record.
 */
export function parseModuleBuiltins(
  yo: YodlSrc,
  moduleName: ModuleName,
): readonly BuiltinDoc[] {
  const out: BuiltinDoc[] = []

  for (const aliased of collectAliasedEntries(
    extractItems(yo, 1),
    parseBuiltinHeader,
  )) {
    const body = aliased.entry.body ?? []
    const { desc, flagGroups, outro } = splitFlagBody(body)
    const lines = [...aliased.aliases, aliased.head]
    const heads = lines.filter(l => !l.continuation && l.name !== "")
    if (!isNonEmpty(heads)) continue
    const [head, ...rest] = heads
    const synopsisTail = lines
      .filter(l => l.continuation)
      .map(l => l.sig.trimStart())

    // When all non-continuation forms share the same command name (e.g. the
    // multiple `zstyle`/`zformat`/`sched` synopsis forms), emit ONE record
    // with all forms folded into the synopsis array. When names differ (e.g.
    // `comptags` aliased to `comptry`), emit a separate record per name so
    // each command gets its own entry.
    type NamedGroup = { readonly name: string; readonly sigs: NonEmpty<string> }
    const namedGroups: readonly NamedGroup[] = rest.every(
      l => l.name === head.name,
    )
      ? [{ name: head.name, sigs: mapNonEmpty(heads, l => l.sig) }]
      : heads.map((l): NamedGroup => ({ name: l.name, sigs: [l.sig] }))

    for (const { name, sigs } of namedGroups) {
      out.push({
        name: mkDocumented("builtin", name),
        synopsis: [...sigs, ...synopsisTail],
        desc,
        module: moduleName,
        ...(flagGroups && { flagGroups }),
        ...(outro && { outro }),
      })
    }
  }

  return out
}

interface BuiltinHeader {
  readonly sig: string
  readonly name: string
  readonly continuation: boolean
}

/**
 * Classify one item header. `SPACES()`-prefixed and leading-whitespace
 * headers are continuation lines for the preceding head; everything else
 * carries a command name (first whitespace-separated token of the sig).
 */
function parseBuiltinHeader(header: YNodeSeq): BuiltinHeader | undefined {
  const isSpacesCont = isMacro(header[0], "SPACES")
  const text = normalizeHeader(header)
  if (!text && !isSpacesCont) return undefined
  const continuation =
    isSpacesCont || text.startsWith(" ") || text.startsWith("\t")
  const name = continuation ? "" : (text.match(/^(\S+)/)?.[1] ?? "")
  if (!name && !continuation) return undefined
  return { sig: text, name, continuation }
}

/**
 * Merge builtins sharing a name into one record. Synopses concatenate (in
 * input order); descs join with paragraph breaks. Optional fields fall back
 * to the later record only when the earlier record lacks them.
 *
 * Use for modules whose .yo documents one command across several subsect
 * blocks — `zpty`, `zsocket`, `zsystem` subcommands.
 */
export function mergeBuiltinsByName(
  docs: readonly BuiltinDoc[],
): readonly BuiltinDoc[] {
  const byName = new Map<Documented<"builtin">, BuiltinDoc>()
  for (const d of docs) {
    const prev = byName.get(d.name)
    if (!prev) {
      byName.set(d.name, d)
      continue
    }
    byName.set(d.name, {
      ...prev,
      synopsis: [...prev.synopsis, ...d.synopsis],
      desc: [prev.desc, d.desc].filter(Boolean).join("\n\n"),
      ...(prev.flagGroups === undefined &&
        d.flagGroups && { flagGroups: d.flagGroups }),
      ...(prev.outro === undefined && d.outro && { outro: d.outro }),
    })
  }
  return [...byName.values()]
}

/**
 * Parse special parameters from the first `startitem()/enditem()` block in
 * a yodl source. Sets `module` on every record.
 *
 * Supports the full ShellParamDoc shape including nested key-lists (e.g.
 * `sysparams` in mod_system.yo). For tied-param notation `tt(X) (tt(Y))`
 * use `parseShellParams` (from shell-params.ts) directly — not needed for
 * module files where params aren't tied.
 */
export function parseModuleParams(
  yo: YodlSrc,
  moduleName: ModuleName,
  scope: ShellParamScope = "shell-set",
): readonly ShellParamDoc[] {
  return parseModuleParamsFromList(extractFirstItemList(yo), moduleName, scope)
}

/**
 * Parse special params from a pre-extracted item list (call this when the
 * caller has already extracted the right item-list slice from a larger body).
 */
export function parseModuleParamsFromList(
  items: ReturnType<typeof extractFirstItemList>,
  moduleName: ModuleName,
  scope: ShellParamScope,
): readonly ShellParamDoc[] {
  const out: ShellParamDoc[] = []
  let pending: string[] = []

  for (const item of items) {
    const names = trimmedTtTexts(item.header)
    if (names.length === 0) {
      pending = []
      continue
    }
    if (!item.body) {
      pending.push(...names)
      continue
    }

    const split = splitParamBody(item.body)
    for (const name of [...names, ...pending]) {
      out.push({
        name: mkDocumented("special_param", name),
        sig: name,
        desc: split.desc,
        scope,
        module: moduleName,
        ...(split.keys && { keys: split.keys }),
        ...(split.outro && { outro: split.outro }),
      })
    }
    pending = []
  }

  return out
}

/**
 * Split a node sequence into the bodies of all top-level
 * `startitem()/enditem()` ranges. Returns one slice per balanced range.
 * Used by modules whose .yo file has multiple sibling item blocks.
 */
export function extractTopLevelItemRegions(nodes: YNodeSeq): YNodeSeq[] {
  const regions: YNodeSeq[] = []
  let depth = 0
  let start = -1
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (!node) continue
    if (isMacro(node, "startitem")) {
      if (depth === 0) start = i
      depth++
    } else if (isMacro(node, "enditem") && depth > 0) {
      depth--
      if (depth === 0 && start !== -1) {
        regions.push(nodes.slice(start, i + 1))
        start = -1
      }
    }
  }
  return regions
}

/**
 * Spec for one top-level `startitem()/enditem()` region in a module file.
 * Each region carries exactly one doc category.
 */
export type RegionSpec =
  | { readonly kind: "builtins" }
  | { readonly kind: "params"; readonly scope: ShellParamScope }
  | { readonly kind: "condOps" }

export interface ModuleRegionResult {
  readonly builtins: readonly BuiltinDoc[]
  readonly params: readonly ShellParamDoc[]
  readonly condOps: readonly CondOpDoc[]
}

/**
 * Parse a module .yo file with multiple top-level item regions, where each
 * region holds a single doc category. The `regions` array's index matches the
 * region's source-order position.
 *
 * Example: mod_termcap.yo has `echotc` builtin in region 0 and `termcap`
 * param in region 1 — spec is
 * `[{ kind: "builtins" }, { kind: "params", scope: "shell-set" }]`.
 *
 * Missing regions (file has fewer than the spec implies) are silently
 * tolerated and contribute empty arrays.
 */
export function parseModuleByRegions(
  yo: YodlSrc,
  moduleName: ModuleName,
  regions: readonly RegionSpec[],
): ModuleRegionResult {
  const found = extractTopLevelItemRegions(asNodes(yo))
  const builtins: BuiltinDoc[] = []
  const params: ShellParamDoc[] = []
  const condOps: CondOpDoc[] = []
  regions.forEach((spec, i) => {
    const region = found[i]
    if (!region) return
    if (spec.kind === "builtins") {
      builtins.push(...parseModuleBuiltins(region, moduleName))
    } else if (spec.kind === "params") {
      params.push(
        ...parseModuleParamsFromList(
          extractFirstItemList(region),
          moduleName,
          spec.scope,
        ),
      )
    } else {
      condOps.push(...parseModuleCondOps(region, moduleName))
    }
  })
  return { builtins, params, condOps }
}

/**
 * Parse conditional operators from a module .yo source.
 *
 * Handles `item(var(expr) tt(-op-name) var(operand))(desc)`.
 * Used by pcre and regex modules.
 */
export function parseModuleCondOps(
  yo: YodlSrc,
  moduleName: ModuleName,
): readonly CondOpDoc[] {
  return collectAliasedEntries(extractItems(yo, 1), h =>
    parseCondHeader(h, MODULE_OP_CHAR_RE),
  ).map(a =>
    buildCondOpDoc(a.head, normalizeBody(a.entry.body ?? []), moduleName),
  )
}
