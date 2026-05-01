# Principles

Cross-cutting design principles. Read before designing new features, shaping a doc category, or touching adapter-facing surfaces. Subsystem rationale: [`DESIGN.md`](./DESIGN.md); contributor rules: [`AGENTS.md`](./AGENTS.md).

A social contract, not hard types. When a tradeoff genuinely shifts, edit. Leaving a rotted principle in place is the real harm.

---

## Scope

### What we know, what we don't

Static zsh knowledge is the product. We parse vendored Yodl into typed records describing what zsh elements *are*; we don't parse arbitrary user code.

- **Zsh-aware, not environment-aware.** Bundled static knowledge over host-shell probing. Environment-dependent data (`$commands`, `$aliases`, `$fpath` beyond system defaults) varies by machine and launch method — out of scope.
- **Mental model:** "if we could bundle a zsh binary and run it in an isolated container, we would." System zsh is invoked only where shell execution is intrinsically required (diagnostics, completion enrichment); otherwise bundled/static.
- analysis/: **Low-hanging fruit:** what line-local, corpus-aware logic can recognize. Everything else is silence.

### Resolver scope balance

Per-category resolvers bridge raw user text to documented identity. Corpus-aware close-variant normalization is in scope; arbitrary user-expression decomposition is not.

- **In:** strip `NO_` and underscores from an option name; accept `(#i)` and bare `i` for a glob flag; decompose a redirection token into group-op + tail.
- **Out:** extracting individual flags from an in-context parameter-expansion arg list like `(@rs:/:j[\])`. User-code parsing — a different problem class.

In-context tokenization, if it belongs anywhere, belongs in `src/analysis/`. Resolvers stop at "is this raw string a documented thing?".

### Resolver feedback (lossy normalization)

Resolution can be lossy: `setopt NO_AUTO_CD` resolves to `autocd`, discarding the `NO_` prefix that carries semantic meaning. The brand machinery keeps `Documented<K>` pure (corpus identity, nothing else); lossy bits surface via a separate parametric `resolverFeedback(corpus, cat, raw)` channel.

- **`resolve` and `Documented<K>` carry only identity.** No optional side-channels; no hidden state.
- **Per-category dispatch lives in zsh-core**, not in consumers. Tooldef stays parametric over `DocCategory` — no `if (cat === "option")` branches.
- **Structured, not prose.** `ResolverFeedback` is a closed `kind`-tagged union; consumers route programmatically and wording isn't API surface.

Current example: option inputs reached via `NO_`-stripping emit an `input-negated` kind. Future lossy resolvers extend the zsh-core union and tooldef + schema pick them up locally.

See DESIGN.md §"Resolver feedback channel".

---

## Facts and docs: asymmetric, not parallel

`src/docs/` (closed taxonomy, exhaustive over the corpus, parametric tables) and `src/analysis/` (line-local, best-effort, flat discriminated union of `Fact` kinds) are intentionally asymmetric:

- **`docs/` is exhaustive over a closed `DocCategory` taxonomy** with `DocCorpus`-keyed tables. Adding a category is a structural change with type-checked completeness everywhere.
- **`analysis/` is line-local and partial.** `Fact` kinds (`cmd-head`, `redir`, `func-decl`, …) overlap `DocCategory` only incidentally and don't share its parametric machinery.

The shapes serve different jobs — documentation is a closed corpus we enumerate; what user code asserts is open-ended and best-effort. Don't introduce parallel scaffolding.

Brand types `Observed<K>` and `Documented<K>` are the load-bearing connection: facts may carry `Observed<K>`; `Documented<K>` carries doc identity; the resolver layer bridges raw user text to documented identity. That's the only structural coupling the two domains need.

---

## Category ontology

### The category namespace is the primary classification axis

`DocCategory` is a closed union. Adding one commits a new ontological split; the type system and resolver dispatch enforce completeness. Closed-union dispatch is what the taxonomy is designed for.

New categories justify themselves when **both** syntactic form and context genuinely differ. `glob_op` / `glob_flag` / `glob_qualifier` is a canonical three-way split: different forms, different contexts (in-pattern, in-pattern, pattern-trailer), different semantics. A shared `glob_*` prefix is labelling, not ontological coupling.

### Category inflation cost

More categories mean more iterations for agents that list or walk — context tokens, reasoning tokens, latency. Prefer a subKind or typed field on an existing record when finer distinctions would otherwise multiply categories.

### Overlap between categories is accepted

