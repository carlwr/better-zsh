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
import { parseNodes, type YNodeSeq } from "./yodl/core/nodes.ts"
import { parseArithOps } from "./yodl/extractors/arith-ops.ts"
import { parseBuiltins } from "./yodl/extractors/builtins.ts"
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
  parseShellParams,
  parseWidgetParams,
} from "./yodl/extractors/shell-params.ts"
import { parseSpecialFunctions } from "./yodl/extractors/special-functions.ts"
import { parseSubscriptFlags } from "./yodl/extractors/subscript-flags.ts"
import { parseZleWidgets } from "./yodl/extractors/zle-widgets.ts"

const dataDir = resolveZshDataDir()

type CategoryLoader = {
  [K in DocCategory]: {
    readonly file: CorpusYodlFile
    readonly parse: (yo: YNodeSeq) => readonly DocRecordMap[K][]
  }
}

// Pre-parse fixups for known upstream-doc typos live next to the extractor
// that relies on the fixed text; `loadCorpus` dispatches through this table
// so the shared-file parse sees the patched source, and direct extractor
// callers (tests) get the same input via each extractor's own string branch.
const fileFixups: Readonly<Record<string, (yo: string) => string>> = {
  "options.yo": fixupOptionsYo,
  "expn.yo": fixupExpnYo,
}

const categoryLoader: CategoryLoader = {
  option: { file: "options.yo", parse: parseOptions },
  cond_op: { file: "cond.yo", parse: parseCondOps },
  builtin: { file: "builtins.yo", parse: parseBuiltins },
  precmd: { file: "grammar.yo", parse: parsePrecmds },
  shell_param: { file: "params.yo", parse: parseShellParams },
  complex_command: { file: "grammar.yo", parse: parseComplexCommands },
  reserved_word: { file: "grammar.yo", parse: parseReswords },
  redir: { file: "redirect.yo", parse: parseRedirs },
  process_subst: { file: "expn.yo", parse: parseProcessSubsts },
  param_expn: { file: "expn.yo", parse: parseParamExpns },
  subscript_flag: { file: "params.yo", parse: parseSubscriptFlags },
  param_flag: { file: "expn.yo", parse: parseParamFlags },
  history: { file: "expn.yo", parse: parseHistory },
  glob_op: { file: "expn.yo", parse: parseGlobOps },
  glob_flag: { file: "expn.yo", parse: parseGlobFlags },
  glob_qualifier: { file: "expn.yo", parse: parseGlobQualifiers },
  prompt_escape: { file: "prompt.yo", parse: parsePromptEscapes },
  zle_widget: { file: "zle.yo", parse: parseZleWidgets },
  keymap: { file: "zle.yo", parse: parseKeymaps },
  job_spec: { file: "jobs.yo", parse: parseJobSpecs },
  arith_op: { file: "arith.yo", parse: parseArithOps },
  special_function: { file: "func.yo", parse: parseSpecialFunctions },
}

/** In-memory corpus of parsed zsh documentation, keyed by category then identity. */
export interface DocCorpus {
  readonly option: ReadonlyMap<Documented<"option">, ZshOption>
  readonly cond_op: ReadonlyMap<Documented<"cond_op">, CondOpDoc>
  readonly builtin: ReadonlyMap<Documented<"builtin">, BuiltinDoc>
  readonly precmd: ReadonlyMap<Documented<"precmd">, PrecmdDoc>
  readonly shell_param: ReadonlyMap<Documented<"shell_param">, ShellParamDoc>
  readonly complex_command: ReadonlyMap<
    Documented<"complex_command">,
    ComplexCommandDoc
  >
  readonly reserved_word: ReadonlyMap<
    Documented<"reserved_word">,
    ReservedWordDoc
  >
  readonly redir: ReadonlyMap<Documented<"redir">, RedirDoc>
  readonly process_subst: ReadonlyMap<
    Documented<"process_subst">,
    ProcessSubstDoc
  >
  readonly param_expn: ReadonlyMap<Documented<"param_expn">, ParamExpnDoc>
  readonly subscript_flag: ReadonlyMap<
    Documented<"subscript_flag">,
    SubscriptFlagDoc
  >
  readonly param_flag: ReadonlyMap<Documented<"param_flag">, ParamFlagDoc>
  readonly history: ReadonlyMap<Documented<"history">, HistoryDoc>
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
}

type _AssertDocCorpusKeys1 = Assert<
  Eq<Exclude<DocCategory, Extract<keyof DocCorpus, string>>, never>
>
type _AssertDocCorpusKeys2 = Assert<
  Eq<Exclude<Extract<keyof DocCorpus, string>, DocCategory>, never>
>

function loadCategoryDocs<K extends DocCategory>(
  cat: K,
  getNodes: (file: string) => YNodeSeq,
): readonly DocRecordMap[K][] {
  // shell_param is composed from two files: `params.yo` (global parameters)
  // plus `zle.yo` widget-local params. Widget-params share ShellParamDoc's
  // shape; they surface under the `zle-widget` section. Kept out of the
  // generic CategoryLoader to avoid a multi-file dispatch schema for a
  // single outlier.
  if (cat === "shell_param") {
    return [
      ...parseShellParams(getNodes("params.yo")),
      ...parseWidgetParams(getNodes("zle.yo")),
    ] as unknown as readonly DocRecordMap[K][]
  }
  const { file, parse } = categoryLoader[cat]
  return parse(getNodes(file)) as readonly DocRecordMap[K][]
}

function buildCategoryMap<K extends DocCategory>(
  cat: K,
  docs: readonly DocRecordMap[K][],
): ReadonlyMap<Documented<K>, DocRecordMap[K]> {
  const map = new Map<Documented<K>, DocRecordMap[K]>()
  const getId = docId[cat] as (doc: DocRecordMap[K]) => Documented<K>
  for (const doc of docs) map.set(getId(doc), doc)
  return map
}

/** Load the full parsed doc corpus. Eager, cached, immutable. */
export const loadCorpus: () => DocCorpus = cached(() => {
  // Parse each .yo file at most once: several categories share a file (expn.yo
  // covers 6 categories, grammar.yo and params.yo 2 each), and parseNodes is
  // the dominant cost. `cachedUnary` keeps the lookup lazy and per-file.
  const getNodes = cachedUnary((file: string): YNodeSeq => {
    const raw = readFileSync(join(dataDir, file), "utf8")
    return parseNodes(fileFixups[file]?.(raw) ?? raw)
  })

  const out: {
    [K in DocCategory]?: ReadonlyMap<Documented<K>, DocRecordMap[K]>
  } = {}
  for (const cat of docCategories) {
    ;(out as Record<DocCategory, unknown>)[cat] = buildCategoryMap(
      cat,
      loadCategoryDocs(cat, getNodes),
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
export const subKindEnums: Readonly<{
  [K in DocCategory]: readonly string[] | undefined
}> = cached(() => {
  const corpus = loadCorpus()
  const out: { [K in DocCategory]?: readonly string[] | undefined } = {}
  for (const cat of docCategories) {
    const map = corpus[cat] as ReadonlyMap<string, DocRecordMap[DocCategory]>
    const getSubKind = docSubKind[cat] as (
      d: DocRecordMap[DocCategory],
    ) => string | undefined
    const seen = new Set<string>()
    for (const rec of map.values()) {
      const k = getSubKind(rec)
      if (k !== undefined && k !== null && k !== "") seen.add(k)
    }
    out[cat] = seen.size === 0 ? undefined : [...seen].sort()
  }
  return Object.freeze(out) as Readonly<{
    [K in DocCategory]: readonly string[] | undefined
  }>
})()
