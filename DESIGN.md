# Design

**Why**, not what — for subsystems. API rollups (JSDoc in the `.d.ts` files) describe *what* the public surface does; this file explains *why* subsystems are shaped as they are.

Cross-cutting principles: [`PRINCIPLES.md`](./PRINCIPLES.md). Contributor conventions, testing, tooling, and style: [`AGENTS.md`](./AGENTS.md).

Do not duplicate JSDoc (types, signatures, behavioral contracts); point to it. If a rule already lives in PRINCIPLES or AGENTS, **cross-link** instead of restating — same-layer repetition drifts.

---

## What is `zsh-core`?

A standalone package of structured zsh knowledge. Parses vendored Yodl (`.yo`) docs into typed records, extracts facts from user zsh code, renders markdown. Nothing extension-specific; other consumers include JSON artifacts and tooldef adapters.

Not a grammar, not a tokenizer. Zsh is not generally parseable without running zsh; we take line-local, corpus-aware wins that do not require shell execution and help editor features.

`src/analysis/` (fact extraction) is conceptually separable from `src/docs/` + `src/render/` + JSON-dist artifacts. Splitting into two workspace packages was deferred: the static-scope test enforces the seam structurally; a separate package would add extraction config without payoff today.

---

## The three orthogonal domains — A / B / C

Every change should preserve this decomposition. It shows up in directory layout (`src/docs/`, `src/analysis/`, `src/render/`), types, and naming.

### A. Parsed Documentation (`src/docs/`)

Static vendored knowledge about zsh language elements. A **closed taxonomy** of `DocCategory` values (see `docCategories`). Each category has:

- A doc-record type per category (see `DocRecordMap` / per-category JSDoc).
- A branded corpus identity: `Documented<K>` — see brand semantics below.
- A map `DocCorpus[K]: ReadonlyMap<Documented<K>, Record>` parsed from `.yo`.

Knows nothing about user code. The universe of documented elements is statically enumerable from the corpus.

### B. Fact Extraction (`src/analysis/`)

Coarse, potentially overlapping annotations about user zsh code. A `Fact` discriminated union keyed by `FactKind` with confidence levels (`"hard"` / `"heuristic"`).

The term "fact" is load-bearing: facts are what the analyzer *asserts*, not a complete description. Analysis is best-effort and line-local; no claim of exhaustiveness.

Where a payload benefits from branding, it carries `Observed<K>` — **never** `Documented<K>`. Facts annotate syntax, not corpus membership.

Knows nothing about doc records or markdown rendering.

### C. Markdown Rendering (`src/render/`)

Doc records → human-readable markdown. Depends on A; orthogonal to B.

### Inter-domain wiring

Consumers (extension, MCP server, `zshref` CLI, future wrappers) plumb A+B→C: facts identify what to look up; the corpus supplies content; rendering produces output. Dispatch stays in consumer code — partial and context-dependent (a `cmd-head` fact might match a builtin, precmd, user function, or nothing).

**zsh-core does not wire A+B→C internally.** No "candidate in, markdown out" convenience API; consumers compose `resolve()` + `renderDoc()`. See §"API orthogonality" and §"MCP as a consumer".

---

## Brand semantics: `Observed<K>` and `Documented<K>`

For *what* each brand means and *how* to use them, see JSDoc on `Observed<K>`, `Documented<K>`, `resolve`, `mkPieceId`. The rest here is **why** the split exists.

### Three phases: raw / observed / documented

- **Raw** — user-code text. Untyped `string`.
- **Observed** — normalized, category-shaped, corpus-blind. `Observed<K>`. For fact extraction.
- **Documented** — corpus-confirmed. `Documented<K>`. Produced by trusted corpus construction or the resolver layer.

The resolvers bridge Observed → Documented.

### Two brands, not one

Provenance and a trusted/untrusted boundary, plus types that forbid conflating structurally different concepts.

### Why normalization is shared but corpus-aware parse is not

Both brands share per-category normalization (pure string rewriting: trim, case-fold). Category-specific concerns requiring the corpus — option `no_`-prefix handling, redirection group-op + tail disambiguation — live in the per-category resolver table, not in `mkObserved` / `mkDocumented`.

Key insight: `no_` handling is **corpus-dependent**. `NOTIFY` is an option; `TIFY` is not. Stripping "NO" off `NOTIFY` gives a non-option. Only a step with corpus access can decide. Baking this into a smart constructor conflates normalization (phase 2) with membership checking (phase 3) and produces bugs that manifest only at lookup time.

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

