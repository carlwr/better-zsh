import type { NonEmpty } from "@carlwr/typescript-extra"
import { mkDocumented } from "../../brands.ts"
import { type ModuleName, parseModuleName } from "../../taxonomy.ts"
import type { BuiltinDoc } from "../../types.ts"
import { collectAliasedEntries, extractItems } from "../core/doc.ts"
import { asNodes, isMacro, type YNodeSeq, type YodlSrc } from "../core/nodes.ts"
import { normalizeHeader, stripYodl } from "../core/text.ts"
import { splitFlagBody } from "./flag-section.ts"

interface SynopsisLine {
  text: string
  continuation: boolean
}

/**
 * Module names for which real records exist in the corpus (parsed from their
 * dedicated mod_*.yo files). The `module(name)(modname)` macro in builtins.yo
 * emits stubs for these — those stubs are skipped to avoid duplicates.
 *
 * After module corpus extraction, any module listed here has real parsed
 * records; the builtins.yo stub would be a lower-quality duplicate.
 */
export const MODULES_WITH_REAL_RECORDS: ReadonlySet<ModuleName> =
  new Set<ModuleName>([
    "zsh/attr",
    "zsh/cap",
    "zsh/clone",
    "zsh/computil",
    "zsh/datetime",
    "zsh/db/gdbm",
    "zsh/net/socket",
    "zsh/param/private",
    "zsh/pcre",
    "zsh/regex",
    "zsh/sched",
    "zsh/stat",
    "zsh/system",
    "zsh/termcap",
    "zsh/terminfo",
    "zsh/watch",
    "zsh/zprof",
    "zsh/zpty",
    "zsh/zselect",
    "zsh/zutil",
  ])

export function parseBuiltins(
  yo: YodlSrc,
  depth?: number,
): readonly BuiltinDoc[] {
  const nodes = asNodes(yo)
  const byName = new Map<string, BuiltinDoc>()

  for (const doc of macroDocs(nodes)) {
    byName.set(doc.name, doc)
  }

  for (const entry of collectAliasedEntries(
    extractItems(nodes, depth),
    parseSynopsisLine,
  )) {
    const body = entry.entry.body ?? []
    const lines = [...entry.aliases, entry.head]
    const synopsisTail = lines.filter(l => l.continuation).map(l => l.text)
    const heads = lines.filter(l => !l.continuation)
    if (heads.length === 0) continue

    const { desc, flagGroups, outro } = splitFlagBody(body)
    const aliasOf = extractAlias(body)
    const module = extractModule(body)

    for (const head of heads) {
      const name = head.text.match(/^(\S+)/)?.[1]
      if (!name) continue
      const synopsis: NonEmpty<string> = [head.text, ...synopsisTail]
      byName.set(name, {
        name: mkDocumented("builtin", name),
        synopsis,
        desc,
        ...(aliasOf && { aliasOf }),
        ...(module && { module }),
        ...(flagGroups && { flagGroups }),
        ...(outro && { outro }),
      })
    }
  }

  return [...byName.values()]
}

function macroDocs(nodes: YNodeSeq): BuiltinDoc[] {
  const docs: BuiltinDoc[] = []

  for (const node of nodes) {
    if (isMacro(node, "alias")) {
      const name = normalizeHeader(node.args[0] ?? [])
      const target = normalizeHeader(node.args[1] ?? [])
      if (!name || !target) continue
      docs.push({
        name: mkDocumented("builtin", name),
        synopsis: [name],
        desc: `Same as \`${target}\`.`,
        aliasOf: mkDocumented("builtin", target),
      })
      continue
    }

    if (isMacro(node, "module")) {
      const name = normalizeHeader(node.args[0] ?? [])
      const module = parseModuleName(normalizeHeader(node.args[1] ?? []))
      if (!name || !module) continue
      // Skip stub when the module has real parsed records — the extractor in
      // modules/ already emits a full record for this builtin; the stub
      // would produce a low-quality duplicate with no synopsis or desc.
      if (MODULES_WITH_REAL_RECORDS.has(module)) continue
      docs.push({
        name: mkDocumented("builtin", name),
        synopsis: [name],
        desc: `Available via the \`${module}\` module.`,
        module,
      })
      continue
    }

    if (isMacro(node, "zlecmd")) {
      const name = normalizeHeader(node.args[0] ?? [])
      if (!name) continue
      docs.push({
        name: mkDocumented("builtin", name),
        synopsis: [name],
        desc: "See ZLE builtins.",
      })
    }
  }

  return docs
}

