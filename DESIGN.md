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

Where a payload benefits from branding, it carries `Observed<K>` — **never** `Documented<K>`. Facts annotate syntax, not corpus membership.

Knows nothing about doc records or markdown rendering.

### C. Markdown Rendering (`src/render/`)

Doc records → human-readable markdown. Depends on A; orthogonal to B.

### Inter-domain wiring

Consumers plumb A+B→C:

- extension
- MCP server
- `zshref` CLI
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

## Brand semantics: `Observed<K>` and `Documented<K>`

Three phases:

- **raw** — user-code text; untyped `string`
- **`Observed<K>`** — normalized, category-shaped, not corpus-checked
- **`Documented<K>`** — corpus-confirmed

Brand contracts and acquisition paths (trusted `mkDocumented` vs checked `resolve`): JSDoc on `Observed<K>`, `Documented<K>` (`zsh-core/types`) plus the file-header block in `zsh-core/docs/brands.ts`. Below is **why** the split exists.

### Two brands, not one

- provenance
- trusted/untrusted boundary
- types that forbid conflating structurally different concepts

### Why normalization is shared but corpus-aware parse is not

Both brands share per-category normalization (the `norm` table in `brands.ts`); category-specific concerns requiring the corpus live in the per-category resolver, not in `mkObserved` / `mkDocumented`.

Key insight: `no_` handling is **corpus-dependent**.

- `NOTIFY` is an option
- `TIFY` is not
- stripping "NO" off `NOTIFY` gives a non-option

Only a step with corpus access can decide. Baking this into a smart constructor conflates normalization with membership checking and produces bugs that manifest only at lookup time.

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
- JSDoc on `ResolverFeedback` / `resolverFeedback`, `zsh-core/docs/resolver.ts`:
  - kinds
  - dispatch table
  - runtime list `resolverFeedbackKinds`
- "why parametric, not per-category APIs" — module-header block, same file

---

## Why `DocCategory` is a closed `as const` array

- `docCategories` — runtime list
- `DocCategory = typeof docCategories[number]`
- compile-time completeness guards (next to the tables they protect):
  - `_AssertClassifyOrder*` — `taxonomy.ts`
  - `_AssertDocCorpusKeys*` — `corpus.ts`
  - `_AssertResolverFeedbackKindsComplete` — `resolver.ts`
- `DocCorpus` — explicit interface (not just a mapped type) so IDE hover shows concrete fields

### Category-indexed artifacts belong in zsh-core

Any "one entry per `DocCategory`" table lives in zsh-core behind a structural completeness guard; consumers import it. Hand-maintained parallel lists drift silently when categories are added — neither tests nor types flag it. `DocCategory`-keyed tables turn that class of drift into a compile error.

---

## Per-category modeling

### Identity per record, display separately

Each record keeps its domain identity in a category-specific field:

- `name`
- `op`
- `flag`
- `key`
- `slug`

The parametric `docId` table gives uniform access without renaming fields. `docDisplay` is the public display function — divergence from id and consumer guidance: its JSDoc in `zsh-core/taxonomy`.

Ids are **shell-safe slugs** — printable ASCII, no whitespace, non-empty. The surface `sig`/`_display` fields keep the human-readable form (with spaces, placeholders). Invariants enforced by `packages/zsh-core/src/test/corpus-ascii.test.ts`.

### Redirection: shell-safe slug identity, sig surface

- Identity is `slug`, derived from `sig` by replacing whitespace with `_` (`>_word`, `<<[-]_word`). `sig` keeps the upstream form (`> word`).
- `groupOp` is the shared lookup bucket; the resolver disambiguates by tail — corpus-aware, not plain map lookup.
- Both forms round-trip through `docs`: direct on `slug`, close-variant resolver on `sig`.
- `OptFlag` and `RedirOp` are secondary-index brands outside the `Observed`/`Documented` split.

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
- **Corpus identity** — every record is `Documented<"reserved_word">`, reachable via `DocPieceId` like other categories.

Wiring:

- `pos: ReservedWordPos` distinguishes command-position vs broader `}` semantics
- analysis uses `ReservedWordFact` with `text: string`, not `Observed<"reserved_word">`
- extension hover tries `complex_command` first, then `reserved_word` — mirrors `classifyOrder`

**Layered consumption** — three slices of "the reserved-word list" stay **deliberately** separate:

- **Corpus** — manual list from Yodl; source for:
  - completions
  - MCP `list`/`search`
  - extra semantic-token painting (with `cmd-head`) for words the analyzer treats only as command heads (`declare`, `typeset`, …)
- **Analysis** — pinned `KEYWORD_HEADS` subset for command-position facts; narrower than corpus by design. Rationale + lock-in test: `analysis/line-facts.ts` and `src/test/analysis/`.
- **Extension** — semantic tokens: analyzer `reserved-word` facts **and** corpus-driven painting for manual reserved words in command position (`semantic-tokens.ts`).

### `subKind` is always-or-never per category

For every doc category, `docSubKind[c]` returns either `undefined` for every record or a non-empty string for every record — never mixed.

- Enforced corpus-wide: `packages/zsh-core/src/test/doc-sub-kind.test.ts`.
- Tool-layer schema consumption (per-category `oneOf` branching, no schema-level optionality): file-header JSDoc on `packages/zsh-core-tooldef/src/tools/shared/output-schema.ts`.

**Future work:** generalize to "per-category structural fields are always-or-never" so schemas encode presence structurally, not as blanket optionals. Fold tests and this section into one named invariant when a second concrete instance appears.

