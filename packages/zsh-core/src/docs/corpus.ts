/**
 * @module
 * Parsed zsh doc corpus — eager, cached, immutable.
 *
 * Resolver layer (raw → `Documented<K>`) lives next door in `resolvers.ts`.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cached, cachedUnary } from "@carlwr/typescript-extra"
import { resolveZshDataDir } from "../assets/data-dir.ts"
import type { CorpusYodlFile } from "./source-files.ts"
import {
  type DocCategory,
  type DocRecordMap,
  docCategories,
  idOf,
  subKindOf,
} from "./taxonomy.ts"
import type {
  BuiltinDoc,
  CondOpDoc,
  Documented,
  MathfuncDoc,
  ShellParamDoc,
} from "./types.ts"
import { extractSectionBody } from "./yodl/core/doc.ts"
import { parseNodes, type YNodeSeq } from "./yodl/core/nodes.ts"
import { parseArithOps } from "./yodl/extractors/arith-ops.ts"
import { applyBuiltinTags, parseBuiltins } from "./yodl/extractors/builtins.ts"
import { parseCompUtils } from "./yodl/extractors/comp-utils.ts"
import { parseComplexCommands } from "./yodl/extractors/complex-commands.ts"
import { parseCondOps } from "./yodl/extractors/cond-ops.ts"
import { parseGlobFlags } from "./yodl/extractors/glob-flags.ts"
import { parseGlobOps } from "./yodl/extractors/glob-ops.ts"
import { parseGlobQualifiers } from "./yodl/extractors/glob-qualifiers.ts"
import { parseHistory } from "./yodl/extractors/history.ts"
import { parseJobSpecs } from "./yodl/extractors/job-specs.ts"
import { parseKeymaps } from "./yodl/extractors/keymaps.ts"
import {
  extractMergedBuiltinModules,
  extractRegionBuiltins,
  extractRegionCondOps,
  extractRegionParams,
} from "./yodl/extractors/modules/by-regions.ts"
import { extractDeltochar } from "./yodl/extractors/modules/deltochar.ts"
import { extractMathfunc } from "./yodl/extractors/modules/mathfunc.ts"
import { extractStat } from "./yodl/extractors/modules/stat.ts"
import { extractSystem } from "./yodl/extractors/modules/system.ts"
import {
  extractTrivialBuiltinModules,
  extractTrivialParamModules,
} from "./yodl/extractors/modules/trivial.ts"
import { fixupOptionsYo, parseOptions } from "./yodl/extractors/options.ts"
import { fixupExpnYo, parseParamExpns } from "./yodl/extractors/param-expns.ts"
import { parseParamFlags } from "./yodl/extractors/param-flags.ts"
import { parsePrecmds } from "./yodl/extractors/precmds.ts"
import { parseProcessSubsts } from "./yodl/extractors/process-substs.ts"
import { parsePromptEscapes } from "./yodl/extractors/prompt-escapes.ts"
import { parseRedirs } from "./yodl/extractors/redirections.ts"
import { parseReswords } from "./yodl/extractors/reserved-words.ts"
import {
  parseCompletionParams,
  parseShellParams,
  parseWidgetParams,
} from "./yodl/extractors/shell-params.ts"
import { parseSpecialFunctions } from "./yodl/extractors/special-functions.ts"
import { parseSubscriptFlags } from "./yodl/extractors/subscript-flags.ts"
import { parseZleWidgets } from "./yodl/extractors/zle-widgets.ts"

const dataDir = resolveZshDataDir()

type GetNodes = (file: CorpusYodlFile) => YNodeSeq
type CategoryLoader = {
  [K in DocCategory]: (gn: GetNodes) => readonly DocRecordMap[K][]
}

// Pre-parse fixups for known upstream-doc typos live next to the extractor
// that relies on the fixed text; `loadCorpus` dispatches through this table
// so the shared-file parse sees the patched source, and direct extractor
// callers (tests) get the same input via each extractor's own string branch.
const fileFixups: Readonly<
  Partial<Record<CorpusYodlFile, (yo: string) => string>>
> = {
  "options.yo": fixupOptionsYo,
  "expn.yo": fixupExpnYo,
}

// `special_param` spans three files; `builtin` spans two (compwid.yo carries
// completion-builtin entries interleaved with other constructs, so only the
// "Completion Builtin Commands" section is extracted at depth 1). Both stay
// in-table so dispatch remains parametric over `DocCategory`. Categories
// whose loaders compose contributions from several module extractors are
// extracted into named helpers below to keep the dispatch table scannable.
const categoryLoader: CategoryLoader = {
  option: gn => parseOptions(gn("options.yo")),
  conditional_op: loadCondOps,
  builtin: loadBuiltins,
  precmd_modifier: gn => parsePrecmds(gn("grammar.yo")),
  special_param: loadSpecialParams,
  complex_command: gn => parseComplexCommands(gn("grammar.yo")),
  reserved_word: gn => parseReswords(gn("grammar.yo")),
  redirection: gn => parseRedirs(gn("redirect.yo")),
  process_subst: gn => parseProcessSubsts(gn("expn.yo")),
  param_expn: gn => parseParamExpns(gn("expn.yo")),
  subscript_flag: gn => parseSubscriptFlags(gn("params.yo")),
  param_expn_flag: gn => parseParamFlags(gn("expn.yo")),
  history_expn: gn => parseHistory(gn("expn.yo")),
  glob_op: gn => parseGlobOps(gn("expn.yo")),
  glob_flag: gn => parseGlobFlags(gn("expn.yo")),
  glob_qualifier: gn => parseGlobQualifiers(gn("expn.yo")),
  prompt_escape: gn => parsePromptEscapes(gn("prompt.yo")),
  zle_widget: gn => [
    ...parseZleWidgets(gn("zle.yo")),
    ...extractDeltochar(gn("mod_deltochar.yo")),
  ],
  keymap: gn => parseKeymaps(gn("zle.yo")),
  job_spec: gn => parseJobSpecs(gn("jobs.yo")),
  arith_op: gn => parseArithOps(gn("arith.yo")),
  mathfunc: loadMathfuncs,
  special_function: gn => parseSpecialFunctions(gn("func.yo")),
  comp_utility: gn => parseCompUtils(gn("compsys.yo")),
}

function loadCondOps(gn: GetNodes): readonly CondOpDoc[] {
  // Completion condition codes in compwid.yo §"Completion Condition Codes"
  // (`-after`, `-between`, `-prefix`, `-suffix`) need a `zsh/complete` tag
  // they don't carry upstream.
  const completionCodes = parseCondOps(
    extractSectionBody(gn("compwid.yo"), "Completion Condition Codes"),
  ).map(op => ({ ...op, module: "zsh/complete" as const }))
  return [
    ...parseCondOps(gn("cond.yo")),
    ...completionCodes,
    ...extractRegionCondOps(gn),
  ]
}

function loadBuiltins(gn: GetNodes): readonly BuiltinDoc[] {
  const fromCompwid = parseBuiltins(
    extractSectionBody(gn("compwid.yo"), "Completion Builtin Commands"),
    1,
  )
  return applyBuiltinTags([
    ...parseBuiltins(gn("builtins.yo")),
    ...fromCompwid,
    ...extractTrivialBuiltinModules(gn),
    ...extractRegionBuiltins(gn),
    ...extractMergedBuiltinModules(gn),
    ...extractStat(gn("mod_stat.yo")),
    ...extractSystem(gn("mod_system.yo")).builtins,
  ])
}

function loadSpecialParams(gn: GetNodes): readonly ShellParamDoc[] {
  return [
    ...parseShellParams(gn("params.yo")),
    ...parseWidgetParams(gn("zle.yo")),
    ...parseCompletionParams(gn("compwid.yo")),
    ...extractTrivialParamModules(gn),
    ...extractRegionParams(gn),
    ...extractSystem(gn("mod_system.yo")).params,
  ]
}

function loadMathfuncs(gn: GetNodes): readonly MathfuncDoc[] {
  return [
    ...extractMathfunc(gn("mod_mathfunc.yo")),
    ...extractSystem(gn("mod_system.yo")).mathfuncs,
  ]
}

/** Per-category map from `Documented<K>` identity to the K-shaped record. */
export type DocMap<K extends DocCategory> = ReadonlyMap<
  Documented<K>,
  DocRecordMap[K]
