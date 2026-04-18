# Design

**Why**, not what. This file complements the API docs (JSDoc in the d.ts rollups); the two should be read side by side. The d.ts tells consumers *what the API does*; this file tells contributors *why the design is shaped this way*.

Avoid duplicating what JSDoc already says (types, signatures, behavioral contracts). Refer to the relevant type or function JSDoc instead. This keeps the two in sync: if a function's behavior changes, only its JSDoc needs updating.

`AGENTS.md` covers contributor conventions, testing, tooling, and code style.

---

## What is `zsh-core`?

A standalone package of structured zsh knowledge. Parses vendored Yodl (`.yo`) doc files into typed records, extracts facts from user zsh code, and renders markdown. Nothing zsh-specific to the extension — `vscode-better-zsh` is one consumer. Future consumers (JSON exports, AI-facing tools) are expected.

Not a grammar, not a tokenizer. Zsh is not generally parseable without running zsh; we pick the low-hanging fruit that does not require shell execution and is useful for editor features.

---

## The three orthogonal domains — A / B / C

Every change should preserve this decomposition. It is visible in the directory layout (`src/docs/`, `src/analysis/`, `src/render/`), in the type surface, and in naming.

### A. Parsed Documentation (`src/docs/`)

Static vendored knowledge about zsh language elements. Organized into a **closed taxonomy** of 13 `DocCategory` values. Each category has:

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

1. **Raw** — user-code text. Untyped `string`.
2. **Observed** — normalized, category-shaped, corpus-blind. `Observed<K>`. Appropriate for fact extraction.
3. **Documented** — corpus-confirmed. `Documented<K>`. Produced by trusted corpus construction or the resolver layer.

The resolver layer bridges phases 2→3. Trying to bridge them inside phase-2 constructors is where the bugs lived in the previous design. The current architecture keeps them cleanly separated.

### Why `mkDocumented` is excluded from the public API

`mkDocumented` mints a `Documented<K>` without a corpus check. It is deliberately behind `"zsh-core/internal"` (not the `"."` export). Legitimate callers: Yodl extractors, the resolver layer, test-corpus builders. See the JSDoc on `Documented<K>` for the checked-vs-trusted distinction. **Do not re-export `mkDocumented` from the public surface.**

---

## API orthogonality — strong guiding principle

If an operation decomposes into A→B→C, prefer exporting A→B and B→C rather than also A→C, even when "almost all consumers need A→C." Consumers compose.

The rendering path is `raw string → DocPieceId → markdown` (`resolve` + `renderDoc`). No combined convenience function. Reasons:

1. `DocPieceId` is a first-class concept (type-safe corpus identity) — an A→C function hides it.
2. Two ways to do the same thing forces consumers to choose and encourages drift.
3. Each step has a crisp meaning: "is this in the corpus?" vs "render this known element."

Corpus-driven aggregation helpers (e.g. `refDocs`) are fine — they operate on already-known corpus records, not on hidden brand crossings.

Not an absolute ban. If post-refactor usage justifies a convenience wrapper, it should be a conscious addition.

---

## Why per-category resolvers

The raw→documented relationship has genuinely different shapes per category (`option` needs corpus-aware negation; `redir` decomposes composite tokens; most others are trivial lookup). A per-category resolver table lets each category carry its own logic while the public API stays uniform. Adding a new complex category is a local addition: drop a resolver entry, the public API picks it up automatically.

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

`docDisplay` is a small function (not a full table) because only `option` diverges — its `.display` preserves case and underscores for humans (`AUTO_CD`), while `.name` is the normalized lookup key (`autocd`). The other 12 categories' identity *is* their display. A full table would be 12 trivial entries delegating to `docId[cat]` plus one override.

`docId` is **internal** (not re-exported); `docDisplay` is **public** since consumer-side UIs (hovers, MCP tool responses, dump output) routinely need a human heading without redoing the per-category branching. `refs.ts` consumes `docId` via direct relative import.

---

## Redirection identity and auxiliary brands

Redirection identity is the full signature (see `RedirDoc` JSDoc), not the leading operator. Multiple docs share a `groupOp`; the redir resolver disambiguates by tail shape. This is why redirections need a corpus-aware resolver rather than simple lookup.

`OptFlag` and `RedirOp` are secondary-index brands — bucketing tokens for consumer-side lookup, not corpus identities. They don't participate in the `Observed`/`Documented` split.

---

## Casts (`as`)

See `AGENTS.md` for the full classification (principled vs smell) with examples. The key design-level point: the sanctioned brand crossing is the resolver layer. Everything else is either brand-mint (smart constructor) or symptom. Cross-brand casts outside these are a data-model smell.

---

## Data flow

Three consumption routes for the vendored `.yo` docs:

1. **Programmatic API** (`loadCorpus()`) — runtime parsing into `DocCorpus`; cached.
2. **Pre-parsed JSON** (`"./data/*.json"` package exports) — same data, pre-serialized.
3. **Raw Yodl source** (`dist/data/zsh-docs/`) — for advanced consumers.

Per-category renderers are internal; the public API is `renderDoc`.

---

## Scope philosophy

