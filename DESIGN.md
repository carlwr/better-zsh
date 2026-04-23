# Design

**Why**, not what — for subsystems. This file complements the API docs (JSDoc in the d.ts rollups): the d.ts tells consumers *what the API does*; this file tells contributors *why each subsystem is shaped the way it is*.

Cross-cutting principles (scope, category ontology, adapter judgement) live in [`PRINCIPLES.md`](./PRINCIPLES.md); contributor conventions, testing, tooling, and code style live in [`AGENTS.md`](./AGENTS.md).

Avoid duplicating what JSDoc already says (types, signatures, behavioral contracts). Refer to the relevant type or function JSDoc instead. This keeps the two in sync: if a function's behavior changes, only its JSDoc needs updating.

---

## What is `zsh-core`?

A standalone package of structured zsh knowledge. Parses vendored Yodl (`.yo`) doc files into typed records, extracts facts from user zsh code, and renders markdown. Nothing zsh-specific to the extension — `vscode-better-zsh` is one consumer. Future consumers (JSON exports, AI-facing tools) are expected.

Not a grammar, not a tokenizer. Zsh is not generally parseable without running zsh; we pick the low-hanging fruit that does not require shell execution and is useful for editor features.

---

## The three orthogonal domains — A / B / C

Every change should preserve this decomposition. It is visible in the directory layout (`src/docs/`, `src/analysis/`, `src/render/`), in the type surface, and in naming.

### A. Parsed Documentation (`src/docs/`)

Static vendored knowledge about zsh language elements. Organized into a **closed taxonomy** of `DocCategory` values (see `docCategories` for the current set). Each category has:

- A doc-record type (e.g. `ZshOption`, `CondOpDoc`, `BuiltinDoc`)
- A branded corpus identity: `Documented<K>` — see brand semantics below
- A map `DocCorpus[K]: ReadonlyMap<Documented<K>, Record>` parsed from `.yo`

Knows nothing about user code. The universe of documented elements is statically enumerable from the corpus.

### B. Fact Extraction (`src/analysis/`)

Coarse, potentially overlapping annotations about user zsh code. A `Fact` discriminated union keyed by `FactKind` (see the d.ts) with confidence levels (`"hard"` / `"heuristic"`).

The term "fact" is load-bearing: facts are what the analyzer *asserts*, not a complete description of the code. Analysis is best-effort and line-local; there's no claim of exhaustiveness. We recognize what we recognize; everything else is silence.

Where a fact payload benefits from branding, it carries an `Observed<K>` — **never** a `Documented<K>`. Facts annotate syntax, not corpus membership.

Knows nothing about doc records or markdown rendering.

### C. Markdown Rendering (`src/render/`)

Transforms doc records into human-readable markdown. Depends on A; orthogonal to B.

### Inter-domain wiring

The **consumer** (extension, MCP server, or any future wrapper) plumbs A+B→C: facts identify what to look up; the doc corpus provides content; rendering produces output. This plumbing is procedural dispatch in consumer code, not static type mapping — because it is inherently partial and context-dependent (a `cmd-head` fact might match a builtin, a precmd, a user function, or nothing).

Key principle: **zsh-core does not wire A+B→C internally.** Consumer-facing "I have a candidate from user code, give me markdown" convenience APIs are deliberately absent; consumers compose `resolve()` + `renderDoc()`. See "API orthogonality" below and "MCP as a consumer" for how that consumer model works outside the editor process.

---

## Brand semantics: `Observed<K>` and `Documented<K>`

For *what* each brand means and *how* to use them, read the JSDoc on `Observed<K>`, `Documented<K>`, `resolve`, `resolveOption`, and `mkPieceId` in the d.ts. This section covers **why the design is shaped this way**.

### Why two brands, not one

The split is about **provenance**. A single brand for "known corpus member" and "unverified lookup query" conflates two roles, gives false confidence, and obscures the trusted/untrusted boundary. `Observed<K>` says "I normalized this from user code"; `Documented<K>` says "the corpus has this." They are structurally incompatible so the type system refuses to confuse them.

