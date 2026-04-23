/**
 * @module
 * Parsed zsh doc corpus — eager, cached, immutable.
 *
 * Also the home of the resolver layer: the per-category table that maps
 * untrusted raw user-code text to `Documented<K>` via category-specific,
 * corpus-aware parsing. This is the sole sanctioned brand-boundary crossing.
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  type Assert,
  cached,
  cachedUnary,
  type Eq,
} from "@carlwr/typescript-extra"
import { resolveZshDataDir } from "../data-dir.ts"
import { mkDocumented, normalizeOptName } from "./brands.ts"
import {
  type DocCategory,
  type DocPieceId,
  type DocRecordMap,
  docCategories,
  docId,
  mkPieceId,
} from "./taxonomy.ts"
import type {
  BuiltinDoc,
  ComplexCommandDoc,
  CondOpDoc,
  Documented,
  GlobFlagDoc,
  GlobOpDoc,
  GlobQualifierDoc,
  HistoryDoc,
  ParamExpnDoc,
  ParamFlagDoc,
  PrecmdDoc,
  ProcessSubstDoc,
  PromptEscapeDoc,
  RedirDoc,
  ReservedWordDoc,
  ShellParamDoc,
  SubscriptFlagDoc,
  ZleWidgetDoc,
  ZshOption,
} from "./types.ts"
import { parseNodes, type YNodeSeq } from "./yodl/core/nodes.ts"
import { parseBuiltins } from "./yodl/extractors/builtins.ts"
import { parseComplexCommands } from "./yodl/extractors/complex-commands.ts"
import { parseCondOps } from "./yodl/extractors/cond-ops.ts"
import { parseGlobFlags } from "./yodl/extractors/glob-flags.ts"
import { parseGlobOps } from "./yodl/extractors/glob-ops.ts"
import { parseGlobQualifiers } from "./yodl/extractors/glob-qualifiers.ts"
import { parseHistory } from "./yodl/extractors/history.ts"
import { fixupOptionsYo, parseOptions } from "./yodl/extractors/options.ts"
import { fixupExpnYo, parseParamExpns } from "./yodl/extractors/param-expns.ts"
import { parseParamFlags } from "./yodl/extractors/param-flags.ts"
import { parsePrecmds } from "./yodl/extractors/precmds.ts"
import { parseProcessSubsts } from "./yodl/extractors/process-substs.ts"
import { parsePromptEscapes } from "./yodl/extractors/prompt-escapes.ts"
import { parseRedirs } from "./yodl/extractors/redirections.ts"
import { parseReswords } from "./yodl/extractors/reserved-words.ts"
import { parseShellParams } from "./yodl/extractors/shell-params.ts"
import { parseSubscriptFlags } from "./yodl/extractors/subscript-flags.ts"
import { parseZleWidgets } from "./yodl/extractors/zle-widgets.ts"

const dataDir = resolveZshDataDir()

type CategoryLoader = {
  [K in DocCategory]: {
    readonly file: string
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

// --- Resolvers --------------------------------------------------------------
//
// The resolver layer maps raw user-code text to `Documented<K>` via per-category,
// corpus-aware parsing. Each resolver is free to do category-specific work —
// option negation (`no_` stripping), redirection group-op + tail matching,
// future custom categories — inside its own function. The uniform interface
// is `(corpus, raw: string) => Documented<K> | undefined`.
//
// The public `resolve(corpus, cat, raw)` dispatches through this table.

type Resolver<K extends DocCategory> = (
  c: DocCorpus,
  raw: string,
) => Documented<K> | undefined

/** Resolver for categories whose raw-to-lookup-key mapping is pure normalization. */
function simpleResolver<K extends DocCategory>(cat: K): Resolver<K> {
  return (c, raw) => {
    const id = mkDocumented(cat, raw)
    return (c[cat] as ReadonlyMap<string, unknown>).has(id as string)
      ? id
      : undefined
  }
}

/**
 * Redirection resolver. Decomposes a raw token (e.g. `"1>&2"`) into a
 * group-op prefix and a tail; disambiguates docs that share the same group-op
 * by matching the user-input tail shape against the doc's literal tail word.
 *
 * Doc sigs use special tail words — "number" for a numeric operand,
 * "word" for a non-numeric one, plus literal tails like `-` and `p`.
 * We classify the user input and match it to one of those literal words.
 */
