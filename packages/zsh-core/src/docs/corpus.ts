/**
 * @module
 * Parsed zsh doc corpus — eager, cached, immutable.
 *
 * Resolver layer (raw → `Documented<K>`) lives next door in `resolvers.ts`.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  type Assert,
  cached,
  cachedUnary,
  type Eq,
} from "@carlwr/typescript-extra"
import { resolveZshDataDir } from "../assets/data-dir.ts"
import type { CorpusYodlFile } from "./source-files.ts"
import {
  type DocCategory,
  type DocRecordMap,
  docCategories,
  docId,
  docSubKind,
} from "./taxonomy.ts"
import type {
  ArithOpDoc,
  BuiltinDoc,
  ComplexCommandDoc,
  CompUtilityDoc,
  CondOpDoc,
  Documented,
  GlobFlagDoc,
  GlobOpDoc,
  GlobQualifierDoc,
  HistoryDoc,
  JobSpecDoc,
  KeymapDoc,
  ParamExpnDoc,
  ParamFlagDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  PromptEscapeDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SpecialFunctionDoc,
  SubscriptFlagDoc,
  ZleWidgetDoc,
  ZshOption,
} from "./types.ts"
import { extractSectionBody } from "./yodl/core/doc.ts"
import { parseNodes, type YNodeSeq } from "./yodl/core/nodes.ts"
import { parseArithOps } from "./yodl/extractors/arith-ops.ts"
import { parseBuiltins } from "./yodl/extractors/builtins.ts"
import { parseCompUtils } from "./yodl/extractors/comp-utils.ts"
import { parseComplexCommands } from "./yodl/extractors/complex-commands.ts"
import { parseCondOps } from "./yodl/extractors/cond-ops.ts"
import { parseGlobFlags } from "./yodl/extractors/glob-flags.ts"
import { parseGlobOps } from "./yodl/extractors/glob-ops.ts"
import { parseGlobQualifiers } from "./yodl/extractors/glob-qualifiers.ts"
import { parseHistory } from "./yodl/extractors/history.ts"
import { parseJobSpecs } from "./yodl/extractors/job-specs.ts"
import { parseKeymaps } from "./yodl/extractors/keymaps.ts"
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
// in-table so dispatch remains parametric over `DocCategory`.
const categoryLoader: CategoryLoader = {
  option: gn => parseOptions(gn("options.yo")),
  conditional_op: gn => parseCondOps(gn("cond.yo")),
  builtin: gn => [
    ...parseBuiltins(gn("builtins.yo")),
    ...parseBuiltins(
      extractSectionBody(gn("compwid.yo"), "Completion Builtin Commands"),
      1,
    ),
  ],
  precmd_modifier: gn => parsePrecmds(gn("grammar.yo")),
  special_param: gn => [
    ...parseShellParams(gn("params.yo")),
    ...parseWidgetParams(gn("zle.yo")),
    ...parseCompletionParams(gn("compwid.yo")),
  ],
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
  zle_widget: gn => parseZleWidgets(gn("zle.yo")),
  keymap: gn => parseKeymaps(gn("zle.yo")),
  job_spec: gn => parseJobSpecs(gn("jobs.yo")),
  arith_op: gn => parseArithOps(gn("arith.yo")),
  special_function: gn => parseSpecialFunctions(gn("func.yo")),
  comp_utility: gn => parseCompUtils(gn("compsys.yo")),
}

/** In-memory corpus of parsed zsh documentation, keyed by category then identity. */
export interface DocCorpus {
  readonly option: ReadonlyMap<Documented<"option">, ZshOption>
  readonly conditional_op: ReadonlyMap<Documented<"conditional_op">, CondOpDoc>
  readonly builtin: ReadonlyMap<Documented<"builtin">, BuiltinDoc>
  readonly precmd_modifier: ReadonlyMap<
    Documented<"precmd_modifier">,
    PrecmdDoc
  >
  readonly special_param: ReadonlyMap<
    Documented<"special_param">,
    ShellParamDoc
  >
  readonly complex_command: ReadonlyMap<
    Documented<"complex_command">,
    ComplexCommandDoc
  >
  readonly reserved_word: ReadonlyMap<
    Documented<"reserved_word">,
    ReservedWordDoc
  >
  readonly redirection: ReadonlyMap<Documented<"redirection">, RedirDoc>
  readonly process_subst: ReadonlyMap<
    Documented<"process_subst">,
    ProcessSubstDoc
  >
  readonly param_expn: ReadonlyMap<Documented<"param_expn">, ParamExpnDoc>
  readonly subscript_flag: ReadonlyMap<
    Documented<"subscript_flag">,
    SubscriptFlagDoc
  >
  readonly param_expn_flag: ReadonlyMap<
    Documented<"param_expn_flag">,
    ParamFlagDoc
  >
  readonly history_expn: ReadonlyMap<Documented<"history_expn">, HistoryDoc>
  readonly glob_op: ReadonlyMap<Documented<"glob_op">, GlobOpDoc>
  readonly glob_flag: ReadonlyMap<Documented<"glob_flag">, GlobFlagDoc>
  readonly glob_qualifier: ReadonlyMap<
    Documented<"glob_qualifier">,
    GlobQualifierDoc
  >
  readonly prompt_escape: ReadonlyMap<
    Documented<"prompt_escape">,
    PromptEscapeDoc
  >
  readonly zle_widget: ReadonlyMap<Documented<"zle_widget">, ZleWidgetDoc>
  readonly keymap: ReadonlyMap<Documented<"keymap">, KeymapDoc>
  readonly job_spec: ReadonlyMap<Documented<"job_spec">, JobSpecDoc>
  readonly arith_op: ReadonlyMap<Documented<"arith_op">, ArithOpDoc>
  readonly special_function: ReadonlyMap<
    Documented<"special_function">,
    SpecialFunctionDoc
  >
  readonly comp_utility: ReadonlyMap<Documented<"comp_utility">, CompUtilityDoc>
}

type _AssertDocCorpusKeys1 = Assert<
  Eq<Exclude<DocCategory, Extract<keyof DocCorpus, string>>, never>
>
type _AssertDocCorpusKeys2 = Assert<
  Eq<Exclude<Extract<keyof DocCorpus, string>, DocCategory>, never>
>
// Catch a wrong record-type per field, not just key drift.
type _AssertDocCorpusValueShapes = Assert<
  Eq<
    DocCorpus,
    { readonly [K in DocCategory]: ReadonlyMap<Documented<K>, DocRecordMap[K]> }
  >
>

function buildCategoryMap<K extends DocCategory>(
  cat: K,
  docs: readonly DocRecordMap[K][],
): ReadonlyMap<Documented<K>, DocRecordMap[K]> {
  const getId = docId[cat] as (doc: DocRecordMap[K]) => Documented<K>
  return new Map(docs.map(d => [getId(d), d]))
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
  const out: {
    [K in DocCategory]?: ReadonlyMap<Documented<K>, DocRecordMap[K]>
  } = {}
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

export const subKindEnums: SubKindEnums = cached(() => {
  const corpus = loadCorpus()
  const entries = docCategories.map(cat => {
    const map = corpus[cat] as ReadonlyMap<string, DocRecordMap[DocCategory]>
    const getSubKind = docSubKind[cat] as (
      d: DocRecordMap[DocCategory],
    ) => string | undefined
    const seen = new Set<string>()
    for (const rec of map.values()) {
      const k = getSubKind(rec)
      if (k) seen.add(k)
    }
    return [cat, seen.size === 0 ? undefined : [...seen].sort()] as const
  })
  return Object.freeze(Object.fromEntries(entries)) as SubKindEnums
})()
