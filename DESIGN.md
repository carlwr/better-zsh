# Design

**Why**, not what — for subsystems. Complements the API docs (JSDoc in the d.ts rollups): the d.ts tells consumers *what the API does*; this file tells contributors *why each subsystem is shaped the way it is*.

Cross-cutting principles in [`PRINCIPLES.md`](./PRINCIPLES.md); contributor conventions, testing, tooling, and code style in [`AGENTS.md`](./AGENTS.md).

Avoid duplicating JSDoc (types, signatures, behavioral contracts). Refer to the relevant JSDoc instead. Keeps the two in sync: if behavior changes, only JSDoc needs updating.

---

## What is `zsh-core`?

A standalone package of structured zsh knowledge. Parses vendored Yodl (`.yo`) docs into typed records, extracts facts from user zsh code, renders markdown. Nothing extension-specific — `vscode-better-zsh` is one consumer; future consumers (JSON exports, AI-facing tools) are expected.

Not a grammar, not a tokenizer. Zsh is not generally parseable without running zsh; we pick the low-hanging fruit that does not require shell execution and is useful for editor features.

---

## The three orthogonal domains — A / B / C

Every change should preserve this decomposition. Visible in directory layout (`src/docs/`, `src/analysis/`, `src/render/`), type surface, and naming.

### A. Parsed Documentation (`src/docs/`)

Static vendored knowledge about zsh language elements. A **closed taxonomy** of `DocCategory` values (see `docCategories`). Each category has:

- A doc-record type (`ZshOption`, `CondOpDoc`, `BuiltinDoc`, ...).
- A branded corpus identity: `Documented<K>` — see brand semantics below.
- A map `DocCorpus[K]: ReadonlyMap<Documented<K>, Record>` parsed from `.yo`.

Knows nothing about user code. The universe of documented elements is statically enumerable from the corpus.

### B. Fact Extraction (`src/analysis/`)

Coarse, potentially overlapping annotations about user zsh code. A `Fact` discriminated union keyed by `FactKind` with confidence levels (`"hard"` / `"heuristic"`).

The term "fact" is load-bearing: facts are what the analyzer *asserts*, not a complete description. Analysis is best-effort and line-local; no claim of exhaustiveness. We recognize what we recognize; everything else is silence.

Where a payload benefits from branding, it carries `Observed<K>` — **never** `Documented<K>`. Facts annotate syntax, not corpus membership.

Knows nothing about doc records or markdown rendering.

### C. Markdown Rendering (`src/render/`)

Doc records → human-readable markdown. Depends on A; orthogonal to B.

### Inter-domain wiring

The **consumer** (extension, MCP server, future wrappers) plumbs A+B→C: facts identify what to look up; the doc corpus provides content; rendering produces output. Procedural dispatch in consumer code, not static type mapping — inherently partial and context-dependent (a `cmd-head` fact might match a builtin, precmd, user function, or nothing).

Key principle: **zsh-core does not wire A+B→C internally.** No "candidate in, markdown out" convenience API; consumers compose `resolve()` + `renderDoc()`. See "API orthogonality" and "MCP as a consumer".

---

## Brand semantics: `Observed<K>` and `Documented<K>`

For *what* each brand means and *how* to use them, see JSDoc on `Observed<K>`, `Documented<K>`, `resolve`, `resolveOption`, `mkPieceId`. This section covers **why the design is shaped this way**.

### Why two brands, not one

Provenance. A single brand for "known corpus member" and "unverified lookup query" conflates two roles, gives false confidence, and obscures the trusted/untrusted boundary. `Observed<K>` says "I normalized this from user code"; `Documented<K>` says "the corpus has this." Structurally incompatible — the type system refuses to confuse them.

### Why normalization is shared but corpus-aware parse is not

Both brands share per-category normalization (pure string rewriting: trim, case-fold). Category-specific concerns requiring the corpus — option `no_`-prefix handling, redirection group-op + tail disambiguation — live in the per-category resolver table, not in `mkObserved` / `mkDocumented`.

Key insight: `no_` handling is **corpus-dependent**. `NOTIFY` is an option; `TIFY` is not. Stripping "NO" off `NOTIFY` gives a non-option. Only a step with corpus access can decide. Baking this into a smart constructor conflates normalization (phase 2) with membership checking (phase 3) and produces bugs that manifest only at lookup time.

### Three phases: raw / observed / documented

- **Raw** — user-code text. Untyped `string`.
- **Observed** — normalized, category-shaped, corpus-blind. `Observed<K>`. For fact extraction.
- **Documented** — corpus-confirmed. `Documented<K>`. Produced by trusted corpus construction or the resolver layer.