---

## Data flow

Vendored `.yo` is consumed three ways:

- **`loadCorpus()`** — runtime parse into `DocCorpus`; cacheable.
- **Pre-parsed JSON** (`"./data/*.json"`) — same records; markdown bodies pre-rendered at build time.
- **Raw Yodl** under `dist/data/zsh-docs/` — advanced consumers.

Per-category renderers are internal; public entry is `renderDoc`. The JSON export is a sibling consumer path (e.g. Rust `include_bytes!`); it stays in zsh-core for build convenience — package split deferred.

---

## Output schemas (tooldef-owned)

- Each `ToolDef` has `outputSchema` (JSON Schema 2020-12) next to its result type.
- Mechanical constraints — file-header JSDoc on `packages/zsh-core-tooldef/src/tools/shared/output-schema.ts`:
  - `$defs` shape
  - `subKind` always-or-never
  - feedback enum interpolation
- Cross-cutting "co-released schema precision" rationale: PRINCIPLES.md.
- Drift enforced by `output-schema-prop.test.ts` (fast-check + Ajv) and `parity.test.ts` (cross-language).

Hand-authored today; migrating to zod-derived schemas is a documented escape hatch if burden grows.

Per MCP spec, tools register `outputSchema`; responses include `structuredContent` for schema-aware clients while legacy clients still get JSON in `content[0].text`.

## Adapters of the shared tool surface

Three adapters over the same `toolDefs`:

- MCP
- VS Code LM
- Rust CLI

Adapters walk `toolDefs` and call `def.execute(corpus, input)`; nothing else.

Structural locks (each is the spec for its own claim):

- **Thin-adapter import allow-list** — `packages/zsh-core-tooldef/src/test/adapter-matrix.ts` (+ `.test.ts`). Forbidden in thin adapters:
  - `resolve`
  - `renderDoc`
  - analysis
- **VS Code LM manifest ↔ `toolDefs`** — `packages/vscode-better-zsh/src/test/zsh-ref-tools.test.ts`.
- **Tool-impl scope fence** — `packages/zsh-core-tooldef/src/test/scope.test.ts`.

Three tools, intent-split:

- `zsh_docs` — lookup with markdown body (unifies former classify/lookup/describe-style flows)
- `zsh_search` — fuzzy discovery
- `zsh_list` — enumeration

Notes:

- per-tool surface: `packages/zshref-mcp/README.md` Tools section
- `zsh_search` and `zsh_list` stay separate — "search with no query" would be a silent footgun
- uniform output envelope keeps adapters simple

Rejected alternatives:

- mega-tool with a `kind` enum
- one tool per category

## Parity surface units (TS ↔ Rust mirrors)

The Rust CLI re-implements a small surface; the rest is consumed via baked JSON.

- Source of truth: `packages/zsh-core-tooldef/src/test/parity-units.ts` (file header is the spec).
- Marker alignment (`// MIRRORED-IN:` / `// MIRROR-OF:`): `mirror-pairs.test.ts`.
- Behavioral parity (modulo the carved-out fuzzy tier): `parity.test.ts`.

## `lookupRaw`: direct ∥ resolver, direct preferred

`lookupRaw` (mechanism in JSDoc, `zsh-core/resolver`) is the single sanctioned way to combine direct corpus-key lookup with resolver fallback. **Do not** run both paths for the same query; **do not** re-implement the rule in consumers.

Direct precedence is load-bearing for template-key categories — the literal corpus key and the live token resolved through templates must not collide:

- `job_spec` — literal `%number` vs resolver's `%5 → %number`
- `history_expn` — `!n` vs `!42`
- `param_expn`
- `special_function` — direct hit `TRAPZERR` vs template `TRAPNAL`

Non-template categories miss direct lookup then resolve (`AUTO_CD` → `autocd`).

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
- round-trip — `packages/zsh-core-tooldef/src/test/round-trip.test.ts`
- Rust mirror — `parity-units.ts` (see above)

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

- `zshref-rs/README.md` — user-facing surface and conventions
- `zshref-rs/DATA-SYNC.md` — dual-mode build, bundled corpus
- `CLI-POLICY.md` — stream / color discipline

Tooldef keeps the marginal cost of "another adapter" low — dynamic `clap::Command` assembly walks the bundled tool-def JSON:

- subcommands = tool names minus `zsh_`
- flags from schema fragments
- `brief` / `description` / `flagBriefs` → clap help slots (three-field split: `packages/zsh-core-tooldef/DEVELOPMENT.md`)

Cross-adapter notes:

- **Fuzzy scores** — CLI uses an in-tree ASCII scorer; MCP uses `fuzzysort`. Not comparable cross-adapter; shared tests compare rank and identity only.
- **Corpus metadata** — `zshref info` and MCP `initialize` carry overlapping data.
- **`zshref schema`**:
  - emits `inputSchema` + `outputSchema` per tool as one JSON bundle for codegen/validation
  - no per-tool subcommand (would fight clap conventions); cherry-pick with `jq`
- **Maintenance posture**:
  - re-vendor cadence measured in years
  - no runtime plugins
  - `make cli-package` in CI

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
- `{` / `}` reserved-word facts are **skipped** in the token provider (TM already covers `f() { … }`; block-`{` vs word-`{` is hairy).
- `((` / `))` **are** tokenized as `keyword` — reuses existing provider paths.
- New token types need a matching semantic-token scope contribution in the extension manifest source.