raw→documented genuinely differs by category:

- `option` — corpus-aware negation.
- `redir` — composite-token decomposition.
- `job_spec`, `special_function` — template + compositional fallback matching.
- Most others — trivial lookup.

A per-category resolver table keeps logic local; the public API stays uniform. New complexity = new table entry.

---

## Resolver feedback channel

Contract and identity/feedback split: PRINCIPLES.md §"Resolver feedback (lossy normalization)". `resolverFeedbackKinds` is the canonical runtime list of kinds.

**Why parametric (one helper, not `isNegatedShellOption`-style per-category APIs):** tooldef and adapters stay uniform — `resolverFeedback(corpus, pid.category, raw)` everywhere instead of growing `if (cat === …)` per new lossy resolver.

---

## Why `DocCategory` is a closed `as const` array

- `docCategories` iterates at runtime (`loadCorpus`, dumps, consumers).
- `DocCategory` is `typeof docCategories[number]` — exhaustiveness checked by category-indexed tables and tests.
- Adding a category is a local taxonomy change; the compiler surfaces update sites.

`DocCorpus` is an explicit interface (not only a mapped type) so IDE hover shows concrete fields; `Eq<…>` assertions enforce completeness.

### Category-indexed artifacts belong in zsh-core

Any "one entry per `DocCategory`" table lives in zsh-core behind a structural completeness guard; consumers import it instead of hand-maintaining parallel lists. After two categories were added, hand-written ordering arrays and hand-typed category lists in tool descriptions drifted silently — neither tests nor types flagged it. `DocCategory`-keyed tables turn that class of drift into a compile error.

---

## Per-category modeling

### Identity per record, display separately

Each record keeps its domain identity (`name`, `op`, `flag`, `key`, `sig`). The parametric `docId` table gives uniform access without renaming fields.

`docDisplay` is a small function (not a full table): only `option` diverges — `.display` keeps case/underscores (`AUTO_CD`), `.name` is the lookup key (`autocd`). Elsewhere identity equals display.

`docId` is internal; `docDisplay` is public for hovers, MCP, dumps.

### Redirection: full-signature identity, auxiliary brands

Redirection identity is the full signature (see redir doc JSDoc), not the leading operator. Multiple docs share a `groupOp`; the resolver disambiguates by tail — corpus-aware, not plain map lookup.

`OptFlag` and `RedirOp` are secondary-index brands for consumer lookup; they do not use the `Observed`/`Documented` split.

### History: grammar components, not independent tokens

`history` resembles short-key categories structurally but models **components** of `![event][:word][:modifier…]`, not parallel standalone tokens. A bare `^` or `:h` is not a zsh token in isolation — unlike `glob_op`, where each record is a single user-code token.

- **Corpus keys are templates** (`!n`, `!str`, `h [ digits ]`, …). `resolveHistory` handles event-designator shapes (`!42` → `!n`); word-designators and modifiers stay unresolved on purpose where search is context-free.
- **`resolveHistory` is intentionally narrow** — same "totality, not utility" posture as `param_expn` (see below). In-expansion decomposition for `!!:1:h` belongs in `src/analysis/` as richer facts later, not necessarily in the resolver.
- **`kind` is the typed facet** — search exposes `subKind` from each record's `kind`. `docDisplay` stays aligned with id except where `option` already diverges.

### Parameter-expansion identity and shape

`param_expn` identity is the full sig (e.g. `${name:-word}` vs `${name-word}` as distinct records), same precedent as redirections.

- **Trivial resolver for totality** — Sigs are literal templates; user tokens will not match. Category is reached via search/tools with `category` set, not raw classification. The resolver exists so resolver-layer completeness guards stay closed.
- **`subKind` is a fixed closed union** — literal values; extending it is a deliberate single-point change.
- **Placeholders via an exact-string table** — one source of truth for `subKind` and operand-slot names; bad renames fail at extraction, not as garbage markdown.
- **No raw-text resolver** — considered and dropped (testing cost, no practical lookup win).

### Complex commands + alternate forms

`ComplexCommandDoc` models `grammar.yo` "Complex Commands" plus "Alternate Forms" as `alternateForms`.