The resolver bridges 2→3. Bridging inside phase-2 constructors is where bugs lived in the previous design.

### Why `mkDocumented` is excluded from the public API

`mkDocumented` mints `Documented<K>` without a corpus check. Behind `"zsh-core/internal"` (not `"."`). Legitimate callers: Yodl extractors, resolver layer, test-corpus builders. See JSDoc on `Documented<K>` for checked-vs-trusted. **Do not re-export `mkDocumented` from the public surface.**

---

## API orthogonality — strong guiding principle

If an operation decomposes into A→B→C, export A→B and B→C, not also A→C, even when "almost all consumers need A→C." Consumers compose.

The rendering path is `raw string → DocPieceId → markdown` (`resolve` + `renderDoc`). No combined convenience function. Reasons:

- `DocPieceId` is a first-class concept (type-safe corpus identity); an A→C function hides it.
- Two ways to do the same thing force consumers to choose and encourage drift.
- Each step has a crisp meaning: "is this in the corpus?" vs "render this known element."

Corpus-driven aggregation helpers (`refDocs`) are fine — they operate on already-known records, not hidden brand crossings.

Not an absolute ban. A post-refactor convenience wrapper is fine as a conscious addition.

---

## Why per-category resolvers

raw→documented has genuinely different shapes per category:

- `option` — corpus-aware negation.
- `redir` — composite-token decomposition.
- `job_spec`, `special_function` — template + compositional fallback matching.
- most others — trivial lookup.

A per-category resolver table lets each category carry its own logic while the public API stays uniform. Adding a complex category is a local addition: drop a resolver entry; the public API picks it up.

---

## Why `DocCategory` is a closed `as const` array

- `docCategories` can be iterated at runtime (for `loadCorpus`, dump tooling, walking consumers).
- `DocCategory` is `typeof docCategories[number]` — a closed union. Exhaustiveness checked everywhere (`DocRecordMap`, `DocCorpus`, resolver table, norm table, `docId`, `mdRenderer`).
- Adding a category is a local change — `docCategories`, `DocRecordMap`, `DocCorpus`, `norm`, `docId`, resolver table, `mdRenderer`, plus a Yodl extractor. The type system enforces completeness everywhere else.

`DocCorpus` is an explicit interface rather than a computed mapped type so IDE hover shows concrete fields, not a formula. Compile-time key assertions (`Eq<...>`) enforce completeness.

### Category-indexed artifacts belong in zsh-core

Any "one entry per `DocCategory`" table lives in zsh-core with a structural completeness guard; consumers import. Today: iteration list, classify-order, human-readable labels, record-type map, corpus shape, renderers, resolvers, id accessors.

**Motivation:** after two categories were added, a hand-written ordering array and hand-typed category lists in tool descriptions silently fell behind — neither tests nor types flagged it. `DocCategory`-keyed tables make that drift a compile error.

Principle: if a consumer is about to hand-write a list or table keyed by category, import instead.

(Contributor rule — no hand-typed enumerations in any doc or runtime string — is in `AGENTS.md`.)

---

## Identity per record, display separately

Each doc record keeps its domain-specific identity field (`name`, `op`, `flag`, `key`, `sig`). `.name` for a builtin reads better than `.id`. The parametric `docId` accessor table gives uniform access without renaming fields.

`docDisplay` is a small function (not a full table) because only `option` diverges — `.display` preserves case and underscores (`AUTO_CD`), while `.name` is the normalized lookup key (`autocd`). Every other category's identity *is* its display; a full table would be trivial entries plus one override.

`docId` is **internal** (not re-exported); `docDisplay` is **public** because consumer UIs (hovers, MCP tool responses, dump output) routinely need a human heading without redoing per-category branching. `refs.ts` consumes `docId` via direct relative import.

---

## Redirection identity and auxiliary brands

Redirection identity is the full signature (see `RedirDoc` JSDoc), not the leading operator. Multiple docs share a `groupOp`; the redir resolver disambiguates by tail shape — hence corpus-aware, not simple lookup.

`OptFlag` and `RedirOp` are secondary-index brands — token buckets for consumer-side lookup, not corpus identities. They don't participate in the `Observed`/`Documented` split.

---

## History: grammar components, not independent tokens

`history` looks like other short-key categories (single-character keys, flat record list) but has a different underlying shape that should guide its resolver and presentation.