zsh-core exposes every category uniformly. `reserved_word` overlaps `complex_command` on `for`/`if`/`while`; it overlaps `builtin` on the `typeset` family. Consumer-layer ordering resolves these — `classifyOrder` in zsh-core, consumed by tooldef, and fallback chains in extension hover. Resist restructuring the taxonomy to eliminate overlap; the resolver walk is where overlap cost belongs.

### Category roles: documentation-primary vs enumeration-primary

Doc categories serve one of two primary roles, and the distinction matters when reasoning about overlap, prose obligations, and consumer paths.

- **Documentation-primary** (the majority): each record is the canonical source of prose for its token. The category exists *because* that token type has documentation worth modelling structurally. The list is incidental — emitted for completeness, but the per-record markdown is the load-bearing artifact.
- **Enumeration-primary**: the *list itself* is the load-bearing artifact. Consumers iterate the corpus map to populate completions, syntactic-class checks, or enumeration-style tools; per-record prose is supplementary, often deliberately omitted when richer prose lives in a documentation-primary category that overlaps.

`reserved_word` is currently the only enumeration-primary category. `classifyOrder` encodes resolver-shadowing and product ordering; in important overlaps such as complex commands before reserved words, consumers walking the corpus reach the richer record first.

Not a separate type or interface — both roles use the same `DocCategory` machinery and `DocCorpus` map. It is design vocabulary: when adding a category, name the role explicitly and justify it against existing precedent.

---

## Category types

### Each category is almost its own type

`DocRecordMap[K]` is a custom shape per category. Field names read as domain vocabulary — `name` for builtin, `op` for cond_op, `sig` for redir, `flag` for glob_flag. A shared `id` field name would obscure, not clarify.

### Shared structural patterns are a plus when genuine

Compare new records against existing precedents. Array fields for composite data (`ZshOption.flags`, `ParamExpnDoc.groupSigs`), `SyntaxDocBase` extension for sig-shaped records, `args` arrays for parameterized flags — these recur because they model zsh's regularities. Follow when the domain calls for it; deviate when it doesn't.

### The structural identity invariant

Every record carries a branded identity field; field names vary, the invariant is uniform: `docId[cat](record) is Documented<K>`. `docId` is the single source of truth; there is deliberately no shared `DocRecordBase<K>` interface.

### Structural info beats markdown

Prefer typed structural fields (subKind, kind, requires, args) over encoding signals in markdown prose. Agents pay tokens for markdown; structured JSON is cheap, machine-routable, and survives format changes. Markdown explains; typed fields route.

---

## Tooldef + adapters

### Judge changes by extrapolation to unknown consumers

Tooldef is a library. Evaluate changes across host adapters and unknown third-party consumers. The asymmetric field budget (`brief`, `description`, `flagBriefs`, `inputSchema.properties[*].description`) exists because adapter surface budgets differ.

### Push decisions downstream

Decisions about inclusion, filtering, or formatting belong as close to the consumer as practical: adapter narrows tooldef, tooldef narrows zsh-core. Counterforce: over-parameterization bloats the per-call input surface. Balance consciously; default is "push downstream."

Counter-example: corpus-aware identity primitives (e.g. `lookupRaw`'s direct-or-resolver rule) live in zsh-core even though tooldef is currently the only consumer. They are properties of *the corpus*, not the tool surface — leaking them into tooldef forces every other consumer (including the Rust mirror) to re-implement the rule, multiplying mirror surface for no gain.

### Schema precision when schemas are co-released

When a schema is co-released with the artifact — regenerated by consumers when they update the producer — default to maximal precision: closed enums, conditional fields modeled, `additionalProperties: false`. Looseness-for-forward-compat applies to registry-style schemas consumed across version boundaries, not co-released ones; here looseness becomes consumer burden in type-generation and weakens drift detection. Both `inputSchema` and `outputSchema` follow. See DESIGN.md §"Output schemas (tooldef-owned)".

Domain-type optionality does not propagate across layers. Where a TS field is `field?: T`, the schema converts the optionality into per-branch required-or-forbidden via `oneOf` discrimination on `category`, not into a schema-level optional. Optionality in domain types is acceptable for genuinely sparse natural data (option aliases, builtin module dependencies, `ReservedWordDoc.desc` for heads owned elsewhere); the schema layer's job is to translate that into structural shape consumers can rely on without defaults.

### `--help` quality is a product feature for humans

Other CLI axes optimize for machines — JSON on stdout, exit codes, enum completions, stable schemas. `--help` optimizes for humans. A reader should not be sent elsewhere to understand a flag; per-flag help should be self-contained at the level of detail the flag warrants.
