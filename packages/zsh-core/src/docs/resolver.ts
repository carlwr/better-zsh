// MIRRORED-IN: zshref-rs/src/resolver.rs

/**
 * @module
 * Resolver layer + lossy-resolution feedback channel.
 *
 * The resolver layer maps untrusted raw user-code text to `Documented<K>` via
 * per-category, corpus-aware parsing. `resolve(corpus, cat, raw)` is the sole
 * sanctioned brand-boundary crossing for raw strings.
 *
 * Resolvers have two durable jobs:
 *
 * - Close the gap between live zsh syntax and corpus identity. Option lookup
 *   is the canonical case: zsh ignores underscores and treats a leading
 *   `NO_`/`NO` as negation, so `auto_cd`, `NO_AUTO_CD`, and `au_to_cd` all
 *   identify the same documented option record.
 * - Bridge documentation chunk shape. Some upstream zsh sections document a
 *   family as operator + form, not one record per surface operator. Redirection
 *   records, for example, are keyed by signatures like `>& number`, `>& -`,
 *   and `<<[-] word`; resolving `2>&1` or `<<EOF` therefore has to identify
 *   the operand shape before it can name a doc record.
 *
 * Template-like categories follow the same identity rule: the resolver maps a
 * live token to the documented template record (`!42` → `!n`,
 * `TRAPINT` → `TRAPNAL`) while direct corpus-key lookup remains responsible
 * for exact round-trips (`!n`, `TRAPNAL`, `%number`).
 *
 * `resolve` returns identity only. Lossy normalization bits (e.g. `setopt
 * NO_AUTO_CD` resolving to `autocd` discards the `NO_` prefix that carries
 * semantic meaning) surface separately via `resolverFeedback`. See
 * DESIGN.md §"Resolver feedback channel" and PRINCIPLES.md §"Resolver feedback
 * (lossy normalization)".
 */

import { mkDocumented } from "./brands.ts"
import type { DocCorpus } from "./corpus.ts"
import { escapeRegExp } from "./regex.ts"
import {
  type DocCategory,
  type DocPieceId,
  docCategories,
  mkPieceId,
} from "./taxonomy.ts"
import { type Documented, type RedirDoc, redirSlugFromSig } from "./types.ts"

// --- Resolvers --------------------------------------------------------------
//
// Each resolver is free to do category-specific work — option negation
// (`no_` stripping), redirection group-op + tail matching, future custom
// categories — inside its own function. The uniform interface is
// `(corpus, raw: string) => Documented<K> | undefined`. The public
// `resolve(corpus, cat, raw)` dispatches through the table.

type Resolver<K extends DocCategory> = (
  c: DocCorpus,
  raw: string,
) => Documented<K> | undefined

/**
 * Membership check against `corpus[cat]`. Centralizes the brand-peel cast
 * needed when `cat` is generic (TS can't narrow `c[cat]` through the union).
 */
function hasId<K extends DocCategory>(
  c: DocCorpus,
  cat: K,
  id: Documented<K>,
): boolean {
  return (c[cat] as ReadonlyMap<string, unknown>).has(id as string)
}

/** Resolver for categories whose raw-to-lookup-key mapping is pure normalization. */
function simpleResolver<K extends DocCategory>(cat: K): Resolver<K> {
  return (c, raw) => {
    const id = mkDocumented(cat, raw)
    return hasId(c, cat, id) ? id : undefined
  }
}

/**
 * Common envelope for resolvers whose raw-to-key step is a pure string
 * projection: trim → match → corpus lookup. `matchKey` returns `undefined`
 * to opt out (e.g. category-specific shape rejection).
 */
function resolveByKey<K extends DocCategory>(
  c: DocCorpus,
  cat: K,
  raw: string,
  matchKey: (t: string) => string | undefined,
): Documented<K> | undefined {
  const t = raw.trim()
  if (!t) return undefined
  const key = matchKey(t)
  if (!key) return undefined
  const id = mkDocumented(cat, key)
  return hasId(c, cat, id) ? id : undefined
}

