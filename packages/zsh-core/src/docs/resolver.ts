// MIRRORED-IN: zshref-rs/src/resolver.rs

/**
 * @module
 * Resolver layer: untrusted raw user-code text → corpus identity, plus
 * feedback when the normalization was lossy.
 *
 * `resolve(corpus, cat, raw)` is the sole sanctioned brand-boundary crossing
 * for raw strings: direct corpus-key lookup first, then the category's
 * resolver — per-category, corpus-aware parsing with two durable jobs:
 *
 * - Close the gap between live zsh syntax and corpus identity. Option lookup
 *   is the canonical case: zsh ignores underscores, treats a leading
 *   `NO_`/`NO` as negation and names options by single-letter flags, so
 *   `auto_cd`, `NO_AUTO_CD`, `au_to_cd` and `-J` all identify the same
 *   documented option record.
 * - Bridge documentation chunk shape. Some upstream zsh sections document a
 *   family as operator + form, not one record per surface operator. Redirection
 *   records, for example, are keyed by signatures like `>& number`, `>& -`,
 *   and `<<[-] word`; resolving `2>&1` or `<<EOF` therefore has to identify
 *   the operand shape before it can name a doc record.
 *
 * Template-like categories follow the same identity rule: the resolver maps a
 * live token to the documented template record (`!42` → `!n`,
 * `TRAPINT` → `TRAPNAL`) while the direct step keeps exact keys
 * round-tripping (`!n`, `TRAPNAL`, `%number`).
 *
 * The hit carries the resolved record and feedback for lossy normalization
 * (`setopt NO_AUTO_CD` resolving to `autocd` discards the `NO_` prefix that
 * carries semantic meaning); the `Documented<K>` brand itself stays
 * identity-only. One parametric entry rather than per-category APIs:
 * dispatch lives in the resolver table, so consumers never branch on the
 * category. See DESIGN.md §"Resolver feedback channel" and PRINCIPLES.md
 * §"Resolver feedback (lossy normalization)".
 */

import { escapeRegExp, isSingle } from "@carlwr/typescript-extra"
import { mkDocumented, redirSlugFromSig } from "./brands.ts"
import type { DocCorpus } from "./corpus.ts"
import {
  classifyOrder,
  type DocCategory,
  type DocRecordMap,
  docCategories,
} from "./taxonomy.ts"
import type { Documented, RedirDoc } from "./types.ts"

// --- Resolvers --------------------------------------------------------------

type Resolver<K extends DocCategory> = (
  c: DocCorpus,
  raw: string,
) => ResolvedHit<K> | undefined

/**
 * The hit for `id` when `corpus[cat]` has it — membership check and record
 * fetch in one, so no resolver answers an id the corpus lacks. Centralizes
 * the brand-peel cast needed when `cat` is generic.
 */
function hitAt<K extends DocCategory>(
  c: DocCorpus,
  cat: K,
  id: Documented<K>,
  feedback?: ResolverFeedback,
): ResolvedHit<K> | undefined {
  const record = (c[cat] as ReadonlyMap<string, DocRecordMap[K]>).get(
    id as string,
  )
  if (record === undefined) return undefined
  return feedback ? { record, feedback } : { record }
}

/** Resolver for categories whose raw-to-key mapping is pure normalization. */
function simpleResolver<K extends DocCategory>(cat: K): Resolver<K> {
  return (c, raw) => hitAt(c, cat, mkDocumented(cat, raw))
}

/**
 * Envelope for resolvers whose raw-to-key step is a pure string projection:
 * trim → match → corpus lookup. `matchKey` returns `undefined` to opt out.
 */
function resolveByKey<K extends DocCategory>(
  c: DocCorpus,
  cat: K,
  raw: string,
  matchKey: (t: string) => string | undefined,
): ResolvedHit<K> | undefined {
  const t = raw.trim()
  if (!t) return undefined
  const key = matchKey(t)
  if (!key) return undefined
  return hitAt(c, cat, mkDocumented(cat, key))
}

/**
 * Redirection resolver. Decomposes a raw token (`"1>&2"`) into group-op +
 * tail. Candidates are the records whose group-op is the longest prefix of
 * the token — zsh lexes the longest operator, so `>&` never falls back to
 * `>` — and the user-input tail shape against each doc's literal tail word
 * ("number", "word", `-`, `p`, ...) picks one of them.
 */