function resolveRedir(
  c: DocCorpus,
  raw: string,
): Documented<"redir"> | undefined {
  const text = raw.trim().replace(/^[0-9]+/, "")
  if (!text) return undefined

  const docs = [...c.redir.values()]
  let groupOp: string | undefined
  for (const doc of docs) {
    if (!text.startsWith(doc.groupOp)) continue
    if (!groupOp || doc.groupOp.length > groupOp.length) groupOp = doc.groupOp
  }
  if (!groupOp) return undefined

  const matches = docs.filter(d => d.groupOp === groupOp)
  if (matches[0] && matches.length === 1) return matches[0].sig

  const wantKind = tailKindOf(text.slice(groupOp.length))
  const hit = matches.filter(d => docTail(d.sig, d.groupOp.length) === wantKind)
  return hit.length === 1 ? hit[0]?.sig : undefined
}

/** Literal tail word from a doc sig ("number" / "word" / "-" / "p" / ""). */
function docTail(sig: string, groupOpLen: number): string {
  return sig.slice(groupOpLen).trimStart()
}

/** Classify user-input tail into the matching doc-sig tail word. */
function tailKindOf(tail: string): string {
  if (/^\d+$/.test(tail)) return "number"
  if (tail === "-" || tail === "p") return tail
  return tail.length > 0 ? "word" : ""
}

/**
 * History resolver -- event-designator forms only.
 *
 * Word-designators (`0`, `a`, `n`, `x-y`, ...) and modifiers (`h`, `s/l/r[/]`,
 * ...) are grammatical components that only have meaning after an event
 * designator; they are NOT independent user-code tokens. A bare `0` or `a`
 * in isolation is never a history token. `classify` is context-free, so this
 * resolver stays out of those forms on the same "totality, not utility"
 * grounds as `param_expn`'s resolver (see DESIGN.md §"History: grammar
 * components, not independent tokens").
 *
 * Recognized forms (first match wins):
 * - `!!`                     -> `!!`
 * - `!#`                     -> `!#`
 * - `!{...}`                 -> `!{...}` (literal corpus template)
 * - `!?str` / `!?str?`       -> `!?str[?]`
 * - `!-n` (digits)           -> `!-n`
 * - `!n`  (digits)           -> `!n`
 * - `!str` (no spaces, no !) -> `!str`
 * - `^foo^bar` / `^foo^bar^` -> `!!` (documented synonym of `!!:s^foo^bar^`)
 */
function resolveHistory(
  c: DocCorpus,
  raw: string,
): Documented<"history"> | undefined {
  const t = raw.trim()
  if (!t) return undefined

  const key = matchHistoryKey(t)
  if (!key) return undefined

  const id = mkDocumented("history", key)
  return c.history.has(id) ? id : undefined
}

function matchHistoryKey(t: string): string | undefined {
  if (t === "!!") return "!!"
  if (t === "!#") return "!#"
  if (t === "!{...}") return "!{...}"

  if (t.startsWith("!?")) {
    const rest = t.slice(2)
    if (rest.length === 0) return undefined
    // optional trailing `?` terminator
    const body = rest.endsWith("?") ? rest.slice(0, -1) : rest
    if (body.length === 0) return undefined
    return "!?str[?]"
  }

  if (t.startsWith("!-")) {
    const rest = t.slice(2)
    if (rest.length > 0 && /^\d+$/.test(rest)) return "!-n"
    return undefined
  }

  if (t.startsWith("!")) {
    const rest = t.slice(1)
    if (rest.length === 0) return undefined
    if (/^\d+$/.test(rest)) return "!n"
    // `!str`: non-space, non-`!` chars
    if (/^[^!\s]+$/.test(rest)) return "!str"
    return undefined
  }

  // `^old^new` / `^old^new^` substitution shorthand -- documented as synonymous
  // with `!!:s^old^new^`, so resolve to the `!!` record.
  if (t.startsWith("^")) {
    const rest = t.slice(1)
    const secondCaret = rest.indexOf("^")
    if (secondCaret <= 0) return undefined
    // require at least one char before and after the middle `^`
    const after = rest.slice(secondCaret + 1)
    if (after.length === 0) return undefined
    // trailing `^` is optional; already covered
    return "!!"
  }

  return undefined
}

/**
 * Resolver factory for flag categories whose corpus keys are single letters
 * (`e`, `U`, `i`, ...) but whose user-code tokens may appear wrapped in
 * parentheses (e.g. `(e)` inside `${arr[(e)...]}`) or with a leading marker
 * (glob_flag: `(#i)`; glob_qualifier: `(#qX)` under `EXTENDED_GLOB`).
 *
 * Tries the raw-trimmed form verbatim; if that misses and the raw token is
 * wrapped, retries the inner form after stripping the category-specific
 * marker prefix. Falls back to undefined — a bare letter that is NOT a
 * documented flag never cross-resolves to an unrelated category entry.
 */