/**
 * Redirection resolver. Decomposes a raw token (e.g. `"1>&2"`) into a
 * group-op prefix and a tail; disambiguates docs that share the same group-op
 * by matching the user-input tail shape against the doc's literal tail word.
 *
 * Doc sigs use special tail words — "number" for a numeric operand,
 * "word" for a non-numeric one, plus literal tails like `-` and `p`.
 * We identify the user-input tail shape and match it to one of those literal words.
 */
function resolveRedir(
  c: DocCorpus,
  raw: string,
): Documented<"redirection"> | undefined {
  const literal = mkDocumented("redirection", raw)
  if (c.redirection.has(literal)) return literal
  // Sig-form close-variant: the documented sig (e.g. `> word`) maps to its
  // shell-safe slug (`>_word`) — see `redirSlugFromSig`.
  const sigSlug = mkDocumented("redirection", redirSlugFromSig(raw.trim()))
  if (c.redirection.has(sigSlug)) return sigSlug
  return resolveByKey(c, "redirection", raw, t => matchRedirKey(c, t))
}

/** Literal tail word from a doc sig ("number" / "word" / "-" / "p" / ""). */
function docTail(sig: string, groupOpLen: number): string {
  return sig.slice(groupOpLen).trimStart()
}

function matchRedirKey(c: DocCorpus, t: string): string | undefined {
  const text = t.replace(/^[0-9]+/, "")
  if (!text || /^<<-?$/.test(text)) return undefined

  const matches = [...c.redirection.values()]
    .map(doc => redirMatch(doc, text))
    .filter((m): m is RedirMatch => m !== undefined)

  const longest = Math.max(...matches.map(m => m.groupLen), -1)
  const hit = matches.filter(m => m.groupLen === longest)
  return hit.length === 1 ? hit[0]?.slug : undefined
}

interface RedirMatch {
  readonly slug: string
  readonly groupLen: number
}

