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

import { escapeRegExp, isDefined, isSingle } from "@carlwr/typescript-extra"
import { mkDocumented } from "./brands.ts"
import type { DocCorpus } from "./corpus.ts"
import {
  type DocCategory,
  type DocPieceId,
  docCategories,
  mkPieceId,
} from "./taxonomy.ts"
import { type Documented, type RedirDoc, redirSlugFromSig } from "./types.ts"

// --- Resolvers --------------------------------------------------------------
// `resolve(corpus, cat, raw)` dispatches through `resolverOverrides` below.

type Resolver<K extends DocCategory> = (
  c: DocCorpus,
  raw: string,
) => Documented<K> | undefined

/**
 * Membership check against `corpus[cat]`. Centralizes the brand-peel cast
 * needed when `cat` is generic.
 */
function hasId<K extends DocCategory>(
  c: DocCorpus,
  cat: K,
  id: Documented<K>,
): boolean {
  return (c[cat] as ReadonlyMap<string, unknown>).has(id as string)
}

/** Resolver for categories whose raw-to-key mapping is pure normalization. */
function simpleResolver<K extends DocCategory>(cat: K): Resolver<K> {
  return (c, raw) => {
    const id = mkDocumented(cat, raw)
    return hasId(c, cat, id) ? id : undefined
  }
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
): Documented<K> | undefined {
  const t = raw.trim()
  if (!t) return undefined
  const key = matchKey(t)
  if (!key) return undefined
  const id = mkDocumented(cat, key)
  return hasId(c, cat, id) ? id : undefined
}

/**
 * Redirection resolver. Decomposes a raw token (`"1>&2"`) into group-op +
 * tail; disambiguates shared group-ops by matching the user-input tail shape
 * against the doc's literal tail word ("number", "word", `-`, `p`, ...).
 */
function resolveRedir(
  c: DocCorpus,
  raw: string,
): Documented<"redirection"> | undefined {
  const literal = mkDocumented("redirection", raw)
  if (c.redirection.has(literal)) return literal
  // Sig-form close-variant: doc sig (`> word`) → slug (`>_word`).
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
    .filter(isDefined)

  const longest = Math.max(...matches.map(m => m.groupLen), -1)
  const hit = matches.filter(m => m.groupLen === longest)
  return isSingle(hit) ? hit[0].slug : undefined
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
): Documented<"history_expn"> | undefined {
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

const SUBSCRIPTED_PARAM_RE = /^([A-Za-z_][A-Za-z0-9_]*)\[(.+)\]$/

type SpecialParamHit = {
  readonly id: Documented<"special_param">
  readonly subscript?: string
}

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
 * `words[CURRENT]` → `words`). Lossy — the subscript surfaces via
 * `resolverFeedback`. Mirrors resolver.rs `resolve_param_subscript`.
 */
function resolveParamSubscript(
  c: DocCorpus,
  raw: string,
): SpecialParamHit | undefined {
  const m = raw.trim().match(SUBSCRIPTED_PARAM_RE)
  if (!m) return undefined
  const base = mkDocumented("special_param", m[1] ?? "")
  if (!c.special_param.has(base)) return undefined
  return { id: base, subscript: m[2] ?? "" }
}

/**
 * Special-parameter resolver. A `$NAME` / `${NAME}` sigil is stripped and the
 * bare name resolved — the only path that reaches the punctuation params
 * (`$#`, `$?`, `$!`, …), which have no leading letter to anchor a literal
 * lookup, and which also accepts `$PATH`, `${HOME}`, etc. Otherwise literal
 * first, then the `[...]` subscript close-variant. Wider user-expression
 * parsing stays out of scope (PRINCIPLES.md §"Resolver scope balance").
 *
 * Module-private; shared with `specialParamFeedback`. Public path:
 * `resolve` + `resolverFeedback`.
 */
