---
audience: maintainer
read-when: subsystem rationale and design decisions
---

# Design

**Why**, not what — for subsystems. API rollups (JSDoc in the `.d.ts` files) describe *what* the public surface does; this file explains *why* subsystems are shaped as they are.

Layered docs:

- `PRINCIPLES.md` — cross-cutting principles
- `AGENTS.md` — contributor conventions entry point; links into topic files for universal patterns
- maintainer-doc index: `./scripts/list-maintainer-docs`

Don't duplicate JSDoc; point to it. If a rule already lives in PRINCIPLES or any contributor doc, **cross-link** instead of restating — same-layer repetition drifts.

---

## What is `zsh-core`?

A standalone package of structured zsh knowledge:

- parses vendored Yodl (`.yo`) into typed records
- extracts facts from user zsh code
- renders markdown

Surface and posture: `packages/zsh-core/README.md`. The static-scope guarantee is enforced — and described — by `packages/zsh-core/src/test/static-scope.test.ts`.

Not a grammar, not a tokenizer. Zsh is not generally parseable without running zsh; we take bounded, corpus-aware wins that do not require shell execution.

`src/analysis/` is conceptually separable from `src/docs/` + `src/render/` + JSON-dist artifacts. Splitting into two workspace packages was deferred: the static-scope test enforces the seam structurally; a separate package would add extraction config without payoff today.

---

## The three orthogonal domains — A / B / C

Every change should preserve this decomposition. It shows up in:

- directory layout (`src/docs/`, `src/analysis/`, `src/render/`)
- types
- naming

### A. Parsed Documentation (`src/docs/`)

Static vendored knowledge about zsh language elements. A **closed taxonomy** of `DocCategory` values (see `docCategories`). Each category has:

- A doc-record type per category (see `DocRecordMap` / per-category JSDoc).
- A branded corpus identity: `Documented<K>` — see brand semantics below.
- A map `DocCorpus[K]: ReadonlyMap<Documented<K>, Record>` parsed from `.yo`.

Knows nothing about user code. The universe of documented elements is statically enumerable from the corpus.

### B. Fact Extraction (`src/analysis/`)

Coarse, potentially overlapping annotations about user zsh code. A `Fact` discriminated union keyed by `FactKind` with confidence levels (`"hard"` / `"heuristic"`).

The term "fact" is load-bearing: facts are what the analyzer *asserts*, not a complete description. Analysis is best-effort and partial; no claim of exhaustiveness.

Payloads are raw text (`text: string`) or closed literal unions (`PrecmdName`) — **never** `Documented<K>`. Facts annotate syntax, not corpus membership.

Knows nothing about doc records or markdown rendering.

### C. Markdown Rendering (`src/render/`)

Doc records → human-readable markdown. Depends on A; orthogonal to B.

Bodies carry record content only; title (`recordTitle`) and category line (`categoryFooter`) are envelope data (`DocRecordId`, the JSON identity fields) that consumers compose — a hover, showing nothing else, appends both.

### Inter-domain wiring

Consumers plumb A+B→C:

- extension
- `zshref` CLI and `zshref-mcp` (the Rust crate)
- future wrappers

Composition:

- _facts_ identify what to look up
- _the corpus_ supplies content
- _rendering_ produces output

Dispatch stays in consumer code — partial and context-dependent. Example: a `cmd-head` fact might match:

- a builtin
- a precommand modifier
- a user function
- nothing

**zsh-core does not wire A+B→C internally.** No "candidate in, markdown out" convenience API; consumers compose `resolve()` + `renderDoc()`.

---

## Brand semantics: raw strings and `Documented<K>`

Two phases:

- **raw** — user-code text; untyped `string`
- **`Documented<K>`** — corpus-confirmed identity

`resolve` is the bridge: raw in, checked identity out. Brand contract and acquisition paths (trusted `mkDocumented` vs checked `resolve`): JSDoc on `Documented<K>` and `mkDocumented` (`zsh-core/types`).