- **Head-keyword identity** — Closed `HeadKey` set (`if`, `for`, `for-arith`, `while`, …). Two `for` entries (name vs arithmetic) stay separate — different enough that merging would obscure structure.
- **`alternateForms: readonly AlternateForm[]`** — same precedent as `ZshOption.flags`, `ParamExpnDoc.groupSigs`: variable-length composite data on one record; each alternate has `template` + `keywords`.
- **`classifyOrder` before `reserved_word`** — Lookup on a head keyword lists `complex_command` before reserved-word boilerplate when categories overlap (`for`, `while`, `[[`, …). See PRINCIPLES.md §"Overlap between categories is accepted".

### Glob qualifiers vs glob flags vs glob operators

Three sibling categories under `glob_*` — shared prefix is labelling only.

- `glob_op` — in-pattern metacharacters (`*`, `?`, `[...]`, `@(...)` …); `kind: "standard" | "ksh-like"`.
- `glob_flag` — in-pattern `(#…)` (`(#i)`, `(#b)`); needs `EXTENDED_GLOB`.
- `glob_qualifier` — trailing parenthesised filters (`*(/)`, …); letter and multi-char keys (`%b`, `%c`).

`glob_qualifier`'s resolver reuses parenthesis-agnostic flag machinery: bare letter, `(X)` when allowed, `(#qX)` when extended glob is on.

### Reserved word: an enumeration-primary doc category

`reserved_word` is the enumeration-primary category (see PRINCIPLES.md §"Category roles"). One record type does three jobs:

- **Enumeration source** — corpus map is the authoritative reserved-word list for completions, `list`, syntactic checks.
- **Supplementary prose** — body keywords, alternate-form keywords, standalone entries may carry `desc`. Heads owned by `complex_command` deliberately omit `desc` — a generic "reserved word" blurb would steer agents to the wrong record. Per-word prose for those lives in the extractor's `ROLE` table.
- **Corpus identity** — every record is `Documented<"reserved_word">` and reachable via `DocPieceId` like other categories.

`pos: ReservedWordPos` is required (command-position vs broader `}` semantics — see corpus / analysis). `ReservedWordDoc` does not extend `SyntaxDocBase` because base requires `desc`; here `desc` is genuinely optional.

Analysis uses `ReservedWordFact` with `text: string`, not `Observed<"reserved_word">`. Extension hover tries `complex_command` first, then `reserved_word` — mirrors `classifyOrder`.

**Layered consumption** — three slices of "the reserved-word list" stay **deliberately** separate:

- **Corpus** — manual list from Yodl; source for completions, MCP `list`/`search`, and (with `cmd-head`) extra semantic-token painting for words the analyzer treats only as command heads (`declare`, `typeset`, …).
- **Analysis** — pinned `KEYWORD_HEADS` subset for command-position facts and `expectCmd`; narrower than corpus by design. Rationale: file-level comment on the constant + lock-in tests.
- **Extension** — semantic tokens: analyzer `reserved-word` facts **and** corpus-driven painting for manual reserved words in command position (`semantic-tokens.ts`).

### `subKind` is always-or-never per category

For every doc category `c`:

- Either `docSubKind[c]` returns `undefined` for every record (the category has no sub-facet — `option`, `builtin`, `redir`, etc.), or
- `docSubKind[c]` returns a non-empty string for every record (the category carries a closed-enum sub-facet — `cond_op` `arity`, `history` `kind`, `reserved_word` `pos`, etc.).

There is no mixed case. The invariant follows from typed structural fields (`d.pos: ReservedWordPos`, `d.kind: HistoryKind`, etc. are all required) and is enforced empirically by a dedicated invariant test in zsh-core's test suite.

This invariant lets the tool-layer output schema treat `subKind` as *required-when-non-undefined, forbidden-when-undefined* via per-category `oneOf` branching, with no schema-level optionality.

**Future work:** one instance of a broader rule — per-category structural fields on the corpus should follow always-or-never so schemas encode presence structurally, not as blanket optionals. Fold the tests (and this section) into one named invariant when a second concrete instance appears.

---

## Data flow

Vendored `.yo` is consumed three ways:

- **`loadCorpus()`** — runtime parse into `DocCorpus`; cacheable.
- **Pre-parsed JSON** (`"./data/*.json"`) — same records; markdown bodies pre-rendered at build time.
- **Raw Yodl** under `dist/data/zsh-docs/` — advanced consumers.

