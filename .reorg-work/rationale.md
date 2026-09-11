# Rationale

Describes the repo as of the tag `pre-reorg`; paths, identifiers and counts are as of then.

## What the maintainer wants

The yardstick for "is this drastic reorg, deleting things that took real effort, what the maintainer wants?":

- drivers:
  - own experimentation and learning
  - exhibits to point at: the agent-oriented project infrastructure (guidelines, discovery scripts, skills), `CLI-POLICY.md`, one behaviour delivered as both a CLI and an MCP server
- built for stability over time: implementation effort once, then version bumps for years; uptake expected limited but not zero; feature and bug-fix work continues for some time after release
- post-release maintenance must be cheap; the expensive thing is re-understanding a non-natural organization — a well-organized, easy-to-understand overall structure outranks preserving effort already spent
- one organization at a time: no "current" and "planned" descriptions kept in parallel; extraction concerns are handled when an extraction actually happens
- generated artifacts are never committed; committing must always be possible
- `zsh-core` is the future-proof part: structured zsh knowledge, as a rich TS API and as JSON with schemas
- `zshref` is the main surface: a picky, agent-optimized CLI. Rust because several TS CLI frameworks were tried and each fought `--help` quality; clap did not, and gives a stable, fast, small, self-contained binary
- an NLP retrieval showcase over the corpus — an SPA running in the browser — is wanted; NLP inside the CLI is not
- the NLP eval and tuning tooling was built for a reason and is kept
- the extension is the least important subproject, not unimportant; giving up its LM tools is acceptable — the MCP serves that need
- "dependencies are better than peers": two peers under a parity invariant have no clear owner of it; with a dependency the depender claims parity and owns the test
- a shared source of truth gives parity by construction; "byte-identical" was a testing convenience, never a policy
- investing now is fine if it lands non-trivially better: easier to work with until release, at release, and above all after

## The problem

- "project messiness" = cross-project coupling:
  - artifact freshness
  - env-var-guarded cross-project builds
  - double-build avoidance
  - illegal monorepo states
  - tests for build chains
  - a root Makefile bridging two toolchains
- the machinery is well built; the need for it is the smell
- cause, as found: structural — behaviour crossing the language boundary in both directions, a diamond, and peers held equal by parity tests that no single party owns

## The shape before

```
zsh-core ─dist(ws)─▶ zsh-core-tooldef ─dist(ws)─▶ zshref-mcp ─▶ npm+JSR
   │                     ├─dist(ws, bundled)─▶ vscode-better-zsh [LM tools]
   │                     └─tooldef.json (include_bytes! / make vendor)─▶ zshref-rs
   ├─dist(ws, bundled)─▶ vscode-better-zsh [hover, completion, tokens]
   ├─artifacts/json (include_bytes! / make vendor)─▶ zshref-rs ─▶ crates.io
   └─zsh-core-json.tar.gz ─▶ GitHub Release (no consumer yet)
zshref-rs ─release binary spawned─▶ tooldef parity.test.ts   (TS re-implements the Rust build-input hash)
zshref-rs [nlp] ─index, rules, fixtures; binary as freshness oracle─▶ zshref-web
```

Load-bearing facts:

- tooldef: ~750 LOC data (prose, schemas, limits, envelope types), ~400 LOC behaviour (~150 of algorithm), ~1900 LOC tests
  - Rust consumed the data half only and hand-mirrored the behaviour; parity was tested, not shared
- `tooldef.json` baked zsh-core facts in (record count as a schema maximum, category enums): two artifacts from two producers that had to agree — a diamond (defined below)
- the TS MCP was ~80 LOC over `execute`: tooldef did its job of making TS adapters thin; it is removed for other reasons
  - `zshref batch` was the same shape over `tools::dispatch` — a Rust MCP is protocol glue only
- of six mirror units, two were zsh-core's (resolver, record-fields) — those remain whatever happens to tooldef
- tool parity compared structure, not bytes: scores stripped; fuzzy tier and `matchesTotal` excluded. Byte-identity held for the web ranker fixture and the fingerprints
- three freshness systems: TS build stamps; the Rust build-input hash (build script + `_selfcheck`); a TS re-implementation of the latter for the parity gate
- the SPA used nothing of the tool layer; it consumed the nlp index — the only reason for the `zshref → zshref-web` arrow
- the Rust nlp module: about half product path, half tuning/eval tooling
  - its embedder (fastembed) differed from the browser's (transformers.js) and was excluded from parity
- three repo extractions were documented and partly pre-applied: `REPO-SHAPE.md` carried both timelines, each candidate had an `EXTRACTION.md`, user-facing READMEs already linked to the future repo names
- tooldef's footprint in build/CI plumbing was small; its product footprint was load-bearing: sole source for the clap surface, MCP instructions and the LM manifest

## Diagnosis

Terms:

- _language crossing_: an edge between a TS and a Rust component
  - a data crossing (JSON + schema) costs a schema and a version pin
  - a behaviour crossing costs a mirror implementation, a parity mechanism, and typically a binary used as the other side's oracle
- _diamond_: one consumer depending on two producers that must agree, one being derived from the other
  - consistency becomes an invariant the consumer must verify on every update — an undesired shape in general
  - cure: a single upstream; the derived producer either merges into the root or into the consumer
- _peers vs dependencies_: the maintainer's principle above; a parity test between peers is a parent asserting they agree

Crossings before and after — one line per crossing:

