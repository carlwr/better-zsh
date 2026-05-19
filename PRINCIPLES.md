---
audience: maintainer
read-when: cross-cutting design tradeoffs
---

# Principles

Cross-cutting design principles. Read before:

- designing new features
- shaping a doc category
- touching adapter-facing surfaces

Subsystem rationale: `DESIGN.md`; contributor rules: `AGENTS.md`.

A social contract, not hard types. When a tradeoff genuinely shifts, edit. Leaving a rotted principle in place is the real harm.

---

## Scope

### What we know, what we don't

Static zsh knowledge is the product. We parse vendored Yodl into typed records describing what zsh elements *are*; we don't parse arbitrary user code.

- **Zsh-aware, not environment-aware.** Bundled static knowledge over host-shell probing. Environment-dependent data varies by machine and launch method — out of scope:
  - `$commands`
  - `$aliases`
  - `$fpath` beyond system defaults
- **Mental model:** "if we could bundle a zsh binary and run it in an isolated container, we would." System zsh is invoked only where shell execution is intrinsically required (diagnostics, completion enrichment); otherwise bundled/static.
- **`analysis/`:** low-hanging fruit — what bounded, static logic can recognize. Everything else is silence.

### Resolver scope balance

Per-category resolvers bridge raw user text to documented identity. Corpus-aware close-variant normalization is in scope; arbitrary user-expression decomposition is not.

- **In:**
  - strip `NO_` and underscores from an option name
  - accept `(#i)` and bare `i` for a glob flag
  - decompose a redirection token into group-op + tail
- **Out:** extracting individual flags from an in-context parameter-expansion arg list like `(@rs:/:j[\])`. User-code parsing — a different problem class.

In-context tokenization, if it belongs anywhere, belongs in `src/analysis/`. Resolvers stop at "is this raw string a documented thing?".

### Resolver feedback (lossy normalization)

Resolution can be lossy (`setopt NO_AUTO_CD` resolves to `autocd`). The brand machinery keeps `Documented<K>` pure; lossy bits surface via a separate parametric `resolverFeedback(corpus, cat, raw)` channel. JSDoc on `ResolverFeedback` / `resolverFeedback` in `zsh-core/resolver` covers:

- concrete kinds
- dispatch table
- "wording isn't API surface" framing

Cross-cutting principles:

- **`resolve` and `Documented<K>` carry only identity.** No optional side-channels, no hidden state.
- **Per-category dispatch lives in zsh-core**, not in consumers. Tooldef stays parametric over `DocCategory` — no `if (cat === "option")` branches.
- **Structured, not prose.** Closed `kind`-tagged union so consumers route programmatically.

See DESIGN.md.

---

## Facts and docs: asymmetric, not parallel

`src/docs/` and `src/analysis/` are intentionally asymmetric:

- **`docs/` is exhaustive over a closed `DocCategory` taxonomy** with `DocCorpus`-keyed tables. Adding a category is a structural change with type-checked completeness everywhere.
- **`analysis/` is partial.** Narrow document-spanning facts exist only when they reduce false positives without claiming a full parse. `Fact` kinds overlap `DocCategory` only incidentally and don't share its parametric machinery.

Different jobs:

- _documentation_ — a closed corpus we enumerate
- _what user code asserts_ — open-ended, best-effort

Don't introduce parallel scaffolding.

Brand types `Observed<K>` and `Documented<K>` are the load-bearing connection (see JSDoc in `zsh-core/types`):

- _facts_ may carry `Observed<K>`
- `Documented<K>` carries doc identity
- _the resolver layer_ bridges raw user text to documented identity

That's the only structural coupling the two domains need.

---

## Category ontology

### The category namespace is the primary classification axis

`DocCategory` is a closed union. Adding one commits a new ontological split; the type system and resolver dispatch enforce completeness. Closed-union dispatch is what the taxonomy is designed for.

New categories justify themselves when **both** syntactic form and context genuinely differ. `glob_op` / `glob_flag` / `glob_qualifier` is a canonical three-way split:

- different forms
- different contexts:
  - `glob_op`: in-pattern
  - `glob_flag`: in-pattern
  - `glob_qualifier`: pattern-trailer
- different semantics

A shared `glob_*` prefix is labelling, not ontological coupling.

### Category inflation cost

More categories mean more iterations for agents that list or walk:

- context tokens
- reasoning tokens
- latency

Prefer a subKind or typed field on an existing record when finer distinctions would otherwise multiply categories.

### Overlap between categories is accepted

zsh-core exposes every category uniformly. Examples of overlap:

- `reserved_word` ↔ `complex_command` on flow-control words (e.g. `for`)
- `reserved_word` ↔ `builtin` on the `typeset` family

Consumer-layer ordering resolves these:

- `classifyOrder` in zsh-core (consumed by tooldef)
- fallback chains in extension hover

Resist restructuring the taxonomy to eliminate overlap; the resolver walk is where overlap cost belongs.

### Category roles: documentation-primary vs enumeration-primary

Doc categories serve one of two primary roles. The distinction matters when reasoning about:

- overlap
- prose obligations
- consumer paths

