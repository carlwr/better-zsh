import {
  assertNever,
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
  findAllBracketRanges,
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

// Handles `findex(name) item(tt(sig))(body)` plus xitem continuation lines.
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
    const headsRaw = lines.filter(l => !l.continuation && l.name !== "")
    if (!isNonEmpty(headsRaw)) continue
    // Expand `<name> ...` abbreviation: mod_stat.yo writes
    // `item(tt(stat) var(...))(...)` after a sibling `xitem(tt(zstat)...)` —
    // the `var(...)` Yodl arg renders as the literal three dots `...`. When
    // a head's sig is exactly `<name> ...`, swap in the first sibling's
    // (longer) sig with the leading name token replaced.
    const heads = expandAbbreviatedHeads(headsRaw)
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

// `SPACES()`-prefixed and leading-whitespace headers are continuations of
// the preceding head; everything else is a new command (first ws-separated
// token of the sig).
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

function expandAbbreviatedHeads(
  heads: NonEmpty<BuiltinHeader>,
): NonEmpty<BuiltinHeader> {
  const isAbbrev = (h: BuiltinHeader): boolean =>
    h.sig.trim() === `${h.name} ...`
  if (!heads.some(isAbbrev)) return heads
  const full = heads.find(h => !isAbbrev(h) && h.name !== "")
  if (!full) return heads
  return mapNonEmpty(heads, h => {
    if (!isAbbrev(h) || h.name === full.name) return h
    const swapped = full.sig.replace(/^\S+/, h.name)
    return { ...h, sig: swapped }
  })
}

/**
 * Synopses concatenate (input order); descs join with paragraph breaks;
 * later optional fields win only when earlier lacks them. Use for modules
 * whose .yo documents one command across several subsect blocks — `zpty`,
 * `zsocket`, `zsystem`.
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
 * Supports nested key-lists (e.g. `sysparams` in mod_system.yo). For tied-param
 * notation `tt(X) (tt(Y))` use `parseShellParams` directly — module files
 * don't tie params.
 */
export function parseModuleParams(
  yo: YodlSrc,
  moduleName: ModuleName,
  scope: ShellParamScope = "shell-set",
): readonly ShellParamDoc[] {
  return parseModuleParamsFromList(extractFirstItemList(yo), moduleName, scope)
}

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

export function extractTopLevelItemRegions(nodes: YNodeSeq): YNodeSeq[] {
  return findAllBracketRanges(nodes, "startitem", "enditem").map(r =>
    nodes.slice(r.start, r.end + 1),
  )
}

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
 * `regions[i]` matches the region at source-order index `i`. Missing regions
 * (file has fewer than the spec implies) are silently tolerated.
 *
 * Example: mod_termcap.yo has `echotc` in region 0 and `termcap` param in
 * region 1 — spec is `[{ kind: "builtins" }, { kind: "params", scope: "shell-set" }]`.
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
    } else if (spec.kind === "condOps") {
      condOps.push(...parseModuleCondOps(region, moduleName))
    } else {
      assertNever(spec)
    }
  })
  return { builtins, params, condOps }
}

// Handles `item(var(expr) tt(-op-name) var(operand))(desc)`.
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