Per-category renderers are internal; public entry is `renderDoc`. The JSON export is a sibling consumer path (e.g. Rust `include_bytes!`); it stays in zsh-core for build convenience — package split deferred.

---

## Consumers of the tooldef layer

`@carlwr/zsh-core-tooldef` holds pure `(DocCorpus, input) → output` implementations plus `ToolDef` metadata. MCP, CLI, and VS Code LM adapters all walk `toolDefs` or exported JSON — one place for names, descriptions, schemas, and drift tests.

The library keeps `@carlwr/zsh-core` as a tiny corpus surface and exposes focused entrypoints such as `@carlwr/zsh-core/types`, `@carlwr/zsh-core/analysis`, `@carlwr/zsh-core/resolver`, and `@carlwr/zsh-core/taxonomy`. Tooldef and editor code import those subpaths so dependency arrows stay visible. AGENTS.md summarizes the split.

## Output schemas (tooldef-owned)

Each `ToolDef` has `outputSchema` (JSON Schema 2020-12) next to its result type. Closed unions (`category`, per-category `subKind`, `ResolverFeedback` kinds) **interpolate from zsh-core exports**, never hand-typed (`AGENTS.md` §"Never enumerate or count `DocCategory`"). Match shapes mark fields required vs absent; `additionalProperties: false`; parametric `feedback?: ResolverFeedback` where tools surface resolver feedback. Rationale: PRINCIPLES.md §"Schema precision when schemas are co-released".

Shared fragments use `$defs` / `$ref`; a small builder handles per-tool variation. Drift: a property test (fast-check + Ajv) over `execute()` vs `outputSchema`, plus a cross-language parity test (`parity.test.ts`) — see §"Parity surface units". Hand-authored today; migrating to zod-derived schemas is a documented escape hatch if burden grows.

Per MCP spec (SDK 1.29+), tools register `outputSchema`; responses include `structuredContent` for schema-aware clients while legacy clients still get JSON in `content[0].text`.

## Adapters of the shared tool surface

Three adapters expose the same `toolDefs` through different transports — MCP (`packages/zshref-mcp/src/server/build-server.ts`), VS Code LM (`packages/vscode-better-zsh/src/lm-adapter/zsh-ref-tools.ts`), Rust CLI (`zshref-rs/src/cli.rs` + `batch.rs`). Adapters walk `toolDefs` and call `def.execute(corpus, input)`; nothing else.

**Thin-adapter lock** — MCP and VS Code LM stay on root `@carlwr/zsh-core` + `@carlwr/zsh-core-tooldef` only (no subpaths), named brace imports, per-adapter tooldef symbols (MCP full set; LM `toolDefs` only); enforcement in `packages/zsh-core-tooldef/src/test/`. No `resolve` / `renderDoc` / analysis. See AGENTS.md §"Tooldef + adapters".

**Package boundaries** — MCP does not depend on `vscode`; LM registration lives in the extension. One extension test locks `contributes.languageModelTools` to `toolDefs` (names + `inputSchema`).

**Scope fence** — Product promise: static knowledge, no shell execution, no env reads from tool impls. The tooldef test rejects `child_process`, network, `node:fs`, `vscode`, and `process.env` under `src/tools/`. Loosening that is deliberate, not accidental.

**Tool surface** — Split by intent (lookup-with-markdown vs fuzzy discovery vs enumeration), not one mega-tool with a `kind` enum and not one tool per category. `zsh_docs` unifies former classify/lookup/describe-style flows; `zsh_search` vs `zsh_list` stay separate so "search with no query" is not a silent footgun. Uniform output envelope `{ matches, matchesReturned, matchesTotal }` keeps adapters simple.

## Parity surface units (TS ↔ Rust mirrors)

The Rust CLI re-implements a small surface; the rest is consumed via baked JSON. Source of truth: `packages/zsh-core-tooldef/src/test/parity-units.ts`. Structural alignment of `// MIRRORED-IN:` / `// MIRROR-OF:` markers is enforced by `mirror-pairs.test.ts`; behavioral parity (modulo the carved-out fuzzy tier) by `parity.test.ts`.

## `lookupRaw`: direct ∥ resolver, direct preferred

zsh-core exports `lookupRaw(corpus, cat, raw)`: try `corpus[cat].get(trim(raw))` first; on miss, fall back to `resolve()`. **Do not** run both paths for the same query, and **do not** re-implement the rule in consumers.