function resolveSpecialParam(
  c: DocCorpus,
  raw: string,
): SpecialParamHit | undefined {
  const name = stripParamSigil(raw.trim())
  if (name !== undefined) {
    const id = mkDocumented("special_param", name)
    if (c.special_param.has(id)) return { id }
    return resolveParamSubscript(c, name)
  }
  const literal = mkDocumented("special_param", raw)
  if (c.special_param.has(literal)) return { id: literal }
  return resolveParamSubscript(c, raw)
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
 * Job-spec resolver. Literal first for `%%`, `%+`, `%-`; template matches
 * for `%n`, `%?str`, `%str`.
 */
function resolveJobSpec(
  c: DocCorpus,
  raw: string,
): Documented<"job_spec"> | undefined {
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
 * Special-function resolver. Literal first for hook names and literal TRAP*
 * names. Two compositional fallbacks for the patterns zsh exposes:
 *
 * - `^(chpwd|periodic|precmd|preexec|zshaddhistory|zshexit)_functions$` →
 *   matching hook record (companion array is the same concept).
 * - `^TRAP[A-Z0-9]+$` → `TRAPNAL` template record.
 *
 * No signal-name validation: `kill -l` is host-level (zsh-aware, not
 * environment-aware).
 */
function resolveSpecialFunction(
  c: DocCorpus,
  raw: string,
): Documented<"special_function"> | undefined {
  const literal = mkDocumented("special_function", raw)
  if (c.special_function.has(literal)) return literal
  return resolveByKey(c, "special_function", raw, matchSpecialFunctionKey)
}

const HOOK_FN_RE = /^(\w+)_functions$/
const TRAP_TEMPLATE_RE = /^TRAP[A-Z0-9]+$/

function matchSpecialFunctionKey(t: string): string | undefined {
  const hook = t.match(HOOK_FN_RE)?.[1]
  if (hook && HOOK_FN_SET.has(hook)) return hook
  if (TRAP_TEMPLATE_RE.test(t)) return "TRAPNAL"
  return undefined
}

/**
 * Option resolver. Literal first (so `NOTIFY` → `notify`, not stripped
 * `tify`); falls back to `no_`-stripped form. Negated pathway surfaces via
 * `resolverFeedback` as `{ kind: "input-negated" }`.
 *
 * Module-private; shared with `optionFeedback`. Public path: `resolve` +
 * `resolverFeedback`.
 */
const NO_PREFIX_RE = /^no_?/i

function resolveOption(
  corpus: DocCorpus,
  raw: string,
):
  | { readonly id: Documented<"option">; readonly negated: boolean }
  | undefined {
  const literal = mkDocumented("option", raw)
  if (corpus.option.has(literal)) return { id: literal, negated: false }
  const trimmed = raw.trim()
  const m = trimmed.match(NO_PREFIX_RE)
  if (!m) return undefined
  const stripped = mkDocumented("option", trimmed.slice(m[0].length))
  return corpus.option.has(stripped)
    ? { id: stripped, negated: true }
    : undefined
}

// Default: `simpleResolver(cat)` — trim + normalize + corpus lookup. Only
// corpus-aware categories override.
//
// `param_expn`: ids are literal template strings (`${name:-word}`), so the
// default will essentially never match a live token. Reached via search/docs;
// the default path is harmless.
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
 * Dispatches through a per-category resolver table; each category may apply
 * corpus-aware parsing (`option` handles `no_`-stripping; redirections
 * decompose group-op + tail; most others normalize + `Map.has`).
 *
 * Identity only — lossy bits surface via `resolverFeedback`. The sole public
 * brand-boundary crossing for untrusted raw strings; the other legitimate
 * routes to a `DocPieceId` are `mkPieceId(cat, record.id)` from a
 * corpus-iterated record, or internal iteration inside zsh-core.
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
// Closed kind-tagged union, parametric over `DocCategory` via
// `feedbackOverrides` (fallback `noFeedback`). See DESIGN.md §"Resolver
// feedback channel" and PRINCIPLES.md §"Resolver feedback".

/**
 * Lossy-resolution feedback. Closed kind-tagged union; consumers route
 * programmatically (wording is not API surface).
 *
 * - `input-negated`: input reached via option resolver's `NO_`-stripping
 *   branch (canonical-form inputs do not carry this).
 * - `subscripted`: input had a trailing `[...]` stripped to reach the parent
 *   record (`compstate[context]` → `compstate`). `subscript` holds the inner.
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

// Non-lossy categories fall through to `noFeedback`. This table is the SoT
// for which categories actually emit feedback.
const feedbackOverrides: { readonly [K in DocCategory]?: FeedbackResolver } = {
  option: optionFeedback,
  special_param: specialParamFeedback,
}

/**
 * JSON Schema fragment per `ResolverFeedback` kind. Source of truth for
 * tooldef's `Feedback` `$def`; per-kind extra fields (`subscript`) live here.
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
 * Closed list of `ResolverFeedback` kinds. Derived from
 * `resolverFeedbackKindSchemas`, the typed SoT.
 */
export const resolverFeedbackKinds: readonly ResolverFeedback["kind"][] =
  Object.keys(resolverFeedbackKindSchemas) as ResolverFeedback["kind"][]

/**
 * Lossy-normalization feedback for a raw user-code token. `undefined` when
 * the input did not resolve or resolution was loss-free (canonical form).
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