### No intermediate brand

A "normalized, not corpus-checked" brand for user-code tokens was removed: no API accepted it, and its one instantiation collapsed to a closed literal union. Facts carry raw text (domain B); corpus-free normalization is `normalizeOptName`.

### Why the smart constructor is not corpus-aware

`mkDocumented` only normalizes (the `norm` table in `brands.ts`); anything needing the corpus lives in the per-category resolver.

Key insight: `no_` handling is **corpus-dependent**.

- `NOTIFY` is an option
- `TIFY` is not
- stripping "NO" off `NOTIFY` gives a non-option

Only a step with corpus access can decide. Baking this into a smart constructor conflates normalization with membership checking and produces bugs that manifest only at lookup time.

---

## API orthogonality — strong guiding principle

If an operation decomposes into A→B→C, export A→B and B→C, not also A→C, even when "almost all consumers need A→C." Consumers compose.

The rendering path is `raw string → DocRecordId → markdown` (`resolve` + `renderDoc`). No combined convenience function. Reasons:

- `DocRecordId` is a first-class concept (type-safe corpus identity); an A→C function hides it.
- Two ways to do the same thing force consumers to choose and encourage drift.
- Each step has a crisp meaning: "is this in the corpus?" vs "render this known element."

Corpus-driven aggregation helpers (`projectRecords`, the JSON projection) are fine — they operate on already-known records, not hidden brand crossings.

Not an absolute ban. A post-refactor convenience wrapper is fine as a conscious addition.

---

## Why per-category resolvers

raw→documented genuinely differs by category:

- `option` — corpus-aware negation.
- `redirection` — composite-token decomposition.
- `job_spec`, `special_function` — template + compositional fallback matching.
- Most others — trivial lookup.

Per-category resolver table:

- keeps logic local
- public API stays uniform
- new complexity = new table entry

---

## Resolver feedback channel

Authoritative homes:

- contract + identity/feedback split — PRINCIPLES.md
- JSDoc on `ResolverFeedback` / `ResolvedHit`, `zsh-core/docs/resolver.ts`:
  - kinds
  - where feedback rides (the `resolve` hit)
  - runtime list `resolverFeedbackKinds`
- "why one parametric entry, not per-category APIs" — module-header block, same file

---

## Why `DocCategory` is a closed `as const` array

One runtime list yields the type, iteration and every category-keyed mapped type, so completeness is a compile error rather than a test. Mechanics, and the guard for a runtime tuple whose order matters: `taxonomy.ts`.

### Category-indexed artifacts belong in zsh-core

Any "one entry per `DocCategory`" table lives in zsh-core behind a structural completeness guard; consumers import it. Hand-maintained parallel lists drift silently when categories are added — neither tests nor types flag it. `DocCategory`-keyed tables turn that class of drift into a compile error.

---

## Per-category modeling

### Identity per record, display separately

Category-specific identity fields behind the parametric `docId` table: `PRINCIPLES.md` §"Category types". `docDisplay` is the public display function — divergence from id and consumer guidance: its JSDoc in `zsh-core/taxonomy`.

Ids are **shell-safe slugs** — printable ASCII, no whitespace, non-empty. The surface `sig`/`_display` fields keep the human-readable form (with spaces, placeholders). Invariants enforced by `packages/zsh-core/src/test/corpus-ascii.test.ts`.

### Redirection: shell-safe slug identity, sig surface

- Identity is `slug`, derived from `sig` by replacing whitespace with `_` (`>_word`, `<<[-]_word`). `sig` keeps the upstream form (`> word`).
- `groupOp` is the shared lookup bucket: the longest `groupOp` prefixing the token wins (zsh lexes the longest operator — `>&` never falls back to `>`), then the resolver disambiguates by tail — corpus-aware, not plain map lookup.
- Both forms round-trip through `docs`: direct on `slug`, close-variant resolver on `sig`.
- `OptFlag` and `RedirOp` are secondary-index brands, not `Documented<K>` identities.