Load-bearing for template-key categories: `job_spec`'s literal `%number` vs the resolver's `%5 → %number` mapping; same risk for `history` (`!n` vs `!42`), `param_expn`, `special_function` (`TRAPZERR` vs `TRAPNAL`). Non-template categories miss direct lookup then resolve (`AUTO_CD` → `autocd`).

The round-trip invariant test asserts that for every literal corpus key `(cat, key)`, `docs(corpus, { raw: key, category: cat })` yields a single match with `id == key`.

Mirrored on the Rust side as `resolve_in` in `zshref-rs/src/resolver.rs`.

## Tie-break in docs

With `category` omitted, `zsh_docs` walks `classifyOrder` so tight identity resolvers beat `option`'s `no_` stripping and `redir`'s loose matching — e.g. `nocorrect` must not shadow-resolve as a negated option. Ordering is owned in zsh-core (`taxonomy.ts`).

## Fuzzy search rationale

`zsh_search` uses fuzzy matching as the last tier (exact → resolver → prefix → fuzzy):

- Corpus spelling of identities can drift benignly; fuzzy decouples agent intent from exact strings.
- Option shapes vary (`no_errreturn` vs `NOERRRETURN`); resolver handles category-specific cases; fuzzy covers the rest.
- Earlier tiers score `1.0`; fuzzy is `< 1.0` — `SearchMatch.score` is always set so consumers know the tier.

Id-only tools omit rendered markdown to keep payloads small; compose with `zsh_docs` for bodies.

---

## CLI as a consumer

`zshref-rs/` wraps the same tooldef JSON as a Rust+clap CLI (stdout JSON). MCP is young; a CLI is cheap insurance for pipelines, air-gapped / Node-less setups, and single-binary distribution.

Tooldef keeps the marginal cost low: dynamic `clap::Command` assembly from bundled JSON (subcommands = tool names minus `zsh_`; flags from schema fragments; `brief` / `description` / `flagBriefs` → clap help — see `packages/zsh-core-tooldef/DEVELOPMENT.md` for the three-field split).

**Completions + `--help`** — `zshref completions …` embeds closed enums for shells; agents can discover categories the same way humans tab-complete. `CLI-VISUAL-POLICY.md` covers stdout/stderr/color discipline.

**Maintenance posture** — Baked corpus via `include_bytes!`, dual-mode build (`zshref-rs/DATA-SYNC.md`), `make cli-package` in CI, no runtime plugins. Intended for re-vendor cadence measured in years.

**`zshref schema`** — Emits both `inputSchema` and `outputSchema` per tool as one JSON bundle for codegen/validation; `--help` warns on size. Cherry-pick with `jq`; no per-tool subcommand (would fight clap conventions).

**`zshref info` / fuzzy scores** — Corpus metadata JSON lives here (MCP has overlapping data in `initialize`). CLI fuzzy uses an in-tree ASCII scorer vs MCP's `fuzzysort` — scores are not comparable cross-adapter; shared tests compare rank/identity only.

---

## Vendored `.yo` files are domain invariants

Vendored Yodl changes on re-vendor / zsh upgrade (infrequent), not continuously; extending what we vendor is a **static** zsh-core change and may require type updates. **Treat properties of vendored `.yo` as domain invariants** when reasoning about extractors and tests.

---

## External input boundaries

At VS Code / FS / process boundaries: **parse, don't validate** downstream — convert to domain types at the entry module; keep the dangerous path short. The module that reads an external API is the policy owner.

---

## Hover dispatch is procedural, not table-driven

A table-driven rewrite of fact-based hover was tried and rejected: `redir` and `process_subst` need bespoke range/slice logic; a uniform table obscured intent. The hover module keeps an explicit warning comment — parametric tables fit uniform domains; not every variation should become a table.

---

## Syntax highlighting / semantic tokens

Full custom zsh TextMate grammar is out of scope; tree-sitter is the long-term direction. Today:

- Vendor the stock sh/bash TM grammar; add **semantic tokens** only where line-local analysis is reliable.
- Stay consistent with TM where TM is right; prefer specifically qualified TextMate scope names for theme overrides.
- `{` / `}` reserved-word facts are **skipped** in the token provider (TM already covers `f() { … }`; block-`{` vs word-`{` is hairy).
- `((` / `))` **are** tokenized as `keyword` — reuses existing provider paths.
- New token types need matching `semanticTokenScopes` in `package.json`.
