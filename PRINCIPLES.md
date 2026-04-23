# Principles

Cross-cutting design principles for better-zsh. Read before designing new features, shaping a doc category, or touching adapter-facing surfaces. Subsystem-specific design rationale lives in [`DESIGN.md`](./DESIGN.md); contributor rules and workflow live in [`AGENTS.md`](./AGENTS.md).

These are a social contract, not hard types. When a tradeoff genuinely shifts — new consumer, assumption no longer holds, experience teaches otherwise — this file moves with it. Editing a principle is maintenance; leaving a rotted one in place is the real harm.

---

## Scope

### What we know, what we don't

Static zsh knowledge is the product. We parse vendored Yodl into typed records describing what zsh elements *are*; we don't try to parse arbitrary user code.

- **Zsh-aware, not environment-aware.** Bundled static knowledge over host-shell probing. Environment-dependent data (`$commands`, `$aliases`, `$fpath` beyond system defaults) varies by machine and launch method — out of scope for core features.
- **Mental model:** "if we could bundle a zsh binary and run it in an isolated container, we would." System zsh is invoked only where shell execution is intrinsically required (diagnostics, completion enrichment); otherwise bundled/static.
- **Low-hanging fruit:** recognize what can be recognized by line-local, corpus-aware logic. Everything else is silence.

### Resolver scope balance

Per-category resolvers bridge raw user text to documented identity. They may do corpus-aware close-variant normalization; they may not decompose arbitrary user expressions.

- **Right side:** stripping `NO_` and underscores from an option name; accepting `(#i)` as well as bare `i` for a glob flag; decomposing a redirection token into group-op + tail.
- **Wrong side:** extracting individual flags out of an in-context parameter-expansion argument list like `(@rs:/:j[\])`. That is user-code parsing, a different problem class, and out of scope.

In-context tokenization, where it belongs at all, belongs in `src/analysis/`. Resolvers stop at "is this raw string a documented thing?" and no further.

---

## Category ontology

### The category namespace is the primary classification axis

`DocCategory` is a closed union. Adding a category commits a new ontological split; the type system and resolver dispatch then enforce completeness across the codebase. Closed-union dispatch is what the taxonomy is designed for.

New categories justify themselves when **both** syntactic form and context genuinely differ. `glob_op` / `glob_flag` / `glob_qualifier` is a canonical three-way split: different forms, different contexts (in-pattern, in-pattern, pattern-trailer), different semantics. A shared `glob_*` prefix is labelling; it does not create ontological coupling that would force shared record shapes.

### Category inflation cost

More categories mean more iterations for agents that list or walk — context tokens, reasoning tokens, latency. Weigh new categories against that specific cost. Prefer a subKind or additional typed field on an existing record when finer distinctions would otherwise multiply categories.

### Overlap between categories is accepted

zsh-core exposes every category uniformly. Overlaps are legitimate: `reserved_word` overlaps `complex_command` on `for`, `if`, `while`; it overlaps `builtin` on the `typeset` family. Consumer-layer ordering resolves them — `classifyOrder` in the tooldef surface, fallback chains in extension hover. Resist restructuring the taxonomy to eliminate overlap; the classification walk is where overlap cost belongs.

---

## Category types

### Each category is almost its own type

`DocRecordMap[K]` is a custom shape per category. Field names should read as the domain's vocabulary — `name` for builtin, `op` for cond_op, `sig` for redir, `flag` for glob_flag. Forcing a shared `id` field name across categories would obscure rather than clarify.

### Shared structural patterns are a plus when genuine

Compare any new record against existing precedents. Array fields for composite data (`ZshOption.flags`, `ParamExpnDoc.groupSigs`), `SyntaxDocBase` extension for sig-shaped records, `args` arrays for parameterized flags — these patterns repeat because they model zsh's own regularities. Follow them when the domain calls for it; deviate when it doesn't.

### The structural identity invariant

Every record carries a branded identity field; field names are category-specific but the invariant is uniform: `docId[cat](record) is Documented<K>`. `docId` is the single source of truth for the mapping, and there is deliberately no shared `DocRecordBase<K>` interface that every record extends.

### Structural info beats markdown

Prefer typed structural fields (subKind, kind, requires, args) over encoding signals in markdown prose. Agents pay tokens for markdown; structured JSON is cheap, machine-routable, and survives format changes. Rendered markdown should explain; typed fields should route.

---

## Tooldef + adapters

### Judge changes by extrapolation to unknown consumers

Tooldef is a library. Current consumers are the MCP server, the Rust CLI, and the VS Code extension; unknown third-party consumers may arrive. Evaluate tooldef changes by reasoning through what each consumer — current and future — would see. The asymmetric field budget (`brief`, `description`, `flagBriefs`, `inputSchema.properties[*].description`) exists because adapter surface budgets differ; respect that when adding.

### Push decisions downstream

Decisions about what to include, filter, or format in output should live as close to the consumer as practical: adapter narrows tooldef, tooldef narrows zsh-core. Counterforce: over-parameterization bloats the per-call input surface and pushes configuration choices onto the caller. Balance consciously; the default is "push downstream."

### `--help` quality is a product feature for humans

Other CLI axes optimize for machines — JSON on stdout, exit codes, enum completions, stable schemas. `--help` optimizes for humans. A reader should not be sent elsewhere to understand a flag; per-flag help should be self-contained at the level of detail the flag warrants.