### History expansion: grammar components, not independent tokens

`history_expn` resembles short-key categories structurally but models **components** of `![event][:word][:modifier…]`, not parallel standalone tokens. A bare `^` or `:h` is not a zsh token in isolation — unlike `glob_op`, where each record is a single user-code token.

- **Corpus keys are templates** (`!n`, `!str`, `h`, …). For modifiers, the id is the bare letter (`h`) and `sig` keeps the documented form (`h [ digits ]`).
- **`resolveHistory` is intentionally narrow** — event-designators only (same "totality, not utility" posture as `param_expn`); details and the future-`src/analysis/` placement: its JSDoc in `zsh-core/resolver`.
- **`kind` is the typed facet** — search exposes `subKind` from each record's `kind`.

### Parameter-expansion identity and shape

Identity is the full sig (e.g. `${name:-word}` vs `${name-word}` as distinct records) — sigs are already shell-safe slugs (printable ASCII, no whitespace). Record details: `ParamExpnDoc` / `ParamExpnSubKind` JSDoc in `zsh-core/types`.

- **Trivial resolver for totality** — sigs are literal templates; the resolver entry exists only to keep completeness guards closed. `param_expn` entry comment in `zsh-core/resolver`.
- **Placeholders via an exact-string table** — one source of truth for `subKind` and operand-slot names; bad renames fail at extraction, not as garbage markdown.
- **No raw-text resolver** — considered and dropped (testing cost, no practical lookup win).

### Complex commands + alternate forms

`ComplexCommandDoc` models `grammar.yo` "Complex Commands" plus "Alternate Forms". Record shape and the `reserved_word` / `classifyOrder` overlap: `ComplexCommandDoc` / `AlternateForm` JSDoc in `zsh-core/types`.

- **Head-keyword identity** — closed key set; `for` and arithmetic `for ((…))` stay separate records to preserve structure.
- **`alternateForms: readonly AlternateForm[]`** — variable-length composite data on one record (precedent: `ZshOption.flags`, `ParamExpnDoc.groupSigs`).

### Glob qualifiers vs glob flags vs glob operators

Three sibling categories under `glob_*` — shared prefix is labelling only:

- `glob_op` — in-pattern metacharacters; `kind: "standard" | "ksh-like"`
- `glob_flag` — in-pattern `(#…)`; needs `EXTENDED_GLOB`
- `glob_qualifier` — pattern-trailing parenthesised filters; letter and multi-char keys

Per-type details and the three-way distinction — JSDoc in `zsh-core/types`:

- `GlobOpDoc`
- `GlobFlagDoc`
- `GlobQualifierDoc`

`glob_qualifier`'s resolver reuses parenthesis-agnostic flag machinery:

- bare letter
- `(X)` when allowed
- `(#qX)` when extended glob is on

### Reserved word: an enumeration-primary doc category

`reserved_word` is the enumeration-primary category (see PRINCIPLES.md). One record type does three jobs:

- **Enumeration source** — corpus map is the authoritative reserved-word list for:
  - completions
  - `list`
  - syntactic checks
- **Supplementary prose** — `desc` may appear except on `complex_command`-owned heads (which deliberately omit it). Epistemic-trap rationale + `SyntaxDocBase` non-extension: `ReservedWordDoc` JSDoc in `zsh-core/types`.
- **Corpus identity** — every record is `Documented<"reserved_word">`, reachable via `DocRecordId` like other categories.

Wiring:

- `pos: ReservedWordPos` distinguishes command-position vs broader `}` semantics
- analysis uses `ReservedWordFact` with raw `text: string`; no corpus-identity brand
- extension hover tries `complex_command` first, then `reserved_word` — mirrors `classifyOrder`