- "Pick the low-hanging fruit."
- We can't, in general, have zsh tokenize user files for us — that would require running user code. We only invoke `zsh -f` where actual shell execution is worth the host-dependent cost: diagnostics (`zsh -n`) and tokenization to enrich completions.
- **Zsh-aware, not environment-aware.** Static zsh knowledge (builtins, options, shell-managed parameters, parameter expansion flags, grammar) is preferred over probing the host shell — it's intrinsic to zsh, stable enough to bundle, and more consistent. Environment-dependent data (`$commands`, `$aliases`, `$fpath` beyond system defaults) is *not* used for core features: it varies by machine, launch method, editor, and target execution environment.
- **Mental model:** "if we could bundle a zsh binary and run it in an isolated container, we would." We use system zsh only where execution is intrinsic; otherwise bundled/static knowledge for consistency, startup latency, and smaller security surface.

---

## MCP as a consumer

`@carlwr/zshref-mcp` is a second consumer of `zsh-core` — alongside the extension — exposing a subset of the static reference as Model Context Protocol tools (stdio transport; importable by any MCP client: Claude Desktop, VS Code's MCP support, Cursor, Codex CLI, etc.). The extension also imports the package and registers the same tools as VS Code Language Model tools via `vscode.lm.registerTool`.

### Rephrasing the consumer model

The original consumer-plumbing principle was written with the editor in mind: "consumers plumb A+B→C procedurally." The MCP package doesn't invalidate it — it instantiates it in a non-editor process. *Every* consumer composes `resolve()` + `renderDoc()` + corpus iteration; the MCP server's tool implementations are a short, type-safe ribbon over those primitives, serialized as JSON.

Consequently, zsh-core did **not** need a new "query API" to support the MCP. The MCP reuses:
- `resolve(corpus, cat, raw)` — the sanctioned brand crossing
- `resolveOption(corpus, raw)` — richer sibling that preserves `negated`
- `renderDoc(corpus, pieceId)` — markdown generation
- `loadCorpus()` — corpus loading via vendored `.yo`
- `docDisplay(cat, doc)` — human-friendly heading (made public for this reason)
- `docCategories` — iteration target

The only zsh-core changes driven by the MCP have been additive exports of already-internal knowledge: `docDisplay`, `classifyOrder`, `docCategoryLabels`. No new endpoints, no new resolver patterns, no new brand crossings. This is evidence that the "static types + consumer plumbing" model generalizes beyond the editor.

### Package boundaries and no-vscode rule

`@carlwr/zshref-mcp` **does not depend on `vscode`** (not even as a type-only import). The extension-side adapter that wires tool defs to `vscode.lm.registerTool` lives in `packages/vscode-better-zsh/src/zsh-ref-tools.ts`. Benefits:
- the MCP package is usable anywhere Node runs; users without VS Code can install via `npx @carlwr/zshref-mcp` (or a future homebrew/binary distribution) and wire it into any MCP-aware client
- the extension cost of the abstraction is one thin file: each adapter is <30 lines
- publish cadence decouples: zshref-mcp versions independently of the extension

A test in `packages/vscode-better-zsh/src/test/zsh-ref-tools.test.ts` asserts that `contributes.languageModelTools` in the extension manifest and the `toolDefs` array in the MCP package stay in one-to-one correspondence (names + `inputSchema`). Drift fails CI.

### Scope fence: "no execution, no environment access" as a product feature

The MCP's public pitch is "static zsh knowledge as MCP tools; no shell execution, no environment access." This is advertised in the package description and the tool `modelDescription` strings. It is also enforced structurally: a test in `packages/zshref-mcp/src/test/scope.test.ts` fails if any file under `src/tools/` imports `child_process`, network APIs, or `node:fs`. Adding a tool that legitimately needs these (none do today; none are planned) would require loosening the fence deliberately, not by accident.

Rationale:
- existing shell-flavored MCP servers mostly involve execution; users searching for a "zsh MCP" will have execution expectations that we do not meet. Leaning into "static, read-only" distinguishes the package and sets correct expectations.
- execution-free tools have no trust boundary to defend; users can install the server without security review.

### Tool surface shape: not a mega-tool

`classify(raw)` is the universal entry point — the agent asks "what is this token?" and gets the first matching category. Per-category richer tools (currently `lookup_option`; future candidates) surface extra fields that don't fit a uniform classify response (e.g. option negation). This avoids the "one mega-tool with a `kind` enum" anti-pattern that some LM agents handle poorly, while also staying well clear of a 13-separate-tools sprawl. New tools should justify themselves against both extremes.

### Tie-break in classify

`classify` walks `classifyOrder` (in zsh-core), which puts closed-identity resolvers before `option`'s `no_`-stripping and `redir`'s loose tail matching — otherwise `nocorrect` would shadow-resolve as "NO_CORRECT" with negation instead of the precmd/reserved-word it is. The ordering encodes resolver-shadowing facts, which are zsh-core knowledge; `classify` is a uniform walk.

### Fuzzy search rationale

`zsh_search` uses fuzzy matching with exact-and-prefix tiers, not exact-only. Reasons:

- Corpus identities aren't a stable API: canonical option names drift in case and underscoring under benign doc edits. Fuzzy decouples agent intent from current corpus spelling.
- Option names have no universal canonical form (`no_errreturn` vs `NOERRRETURN` — both plausible, neither "right"). The option resolver handles this per-option; fuzzy generalizes the same forgiveness across categories without corpus-aware resolvers.
- Exact + prefix tiers stay precise: literal id/display hits win outright; fuzzy only fires when earlier tiers miss.

Rendered markdown is withheld from search results to keep responses small and encourage composition with the describe/classify tools.

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