function resolveRedir(
  c: DocCorpus,
  raw: string,
): ResolvedHit<"redirection"> | undefined {
  return (
    hitAt(c, "redirection", mkDocumented("redirection", raw)) ??
    // Sig-form close-variant: doc sig (`> word`) → id (`>_word`).
    hitAt(
      c,
      "redirection",
      mkDocumented("redirection", redirSlugFromSig(raw.trim())),
    ) ??
    resolveByKey(c, "redirection", raw, t => matchRedirKey(c, t))
  )
}

/** Literal tail word from a doc sig ("number" / "word" / "-" / "p" / ""). */
function docTail(sig: string, groupOpLen: number): string {
  return sig.slice(groupOpLen).trimStart()
}

function matchRedirKey(c: DocCorpus, t: string): string | undefined {
  const text = t.replace(/^[0-9]+/, "")
  const docs = [...c.redirection.values()]
  const longest = Math.max(
    0,
    ...docs.map(doc => groupOpPrefixLen(doc.groupOp, text)),
  )
  if (longest === 0) return undefined
  const hit = docs.filter(
    doc =>
      groupOpPrefixLen(doc.groupOp, text) === longest &&
      redirTailMatches(doc, text.slice(longest)),
  )
  return isSingle(hit) ? hit[0].id : undefined
}

/** Length of `groupOp` as a prefix of `text`, 0 when it is none; `<<[-]` stands for `<<-` or `<<`. */
function groupOpPrefixLen(groupOp: string, text: string): number {
  const ops = groupOp === "<<[-]" ? ["<<-", "<<"] : [groupOp]
  return ops.find(op => text.startsWith(op))?.length ?? 0
}

function redirTailMatches({ sig, groupOp }: RedirDoc, tail: string): boolean {
  const pat =
    groupOp === "<<[-]"
      ? String.raw`\s*\S.*`
      : redirTailPattern(groupOp, docTail(sig, groupOp.length))
  return new RegExp(`^${pat}$`).test(tail)
}

function redirTailPattern(groupOp: string, tail: string): string {
  if (tail === "number") return String.raw`\s*\d+`
  if (tail === "-" || tail === "p") return String.raw`\s*${escapeRegExp(tail)}`
  if (tail !== "word") return ""
  return groupOp === ">&" || groupOp === "<&"
    ? String.raw`\s*(?!(?:\d+|-|p)$)\S.*`
    : String.raw`(?:\s*\S.*)?`
}

/**
 * History resolver — event-designators only.
 *
 * Word-designators (`0`, `a`, `n`, `x-y`, ...) and modifiers (`h`, `s/l/r[/]`,
 * ...) only carry meaning after an event designator; a bare `0` or `a` is
 * never a history token. Same "totality, not utility" posture as `param_expn`
 * (DESIGN.md §"History: grammar components, not independent tokens").
 */
function resolveHistory(
  c: DocCorpus,
  raw: string,
): ResolvedHit<"history_expn"> | undefined {
  return resolveByKey(c, "history_expn", raw, matchHistoryKey)
}