function redirMatch(doc: RedirDoc, text: string): RedirMatch | undefined {
  const { sig, slug, groupOp } = doc
  const group = groupOp === "<<[-]" ? "<<-?" : escapeRegExp(groupOp)
  const tail = docTail(sig, groupOp.length)
  const tailPat =
    groupOp === "<<[-]" ? String.raw`\s*\S.*` : redirTailPattern(groupOp, tail)
  const m = text.match(new RegExp(`^(${group})${tailPat}$`))
  return m ? { slug, groupLen: m[1]?.length ?? 0 } : undefined
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
 * History resolver -- event-designator forms only.
 *
 * Word-designators (`0`, `a`, `n`, `x-y`, ...) and modifiers (`h`, `s/l/r[/]`,
 * ...) are grammatical components that only have meaning after an event
 * designator; they are NOT independent user-code tokens. A bare `0` or `a`
 * in isolation is never a history token. Search is context-free, so this
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
 * - `!str` (no whitespace or `!$^%*`) -> `!str`
 * - `^foo^bar` / `^foo^bar^` -> `!!` (documented synonym of `!!:s^foo^bar^`)
 */
function resolveHistory(
  c: DocCorpus,
  raw: string,
): Documented<"history_expn"> | undefined {
  return resolveByKey(c, "history_expn", raw, matchHistoryKey)
}

function matchHistoryKey(t: string): string | undefined {
  if (/^!!$/.test(t)) return "!!"
  if (/^!#$/.test(t)) return "!#"
  if (/^!\{.+\}$/.test(t)) return "!{...}"
  if (/^!\?.+\??$/.test(t)) return "!?str[?]"
  if (/^!-\d+$/.test(t)) return "!-n"
  if (/^!\d+$/.test(t)) return "!n"
  if (/^![^!$^%*\s]+$/.test(t)) return "!str"
  if (/^\^[^^]+\^[^^]+?\^?$/.test(t)) return "!!"
  return undefined
}

// Single-letter flag categories: corpus keys are letters (`e`, `U`, `i`, ...),
// user tokens may wrap them in parens (`(e)`, `(#i)`, `(#qX)`) or trail args
// (`j:string:`). One union; helpers below narrow further when behaviour diverges.
type FlagCategory =
  | "subscript_flag"
  | "param_expn_flag"
  | "glob_flag"
  | "glob_qualifier"

// Subset of `FlagCategory` whose sigs carry colon-delimited operand markers.
const COLON_ARG_FLAG_CATS: ReadonlySet<FlagCategory> = new Set([
  "param_expn_flag",
  "subscript_flag",
])

/**
 * Resolver factory for flag categories whose corpus keys are single letters
 * but whose user-code tokens may appear wrapped in parentheses or with a
 * category-specific marker prefix (`#` for `glob_flag`, `#q` for
 * `glob_qualifier`).
 *
 * Tries the raw-trimmed form verbatim; if that misses and the raw token is
 * wrapped, retries the inner form after stripping the marker prefix. Falls
 * back to undefined — a bare letter that is NOT a documented flag never
 * cross-resolves to an unrelated category entry.
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
 * the full sig form (`j:string:`) by stripping args down to the bare flag
 * letter (`j`).
 */
function tryFlagKey<K extends FlagCategory>(
  c: DocCorpus,
  cat: K,
  key: string,
): Documented<K> | undefined {
  const id = mkDocumented(cat, key)
  if (hasId(c, cat, id)) return id
  if (!COLON_ARG_FLAG_CATS.has(cat) || !key.includes(":")) return undefined
  const bare = key.split(":")[0]
  if (!bare) return undefined
  const bareId = mkDocumented(cat, bare)
  return hasId(c, cat, bareId) ? bareId : undefined
}

function flagInnerKey(cat: FlagCategory, t: string): string | undefined {
  const inner = t.match(/^\((.+)\)$/)?.[1]
  if (!inner) return undefined
  if (cat === "glob_flag") return inner.replace(/^#/, "")
  if (cat === "glob_qualifier") return inner.replace(/^#q/, "")
  return inner
}

/**
 * Special-parameter resolver. Literal first; falls back to stripping a
 * trailing `[...]` subscript so live forms like `compstate[context]`,
 * `words[CURRENT]`, `pipestatus[1]` resolve to the parent record. Stripping
 * is lossy — the subscript is surfaced separately via `resolverFeedback`.
 *
 * Bridges documented identity to surface syntax; user-expression parsing
 * stays out of scope (PRINCIPLES.md §"Resolver scope balance").
 *
 * Private to `resolvers.ts`: shared between `resolve` and
 * `specialParamFeedback`. Public callers go through
 * `resolve(corpus, "special_param", raw)` and
 * `resolverFeedback(corpus, "special_param", raw)`.
 */
function resolveSpecialParam(
  c: DocCorpus,
  raw: string,
):
  | {
      readonly id: Documented<"special_param">
      readonly subscript?: string
    }
  | undefined {
  const literal = mkDocumented("special_param", raw)
  if (c.special_param.has(literal)) return { id: literal }
  const t = raw.trim()
  const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\[(.+)\]$/)
  if (!m) return undefined
  const base = mkDocumented("special_param", m[1] ?? "")
  if (!c.special_param.has(base)) return undefined
  return { id: base, subscript: m[2] ?? "" }
}

function specialParamFeedback(
  c: DocCorpus,
  raw: string,
): ResolverFeedback | undefined {
  const r = resolveSpecialParam(c, raw)
  return r?.subscript !== undefined
    ? { kind: "subscripted", subscript: r.subscript }
    : undefined
}

/**
 * Job-spec resolver. Literal-first for `%%`, `%+`, `%-`; template matches for
 * `%n` (digits), `%?str`, `%str`.
 */
function resolveJobSpec(
  c: DocCorpus,
  raw: string,
): Documented<"job_spec"> | undefined {
  return resolveByKey(c, "job_spec", raw, t =>
    t.startsWith("%") ? jobSpecKey(t) : undefined,
  )
}

function jobSpecKey(t: string): string | undefined {
  if (/^%(?:%|\+|-)$/.test(t)) return t
  if (/^%\d+$/.test(t)) return "%number"
  if (/^%\?.+$/.test(t)) return "%?string"
  if (t !== "%?" && /^%.+$/.test(t)) return "%string"
  return undefined
}

export const hookNames: readonly string[] = [
  "chpwd",
  "periodic",
  "precmd",
  "preexec",
  "zshaddhistory",
  "zshexit",
]

const HOOK_FN_SET: ReadonlySet<string> = new Set(hookNames)

/**
 * Special-function resolver.
 *
 * Literal-first: hook names (`chpwd`, `precmd`, ...) and literal TRAP* names
 * (`TRAPDEBUG`, `TRAPEXIT`, `TRAPZERR`, `TRAPERR`) hit their own records.
 * Compositional fallbacks close the two identifier-composition patterns zsh
 * exposes for this category:
 * - `^(chpwd|periodic|precmd|preexec|zshaddhistory|zshexit)_functions$` →
 *   the matching hook record (the companion array is the same concept).
 * - `^TRAP[A-Z0-9]+$` → the TRAPNAL template record.
 * Deliberately no signal-name validation: host-level `kill -l` contents are
 * not baked (zsh-aware, not environment-aware).
 */
function resolveSpecialFunction(
  c: DocCorpus,
  raw: string,
): Documented<"special_function"> | undefined {
  const literal = mkDocumented("special_function", raw)
  if (c.special_function.has(literal)) return literal
  return resolveByKey(c, "special_function", raw, matchSpecialFunctionKey)
}

function matchSpecialFunctionKey(t: string): string | undefined {
  const hook = t.match(/^(\w+)_functions$/)?.[1]
  if (hook && HOOK_FN_SET.has(hook)) return hook
  if (/^TRAP[A-Z0-9]+$/.test(t)) return "TRAPNAL"
  return undefined
}

/**
 * Option resolver. Literal first (so `NOTIFY` resolves to `notify`, not to
 * stripped `tify`); falls back to `no_`-stripped form when the literal is
 * absent. The negated pathway is what `resolverFeedback` reports as
 * `{ kind: "input-negated" }`.
 *
 * Private to `resolvers.ts`: shared between `resolve` and `optionFeedback`.
 * Public callers go through `resolve(corpus, "option", raw)` for identity and
 * `resolverFeedback(corpus, "option", raw)` for the negation bit.
 */
function resolveOption(
  corpus: DocCorpus,
  raw: string,
):
  | { readonly id: Documented<"option">; readonly negated: boolean }
  | undefined {
  const literal = mkDocumented("option", raw)
  if (corpus.option.has(literal)) return { id: literal, negated: false }
  const trimmed = raw.trim()
  const m = trimmed.match(/^no_?/i)
  if (!m) return undefined
  const stripped = mkDocumented("option", trimmed.slice(m[0].length))
  return corpus.option.has(stripped)
    ? { id: stripped, negated: true }
    : undefined
}

// Default is `simpleResolver(cat)` — trim + normalize + corpus lookup.
// Only categories with corpus-aware parsing appear as overrides.
//
// Note on `param_expn`: ids are literal doc-template strings (e.g.
// `${name:-word}`), so the default `simpleResolver` will essentially never
// match a live user-code token. The category is reached via search/docs
// rather than raw-token resolution; the default path is harmless.
const resolverOverrides: { readonly [K in DocCategory]?: Resolver<K> } = {
  option: (c, raw) => resolveOption(c, raw)?.id,
  special_param: (c, raw) => resolveSpecialParam(c, raw)?.id,
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
 * Resolve a raw user-code token against the corpus.
 *
 * Dispatches through an internal per-category resolver table; each category
 * may apply corpus-aware parsing (`option` handles `no_`-prefix negation;
 * redirections decompose group-op + tail; most others just normalize + `Map.has`).
 *
 * Returns the matching `DocPieceId` (i.e. `{ category, id }` where `id` is
 * `Documented<K>`) or `undefined` if the token does not identify a corpus
 * element. The `| undefined` makes non-membership explicit at the value level.
 *
 * Returns identity only. Lossy bits (e.g. whether an option was reached via
 * `NO_`-stripping) surface separately via `resolverFeedback`.
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
 * Direct corpus-key lookup with resolver fallback. Direct precedence is
 * load-bearing for template-key categories (`job_spec`, `history_expn`,
 * `param_expn`, `special_function`). See DESIGN.md §"`lookupRaw`".
 */
export function lookupRaw<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
  raw: string,
): DocPieceId | undefined {
  const id = raw.trim() as Documented<K>
  if (id && hasId(corpus, cat, id)) return mkPieceId(cat, id)
  return resolve(corpus, cat, raw)
}

// --- Resolver feedback ------------------------------------------------------
// Lossy bits (e.g. `NO_AUTO_CD` → `autocd` discards the `NO_` prefix) surface
// here, not on `Documented<K>`. Closed kind-tagged union, parametric over
// `DocCategory` via `feedbackOverrides` (fallback `noFeedback`). See DESIGN.md
// §"Resolver feedback channel" and PRINCIPLES.md §"Resolver feedback".

/**
 * Lossy-resolution feedback emitted by per-category resolvers. Closed
 * kind-tagged union so consumers route programmatically; wording is not API
 * surface.
 *
 * - `input-negated`: the raw input was reached via the option resolver's
 *   `NO_`-stripping branch; canonical-form inputs (e.g. `AUTO_CD`,
 *   `autocd`) do not carry this feedback.
 * - `subscripted`: the raw input carried a trailing `[...]` subscript that
 *   was stripped to reach the parent record (e.g. `compstate[context]` →
 *   `compstate`). `subscript` holds the inner-subscript text (the `...`).
 */
export type ResolverFeedback =
  | { readonly kind: "input-negated" }
  | { readonly kind: "subscripted"; readonly subscript: string }

type FeedbackResolver = (
  corpus: DocCorpus,
  raw: string,
) => ResolverFeedback | undefined

function optionFeedback(
  corpus: DocCorpus,
  raw: string,
): ResolverFeedback | undefined {
  const r = resolveOption(corpus, raw)
  return r?.negated ? { kind: "input-negated" } : undefined
}

const noFeedback: FeedbackResolver = () => undefined

// Categories without a lossy path fall through to `noFeedback`. Only entries
// here override that default — keeps the table the SoT for "which categories
// actually emit feedback."
const feedbackOverrides: { readonly [K in DocCategory]?: FeedbackResolver } = {
  option: optionFeedback,
  special_param: specialParamFeedback,
}

/**
 * JSON Schema fragment per `ResolverFeedback` kind. Source of truth for the
 * `Feedback` `$def` consumed by tooldef's output-schema builder; per-kind
 * extra fields (e.g. `subscript`) live here, not in the consumer.
 */
const kindSchema = (
  kind: ResolverFeedback["kind"],
  extra: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> => ({
  type: "object",
  additionalProperties: false,
  required: ["kind", ...Object.keys(extra)],
  properties: { kind: { const: kind }, ...extra },
})

type ResolverFeedbackKindSchemas = {
  readonly [K in ResolverFeedback["kind"]]: Readonly<Record<string, unknown>>
}

export const resolverFeedbackKindSchemas: ResolverFeedbackKindSchemas = {
  "input-negated": kindSchema("input-negated"),
  subscripted: kindSchema("subscripted", {
    subscript: { type: "string", minLength: 1 },
  }),
}

/**
 * Closed list of `ResolverFeedback` kinds emitted by any category resolver.
 * Derived from `resolverFeedbackKindSchemas`, the typed source of truth for
 * closed feedback-kind values and per-kind schema shape.
 */
export const resolverFeedbackKinds: readonly ResolverFeedback["kind"][] =
  Object.keys(resolverFeedbackKindSchemas) as ResolverFeedback["kind"][]

/**
 * Resolve a raw user-code token against the corpus and return optional
 * lossy-normalization feedback emitted by the per-category resolver. Returns
 * `undefined` when no feedback applies — either the input did not resolve, or
 * resolution was loss-free (canonical form).
 *
 * Parametric over `DocCategory`: tooldef and schema layers stay free of
 * per-category branches.
 */
export function resolverFeedback<K extends DocCategory>(
  corpus: DocCorpus,
  cat: K,
  raw: string,
): ResolverFeedback | undefined {
  return (feedbackOverrides[cat] ?? noFeedback)(corpus, raw)
}