- **Documentation-primary** (the majority): each record is the canonical source of prose for its token. The category exists *because* that token type has documentation worth modelling structurally. The list is incidental — emitted for completeness, but the per-record markdown is the load-bearing artifact.
- **Enumeration-primary**: the *list itself* is the load-bearing artifact. Consumers iterate the corpus map for:
  - completions
  - syntactic-class checks
  - enumeration-style tools

  Per-record prose is supplementary, often deliberately omitted when richer prose lives in a documentation-primary category that overlaps.

`reserved_word` is currently the only enumeration-primary category. `classifyOrder` encodes resolver-shadowing and product ordering; in important overlaps such as complex commands before reserved words, consumers walking the corpus reach the richer record first.

Not a separate type or interface — both roles use the same `DocCategory` machinery and `DocCorpus` map. It is design vocabulary: when adding a category, name the role explicitly and justify it against existing precedent.

---

## Category types

### Each category is almost its own type

`DocRecordMap[K]` is a custom shape per category. Field names read as domain vocabulary:

- `name` for builtin
- `op` for conditional_op
- `slug` for redirection
- `flag` for glob_flag

A shared `id` field name would obscure, not clarify. Per-category record shapes: JSDoc in `zsh-core/types`.

### Shared structural patterns are a plus when genuine

Existing precedents to compare new records against — recur because they model zsh's regularities:

- array fields for composite data (`ZshOption.flags`, `ParamExpnDoc.groupSigs`)
- `SyntaxDocBase` extension for sig-shaped records
- `args` arrays for parameterized flags

Follow when the domain calls for it; deviate when it doesn't.

### The structural identity invariant

Every record carries a branded identity field; field names vary, the invariant is uniform — `docId[cat](record) is Documented<K>`. `docId` (in `zsh-core/taxonomy`) is the single source of truth; there is deliberately no shared `DocRecordBase<K>` interface.

### Structural info beats markdown

Prefer typed structural fields over encoding signals in markdown prose. Examples:

- `subKind`
- `kind`
- `requires`
- `args`

Agents pay tokens for markdown. Structured JSON beats it on:

- cheap to emit
- machine-routable
- survives format changes

Markdown explains; typed fields route.

### Records are self-contained

One identity unit, one rendered markdown body. The ontology has no "see also" between records; consumers receive a self-contained body per identity unit.

A record's typed sub-payload (variable-length composite field) is *internal structure*, not navigation: when an upstream item documents an enumerated nested set whose members carry their own prose, capture it as a typed field on the record and let the renderer compose prose from it. The producer can grow richer shapes without consumers lifting navigation primitives.

### Parsers parse yodl; renderers may shape-infer

Two roles, two postures:

- **Parser:** captures what Yodl *literally says*. Item bodies, nested-list structure, header signatures, macro names — these are explicit signals. The parser preserves them as typed record fields and stops there.
- **Renderer:** may apply heuristics on shape and sequence — "a lone `em()` on its own paragraph behaves like a section heading" is a shape inference, not a parse fact. Heuristics belong in the renderer (or a render-time pre-pass), not in the extractors.

Why: parser output is the typed corpus and feeds every downstream consumer (TS, Rust, schemas). Heuristics in parsers leak into types and tests; renderers absorb heuristics without contaminating shapes.

Pragmatism carve-out: when shape inference *radically* simplifies code or removes large amounts of duplicated downstream logic, a parser-level heuristic is acceptable — but always with an in-code comment explaining the inference. Clear code beats a comment; a comment beats a hidden coupling.

---

## Tooldef + adapters

### Judge changes by extrapolation to unknown consumers

Tooldef is a library. Evaluate changes across host adapters and unknown third-party consumers. Adapter surface budgets differ — hence the asymmetric field budget:

- `brief`
- `description`
- `flagBriefs`
- `inputSchema.properties[*].description`

### Push decisions downstream

Decisions belong close to the consumer:

- inclusion
- filtering
- formatting

Adapter narrows tooldef, tooldef narrows zsh-core. Counterforce: over-parameterization bloats the per-call input surface. Balance consciously; default is "push downstream."

Counter-example: corpus-aware identity primitives (e.g. `lookupRaw`'s direct-or-resolver rule) live in zsh-core even though tooldef is the only current consumer. They are properties of *the corpus*, not the tool surface — leaking them into tooldef would force every other consumer (including the Rust mirror) to re-implement the rule, multiplying mirror surface for no gain.

### Schema precision when schemas are co-released

_Co-released_: regenerated by consumers when they update the producer. Default to maximal precision:

- closed enums
- conditional fields modeled
- `additionalProperties: false`

Looseness-for-forward-compat applies to registry-style schemas consumed across version boundaries, not co-released ones — here looseness becomes consumer burden in type-generation and weakens drift detection. Both `inputSchema` and `outputSchema` follow. See DESIGN.md.

Domain-type optionality does not propagate across layers. Where a TS field is `field?: T`, the schema converts the optionality into per-branch required-or-forbidden via `oneOf` discrimination on `category`, not into a schema-level optional. Optionality in domain types is acceptable for genuinely sparse natural data:

- option aliases
- builtin module dependencies
- `ReservedWordDoc.desc` for heads owned elsewhere

The schema layer translates that into structural shape consumers can rely on without defaults.

### `--help` quality is a product feature for humans

Other CLI axes optimize for machines:

- JSON on stdout
- exit codes
- enum completions
- stable schemas

`--help` optimizes for humans. A reader should not be sent elsewhere to understand a flag; per-flag help should be self-contained at the level of detail the flag warrants.