// First match wins; order matters (e.g. `!!` before `!str`).
const HISTORY_KEYS: readonly (readonly [RegExp, string])[] = [
  [/^!!$/, "!!"],
  [/^!#$/, "!#"],
  [/^!\{.+\}$/, "!{...}"], // literal corpus template
  [/^!\?.+\??$/, "!?str[?]"],
  [/^!-\d+$/, "!-n"],
  [/^!\d+$/, "!n"],
  [/^![^!$^%*\s]+$/, "!str"],
  [/^\^[^^]+\^[^^]+?\^?$/, "!!"], // documented synonym of `!!:s^foo^bar^`
]

function matchHistoryKey(t: string): string | undefined {
  return HISTORY_KEYS.find(([re]) => re.test(t))?.[1]
}

// Single-letter flag categories. Corpus keys are letters (`e`, `U`, `i`);
// user tokens may wrap in parens (`(e)`, `(#i)`, `(#qX)`) or trail args
// (`j:string:`). Helpers narrow further when behaviour diverges.
type FlagCategory =
  | "subscript_flag"
  | "param_expn_flag"
  | "glob_flag"
  | "glob_qualifier"

// Subset whose sigs carry colon-delimited operand markers.
const COLON_ARG_FLAG_CATS: ReadonlySet<FlagCategory> = new Set([
  "param_expn_flag",
  "subscript_flag",
])

/**
 * Resolver factory for flag categories whose corpus keys are single letters
 * but whose user tokens may appear wrapped in parens or with a category-
 * specific marker prefix (`#` for `glob_flag`, `#q` for `glob_qualifier`).
 *
 * Tries raw verbatim; on miss, retries the inner form after stripping the
 * marker prefix. A bare letter that is NOT a documented flag never
 * cross-resolves into an unrelated category.
 */
function parensAgnosticFlagResolver<K extends FlagCategory>(
  cat: K,
): Resolver<K> {
  return (c, raw) => {
    const t = raw.trim()
    const direct = tryFlagKey(c, cat, t)
    if (direct) return direct
    const inner = flagInnerKey(cat, t)
    return inner ? tryFlagKey(c, cat, inner) : undefined
  }
}

/**
 * Try a key against the flag map. For `COLON_ARG_FLAG_CATS`, also accepts
 * the full sig form (`j:string:`) by stripping to the bare letter (`j`).
 */
function tryFlagKey<K extends FlagCategory>(
  c: DocCorpus,
  cat: K,
  key: string,
): ResolvedHit<K> | undefined {
  const direct = hitAt(c, cat, mkDocumented(cat, key))
  if (direct) return direct
  if (!COLON_ARG_FLAG_CATS.has(cat) || !key.includes(":")) return undefined
  const bare = key.split(":")[0]
  if (!bare) return undefined
  return hitAt(c, cat, mkDocumented(cat, bare))
}

function flagInnerKey(cat: FlagCategory, t: string): string | undefined {
  const inner = t.match(/^\((.+)\)$/)?.[1]
  if (!inner) return undefined
  if (cat === "glob_flag") return inner.replace(/^#/, "")
  if (cat === "glob_qualifier") return inner.replace(/^#q/, "")
  return inner
}

const SUBSCRIPTED_PARAM_RE = /^([A-Za-z_][A-Za-z0-9_]*)\[(.+)\]$/

/**
 * Strip a `$` / `${…}` parameter sigil, returning the bare name. `undefined`
 * when `t` is not sigiled or the sigil wraps nothing (`$`, `${}`). Mirrors the
 * `strip_prefix('$')` branch of resolver.rs `resolve_special_param`.
 */
function stripParamSigil(t: string): string | undefined {
  if (!t.startsWith("$")) return undefined
  const rest = t.slice(1)
  const inner =
    rest.startsWith("{") && rest.endsWith("}") ? rest.slice(1, -1) : rest
  return inner === "" ? undefined : inner
}

/**
 * Close-variant `IDENT[inner]` → `IDENT` (`compstate[context]` → `compstate`,
 * `words[CURRENT]` → `words`). Lossy — the subscript surfaces as
 * `subscripted` feedback. Mirrors resolver.rs `resolve_param_subscript`.
 */
function resolveParamSubscript(
  c: DocCorpus,
  raw: string,
): ResolvedHit<"special_param"> | undefined {
  const m = raw.trim().match(SUBSCRIPTED_PARAM_RE)
  if (!m) return undefined
  return hitAt(c, "special_param", mkDocumented("special_param", m[1] ?? ""), {
    kind: "subscripted",
    subscript: m[2] ?? "",
  })
}

/**
 * Special-parameter resolver. A `$NAME` / `${NAME}` sigil is stripped and the
 * bare name resolved — the only path that reaches the punctuation params
 * (`$#`, `$?`, `$!`, …), which have no leading letter to anchor a literal
 * lookup, and which also accepts `$PATH`, `${HOME}`, etc. Otherwise literal
 * first, then the `[...]` subscript close-variant. Wider user-expression
 * parsing stays out of scope (PRINCIPLES.md §"Resolver scope balance").
 */
function resolveSpecialParam(
  c: DocCorpus,
  raw: string,
): ResolvedHit<"special_param"> | undefined {
  const name = stripParamSigil(raw.trim())
  if (name !== undefined) {
    return (
      hitAt(c, "special_param", mkDocumented("special_param", name)) ??
      resolveParamSubscript(c, name)
    )
  }
  return (
    hitAt(c, "special_param", mkDocumented("special_param", raw)) ??
    resolveParamSubscript(c, raw)
  )
}

/**
 * Job-spec resolver. Literal first for `%%`, `%+`, `%-`; template matches
 * for `%n`, `%?str`, `%str`.
 */
function resolveJobSpec(
  c: DocCorpus,
  raw: string,
): ResolvedHit<"job_spec"> | undefined {
  return resolveByKey(c, "job_spec", raw, t =>
    t.startsWith("%") ? jobSpecKey(t) : undefined,
  )
}

const JOB_LITERAL_RE = /^%(?:%|\+|-)$/
const JOB_NUMBER_RE = /^%\d+$/
const JOB_CONTAINS_RE = /^%\?.+$/
const JOB_STRING_RE = /^%.+$/

function jobSpecKey(t: string): string | undefined {
  if (JOB_LITERAL_RE.test(t)) return t
  if (JOB_NUMBER_RE.test(t)) return "%number"
  if (JOB_CONTAINS_RE.test(t)) return "%?string"
  if (t !== "%?" && JOB_STRING_RE.test(t)) return "%string"
  return undefined
}

/**
 * Special-function resolver. Literal first for hook names and literal TRAP*
 * names. Two compositional fallbacks for the patterns zsh exposes:
 *
 * - a hook record's `hookArray` (`precmd_functions`) → that hook record
 *   (companion array is the same concept).
 * - `^TRAP[A-Z0-9]+$` → `TRAPNAL` template record.
 *
 * No signal-name validation: `kill -l` is host-level (zsh-aware, not
 * environment-aware).
 */
function resolveSpecialFunction(
  c: DocCorpus,
  raw: string,
): ResolvedHit<"special_function"> | undefined {
  return (
    hitAt(c, "special_function", mkDocumented("special_function", raw)) ??
    resolveByKey(c, "special_function", raw, t => matchSpecialFunctionKey(c, t))
  )
}

const TRAP_TEMPLATE_RE = /^TRAP[A-Z0-9]+$/

function matchSpecialFunctionKey(c: DocCorpus, t: string): string | undefined {
  const hook = [...c.special_function.values()].find(d => d.hookArray === t)
  if (hook) return hook.id
  if (TRAP_TEMPLATE_RE.test(t)) return "TRAPNAL"
  return undefined
}

const NO_PREFIX_RE = /^no_?/i
const OPT_FLAG_RE = /^([+-])([A-Za-z0-9])$/

const INPUT_NEGATED: ResolverFeedback = { kind: "input-negated" }

/**
 * Option resolver. Literal first (so `NOTIFY` → `notify`, not stripped
 * `tify`); then the `no_`-stripped form; then a single-letter flag (`-J`,
 * `+J`). Negated pathways — `no_` prefix, or a flag whose sign is the
 * option's off state — carry `input-negated` feedback.
 */
function resolveOption(
  corpus: DocCorpus,
  raw: string,
): ResolvedHit<"option"> | undefined {
  const literal = hitAt(corpus, "option", mkDocumented("option", raw))
  if (literal) return literal
  const trimmed = raw.trim()
  const m = trimmed.match(NO_PREFIX_RE)
  if (m) {
    const stripped = hitAt(
      corpus,
      "option",
      mkDocumented("option", trimmed.slice(m[0].length)),
      INPUT_NEGATED,
    )
    if (stripped) return stripped
  }
  return resolveOptionFlag(corpus, trimmed)
}

/**
 * `-J` / `+J` against the plain-zsh single-letter table: the first option in
 * corpus order with a `zsh`-table alias of that letter. Case is significant
 * (`-J` ≠ `-j`), so the raw letter is matched, not the normalized id.
 * sh/ksh-only letters (`-b`) never resolve — they are errors in plain zsh.
 */
function resolveOptionFlag(
  corpus: DocCorpus,
  trimmed: string,
): ResolvedHit<"option"> | undefined {
  const m = trimmed.match(OPT_FLAG_RE)
  const sign = m?.[1]
  const char = m?.[2]
  if (!sign || !char) return undefined
  for (const opt of corpus.option.values()) {
    const alias = opt.flags.find(
      f => f.char === char && f.emulations.includes("zsh"),
    )
    if (!alias) continue
    return alias.on === sign
      ? { record: opt }
      : { record: opt, feedback: INPUT_NEGATED }
  }
  return undefined
}

// Default: `simpleResolver(cat)` — trim + normalize + corpus lookup. Only
// corpus-aware categories override.
//
// `param_expn`: ids are literal template strings (`${name:-word}`), so the
// default will essentially never match a live token. Reached via search/docs;
// the default path is harmless.
const resolverOverrides: { readonly [K in DocCategory]?: Resolver<K> } = {
  option: resolveOption,
  special_param: resolveSpecialParam,
  redirection: resolveRedir,
  subscript_flag: parensAgnosticFlagResolver("subscript_flag"),
  param_expn_flag: parensAgnosticFlagResolver("param_expn_flag"),
  history_expn: resolveHistory,
  glob_flag: parensAgnosticFlagResolver("glob_flag"),
  glob_qualifier: parensAgnosticFlagResolver("glob_qualifier"),
  job_spec: resolveJobSpec,
  special_function: resolveSpecialFunction,
}

const resolvers: { [K in DocCategory]: Resolver<K> } = Object.fromEntries(
  docCategories.map(cat => [
    cat,
    resolverOverrides[cat] ?? simpleResolver(cat),
  ]),
) as { [K in DocCategory]: Resolver<K> }

/**
 * What `resolve` answers: the corpus record — which carries its own
 * identity, `category` and `id` — plus `feedback` when reaching it
 * normalized away something meaningful (absent on loss-free paths and for
 * non-lossy categories). `record` is what the renderers take, so a hit
 * never has to be looked up again.
 */
export type ResolvedHit<K extends DocCategory> = {
  readonly record: DocRecordMap[K]
  readonly feedback?: ResolverFeedback
}

/**
 * Resolve a raw user-code token against the corpus: direct corpus-key lookup
 * (trimmed `raw` as the key, never lossy), then the category's resolver —
 * corpus-aware parsing such as `option`'s `no_`-stripping and `-J`/`+J`
 * flags, or redirections decomposed into group-op + tail; most categories
 * just normalize + `Map.has`.
 *
 * Direct precedence is load-bearing for template-key categories, where the
 * literal key and a live token resolved through templates must not collide:
 * `job_spec` `%number` vs `%5 → %number`, `history_expn` `!n` vs `!42`,
 * `special_function` `TRAPZERR` vs `TRAPINT → TRAPNAL`. Non-template
 * categories miss the direct step and resolve (`AUTO_CD` → `autocd`).
 *
 * The sole public brand-boundary crossing for untrusted raw strings; the
 * other route to an identity is corpus iteration.
 */
export function resolve<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
  raw: string,
): ResolvedHit<K> | undefined {
  const key = raw.trim() as Documented<K>
  return (
    (key ? hitAt(corpus, cat, key) : undefined) ?? resolvers[cat](corpus, raw)
  )
}

// --- Category walk ----------------------------------------------------------

/**
 * Per-category admission to the category walk (`resolveAll`): a category
 * declines a scoped hit whose record is not a token on its own. Absent
 * admits every hit.
 */
const walkAdmits: {
  readonly [K in DocCategory]?: (record: DocRecordMap[K]) => boolean
} = {
  // Word designators and modifiers only mean something after an event
  // designator: a bare `h` or `0` is not a history token. The scoped lookup
  // keeps finding them — `history_expn` stays total over its keys.
  history_expn: rec => rec.subKind === "event-designator",
}

/**
 * Resolve a raw token in every category, `classifyOrder` first to last, and
 * keep the hits the categories admit to a walk — one per category at most,
 * so `for` yields its complex-command record before its reserved-word one.
 * Empty when nothing resolves. The first element is the tie-broken answer
 * to "what is this token?"; a scoped `resolve` is the answer for a known
 * category. Each hit's `record` is a `DocRecord`: `record.category`
 * narrows it.
 *
 * The walk order and the admission rule are corpus properties, owned here
 * and pinned by the resolver fixture — consumers neither re-walk nor
 * re-filter (PRINCIPLES.md §"Push decisions downstream").
 */
export function resolveAll(
  corpus: DocCorpus,
  raw: string,
): readonly ResolvedHit<DocCategory>[] {
  const hits: ResolvedHit<DocCategory>[] = []
  for (const cat of classifyOrder) {
    const hit = resolveAdmitted(corpus, cat, raw)
    if (hit) hits.push(hit)
  }
  return hits
}

/** Scoped `resolve` under the walk's admission rule. */
function resolveAdmitted<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
  raw: string,
): ResolvedHit<K> | undefined {
  const hit = resolve(corpus, cat, raw)
  if (!hit) return undefined
  const admits = walkAdmits[cat] as
    | ((record: DocRecordMap[K]) => boolean)
    | undefined
  return admits === undefined || admits(hit.record) ? hit : undefined
}

// --- Resolver feedback ------------------------------------------------------

/**
 * Lossy-resolution feedback, carried on the `ResolvedHit`: a closed union
 * tagged by `kind`, to route on. Its JSON Schema ships generated from this
 * type (`index.json`, the resolver fixture's schema); the kinds are
 * type-level only.
 *
 * - `input-negated`: input denotes the option's off state — `NO_` prefix or
 *   flipped-sign single-letter flag (canonical-form inputs do not carry this).
 * - `subscripted`: input had a trailing `[...]` stripped to reach the parent
 *   record (`compstate[context]` → `compstate`). `subscript` holds the inner.
 */
export type ResolverFeedback =
  | { readonly kind: "input-negated" }
  | {
      readonly kind: "subscripted"
      /** @minLength 1 */
      readonly subscript: string
    }