### Why normalization is shared but corpus-aware parse is not

Both brands share the same per-category normalization. Normalization is pure string rewriting (trim, case-fold). Category-specific concerns that **require the corpus** — option `no_`-prefix handling, redirection group-op + tail disambiguation — live in the per-category resolver table, not in `mkObserved` / `mkDocumented`.

The key insight: the right handling of `no_` is **corpus-dependent**. `NOTIFY` is an option; `TIFY` is not. Stripping "NO" off `NOTIFY` gives a non-option. Only a step with corpus access can decide. Baking this into a smart constructor conflates normalization (phase 2) with membership checking (phase 3) and produces bugs that manifest only at lookup time.

### Three phases: raw / observed / documented

- **Raw** — user-code text. Untyped `string`.
- **Observed** — normalized, category-shaped, corpus-blind. `Observed<K>`. Appropriate for fact extraction.
- **Documented** — corpus-confirmed. `Documented<K>`. Produced by trusted corpus construction or the resolver layer.

The resolver layer bridges phases 2→3. Trying to bridge them inside phase-2 constructors is where the bugs lived in the previous design. The current architecture keeps them cleanly separated.

### Why `mkDocumented` is excluded from the public API

`mkDocumented` mints a `Documented<K>` without a corpus check. It is deliberately behind `"zsh-core/internal"` (not the `"."` export). Legitimate callers: Yodl extractors, the resolver layer, test-corpus builders. See the JSDoc on `Documented<K>` for the checked-vs-trusted distinction. **Do not re-export `mkDocumented` from the public surface.**

---

## API orthogonality — strong guiding principle

If an operation decomposes into A→B→C, prefer exporting A→B and B→C rather than also A→C, even when "almost all consumers need A→C." Consumers compose.

The rendering path is `raw string → DocPieceId → markdown` (`resolve` + `renderDoc`). No combined convenience function. Reasons:

- `DocPieceId` is a first-class concept (type-safe corpus identity) — an A→C function hides it.
- Two ways to do the same thing force consumers to choose and encourage drift.
- Each step has a crisp meaning: "is this in the corpus?" vs "render this known element."

Corpus-driven aggregation helpers (e.g. `refDocs`) are fine — they operate on already-known corpus records, not on hidden brand crossings.

Not an absolute ban. If post-refactor usage justifies a convenience wrapper, it should be a conscious addition.

---

## Why per-category resolvers

The raw→documented relationship has genuinely different shapes per category (`option` needs corpus-aware negation; `redir` decomposes composite tokens; `job_spec` and `special_function` apply template + compositional fallback matching; most others are trivial lookup). A per-category resolver table lets each category carry its own logic while the public API stays uniform. Adding a new complex category is a local addition: drop a resolver entry, the public API picks it up automatically.

---

## Why `DocCategory` is a closed `as const` array

- `docCategories` can be iterated at runtime (for `loadCorpus`, for dump tooling, for consumers that want to walk everything).
- `DocCategory` is `typeof docCategories[number]` — a closed union. Exhaustiveness is checked everywhere (`DocRecordMap`, `DocCorpus`, resolver table, norm table, `docId`, `mdRenderer`).
- Adding a new category is a local change — `docCategories`, `DocRecordMap`, `DocCorpus`, `norm`, `docId`, the resolver table, `mdRenderer`, plus a Yodl extractor. The type system then enforces completeness everywhere else.

`DocCorpus` is an explicit interface rather than a computed mapped type because hovering `DocCorpus` in an IDE should show concrete fields, not a formula. Compile-time key assertions (`Eq<...>`) enforce completeness.

### Category-indexed artifacts belong in zsh-core

Any table of shape "one entry per `DocCategory`" lives in zsh-core with a structural completeness guard; consumers import. Today this covers the iteration list, the classify-order, human-readable labels, the record-type map, the corpus shape, renderers, resolvers, and id accessors.