**Layered consumption** — three slices of "the reserved-word list" stay **deliberately** separate:

- **Corpus** — manual list from Yodl; source for:
  - completions
  - MCP `list`/`search`
  - extra semantic-token painting (with `cmd-head`) for words the analyzer treats only as command heads (`declare`, `typeset`, …)
- **Analysis** — pinned `KEYWORD_HEADS` subset for command-position facts; narrower than corpus by design. Rationale + lock-in test: `analysis/line-facts.ts` and `src/test/analysis/`.
- **Extension** — semantic tokens: analyzer `reserved-word` facts **and** corpus-driven painting for manual reserved words in command position (`semantic-tokens.ts`).

### ZLE widget: default bindings are typed, not a header signature

The manual's header groups (`(^B ESC-[D) (unbound) (unbound)`) are per-keymap default bindings, not a usage signature — lifted into `defaultBindings`; the record carries no `sig`. Shape and edge cases (`Text Objects`, `self-insert` prose): `ZleWidgetDoc` / `ZleDefaultBinding` JSDoc in `zsh-core/types`.

- **Keys stay in the manual's notation** (`^B`, `ESC-[D`) — lossless; `bindkey` syntax is a consumer or renderer concern.
- **Rendered as one labeled paragraph** — a `bindkey`-form head was rejected: it needs notation translation plus shell quoting, and ranges (`digit-argument`) and prose (`self-insert`) have no `bindkey` form.

### `subKind` is always-or-never per category

Per doc category, `subKindOf` returns `undefined` for every record or a non-empty string for every record — never mixed.

- Enforced corpus-wide: `packages/zsh-core/src/test/doc-sub-kind.test.ts`.
- Release-schema consumption (`_subKind` required with a closed enum, or absent, per category): `packages/zsh-core/scripts/build-schema.ts`.
- Tool-layer schema consumption (per-category `oneOf` branching, no schema-level optionality): `zshref-rs/src/tools/schema.rs`.

**Future work:** generalize to "per-category structural fields are always-or-never" so schemas encode presence structurally, not as blanket optionals. Fold tests and this section into one named invariant when a second concrete instance appears.

---

## Data flow

Vendored `.yo` is consumed three ways:

- **`loadCorpus()`** — runtime parse into `DocCorpus`; lazy per category, cached (its JSDoc). Rendering measured cheap for the whole corpus, so it stays unmemoized — PRINCIPLES.md §"Cost and laziness".
- **Pre-parsed JSON** — same records; markdown bodies pre-rendered at build time. Distribution: `PACKAGING.md`.
  - _schema:_ one bundle, generated from the TS types plus the corpus (`packages/zsh-core/scripts/build-schema.ts`)
    - `$defs` are named by category (`recordsSchemaDefs` in `json-artifacts.ts`), never by TS type
    - draft 2020-12, as the crate's tool schemas
    - precision posture: PRINCIPLES.md §"Schema precision when schemas are co-released"
- **Raw Yodl** under `dist/data/zsh-docs/` — advanced consumers.

Per-category renderers are internal; public entry is `renderDoc`. The JSON stays in zsh-core for build convenience — package split deferred.

### Why the library parses at runtime

The TS API is the root; the JSON is a derived view of it, for consumers that cannot run the TypeScript — renderer and resolvers included (e.g. Rust `include_bytes!`). Library consumers parse the vendored Yodl at runtime; loading a pre-parsed corpus instead was considered and rejected — the instance of PRINCIPLES.md §"Cross-project structure" (derived data, committed files) and §"Cost and laziness":

- the vendored `.yo` is committed; a generated corpus is not — JSR publishes only the former, and tests and scripts run on an unbuilt checkout, so the runtime would need a parse fallback
- the projection is a seam: the JSON may lag, omit or reshape without touching the runtime API
- parse cost is met by per-category laziness, not by shipping a different form