>

/** In-memory corpus of parsed zsh documentation, keyed by category then identity. */
export type DocCorpus = { readonly [K in DocCategory]: DocMap<K> }

function buildCategoryMap<K extends DocCategory>(
  cat: K,
  docs: readonly DocRecordMap[K][],
): DocMap<K> {
  return new Map(docs.map(d => [idOf(cat, d), d]))
}

/** Load the full parsed doc corpus. Eager, cached, immutable. */
export const loadCorpus: () => DocCorpus = cached(() => {
  // Parse each .yo file at most once: several categories share a file (expn.yo
  // covers 6 categories, grammar.yo and params.yo 2 each), and parseNodes is
  // the dominant cost. `cachedUnary` keeps the lookup lazy and per-file.
  const getNodes: GetNodes = cachedUnary(file => {
    const raw = readFileSync(join(dataDir, file), "utf8")
    return parseNodes(fileFixups[file]?.(raw) ?? raw)
  })
  const out: { [K in DocCategory]?: DocMap<K> } = {}
  for (const cat of docCategories) {
    ;(out as Record<DocCategory, unknown>)[cat] = buildCategoryMap(
      cat,
      categoryLoader[cat](getNodes),
    )
  }
  return Object.freeze(out) as DocCorpus
})

/**
 * Per-category sorted, de-duplicated `subKind` values observed in the
 * corpus. `undefined` for categories whose `docSubKind[c]` returns
 * `undefined` for every record (no meaningful sub-facet).
 *
 * Consumers (tooldef output schemas) interpolate these into JSON Schema
 * `enum` keywords; per AGENTS.md §"Never enumerate or count
 * `DocCategory`", closed-union enum values come from canonical tables.
 *
 * Eager, cached, immutable. Total over `DocCategory`, mirroring
 * `docSubKind` in `taxonomy.ts`.
 */
type SubKindEnums = Readonly<{
  [K in DocCategory]: readonly string[] | undefined
}>

export const subKindEnums: SubKindEnums = (() => {
  const corpus = loadCorpus()
  const entries = docCategories.map(cat => {
    const seen = new Set<string>()
    for (const rec of corpus[cat].values()) {
      const k = subKindOf(cat, rec)
      if (k) seen.add(k)
    }
    return [cat, seen.size === 0 ? undefined : [...seen].sort()] as const
  })
  return Object.freeze(Object.fromEntries(entries)) as SubKindEnums
})()