**Motivation:** after two categories were added to the taxonomy, a hand-written ordering array and hand-typed category lists in tool descriptions silently fell behind — neither tests nor the type system flagged it. Moving both into zsh-core behind `DocCategory`-keyed tables makes the same class of drift a compile error.

Principle: if a consumer is about to hand-write a list or table keyed by category, import instead.

(Contributor rule — no hand-typed enumerations in any documentation or runtime string — is in `AGENTS.md`.)

---

## Identity per record, display separately

Each doc record keeps its domain-specific identity field name (`name`, `op`, `flag`, `key`, `sig`). `.name` for a builtin reads better than `.id`. The parametric `docId` accessor table provides uniform access across categories without renaming fields.

`docDisplay` is a small function (not a full table) because only `option` diverges — its `.display` preserves case and underscores for humans (`AUTO_CD`), while `.name` is the normalized lookup key (`autocd`). Every other category's identity *is* its display. A full table would be a pile of trivial entries delegating to `docId[cat]` plus one override.

`docId` is **internal** (not re-exported); `docDisplay` is **public** since consumer-side UIs (hovers, MCP tool responses, dump output) routinely need a human heading without redoing the per-category branching. `refs.ts` consumes `docId` via direct relative import.

---

## Redirection identity and auxiliary brands

Redirection identity is the full signature (see `RedirDoc` JSDoc), not the leading operator. Multiple docs share a `groupOp`; the redir resolver disambiguates by tail shape. This is why redirections need a corpus-aware resolver rather than simple lookup.

`OptFlag` and `RedirOp` are secondary-index brands — bucketing tokens for consumer-side lookup, not corpus identities. They don't participate in the `Observed`/`Documented` split.

---

## History: grammar components, not independent tokens

The `history` category looks superficially like other short-key categories (single-character keys, flat record list) but has a different underlying shape that should guide its resolver and presentation.