Parser and renderer are layered: the parser may capture structure the renderer chooses to flatten or compose. Rendered markdown is the byte-equal contract surface; record-shape changes (new typed fields) stay below it until they cross into the wire schema. Records carry prose twice — typed fields for routing, `_mdBody` for reading — roughly a third to a half of the payload; accepted. Cross-cutting "records are self-contained" framing: PRINCIPLES.md.

---

## Output schemas (crate-owned)

- Each tool's `outputSchema` is generated in the `zshref` crate beside its implementation (`src/tools/schema.rs`).
- `subKind` enums and the record total come from the loaded corpus; feedback kind schemas from `index.json`.
- Cross-cutting "co-released schema precision" rationale: PRINCIPLES.md.
- Drift enforced at test time: every tool response the crate's test suite sees is validated against its schema (`zshref-rs/tests/common/`).

Per MCP spec, tools register `outputSchema`; responses include `structuredContent` for schema-aware clients while legacy clients still get JSON in `content[0].text`.

## Adapters of the shared tool surface

Two adapters over the same `ToolSet`, both in the `zshref` crate: the CLI and the MCP server.

Adapters walk the tool set (`src/tools.rs`) and dispatch through it; nothing else — one shared request path, `Tool::call`.

Structural lock on the tool layer (the spec for its own claim): **scope fence** — `zshref-rs/tests/scope_fence.rs`.

Tools are intent-split — lookup with markdown body, fuzzy discovery, enumeration — and stay separate: "search with no query" would be a silent footgun. A uniform output envelope keeps adapters simple. Per-tool surface: `zshref-rs/README.md`.

Rejected alternatives:

- mega-tool with a `kind` enum
- one tool per category

One crate with a lib target and two bins; rejected shapes:

- the MCP as its own crate or repo over a `zshref` lib: a public lib API to semver for one consumer; three version bumps per change
- a TS MCP fed by a Rust-emitted metadata artifact: two behaviour implementations, so an oracle is still needed
- prose and limits as committed YAML + JSON Schema: one consumer once the MCP is Rust; constants and strings in Rust are the source

## TS ↔ Rust mirrors

The Rust crate re-implements one behaviour — the resolvers; the rest it consumes as baked JSON.

- Markers (`// MIRRORED-IN:` / `// MIRROR-OF:`) on the mirrored pairs (resolvers, record-field projection): orientation, no mechanical check.
- Resolver conformance: the fixture zsh-core releases beside the corpus JSON (`packages/zsh-core/scripts/resolver-fixture.ts`), replayed in-crate by `zshref-rs/src/resolver.rs`.

The mirror is accepted because it is bounded — it changes only with categories or normalization rules, and drifts visibly against the fixture (principle: `PRINCIPLES.md` §"Cross-project structure"). Rejected ways to remove it:

- resolvers as data: a table or pattern format expressive enough for the template categories is a custom DSL, and specifying, testing and tooling one costs more than a bounded dual implementation
- zsh-core in Rust: Yodl parsing and the data model are substantial, the extension needs TS, the package's audience (IDE- and agent-adjacent tooling) is TS-centric, and the deliverable to Rust is already data

## `resolve`: direct ∥ resolver, direct preferred

`resolve` (`zsh-core/resolver`) is the one entry: direct corpus-key lookup, then the category's resolver, one hit carrying identity and feedback. Its JSDoc holds the mechanism and why direct precedence is load-bearing for template-key categories (`!n` vs `!42 → !n`). **Do not** run the paths separately for the same query; **do not** re-implement the rule in consumers.

### Resolver input is wider than the id set

The `zsh_docs` input parameter is intentionally named `key`, not `id`. The resolver entry is permissive — all of these resolve through it:

- raw zsh tokens — `AUTO_CD`, `<<<`
- close-variant surface forms with whitespace — `> word`
- canonical ids — `autocd`

Inputs that fall outside the id charset (whitespace, etc.) are not errors; they are normal resolver input and yield 0 matches when nothing resolves.

