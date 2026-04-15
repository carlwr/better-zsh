/**
 * @module
 * Parsed zsh doc corpus — eager, cached, immutable.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type Assert, cached, type Eq } from "@carlwr/typescript-extra"
import { resolveZshDataDir } from "../data-dir.ts"
import {
  type CandidateDocPieceId,
  type DocCategory,
  type DocPieceId,
  type DocRecordMap,
  docCategories,
  docId,
} from "./taxonomy.ts"
import type {
  BuiltinDoc,
  CondOpDoc,
  GlobFlagDoc,
  GlobOpDoc,
  HistoryDoc,
  ParamFlagDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  Proven,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SubscriptFlagDoc,
  ZshOption,
} from "./types.ts"
import { type Candidate, normalizeOptName } from "./types.ts"
import { parseBuiltins } from "./yodl/extractors/builtins.ts"
import { parseCondOps } from "./yodl/extractors/cond-ops.ts"
import { parseGlobFlags } from "./yodl/extractors/glob-flags.ts"
import { parseGlobOps } from "./yodl/extractors/glob-ops.ts"
import { parseHistory } from "./yodl/extractors/history.ts"
import { parseOptions } from "./yodl/extractors/options.ts"
import { parseParamFlags } from "./yodl/extractors/param-flags.ts"
import { parsePrecmds } from "./yodl/extractors/precmds.ts"
import { parseProcessSubsts } from "./yodl/extractors/process-substs.ts"
import { parseRedirs } from "./yodl/extractors/redirections.ts"
import { parseReswords } from "./yodl/extractors/reserved-words.ts"
import { parseShellParams } from "./yodl/extractors/shell-params.ts"
import { parseSubscriptFlags } from "./yodl/extractors/subscript-flags.ts"

const dataDir = resolveZshDataDir()

type CategoryLoader = {
  [K in DocCategory]: {
    readonly file: string
    readonly parse: (yo: string) => readonly DocRecordMap[K][]
  }
}

const categoryLoader: CategoryLoader = {
  option: { file: "options.yo", parse: parseOptions },
  cond_op: { file: "cond.yo", parse: parseCondOps },
  builtin: { file: "builtins.yo", parse: parseBuiltins },
  precmd: { file: "grammar.yo", parse: parsePrecmds },
  shell_param: { file: "params.yo", parse: parseShellParams },
  reserved_word: { file: "grammar.yo", parse: parseReswords },
  redir: { file: "redirect.yo", parse: parseRedirs },
  process_subst: { file: "expn.yo", parse: parseProcessSubsts },
  subscript_flag: { file: "params.yo", parse: parseSubscriptFlags },
  param_flag: { file: "expn.yo", parse: parseParamFlags },
  history: { file: "expn.yo", parse: parseHistory },
  glob_op: { file: "expn.yo", parse: parseGlobOps },
  glob_flag: { file: "expn.yo", parse: parseGlobFlags },
}

/** In-memory corpus of parsed zsh documentation, keyed by category then identity. */
export interface DocCorpus {
  readonly option: ReadonlyMap<Proven<"option">, ZshOption>
  readonly cond_op: ReadonlyMap<Proven<"cond_op">, CondOpDoc>
  readonly builtin: ReadonlyMap<Proven<"builtin">, BuiltinDoc>
  readonly precmd: ReadonlyMap<Proven<"precmd">, PrecmdDoc>
  readonly shell_param: ReadonlyMap<Proven<"shell_param">, ShellParamDoc>
  readonly reserved_word: ReadonlyMap<Proven<"reserved_word">, ReservedWordDoc>
  readonly redir: ReadonlyMap<Proven<"redir">, RedirDoc>
  readonly process_subst: ReadonlyMap<Proven<"process_subst">, ProcessSubstDoc>
  readonly subscript_flag: ReadonlyMap<
    Proven<"subscript_flag">,
    SubscriptFlagDoc
  >
  readonly param_flag: ReadonlyMap<Proven<"param_flag">, ParamFlagDoc>
  readonly history: ReadonlyMap<Proven<"history">, HistoryDoc>
  readonly glob_op: ReadonlyMap<Proven<"glob_op">, GlobOpDoc>
  readonly glob_flag: ReadonlyMap<Proven<"glob_flag">, GlobFlagDoc>
}

type _AssertDocCorpusKeys1 = Assert<
  Eq<Exclude<DocCategory, Extract<keyof DocCorpus, string>>, never>
>
type _AssertDocCorpusKeys2 = Assert<
  Eq<Exclude<Extract<keyof DocCorpus, string>, DocCategory>, never>
>

function loadCategoryDocs<K extends DocCategory>(
  cat: K,
): readonly DocRecordMap[K][] {
  const { file, parse } = categoryLoader[cat]
  const yo = readFileSync(join(dataDir, file), "utf8")
  return parse(yo) as readonly DocRecordMap[K][]
}

function buildCategoryMap<K extends DocCategory>(
  cat: K,
  docs: readonly DocRecordMap[K][],
): ReadonlyMap<Proven<K>, DocRecordMap[K]> {
  const map = new Map<Proven<K>, DocRecordMap[K]>()
  const getId = docId[cat] as (doc: DocRecordMap[K]) => Proven<K>
  for (const doc of docs) map.set(getId(doc), doc)
  return map
}

/**
 * Resolve a candidate lookup against the corpus. Returns a proven `DocPieceId`
 * if the candidate identifies a documented element, `undefined` otherwise.
 *
 * This is the sole public brand-boundary crossing point: it is the one place
 * where a candidate brand is compared against a corpus brand. Internally the
 * candidate is cast to a string for Map lookup; externally the return type
 * expresses "might not exist" via `| undefined`.
 */
export function resolve(
  corpus: DocCorpus,
  query: CandidateDocPieceId,
): DocPieceId | undefined {
  const map = corpus[query.category] as ReadonlyMap<string, unknown>
  const id = query.id as unknown as string
  if (!map.has(id)) return undefined
  return { category: query.category, id: query.id } as unknown as DocPieceId
}

/**
 * Resolve a raw option string against the corpus, preserving `no_` negation as
 * a semantic signal. Tries the literal form first (handles `NOTIFY` correctly
 * when `NO_NOTIFY` is also passed in); falls back to stripped form with
 * `negated: true` when the literal is absent.
 */
export function resolveOption(
  corpus: DocCorpus,
  raw: string,
): { readonly id: Proven<"option">; readonly negated: boolean } | undefined {
  const trimmed = raw.trim()
  const literal = normalizeOptName(trimmed) as unknown as Proven<"option">
  if (corpus.option.has(literal)) return { id: literal, negated: false }
  const m = trimmed.match(/^no_?/i)
  if (!m) return undefined
  // normalizeOptName only — mkCandidate would re-strip a second no_ prefix
  const stripped = normalizeOptName(
    trimmed.slice(m[0].length),
  ) as Candidate<"option">
  const id = stripped as unknown as Proven<"option">
  return corpus.option.has(id) ? { id, negated: true } : undefined
}

/** Load the full parsed doc corpus. Eager, cached, immutable. */
export const loadCorpus: () => DocCorpus = cached(() => {
  const out: {
    [K in DocCategory]?: ReadonlyMap<Proven<K>, DocRecordMap[K]>
  } = {}
  for (const cat of docCategories) {
    ;(out as Record<DocCategory, unknown>)[cat] = buildCategoryMap(
      cat,
      loadCategoryDocs(cat),
    )
  }
  return Object.freeze(out) as DocCorpus
})