- **Three subkinds compose into one grammatical form.** `HistoryKind` (`event-designator` | `word-designator` | `modifier`) are not parallel taxonomies of independent tokens; they are components of `![event][:word][:modifier…]`. A bare `^` or `:h` is not a zsh token in isolation. This distinguishes `history` from, say, `glob_op`, where each record *is* a standalone user-code token.
- **Corpus keys are templates, not literals.** `!n`, `!str`, `!-n`, `h [ digits ]`, `s/l/r[/]` — the `n` / `str` / `digits` stand for a syntactic class. `resolveHistory` parses the event-designator forms (matching `!42` to `!n`, `!vim` to `!str`, etc.); word-designator and modifier tokens (`:h3`, `gs/foo/bar/`) stay unresolved on purpose.
- **`classify` is context-free; word-designators and modifiers are not.** A token `0` or `a` is a history word-designator or modifier only *after* an event designator; in isolation it is not a history token at all. `resolveHistory` therefore restricts itself to event-designator forms (tokens starting with `!`, plus the `^str^repl` shorthand) — same "totality, not utility" posture as `param_expn`'s resolver.
- **In-expansion decomposition belongs in the analysis layer.** Hover/UI for the inner parts of `!!:1:h` needs a history-expansion fact kind in `src/analysis/`, not a richer classify resolver. This is a larger future direction; it does not block event-designator resolver work.
- **`kind` is the typed facet; surface it to consumers.** Search results carry `subKind` (populated from each record's `kind`) so the flat list of short keys isn't cryptic. `docDisplay` stays equal to `id` — the identity surface doesn't grow divergent-from-id cases beyond `option`.

## Parameter-expansion identity and shape

`param_expn` identity is the full sig (e.g. `${name:-word}`), not a leading operator — same precedent as redirections. `${name:-word}` and `${name-word}` are separate records, not sub-variants of a `:-` operator. This keeps identity mechanical: two sigs are equal iff the literal templates match.

- **`simpleResolver` kept for totality, not utility.** Sigs are literal doc templates; no user-code token will ever match them. The category is reached through search + describe rather than raw-token classification. Keeping a resolver in the per-category table preserves the closed-union completeness guards across `docs/corpus.ts`.
- **`subKind` is a fixed closed union, not a computed label.** Literal values; extending the union is a deliberate, single-point change that the type system propagates.
- **Placeholders are extracted via an exact-string table, not a regex.** The table is the single source of truth for both `subKind` and operand-slot names (`name`, `word`, `pattern`, `repl`, `spec`, `arrayname`, `offset`, `length`). Silent upstream renames trip an "unknown sig" throw on the next build — drift fails loudly at extraction time rather than rendering as garbage.
- **No raw-text resolver.** Considered and dropped: the added testing burden outweighed the zero practical value, given that sigs are template-shaped and won't appear in user code.

---

## Complex commands + alternate forms

`ComplexCommandDoc` models zsh's structured control-flow constructs parsed from `grammar.yo`'s "Complex Commands" section, with entries from "Alternate Forms For Complex Commands" attached as an `alternateForms` array.

- **Head-keyword identity.** Records are keyed by a closed `HeadKey` set — `if`, `for`, `for-arith`, `while`, `until`, `repeat`, `case`, `select`, `function`, `time`, `(`, `{`, `{try}always`, `[[`. Two `for` entries (`for name ... in ... do ... done` and `for (( ; ; )) do ... done`) are deliberate: the arithmetic form is structurally distinct enough that collapsing would cost clarity.
- **Array fields precedent.** `alternateForms: readonly AlternateForm[]` follows `ZshOption.flags` and `ParamExpnDoc.groupSigs` — variable-length composite data on a doc record. Each alternate carries its own `template` + `keywords` so renderers can present forms uniformly.
- **Classify-order placement: before `reserved_word`.** `classify("for")` returns the structured `complex_command` record, not the reserved-word boilerplate. `for`/`while`/`[[`/… overlap with `reserved_word` by design; the walk-order lets consumer layers absorb the ambiguity without restructuring the taxonomy. See `PRINCIPLES.md` §"Overlap between categories is accepted".

## Glob qualifiers vs glob flags vs glob operators

Three sibling categories under the `glob_*` prefix — the shared prefix is labelling, not ontological coupling. Each fits its own syntactic slot:

- `glob_op` — in-pattern meta-chars (`*`, `?`, `[...]`, `@(...)` et al.), with a `kind: "standard" | "ksh-like"` discriminator.
- `glob_flag` — the in-pattern `(#…)` marker (e.g. `(#i)`, `(#b)`), requires `EXTENDED_GLOB`.
- `glob_qualifier` — the trailing parenthesised form that *filters the match list* (e.g. `*(/)`, `*(#q@)`), keyed on single letters + multi-character variants like `%b` / `%c`.

The resolver for `glob_qualifier` reuses `parensAgnosticFlagResolver`; it accepts bare-letter, `(X)` under `BARE_GLOB_QUAL`, and `(#qX)` under `EXTENDED_GLOB`.

## Reserved word desc is optional

`ReservedWordDoc.desc` is `string | undefined` — and `ReservedWordDoc` deliberately does not extend `SyntaxDocBase` (where `desc` would be required).

- **Honesty over placeholder prose.** Heads covered by `complex_command` (e.g. `for`, `while`, `[[`) omit `desc` entirely. A fixed generic "this is a reserved word" string would be an epistemic trap: agents describing a `for` token would settle for the reserved-word record and miss the richer synopsis + alternateForms that live in `complex_command`.
- **Enriched prose where it pays.** Body words (`do`, `then`, `done`, …), alternate-form keywords (`foreach`, `end`), and standalone entries (`!`, `coproc`, the `typeset` family) each get a one-line per-word `desc`. The role classification is extractor-internal — no typed `role` field on the record, since no consumer today would dispatch on it.
- **Extractor role-table is the single source.** Drift-prone to stale prose; prefer editing the extractor's `ROLE` table over fan-out elsewhere.

---

## Casts (`as`)

See `AGENTS.md` for the full classification (principled vs smell) with examples. The key design-level point: the sanctioned brand crossing is the resolver layer. Everything else is either brand-mint (smart constructor) or symptom. Cross-brand casts outside these are a data-model smell.

---

## Data flow

Three consumption routes for the vendored `.yo` docs:

- **Programmatic API** (`loadCorpus()`) — runtime parsing into `DocCorpus`; cached.
- **Pre-parsed JSON** (`"./data/*.json"` package exports) — same data, pre-serialized.
- **Raw Yodl source** (`dist/data/zsh-docs/`) — for advanced consumers.

Per-category renderers are internal; the public API is `renderDoc`.

---

## Consumers of the tooldef layer

The static reference is wrapped into a framework-neutral tool layer (`@carlwr/zsh-core-tooldef`: pure `(DocCorpus, input) → output` impls plus `ToolDef` metadata). Three consumer packages today adapt that layer to different host protocols:

- **`@carlwr/zshref-mcp`** — a Model Context Protocol server over stdio; importable by any MCP client (Claude Desktop, VS Code's MCP support, Cursor, Codex CLI, etc.).
- **`zshref-rs/`** — a Rust+clap CLI (`zshref` bin) with one subcommand per `ToolDef`, emitting JSON on stdout. Pipe-friendly; same pure-tool surface as the MCP, bridged by reading the tool-def JSON baked into the binary at build time.
- **`vscode-better-zsh`** — the VS Code extension; registers the same tools as VS Code Language Model tools via `vscode.lm.registerTool`.

Three consumers justifies the tooldef extraction: at one or two, the shared layer is overhead; at three, collapsing per-adapter glue into a `toolDefs` walk pays for itself in both code and drift prevention — tool name, description, and input schema live in one place, every adapter picks them up automatically.

The remaining subsections are framed around the MCP specifically — the original second consumer and the most illustrative case; the rationale generalizes to the CLI (no-vscode posture, static-only scope) and to the extension's LM-tool registration.

## MCP as a consumer

`@carlwr/zshref-mcp` exposes the tooldef surface as Model Context Protocol tools.

### Consumer model generalizes beyond the editor

The A+B→C consumer-plumbing principle was written with the editor in mind. The MCP package instantiates it in a non-editor process: every consumer composes `resolve()` + `renderDoc()` + corpus iteration, and the MCP server's tool implementations are a short, type-safe ribbon over those primitives, serialized as JSON.

Consequently, zsh-core did **not** need a new "query API" for the MCP. It reuses:
- `resolve(corpus, cat, raw)` — the sanctioned brand crossing
- `resolveOption(corpus, raw)` — richer sibling that preserves `negated`
- `renderDoc(corpus, pieceId)` — markdown generation
- `loadCorpus()` — corpus loading via vendored `.yo`
- `docDisplay(cat, doc)` — human-friendly heading (made public for this reason)
- `docCategories` — iteration target

MCP-driven zsh-core changes have been purely additive exports of already-internal knowledge (`docDisplay`, `classifyOrder`, `docCategoryLabels`). No new endpoints, resolver patterns, or brand crossings — evidence that "static types + consumer plumbing" generalizes beyond the editor.

### Package boundaries and no-vscode rule

`@carlwr/zshref-mcp` **does not depend on `vscode`** (not even as a type-only import). The extension-side adapter that wires tool defs to `vscode.lm.registerTool` lives in `packages/vscode-better-zsh/src/zsh-ref-tools.ts`. Benefits:
- the MCP package is usable anywhere Node runs; users without VS Code can install via `npx @carlwr/zshref-mcp` (or a future homebrew/binary distribution) and wire it into any MCP-aware client
- the extension cost of the abstraction is one thin file: each adapter is <30 lines
- publish cadence decouples: zshref-mcp versions independently of the extension

A test in `packages/vscode-better-zsh/src/test/zsh-ref-tools.test.ts` asserts one-to-one correspondence (names + `inputSchema`) between `contributes.languageModelTools` in the extension manifest and `toolDefs` in `@carlwr/zsh-core-tooldef` (shared with MCP and CLI). Drift fails CI.

### Scope fence: "no execution, no environment access" as a product feature

The MCP's public pitch is "static zsh knowledge as MCP tools; no shell execution, no environment access." Advertised in the package description and tool `modelDescription` strings, enforced structurally: a test in `packages/zsh-core-tooldef/src/test/scope.test.ts` fails if any file under `src/tools/` imports `child_process`, network APIs, `node:fs`, `vscode`, or reads `process.env`. The VS Code extension and Rust CLI inherit the guarantee (extension via direct `toolDefs` import; CLI via the same definitions exported as JSON and baked into the binary). Adding a tool that legitimately needs these (none do today; none are planned) would require deliberately loosening the fence.

Rationale:
- existing shell-flavored MCP servers mostly involve execution; users searching for a "zsh MCP" will have execution expectations that we do not meet. Leaning into "static, read-only" distinguishes the package and sets correct expectations.
- execution-free tools have no trust boundary to defend; users can install the server without security review.

### Tool surface shape: not a mega-tool

`classify(raw)` is the universal entry point — the agent asks "what is this token?" and gets the first matching category. Per-category richer tools (currently `lookup_option`; future candidates) surface extra fields that don't fit a uniform classify response (e.g. option negation). This avoids the "one mega-tool with a `kind` enum" anti-pattern that some LM agents handle poorly, while also staying well clear of a per-category-tool sprawl. New tools should justify themselves against both extremes.

"List every record in a category" is deliberately a *mode* of `zsh_search` (empty `query` + `category` filter), not a dedicated `zsh_list` tool. The existing code path already returns the right shape (`{matches, matchesReturned, matchesTotal}`) and a corpus-margin test guarantees every category fits in one `MAX_LIMIT` response. A dedicated tool would duplicate the surface without adding capability; discoverability is addressed by promoting the mode in `searchToolDef.description` and by the suite-level `TOOL_SUITE_PREAMBLE` (rendered into MCP `instructions` and `zshref --help`).

### Tie-break in classify

`classify` walks `classifyOrder` (in zsh-core), which puts closed-identity resolvers before `option`'s `no_`-stripping and `redir`'s loose tail matching — otherwise `nocorrect` would shadow-resolve as "NO_CORRECT" with negation instead of the precmd/reserved-word it is. The ordering encodes resolver-shadowing facts, which are zsh-core knowledge; `classify` is a uniform walk.

### Fuzzy search rationale

`zsh_search` uses fuzzy matching with exact-and-prefix tiers, not exact-only. Reasons:

- Corpus identities aren't a stable API: canonical option names drift in case and underscoring under benign doc edits. Fuzzy decouples agent intent from current corpus spelling.
- Option names have no universal canonical form (`no_errreturn` vs `NOERRRETURN` — both plausible, neither "right"). The option resolver handles this per-option; fuzzy generalizes the same forgiveness across categories without corpus-aware resolvers.
- Exact + prefix tiers stay precise: literal id/display hits win outright; fuzzy only fires when earlier tiers miss.

Rendered markdown is withheld from search results to keep responses small and encourage composition with the describe/classify tools.

---

## CLI as a consumer

Symmetric to "MCP as a consumer" above. `zshref-rs/` wraps the same `toolDefs` surface as a Rust+clap CLI emitting JSON on stdout.

### Why a CLI adapter, given the MCP

MCP is an ~18-month-old protocol; POSIX CLIs have a 50-year backward-compat history. A CLI adapter is cheap insurance against protocol churn and a better fit for shell pipelines, air-gapped / Node-less environments, and single-binary distribution. The tooldef seam keeps the marginal cost small — see "Dynamic `clap::Command` assembly" below.

### Completions and `--help` as the agent interface

Two design consequences of "agents read the CLI the same way humans do — except more literally":

- `zshref completions {bash,zsh,fish,…}` emits sourceable completion scripts that embed closed-set enums as shell completion values. For agents this replaces "recall the valid categories" with "tab-expand them"; for humans it's the native shell UX. One feature, two audiences.
- Every subcommand's `--help` text comes from the shared `ToolDef.description` (MCP-primary prose, `zsh_*` rewritten to `zshref *`); `ToolDef.brief` / `flagBriefs` feed the narrower CLI columns where long prose would wrap badly. Rationale for the three-field split is in `packages/zsh-core-tooldef/DEVELOPMENT.md`.

`CLI-VISUAL-POLICY.md` captures the framework-neutral visual rules (stdout for JSON, stderr for prose, color gating, line-length discipline). The clap implementation follows it.

### Dynamic `clap::Command` assembly

`zshref-rs/src/cli.rs` walks `toolDefs` (JSON-exported from `@carlwr/zsh-core-tooldef`) at startup and builds the clap tree on the fly: subcommand names are tool names with `zsh_` stripped; per-flag clap types are inferred from the schema fragment (`category` enum → `PossibleValues`, integer with bounds → `u32` range, else `String`); `brief` → `about`, `description` → `long_about`, `flagBriefs[key]` → `help`. Adding a tool to `@carlwr/zsh-core-tooldef` automatically extends the CLI surface; the only CLI-side change is an entry in the Rust `dispatch` match. Drift is guarded — `cli::DOC_CATEGORIES`, `CATEGORY_FILES`, and `CLASSIFY_ORDER` are cross-checked against the canonical `index.json` emitted by zsh-core.

### Maintenance-mode posture

Re-vendoring cadence for the embedded corpus is years, not months. The CLI is shaped for that rhythm: single statically-linked binary with baked-in corpus (`include_bytes!`); dual-mode build (`zshref-rs/DATA-SYNC.md` option 6) auto-detects monorepo-source vs vendored-source; `make cli-package` validates the extraction path in CI; no runtime feature flags, plugin system, or user-supplied data paths. Expected durability is decade-scale, for the same reasons zsh itself has stayed stable.

### `zshref info` and fuzzy-score divergence

Two small CLI-only notes worth pinning:

- `zshref info` emits corpus metadata as JSON (package version, upstream zsh tag/commit/date, per-category counts, category list). CLI-only because MCP's `initialize` frames already carry equivalent metadata. New programmatic-introspection additions belong here rather than as `--version`-adjacent subcommands.
- The CLI uses an in-tree ASCII subsequence scorer (`src/fuzzy.rs`); the MCP uses `fuzzysort`. Fuzzy scores are not comparable across adapters. The shared-fixture integration test strips `score` fields before comparison and asserts on rank + identity only. The tradeoff (no third-party fuzzy dep in the Rust crate, same ordering in practice) is deliberate.

---

## Vendored `.yo` files are domain invariants

In practice, the vendored Yodl files only change if we re-vendor (every 10–20 years for a zsh upgrade). We do **not** design around continuous re-vendoring.

What *does* happen: extending functionality by vendoring in more `.yo` material. That is a static change to zsh-core and is **expected** to warrant updates to its static types.

Practical consequence: **properties of the vendored `.yo` files can be treated as domain invariants.**

---

## External input boundaries

- **Parse, don't validate.** At boundaries with external APIs (VS Code settings, filesystem, process env), parse raw values into domain types at the entry point. Everything downstream operates on parsed types.
- **Contain boundaries structurally.** The module that reads an external API is the sole reader. The module boundary *is* the policy.
- **Minimize the dangerous path.** The path from raw external input to the first strongly typed representation should be short and contained. Smart constructors at parse boundaries; no function accepts raw external values unless parsing is its explicit job.

---

## Hover UX for negated options

`resolveOption(corpus, raw)` returns `{ id, negated }`. `vscode-better-zsh` currently discards `negated` — hovering `setopt NO_AUTO_CD` shows the same markdown as `setopt AUTO_CD`. This is deliberately deferred; the correct UX (e.g. "AUTO_CD is being turned OFF") is a follow-up. The `setoptHover` path in `hover.ts` carries a comment marking this.

---

## Hover dispatch is procedural, not table-driven

A table-driven rewrite of `factBasedHover` has been attempted and rejected. It did not improve conciseness and weakened clarity — the `redir` case needs its own range calculation and group-op disambiguation; `process_subst` has a text-slice hoop; a uniform table broke the readability of per-fact-kind intent without a net win. `hover.ts` carries a `DON'T DELETE THIS COMMENT`-marked note recording this decision.

Parametric, table-driven shapes are useful where domain shape is genuinely uniform; not every axis of variation deserves to become a table.

---

## Syntax highlighting / semantic tokens

A complete custom zsh TextMate grammar is out of scope. Shell-script parsing is hairy, and tree-sitter — not TextMate — is the long-term future. So:

- Vendor the current sh/bash-focused VS Code TM grammar.
- **Offer some semantic tokens for parts of zsh syntax that happen to be parseable with reasonable effort.** Semantic tokens layer on top of TM scopes and hide imperfections.

Design choices:

- Baseline highlighting is the TM grammar; semantic tokens should be consistent with it where the TM grammar is correct.
- Map to specifically-qualified scopes (e.g. `keyword.operator.logical.binary.shell` rather than generic `keyword.operator.logical.shell`) — this gives users/themes override flexibility.
- `{` / `}` are emitted as `reserved-word` facts by analysis but *skipped* in the token provider (TM grammar already handles `f() { … }`; distinguishing block-`{` from word-`{` heuristically is non-trivial).
- `((` / `))` *are* emitted and get `keyword` tokens — reuses existing provider logic without a new token type.
- New token types weigh against needing matching `semanticTokenScopes` entries in `package.json`.

---

## Future directions

- **Programmatic discovery.** Iterate `docCategories`, access `corpus[K]`, inspect the map — all type-safe. The goal: a consumer that asks "what builtins are there?" gets a list whose every element carries a static proof of documentation. No "might not have docs" case to handle.
- **Rich fact-to-doc links.** `DocPieceId` is the natural return type if future analysis produces tighter fact→doc connections.
- **New doc categories.** Local additions to the taxonomy tables; the typechecker enforces completeness everywhere else.
- **Richer markdown rendering.** Internal `md*()` renderers can be enriched independently. An upgrade path is noted in `renderDoc`'s JSDoc for a future `level: "full" | "sig"` axis if multiple categories grow meaningful compact forms.
- **Environment-dependent introspection** may later be offered through agent-facing Language Model Tools, where agents explicitly opt in with clear caveats about side effects and env-specificity.

---

## History — original goals of the large type-strengthening refactor

For context only. The refactor that produced the current design was driven by:

- **Implicit taxonomy** — doc categories existed in many locations without a compile-time check of consistency.
- **Type-specialized proliferation** — per-category functions (`mdOpt`, `mdCondOp`, …), per-category loaders (`getOptions`, `getCondOps`, …), per-category provider fields, all duplicating structure.
- **Weak inter-domain connections** — no uniform way to go from "I know the category and id" to "give me the markdown."
- **No unified identity model** — each doc category used a different field name with no common abstraction.

Principles applied:

- Closed unions, smart constructors, parse-don't-validate.
- Branded types; narrowing.
- Parametric over type-specialized — one generic function where there were N category-specific variants. A primary driver.
- Less code at use sites beats net code reduction.
- Conceptual clarity through types, identifiers, file structure — not comments.

Non-goals:

- No new product features "for their own sake."
- No drift toward AST complexity.
- No markdown rendering for TBD categories (return `"TBD"`; keep the types total).
- No touching the "odd bird" of user-function docstrings — a separate extension feature outside the doc taxonomy.
