import { nonEmpty } from "@carlwr/typescript-extra"
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
  /**
   * True when the upstream header's first significant token is a `var(...)`
   * metavariable rather than a `tt(...)` literal — i.e. the head reads as a
   * continuation of the preceding builtin's synopsis, not a self-named form.
   * `bg`/`fg`/`disown` body items are written as `var(job) ... tt(&)`; without
   * this flag they would create spurious `## job` records and lose their
   * intended association.
   */
  metaPrefix: boolean
}

/**
 * Modules with real records parsed from their dedicated mod_*.yo files.
 * `module(name)(modname)` stubs in builtins.yo are skipped for these to avoid
 * lower-quality duplicates.
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

    // Two grouping patterns in this corpus:
    //
    // (a) one builtin, multiple forms — all heads start with the same name
    //     (e.g. `cd` with 3 xitems, `fc` with 5+). Heads whose upstream
    //     macro is `var(...)` (`bg`/`fg`/`disown` body items) are also
    //     variant-forms of the preceding `tt(...)`-named builtin.
    //
    // (b) shared body, distinct names — `tt(test)` xitem + `tt([)` item; two
    //     findex declarations; each gets its own record with its own
    //     synopsis but the same body.
    //
    // Strategy: walk heads in order; a `metaPrefix` head folds into the
    // current group, a `tt(...)`-named head with a NEW first token opens a
    // new group. All groups share the same body (`desc`/`flagGroups`/etc.).
    interface HeadGroup {
      readonly name: string
      readonly synopses: string[]
    }
    const groups: HeadGroup[] = []
    for (const head of heads) {
      const last = groups[groups.length - 1]
      if (head.metaPrefix && last) {
        last.synopses.push(head.text)
        continue
      }
      const name = head.text.match(/^(\S+)/)?.[1]
      if (!name) continue
      const existing = groups.find(g => g.name === name)
      if (existing) existing.synopses.push(head.text)
      else groups.push({ name, synopses: [head.text] })
    }
    for (const g of groups) {
      const [first, ...rest] = g.synopses
      if (!first) continue
      const synopsis = nonEmpty(first, ...rest, ...synopsisTail)
      byName.set(g.name, {
        name: mkDocumented("builtin", g.name),
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
      // Skip the stub when modules/ already emits a full record — the stub
      // would be a low-quality duplicate (no synopsis or desc).
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
  return (
    stripYodl(raw, "code")
      .replace(/\\\n/g, "\n")
      .replace(/\\$/gm, "")
      .replace(/\n{2,}/g, "\n")
      .split("\n")
      .map(line => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .trim()
      // Upstream `compadd` synopsis continuation lines are written as
      // `SPACES()[tt(-X)...]` — no space inside the opening `[`. After tt
      // stripping that yields `[-X`, which deviates from the man-page
      // convention used everywhere else in the same synopsis. Restore the
      // inner space so the rendered block looks uniform.
      .replace(/\[(-[A-Za-z])/g, "[ $1")
  )
}

function parseSynopsisLine(raw: YNodeSeq): SynopsisLine | undefined {
  const text = normalizeSynopsis(raw)
  if (!text) return undefined
  return {
    text,
    continuation: isMacro(raw[0], "SPACES"),
    metaPrefix: isMacro(raw[0], "var"),
  }
}

// Tags builtins documented in builtins.yo / compwid.yo whose yodl sources
// don't use the `module()` macro (inlined). Avoids duplicating record parsing.
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

// Phantom-branded `Documented<"builtin">` is a plain string at runtime, so
// `doc.name` matches keys by ordinary string equality.
const BUILTIN_MODULE_TAGS: Readonly<Partial<Record<string, BuiltinTag>>> = {
  compctl: { module: "zsh/compctl", deprecated: true },
  compcall: { module: "zsh/compctl", deprecated: true },
  compadd: { module: "zsh/complete" },
  compset: { module: "zsh/complete" },
  bindkey: { module: "zsh/zle" },
  vared: { module: "zsh/zle" },
  zle: { module: "zsh/zle" },
  limit: { module: "zsh/rlimits" },
  ulimit: { module: "zsh/rlimits" },
  unlimit: { module: "zsh/rlimits" },
}

function extractAlias(body: YNodeSeq) {
  // Match the name in `Same as X' / `Same as `tt(X)' ` upstream forms.
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