- **Three subkinds compose into one grammatical form.** `HistoryKind` (`event-designator` | `word-designator` | `modifier`) are components of `![event][:word][:modifier…]`, not parallel taxonomies of independent tokens. A bare `^` or `:h` is not a zsh token in isolation. Distinguishes `history` from `glob_op`, where each record *is* a standalone user-code token.
- **Corpus keys are templates, not literals.** `!n`, `!str`, `!-n`, `h [ digits ]`, `s/l/r[/]` — `n` / `str` / `digits` stand for a syntactic class. `resolveHistory` parses event-designator forms (`!42` → `!n`, `!vim` → `!str`); word-designator and modifier tokens (`:h3`, `gs/foo/bar/`) stay unresolved on purpose.
- **`classify` is context-free; word-designators and modifiers are not.** A token `0` or `a` is a history word-designator or modifier only *after* an event designator; in isolation it isn't a history token at all. `resolveHistory` therefore restricts itself to event-designator forms (tokens starting with `!`, plus the `^str^repl` shorthand) — same "totality, not utility" posture as `param_expn`'s resolver.
- **In-expansion decomposition belongs in the analysis layer.** Hover/UI for inner parts of `!!:1:h` needs a history-expansion fact kind in `src/analysis/`, not a richer classify resolver. Larger future direction; doesn't block event-designator resolver work.
- **`kind` is the typed facet; surface it.** Search results carry `subKind` (from each record's `kind`) so the flat list of short keys isn't cryptic. `docDisplay` stays equal to `id` — identity surface doesn't grow divergent-from-id cases beyond `option`.

## Parameter-expansion identity and shape

`param_expn` identity is the full sig (e.g. `${name:-word}`), not a leading operator — same precedent as redirections. `${name:-word}` and `${name-word}` are separate records, not sub-variants of a `:-` operator. Identity stays mechanical: two sigs are equal iff the literal templates match.

- **`simpleResolver` kept for totality, not utility.** Sigs are literal doc templates; no user-code token will match. The category is reached through `zsh_search` + `zsh_docs` (with `category` set), not raw-token classification. Keeping a resolver in the per-category table preserves closed-union completeness guards across `docs/corpus.ts`.
- **`subKind` is a fixed closed union, not a computed label.** Literal values; extending the union is a deliberate single-point change that the type system propagates.
- **Placeholders extracted via an exact-string table, not a regex.** Single source of truth for both `subKind` and operand-slot names (`name`, `word`, `pattern`, `repl`, `spec`, `arrayname`, `offset`, `length`). Silent upstream renames trip an "unknown sig" throw on the next build — drift fails loudly at extraction time, not as rendered garbage.
- **No raw-text resolver.** Considered and dropped: testing burden outweighed zero practical value, since sigs are template-shaped and won't appear in user code.

---

## Complex commands + alternate forms

`ComplexCommandDoc` models zsh's structured control-flow constructs from `grammar.yo`'s "Complex Commands", with entries from "Alternate Forms For Complex Commands" attached as `alternateForms`.

- **Head-keyword identity.** Closed `HeadKey` set — `if`, `for`, `for-arith`, `while`, `until`, `repeat`, `case`, `select`, `function`, `time`, `(`, `{`, `{try}always`, `[[`. Two `for` entries (`for name ... in ... do ... done` and `for (( ; ; )) do ... done`) are deliberate: the arithmetic form is structurally distinct enough that collapsing would cost clarity.
- **Array fields precedent.** `alternateForms: readonly AlternateForm[]` follows `ZshOption.flags` and `ParamExpnDoc.groupSigs` — variable-length composite data on a doc record. Each alternate carries its own `template` + `keywords` so renderers present forms uniformly.
- **Classify-order placement: before `reserved_word`.** `zsh_docs --raw=for` (no `category`) lists the structured `complex_command` record before reserved-word boilerplate. `for`/`while`/`[[`/… overlap `reserved_word` by design; the walk-order lets consumers absorb the ambiguity without restructuring the taxonomy. See `PRINCIPLES.md` §"Overlap between categories is accepted".

## Glob qualifiers vs glob flags vs glob operators

Three sibling categories under `glob_*` — shared prefix is labelling, not ontological coupling. Each fits its own syntactic slot:

- `glob_op` — in-pattern meta-chars (`*`, `?`, `[...]`, `@(...)` et al.), with a `kind: "standard" | "ksh-like"` discriminator.
- `glob_flag` — in-pattern `(#…)` marker (`(#i)`, `(#b)`); requires `EXTENDED_GLOB`.
- `glob_qualifier` — trailing parenthesised form that *filters the match list* (`*(/)`, `*(#q@)`); keyed on single letters + multi-character variants (`%b`, `%c`).

`glob_qualifier`'s resolver reuses `parensAgnosticFlagResolver`; accepts bare-letter, `(X)` under `BARE_GLOB_QUAL`, and `(#qX)` under `EXTENDED_GLOB`.

## Reserved word: an enumeration-primary doc category

`reserved_word` is currently the only enumeration-primary doc category (see PRINCIPLES.md §"Category roles"). It carries three jobs in one record type:

- **Enumeration source.** The corpus map is the authoritative list of zsh reserved words. Consumers iterate it for completion items, the `list` tool, and syntactic-class membership checks.
- **Supplementary prose.** Body keywords (`do`, `then`, `done`, …), alternate-form keywords (`foreach`, `end`), and standalone entries (`!`, `coproc`, `typeset` family) carry per-word `desc`. `ReservedWordDoc.desc` is `string | undefined` — heads owned by `complex_command` (`for`, `while`, `[[`, `{`, `time`) deliberately omit it. A generic "this is a reserved word" string would be an epistemic trap, pushing agents toward the cheapest record when the richer one lives elsewhere. Per-word prose lives in the extractor's `ROLE` table — single source of truth.
- **Corpus identity.** Every record carries `Documented<"reserved_word">` and is reachable via `DocPieceId`, supporting hover, search, and resolver pathways uniformly with other categories.

`pos: ReservedWordPos` (`"command" | "any"`) is required on every record and classifies position semantics. Near-binary in the current corpus: every parsed reserved word is `"command"`; only the synthetic `}` entry is `"any"` (recognized when neither `IGNORE_BRACES` nor `IGNORE_CLOSE_BRACES` is set).

`ReservedWordDoc` does not extend `SyntaxDocBase` because `SyntaxDocBase` requires `desc`, and `reserved_word`'s `desc` is genuinely optional.

The analysis layer has its own `ReservedWordFact`, span-shaped and decoupled from doc identity — it carries `text: string`, not `Observed<"reserved_word">`. Extension hover bridges the two by trying `complex_command` first, falling back to `reserved_word`, mirroring `classifyOrder`.

### Layered consumption

Three consumers of "the reserved-word list" each take a different slice; they are deliberately not unified.

- **Corpus** (`corpus.reserved_word`) — the zsh manual's reserved-word list, parsed from vendored Yodl. Authoritative source for completion items, MCP `list`/`search`, and extension painting.
- **Analysis layer** (`KEYWORD_HEADS` in `analysis/line-facts.ts`) — the set the line analyzer treats as command-position keywords, emitting `reserved-word` facts and resetting `expectCmd`. Deliberately narrower (omits the typeset family, `nocorrect`, `foreach`, `repeat`, `end`) and adds `in`/`]]` for defensive cases. Pinned by `cmd-position-keywords-lockin.test.ts`; see the comment on `KEYWORD_HEADS` for per-token rationale.
- **Extension painting** (`SemanticTokensProvider`) — paints the analyzer's `reserved-word` facts as keyword (subset behaviour preserved), AND paints corpus reserved words seen in command position as keyword via the `cmd-head` branch. The two paths cover the union; the divergence between corpus and analyzer surfaces here as additional keyword highlighting (e.g. `declare`, `typeset`) without affecting analysis semantics.

## `subKind` is always-or-never per category

For every doc category `c`:

- Either `docSubKind[c]` returns `undefined` for every record (the category has no sub-facet — `option`, `builtin`, `redir`, etc.), or
- `docSubKind[c]` returns a non-empty string for every record (the category carries a closed-enum sub-facet — `cond_op` `arity`, `history` `kind`, `reserved_word` `pos`, etc.).

There is no mixed case. The invariant follows from typed structural fields (`d.pos: ReservedWordPos`, `d.kind: HistoryKind`, etc. are all required) and is enforced empirically by `subKindAlwaysOrNever` in zsh-core's test suite.

This invariant lets the tool-layer output schema treat `subKind` as *required-when-non-undefined, forbidden-when-undefined* via per-category `oneOf` branching, with no schema-level optionality.

**Future work.** This is one specific instance of a broader policy that should eventually be named and tested generally: per-category structural fields should follow always-or-never on the corpus, so the schema can encode their presence structurally rather than as optional. When a second instance arises, generalize the test (and this section) into a single named invariant rather than per-field tests. Tracked as a "should do later" item; not blocking.

---

## Casts (`as`)

See `AGENTS.md` for the full classification with examples. Design-level point: the sanctioned brand crossing is the resolver layer. Everything else is either brand-mint (smart constructor) or symptom. Cross-brand casts outside these are a data-model smell.

---

## Data flow

Three consumption routes for the vendored `.yo` docs:

- **Programmatic API** (`loadCorpus()`) — runtime parsing into `DocCorpus`; cached.
- **Pre-parsed JSON** (`"./data/*.json"` package exports) — same data, pre-serialized.
- **Raw Yodl source** (`dist/data/zsh-docs/`) — for advanced consumers.

Per-category renderers are internal; public API is `renderDoc`.

---

## Consumers of the tooldef layer

The static reference is wrapped into a framework-neutral tool layer (`@carlwr/zsh-core-tooldef`: pure `(DocCorpus, input) → output` impls plus `ToolDef` metadata). Three consumer packages today adapt it to different host protocols:

- **`@carlwr/zshref-mcp`** — a Model Context Protocol server over stdio; importable by any MCP client (Claude Desktop, VS Code's MCP support, Cursor, Codex CLI, etc.).
- **`zshref-rs/`** — a Rust+clap CLI (`zshref` bin) with one subcommand per `ToolDef`, emitting JSON on stdout. Pipe-friendly; same pure-tool surface as the MCP, bridged by reading the tool-def JSON baked into the binary at build time.
- **`vscode-better-zsh`** — VS Code extension; registers the same tools as VS Code Language Model tools via `vscode.lm.registerTool`.

Three consumers justifies the extraction: at one or two, the shared layer is overhead; at three, collapsing per-adapter glue into a `toolDefs` walk pays for itself in code and drift prevention — name, description, input schema in one place, picked up automatically.

The remaining subsections are framed around the MCP — the original second consumer and most illustrative case; rationale generalizes to the CLI (no-vscode posture, static-only scope) and to the extension's LM-tool registration.

## Output schemas (tooldef-owned)

Symmetric to `inputSchema`: each `ToolDef` carries an `outputSchema` (JSON Schema, Draft 2020-12), hand-written and co-located with the result type alias. Closed-union leaf data (`category`, per-category `subKind` enums) interpolates from canonical zsh-core tables, never hand-typed (see AGENTS.md §"Never enumerate or count `DocCategory`").

Maximally precise: per-tool match shapes drop fields the tool doesn't emit (`docs` carries `markdown` and conditional `negated`; `search` always carries `score`; `list` carries neither), conditional fields use `oneOf` (e.g. `negated` keyed on `category === "option"`), `additionalProperties: false` everywhere. Rationale: PRINCIPLES.md §"Schema precision when schemas are co-released".

Drift is caught by Ajv conformance on every fixture in `rust-fixtures.test.ts`, plus a property test (fast-check + Ajv) that walks `toolDefs`, generates inputs from each `inputSchema`, runs `execute()`, and validates outputs against `outputSchema`.

Hand-written today; if maintenance burden grows, migrate inputs+outputs+TS types to zod and derive both schemas from one source. Not warranted at three tools — recorded so future maintainers don't re-derive the choice.

## MCP as a consumer

`@carlwr/zshref-mcp` exposes the tooldef surface as MCP tools.

### Consumer model generalizes beyond the editor

The A+B→C consumer-plumbing principle was written with the editor in mind. The MCP package instantiates it in a non-editor process: every consumer composes `resolve()` + `renderDoc()` + corpus iteration, and the MCP server's tool impls are a short, type-safe ribbon over those primitives, serialized as JSON.

Consequently, zsh-core did **not** need a new "query API" for the MCP. It reuses:
- `resolve(corpus, cat, raw)` — sanctioned brand crossing
- `resolveOption(corpus, raw)` — richer sibling preserving `negated`
- `renderDoc(corpus, pieceId)` — markdown generation
- `loadCorpus()` — corpus loading via vendored `.yo`
- `docDisplay(cat, doc)` — human-friendly heading (made public for this reason)
- `docCategories` — iteration target

MCP-driven zsh-core changes have been purely additive exports of already-internal knowledge (`docDisplay`, `classifyOrder`, `docCategoryLabels`). No new endpoints, resolver patterns, or brand crossings — evidence that "static types + consumer plumbing" generalizes beyond the editor.

### Package boundaries and no-vscode rule

`@carlwr/zshref-mcp` **does not depend on `vscode`** (not even type-only). The extension-side adapter wiring tool defs to `vscode.lm.registerTool` lives in `packages/vscode-better-zsh/src/zsh-ref-tools.ts`. Benefits:
- MCP package usable anywhere Node runs; users without VS Code can install via `npx @carlwr/zshref-mcp` (or a future homebrew/binary distribution) and wire it into any MCP client.
- Extension-side cost: one thin file (<30 lines per adapter).
- Publish cadence decouples: zshref-mcp versions independently of the extension.

A test in `packages/vscode-better-zsh/src/test/zsh-ref-tools.test.ts` asserts one-to-one correspondence (names + `inputSchema`) between `contributes.languageModelTools` and `toolDefs`. Drift fails CI.

### Scope fence: "no execution, no environment access" as a product feature

Public pitch: "static zsh knowledge as MCP tools; no shell execution, no environment access." Advertised in the package description and tool `modelDescription` strings, enforced structurally: a test in `packages/zsh-core-tooldef/src/test/scope.test.ts` fails if any file under `src/tools/` imports `child_process`, network APIs, `node:fs`, `vscode`, or reads `process.env`. The extension and Rust CLI inherit the guarantee (extension via direct `toolDefs` import; CLI via the JSON baked into the binary). Adding a tool that legitimately needs these (none do today; none are planned) would require deliberately loosening the fence.

Rationale:
- Existing shell-flavored MCP servers mostly involve execution; users searching for a "zsh MCP" will have execution expectations we don't meet. Leaning into "static, read-only" distinguishes the package and sets correct expectations.
- Execution-free tools have no trust boundary; users can install without security review.

### Tool surface shape: not a mega-tool

Three tools, one intent axis each:

- **`zsh_docs`** — look up a raw token; returns markdown. Universal entry point.
- **`zsh_search`** — fuzzy discovery by name; identifiers only.
- **`zsh_list`** — enumerate corpus records; identifiers only.

`zsh_docs` returns one match per resolving category — 0 or 1 with `category` set; otherwise a `classifyOrder` walk that may surface multiple matches on category overlap (`for` → `complex_command` + `reserved_word`). Option matches always carry `negated: true|false`. Collapses the previous `zsh_classify` + `zsh_lookup_option` + `zsh_describe` triad: per-category richer fields fold into the unified shape, not a separate tool.

Anti-patterns avoided:
- mega-tool (one tool with a `kind` enum) — by separating intent axes;
- per-category-tool sprawl — by keeping per-category specifics in the resolver layer.

`zsh_search` and `zsh_list` are deliberately separate despite identical envelopes. Earlier listing was a mode of `zsh_search` (empty query + optional `category`); calling a fuzzy-search tool with no query is a footgun. The split makes no-query `search` a clap-side requirement violation and gives enumeration its own intent-matching tool. New tools should justify themselves against both extremes (mega-tool vs per-category sprawl).

Output envelope is uniform across all three — `{matches, matchesReturned, matchesTotal}`, even when `docs` cannot truncate. One shape removes per-tool branching in adapters and lets `matchesReturned < matchesTotal` carry truncation without `matches.length` counting at the call site.

### docs: direct ∥ resolver, direct preferred

Per-category lookup: try `corpus[cat].get(trim(raw))`; if it hits, use it; else fall back to the per-category resolver. Never both.

Load-bearing for template-key categories. `job_spec` has literal corpus keys `%number`, `%string`, `%?string`, `%%`, `%+`, `%-`; the resolver maps non-literal forms (`%5`, `%vim`) onto them. Without direct precedence, `{raw: "%number", category: "job_spec"}` would route through the resolver, which inspects the `%5`-shape body and returns the wrong template (`%string` for non-digit body) — breaking round-trip. Same shape in `history` (`!n` vs `!42`), `param_expn`, `special_function` (`TRAPZERR` vs `TRAPNAL`). Non-template categories don't care: `corpus.option.get("AUTO_CD")` misses (canonical id is `autocd`), so the resolver runs and normalizes.

Enforced by the round-trip invariant test: for every literal corpus key `(cat, key)`, `docs(corpus, {raw: key, category: cat})` returns a single match with `id == key`.

### Tie-break in docs

With `category` omitted, `zsh_docs` walks `classifyOrder` (zsh-core), which puts closed-identity resolvers ahead of `option`'s `no_`-stripping and `redir`'s loose tail matching — otherwise `nocorrect` would shadow-resolve as "NO_CORRECT" with negation, not the precmd/reserved-word it is. The ordering encodes resolver-shadowing facts owned by zsh-core; `docs` itself is a uniform walk.

### Fuzzy search rationale

`zsh_search` uses fuzzy matching as the bottom of a four-tier walk (exact → resolver → prefix → fuzzy), not exact-only:

- Corpus identities aren't a stable API; canonical option names drift in case and underscoring under benign doc edits. Fuzzy decouples agent intent from current corpus spelling.
- Option names have no universal canonical form (`no_errreturn` vs `NOERRRETURN` — both plausible). The option resolver handles per-option in the resolver tier; fuzzy generalizes that forgiveness across categories beyond what corpus-aware resolvers cover.
- Exact / resolver / prefix tiers stay precise (every match scores `1.0`); fuzzy only fires when earlier tiers miss and is the only tier with `< 1.0`. `SearchMatch.score` is required so consumers can route by tier without recomputing.

Rendered markdown is withheld from `search` and `list` to keep responses small and encourage composition with `zsh_docs` for the body.

### MCP `outputSchema` and `structuredContent`

Tools register `outputSchema` per the MCP spec since 2025-03-26 (SDK 1.29+). Responses emit `structuredContent` alongside the text content block — schema-aware clients get validated, typed responses; older clients still receive the JSON-stringified body in `content[0].text`.

---

## CLI as a consumer

Symmetric to "MCP as a consumer". `zshref-rs/` wraps the same `toolDefs` surface as a Rust+clap CLI emitting JSON on stdout.

### Why a CLI adapter, given the MCP

MCP is ~18 months old; POSIX CLIs have 50 years of backward-compat history. A CLI adapter is cheap insurance against protocol churn and a better fit for shell pipelines, air-gapped / Node-less environments, and single-binary distribution. The tooldef seam keeps marginal cost small — see "Dynamic `clap::Command` assembly".

### Completions and `--help` as the agent interface

Two consequences of "agents read the CLI the same way humans do — except more literally":

- `zshref completions {bash,zsh,fish,…}` emits sourceable completion scripts embedding closed-set enums as shell completion values. For agents: replaces "recall the valid categories" with "tab-expand them"; for humans it's the native shell UX. One feature, two audiences.
- Every subcommand's `--help` comes from the shared `ToolDef.description` (MCP-primary prose, `zsh_*` rewritten to `zshref *`); `ToolDef.brief` / `flagBriefs` feed narrower CLI columns where long prose would wrap badly. Three-field split rationale: `packages/zsh-core-tooldef/DEVELOPMENT.md`.

`CLI-VISUAL-POLICY.md` captures framework-neutral visual rules (stdout for JSON, stderr for prose, color gating, line-length discipline). The clap implementation follows it.

### Dynamic `clap::Command` assembly

`zshref-rs/src/cli.rs` walks `toolDefs` (JSON-exported from `@carlwr/zsh-core-tooldef`) at startup and builds the clap tree on the fly:

- Subcommands: tool names with `zsh_` stripped.
- Per-flag clap types inferred from the schema fragment: `category` enum → `PossibleValues`; integer-with-bounds → `u32` range; else `String`.
- `brief` → `about`, `description` → `long_about`, `flagBriefs[key]` → `help`.

Adding a tool to tooldef extends the CLI surface automatically; the only CLI-side change is an entry in the Rust `dispatch` match. Drift is guarded — `cli::DOC_CATEGORIES`, `CATEGORY_FILES`, `CLASSIFY_ORDER` are cross-checked against the canonical `index.json` emitted by zsh-core.

### Maintenance-mode posture

Re-vendoring cadence is years, not months. The CLI is shaped for that rhythm:

- Single statically-linked binary with baked-in corpus (`include_bytes!`).
- Dual-mode build (`zshref-rs/DATA-SYNC.md` option 6) auto-detects monorepo-source vs vendored-source.
- `make cli-package` validates the extraction path in CI.
- No runtime feature flags, plugin system, or user-supplied data paths.

Expected durability: decade-scale, for the same reasons zsh itself has stayed stable.

### `zshref schema`

Emits all `outputSchema`s as a single JSON bundle on stdout. Intended for code generation and programmatic validation — not human or agent reading. Both top-level `--help` and the subcommand's own `--help` carry a size hint (interpolated word count + leaf-property count) and a redirect to `--help` + completions for documentation.

Bundle-only, deliberately. Per-tool cherry-picking is `zshref schema | jq '.tools[] | select(.name == "zsh_search")'` (full tool name; the bundle preserves the `zsh_` prefix). A per-tool subcommand was rejected: it would diverge from clap's `--help`-vs-`help` convention (no nested `help` subcommand) and complicate Usage-line presentation; a future-compatible `zshref schema --tool=NAME` flag remains available if demand emerges.

### `zshref info` and fuzzy-score divergence

- `zshref info` emits corpus metadata as JSON (package version, upstream zsh tag/commit/date, per-category counts, category list). CLI-only because MCP's `initialize` frames already carry equivalent metadata. New programmatic-introspection additions belong here, not as `--version`-adjacent subcommands.
- The CLI uses an in-tree ASCII subsequence scorer (`src/fuzzy.rs`); the MCP uses `fuzzysort`. Fuzzy scores are not comparable across adapters. The shared-fixture integration test strips `score` fields before comparison and asserts on rank + identity only. Tradeoff (no third-party fuzzy dep in the Rust crate, same ordering in practice) is deliberate.

---

## Vendored `.yo` files are domain invariants

In practice the vendored Yodl files change only when we re-vendor (every 10–20 years for a zsh upgrade). We do **not** design around continuous re-vendoring.

What *does* happen: extending functionality by vendoring more `.yo` material. That is a static change to zsh-core and is **expected** to warrant updates to its static types.

Consequence: **properties of vendored `.yo` files can be treated as domain invariants.**

---

## External input boundaries

- **Parse, don't validate.** At boundaries with external APIs (VS Code settings, filesystem, process env), parse raw values into domain types at the entry point. Everything downstream operates on parsed types.
- **Contain boundaries structurally.** The module that reads an external API is the sole reader. The module boundary *is* the policy.
- **Minimize the dangerous path.** Path from raw external input to first strongly typed representation should be short and contained. Smart constructors at parse boundaries; no function accepts raw external values unless parsing is its explicit job.

---

## Hover UX for negated options

`resolveOption(corpus, raw)` returns `{ id, negated }`. `vscode-better-zsh` currently discards `negated` — hovering `setopt NO_AUTO_CD` shows the same markdown as `setopt AUTO_CD`. Deliberately deferred; correct UX (e.g. "AUTO_CD is being turned OFF") is a follow-up. The `setoptHover` path in `hover.ts` marks this.

---

## Hover dispatch is procedural, not table-driven

A table-driven rewrite of `factBasedHover` was attempted and rejected. It did not improve conciseness and weakened clarity — `redir` needs its own range calculation and group-op disambiguation; `process_subst` has a text-slice hoop; a uniform table broke per-fact-kind intent without a net win. `hover.ts` carries a `DON'T DELETE THIS COMMENT` note.

Parametric, table-driven shapes are useful where domain shape is uniform; not every axis of variation deserves to become a table.

---

## Syntax highlighting / semantic tokens

A complete custom zsh TextMate grammar is out of scope. Shell-script parsing is hairy, and tree-sitter — not TextMate — is the long-term future. So:

- Vendor the current sh/bash-focused VS Code TM grammar.
- **Offer some semantic tokens for parts of zsh syntax parseable with reasonable effort.** Semantic tokens layer on top of TM scopes and hide imperfections.

Design choices:

- Baseline highlighting is the TM grammar; semantic tokens should be consistent with it where the TM grammar is correct.
- Map to specifically-qualified scopes (`keyword.operator.logical.binary.shell` rather than generic `keyword.operator.logical.shell`) — gives users/themes override flexibility.
- `{` / `}` are emitted as `reserved-word` facts but *skipped* in the token provider (TM already handles `f() { … }`; distinguishing block-`{` from word-`{` heuristically is non-trivial).
- `((` / `))` *are* emitted and get `keyword` tokens — reuses provider logic without a new token type.
- New token types weigh against needing matching `semanticTokenScopes` entries in `package.json`.

---

## Future directions

- **Programmatic discovery.** Iterate `docCategories`, access `corpus[K]`, inspect the map — all type-safe. Goal: a consumer asking "what builtins are there?" gets a list whose every element carries a static proof of documentation.
- **Rich fact-to-doc links.** `DocPieceId` is the natural return type if future analysis produces tighter fact→doc connections.
- **New doc categories.** Local additions to taxonomy tables; the typechecker enforces completeness everywhere else.
- **Richer markdown rendering.** Internal `md*()` renderers can be enriched independently. `renderDoc`'s JSDoc notes an upgrade path for a future `level: "full" | "sig"` axis if multiple categories grow meaningful compact forms.
- **Environment-dependent introspection** may later be offered through agent-facing Language Model Tools, with explicit opt-in and clear caveats about side effects and env-specificity.

---

## History — original goals of the large type-strengthening refactor

For context. The refactor that produced the current design was driven by:

- **Implicit taxonomy** — doc categories existed in many locations without compile-time consistency.
- **Type-specialized proliferation** — per-category functions (`mdOpt`, `mdCondOp`, …), per-category loaders (`getOptions`, `getCondOps`, …), per-category provider fields, all duplicating structure.
- **Weak inter-domain connections** — no uniform way to go from "I know the category and id" to "give me the markdown."
- **No unified identity model** — each category used a different field name with no common abstraction.

Principles applied:

- Closed unions, smart constructors, parse-don't-validate.
- Branded types; narrowing.
- Parametric over type-specialized — one generic where there were N variants. A primary driver.
- Less code at use sites beats net code reduction.
- Conceptual clarity through types, identifiers, file structure — not comments.

Non-goals:

- No new product features "for their own sake."
- No drift toward AST complexity.
- No markdown rendering for TBD categories (return `"TBD"`; keep types total).
- No touching the "odd bird" of user-function docstrings — a separate extension feature outside the doc taxonomy.