function parensAgnosticFlagResolver<
  K extends "subscript_flag" | "param_flag" | "glob_flag" | "glob_qualifier",
>(cat: K): Resolver<K> {
  return (c, raw) => {
    const map = c[cat] as ReadonlyMap<string, unknown>

    const direct = mkDocumented(cat, raw)
    if (map.has(direct as string)) return direct

    const t = raw.trim()
    if (t.startsWith("(") && t.endsWith(")") && t.length >= 2) {
      const inner = t.slice(1, -1)
      // Strip category-specific leading marker from the parenthesised form:
      //   glob_flag:      `(#i)`  → `i`
      //   glob_qualifier: `(#q@)` → `@`  (EXTENDED_GLOB form; BARE_GLOB_QUAL
      //                                    form `(@)` works via direct match)
      let stripped = inner
      if (cat === "glob_flag" && stripped.startsWith("#")) {
        stripped = stripped.slice(1)
      } else if (cat === "glob_qualifier" && stripped.startsWith("#q")) {
        stripped = stripped.slice(2)
      }
      if (stripped.length > 0) {
        const id = mkDocumented(cat, stripped)
        if (map.has(id as string)) return id
      }
    }

    return undefined
  }
}

const resolvers: { [K in DocCategory]: Resolver<K> } = {
  option: (c, raw) => resolveOption(c, raw)?.id,
  cond_op: simpleResolver("cond_op"),
  builtin: simpleResolver("builtin"),
  precmd: simpleResolver("precmd"),
  shell_param: simpleResolver("shell_param"),
  complex_command: simpleResolver("complex_command"),
  reserved_word: simpleResolver("reserved_word"),
  redir: resolveRedir,
  process_subst: simpleResolver("process_subst"),
  // param_expn ids are literal doc-template strings (e.g. `${name:-word}`),
  // so `simpleResolver` will essentially never match live user-code tokens;
  // the category is reached via search/describe rather than classify. Kept
  // in the table for total coverage of the closed `DocCategory` union.
  param_expn: simpleResolver("param_expn"),
  subscript_flag: parensAgnosticFlagResolver("subscript_flag"),
  param_flag: parensAgnosticFlagResolver("param_flag"),
  history: resolveHistory,
  glob_op: simpleResolver("glob_op"),
  glob_flag: parensAgnosticFlagResolver("glob_flag"),
  glob_qualifier: parensAgnosticFlagResolver("glob_qualifier"),
  prompt_escape: simpleResolver("prompt_escape"),
  zle_widget: simpleResolver("zle_widget"),
}

/**
 * Resolve a raw user-code token against the corpus.
 *
 * Dispatches through an internal per-category resolver table; each category
 * may apply corpus-aware parsing (`option` handles `no_`-prefix negation;
 * `redir` decomposes group-op + tail; most others just normalize + `Map.has`).
 *
 * Returns the matching `DocPieceId` (i.e. `{ category, id }` where `id` is
 * `Documented<K>`) or `undefined` if the token does not identify a corpus
 * element. The `| undefined` makes non-membership explicit at the value level.
 *
 * This is the sole public brand-boundary crossing point for untrusted raw
 * strings. The other legitimate routes to a `DocPieceId` are: assembling one
 * via `mkPieceId(cat, record.id)` from a corpus-iterated record, or internal
 * iteration inside zsh-core.
 */
export function resolve<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
  raw: string,
): DocPieceId | undefined {
  const id = resolvers[cat](corpus, raw)
  return id === undefined ? undefined : mkPieceId(cat, id)
}

/**
 * Resolve a raw option string in setopt/unsetopt context, preserving `no_`
 * negation as a semantic signal. Tries the literal normalized form first
 * (so `NOTIFY` resolves to `notify`, not to stripped `tify`); falls back to
 * a `no_`-stripped form with `negated: true` when the literal is absent.
 *
 * Category-specific richer sibling of `resolve(corpus, "option", raw)` —
 * callers that need to distinguish `setopt AUTO_CD` from `setopt NO_AUTO_CD`
 * use this; callers that only need the doc identity can use `resolve`.
 */
export function resolveOption(
  corpus: DocCorpus,
  raw: string,
):
  | { readonly id: Documented<"option">; readonly negated: boolean }
  | undefined {
  const literal = mkDocumented("option", raw)
  if (corpus.option.has(literal)) return { id: literal, negated: false }
  const m = raw.trim().match(/^no_?/i)
  if (!m) return undefined
  const stripped = normalizeOptName(
    raw.trim().slice(m[0].length),
  ) as Documented<"option">
  return corpus.option.has(stripped)
    ? { id: stripped, negated: true }
    : undefined
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