function normalizeSynopsis(raw: YNodeSeq): string {
  // Synopsis ends up inside a fenced ```zsh code block — strip tt/var
  // markup to plain text so the code block stays clean.
  return stripYodl(raw, "code")
    .replace(/\\\n/g, "\n")
    .replace(/\\$/gm, "")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map(line => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim()
}

function parseSynopsisLine(raw: YNodeSeq): SynopsisLine | undefined {
  const text = normalizeSynopsis(raw)
  if (!text) return undefined
  return { text, continuation: isMacro(raw[0], "SPACES") }
}

/**
 * Post-process tagging: apply `module` and `deprecated` fields to builtins
 * that are documented in builtins.yo / compwid.yo without their module tags.
 *
 * These are builtins defined by specific modules but whose yodl sources do
 * not use the `module()` macro (they're documented inline). This post-pass
 * ensures the module field is set without duplicating the record parsing.
 */
export function applyBuiltinTags(
  docs: readonly BuiltinDoc[],
): readonly BuiltinDoc[] {
  return docs.map(doc => {
    const override = BUILTIN_MODULE_TAGS[doc.name]
    if (!override) return doc
    return {
      ...doc,
      ...(override.module && { module: override.module }),
      ...(override.deprecated !== undefined && {
        deprecated: override.deprecated,
      }),
    }
  })
}

interface BuiltinTag {
  readonly module?: ModuleName
  readonly deprecated?: boolean
}

/**
 * Builtin-name → module (and optional deprecated flag) overrides.
 * Applied by `applyBuiltinTags` after all builtins are collected.
 *
 * `Partial<…>` so lookup is correctly typed as possibly `undefined`; the
 * phantom-branded `Documented<"builtin">` is just a string at runtime, so
 * indexing with `doc.name` matches by ordinary string equality.
 */
const BUILTIN_MODULE_TAGS: Readonly<Partial<Record<string, BuiltinTag>>> = {
  // zsh/compctl — deprecated completion system
  compctl: { module: "zsh/compctl", deprecated: true },
  compcall: { module: "zsh/compctl", deprecated: true },
  // zsh/complete — modern completion builtins
  compadd: { module: "zsh/complete" },
  compset: { module: "zsh/complete" },
  // zsh/zle — line editor builtins
  bindkey: { module: "zsh/zle" },
  vared: { module: "zsh/zle" },
  zle: { module: "zsh/zle" },
  // zsh/rlimits
  limit: { module: "zsh/rlimits" },
  ulimit: { module: "zsh/rlimits" },
  unlimit: { module: "zsh/rlimits" },
}

function extractAlias(body: YNodeSeq) {
  // Match the name in `Same as X' / `Same as `tt(X)' ` upstream forms.
  // `stripYodl` in code mode gives us the raw extracted text — no markdown
  // markup to disambiguate against.
  const m = stripYodl(body, "code").match(/\bSame as (?:`([^']*)'|([^.\s]+))/)
  const name = m?.[1] ?? m?.[2]
  return name ? mkDocumented("builtin", name) : undefined
}

function extractModule(body: YNodeSeq): ModuleName | undefined {
  const raw = stripYodl(body, "code")
    .replace(/\s+/g, " ")
    .match(/\bThe (\S+) Module\b/)?.[1]
  return raw ? parseModuleName(raw) : undefined
}