The contract on the canonical-id subset is tight:

- every `id` returned by any tool is shell-safe (printable ASCII, no whitespace)
- re-feeding such an `id` as `key` is guaranteed to resolve: ≥1 match overall, ≤1 per category
- with `category` set to the resolved category, the returned `id` equals the input

Enforcement:

- charset — `packages/zsh-core/src/test/corpus-ascii.test.ts`
- round-trip — `packages/zsh-core/src/test/resolver.test.ts` (TS), `zshref-rs/tests/cli_invariants.rs` (Rust)

## Tie-break in docs

With `category` omitted, `zsh_docs` walks `classifyOrder` so tight identity resolvers beat `option`'s `no_` stripping and `redirection`'s loose matching — e.g. `nocorrect` must not shadow-resolve as a negated option. Ordering and per-entry rationale: inline comments on `classifyOrderTuple` in `zsh-core/taxonomy.ts`.

## Fuzzy search rationale

`zsh_search` walks four tiers — exact → resolver → prefix → fuzzy.

- Earlier tiers score `1.0`; fuzzy is `< 1.0`. `SearchMatch.score` is always set so consumers know the tier.
- Id-only tools (`zsh_search`, `zsh_list`) omit rendered markdown; compose with `zsh_docs` for bodies.

Why fuzzy at all:

- Corpus spelling of identities can drift benignly — fuzzy decouples agent intent from exact strings.
- Option shapes vary (`no_errreturn` vs `NOERRRETURN`). Resolver handles the category-specific cases; fuzzy covers the rest.

---

## CLI as a consumer

External coverage:

- `zshref-rs/README.md`
- `zshref-rs/DATA-SYNC.md`
- `CLI-POLICY.md`

Rust, not a TS CLI: several TS CLI frameworks were tried and each fought `--help` quality (`PRINCIPLES.md`); clap did not. A small, fast, self-contained binary is the product for a tool agents invoke hundreds of times per session; single-binary TS routes give large binaries and slow startup.

The tool set keeps the marginal cost of "another adapter" low — the CLI assembles its `clap::Command` by walking it (`zshref-rs/src/cli.rs`), tool and field prose included.

Cross-adapter notes:

- **Corpus metadata** — `zshref info`; MCP `initialize` carries only the suite preamble (`instructions`) and the crate version.
- **`zshref schema`** — one bundle, no per-tool subcommand: that would fight clap conventions.
- **Maintenance posture**:
  - re-vendor cadence measured in years
  - no runtime plugins

---

## Vendored `.yo` files are domain invariants

Vendored Yodl changes only on re-vendor / zsh upgrade; extending what we vendor is a **static** zsh-core change and may require type updates. **Treat properties of vendored `.yo` as domain invariants** when reasoning about extractors and tests.

---

## External input boundaries

- VS Code APIs
- filesystem
- process env

Posture:

- **parse, don't validate** downstream
- convert to domain types at the entry module
- keep the dangerous path short

The module that reads an external API is the policy owner.

---

## Hover dispatch is procedural, not table-driven

A table-driven rewrite was tried and rejected. Pinning comment in `packages/vscode-better-zsh/src/editor/hover.ts` (carries the "DON'T DELETE THIS COMMENT" marker). Parametric tables fit uniform domains, not every variation.

---

## Syntax highlighting / semantic tokens

Full custom zsh TextMate grammar is out of scope; tree-sitter is the long-term direction. Today:

- Vendor the stock sh/bash TM grammar; add **semantic tokens** only where static analysis is reliable.
- Stay consistent with TM where TM is right; prefer specifically qualified TextMate scope names for theme overrides.
- Delimiter-like reserved-word facts (`{`, `[[`, …) are **skipped** in the token provider: TM already covers them, and block-`{` vs word-`{` is hairy.
- Token types, modifiers and their TM scope mapping are declared together in the extension's manifest source.