```
before   TS zsh-core ──data: corpus JSON ───────────────────────────────▶ Rust zshref
         TS zsh-core ──behaviour: resolvers (mirror) ───────────────────▶ Rust zshref
         TS tooldef  ──data: tool metadata JSON ────────────────────────▶ Rust zshref
         TS tooldef  ──behaviour: tool semantics (mirror) ──────────────▶ Rust zshref
         TS tooldef  ◀──behaviour: binary as parity oracle ────────────── Rust zshref
         TS web      ◀──data: nlp index, rules, fixtures ──────────────── Rust zshref
         TS web      ◀──behaviour: ranker (mirror) ────────────────────── Rust zshref

after    TS zsh-core ──data: corpus JSON + resolver fixture ────────────▶ Rust zshref
         TS zsh-core ──behaviour: resolvers (mirror, fixture-checked) ──▶ Rust zshref
```

Findings:

- what made the shape uncomfortable was not TS↔Rust as such but behaviour crossing it in both directions, plus binaries used as oracles
- tooldef put `zshref` in a diamond with zsh-core
- CLI and MCP were peers under a parent (tooldef) that owned metadata but not behaviour; the parity test was the parent asserting the peers agree
- where a mirror is unavoidable, the dependent owns the claim and tests it against a fixture the source ships — precedent: `rank.rs` → `parity-fixture.json` → web tests

## The moves

- why tooldef goes: with CLI and MCP in one Rust crate, tool definitions, prose, limits and schemas live in Rust only — one implementation serving both adapters
  - no CLI↔MCP parity tests: parity by construction
  - one behaviour crossing and one diamond fewer
  - tooldef's job — one definition for several TS adapters — has no TS adapter left once the extension drops LM tools; the crate's lib target does that job for the two Rust bins
  - this pays only with the MCP in Rust: a TS MCP would keep a second implementation of the tool semantics, and with it an oracle
  - the trade, known and accepted: zsh-core's TS API keeps primitives only; tool semantics, prose, limits and schemas are Rust-only, so a future TS adapter re-implements them
- nlp to the SPA, in TS: the query path had to be browser-side anyway (the WASM ruling in `zshref-web/AGENTS.md`); moving the index path too gives one language and one embedder, and removes:
  - the only Rust→TS behaviour crossing
  - the second binary
  - the dual MSRV
  - `_selfcheck`
  - web staging
- SPA into the workspace: the same mechanism as the extension; the TS API is higher-fidelity than the JSON assets
  - cost: the SPA's toolchain and dependency churn enter the shared lockfile and root `qa`; reversible by the deferred `zshref-web` split
- resolver fixture: the split makes cross-repo binary spawning impossible anyway; a co-released fixture is the zshref-owned replacement and retires the third fingerprint implementation
- extension drops LM tools: ~115 LOC; the MCP fills the role in VS Code; fuzzysort leaves the bundle
- the extraction plan shrinks from three repos to one
  - `zshref-mcp`: nothing left to extract once the MCP is a bin in the `zshref` crate; a thin repo for it stays possible, unplanned
  - `zshref-web`: its extraction had no technical driver, only the repo-list one; under "one organization at a time" it is not documented until it happens, if ever
  - `zshref-rs` → `zshref`: unchanged, and simpler — one upstream, vendored by release assets, no Node toolchain in the extracted repo
  - the repo list after: `better-zsh` (TS) and `zshref` (Rust)
- second-order: with no downstream consumer of the binary, the build-input hash and `zshref info`'s freshness role lose their purpose

## Alternatives considered

- keep tooldef, split anyway: zshref vendors two release assets that must be mutually consistent; the diamond survives as a version-pair invariant, plus goldens for parity — messiness moves to release time
- TS MCP fed by a Rust-emitted YAML artifact: flips the arrow but keeps two behaviour implementations, so an oracle is still needed; tooldef-shaped YAML plus a TS ingest layer; net zero
- Rust MCP as a separate repo over a `zshref` lib: a public lib API to semver for one consumer, three version bumps per change; can be split off later if the repo list wants it
- three Rust crates or repos (lib, cli, mcp): same objection; the lib has two consumers, both released in lockstep — one package with a lib target and two bins is the ordinary shape
- YAML + JSON-schema as the committed source for prose and limits: one consumer once the MCP is Rust; constants and strings in Rust are the source
- npm packaging as its own repo: re-creates a cross-repo artifact edge; if ever, it lives in the `zshref-rs` repo under the same release workflow
- WASM ranker, or the whole nlp binary as WASM: ruled out earlier (`zshref-web/AGENTS.md`); the embedder is browser-side either way
- in-browser index building: too slow for first load; the index is a build-time artifact
- rewriting zsh-core in Rust:
  - substantial: Yodl parsing, a Rust data model, the non-corpus parts
  - the extension needs TS
  - the package API's audience (IDE- and agent-adjacent tooling) is TS-centric
  - zsh-core's deliverable to Rust is already data — the only behaviour leak is the resolvers
- a TS CLI instead of Rust:
  - single-binary TS routes give large binaries and slower startup
  - several TS CLI frameworks were tried and fought `--help` quality
  - a small fast native binary is the product for a tool agents invoke hundreds of times per session
- resolvers as data, to remove the mirror — rejected: a table or pattern format expressive enough for the template categories is a custom DSL; making one robust (specification, tests, tooling) costs more than a bounded dual implementation checked by a fixture — the usual "let's build a DSL" trap

## Why one TS↔Rust crossing is acceptable

- the crossing is data: corpus JSON, taxonomy in `index.json`, the resolver fixture
- the one mirror is bounded (~430 LOC Rust), changes only with categories or normalization rules, and drifts visibly against the fixture
- what sits comfortably:
  - one root of truth
  - interfaces that are data
  - every edge a standard mechanism (registry package, release asset)
  - every duplicated behaviour with an owner and a mechanical check
