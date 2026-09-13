---
audience: maintainer
read-when: doing or reviewing the reorg work, or reading why the repo shape changed
---

# Reorg work

Steps, decisions and rationale for the 2026 reorg. Deleted once every step is done and verified.

## About this directory

- the only place that describes a future shape; every other doc describes the current state and changes when the state changes
- `rationale.md`: why — the maintainer's goals, the shape before, the diagnosis, alternatives rejected
- style: `STYLE-MD.md` applies in full; cross-references between files and sections within this dir may be looser than it wants
- frontmatter: only this file carries it, so the maintainer-docs index lists one entry; siblings are reached from here
- paths and identifiers: as of the tag `pre-reorg` unless stated; they move or vanish as steps land
- names: all legacy during the work; no new names proposed here; renaming is a separate follow-up
- reasons and rejected alternatives survive the work: they stay here, even where they describe the pre-reorg shape, until the closing step decides their home
- state a step must leave behind (mid-step handoff, discovered issues): `state.md` in this dir; deleted when consumed
- temporary files a step produces (captures, scratch output): `.aux/` at the repo root — gitignored; never committed
- a step whose detail outgrows its section moves in full to a companion file in this dir; the section becomes a pointer
- execution: roughly one session per step; the session works out its own detail — files here hold what is decided, not how to do it

## End state

Layout — the workspace packages and the Rust crate:

```
.
├── packages/
│   ├── zsh-core             TS lib: corpus, resolvers, rendering; emits the release assets
│   ├── vscode-better-zsh    VS Code extension
│   └── zshref-web           SPA; all NLP; index built at build time
└── zshref-rs/               Rust crate: `zshref` CLI + `zshref-mcp` bins; not a pnpm member
```

Dependencies — an arrow reads "consumes, pinned by version"; its label is the mechanism:

```
                          zsh-core
            ┌────────────────┼──────────────────────┐
     workspace link    workspace link          release assets
      (built dist/)     (built dist/)     (corpus JSON, resolver fixture)
            ▼                ▼                      ▼
    vscode-better-zsh    zshref-web              zshref-rs
                             ▼                      ▼
                     HuggingFace model           crates.io
                     (runtime download)           (publish)
```

- workspace link: pnpm `workspace:*` onto the upstream's built `dist/`; the TS stamp keeps it fresh
- release assets: tarballs on zsh-core's release tag, vendored by `make vendor` — in-monorepo from the sibling's `artifacts/`, post-split by download
- zsh-core is the only producer; the three consumers are leaves with no consumer of their own
- _decided (`nlp-move.md`):_ the NLP (ranker, index build, eval tooling) inside `zshref-web` as drawn; the alternative was a workspace lib package the SPA consumes by workspace link
  - the lib would be a second TS producer over the same mechanism; it makes the browser/Node seam structural instead of by convention
  - the invariants below concern language crossings and bespoke mechanisms; a TS→TS workspace edge adds neither
- hosting: GitHub Pages, one site — the SPA at the root, the zsh-core docs under `/zsh-core-docs/`; Cloudflare Pages the alternative

Invariants — the properties the end state was chosen for, and the constraint on any course correction during the work:

- one root of truth; every edge a pinned version of a standard mechanism
- leaves have no consumers: no freshness oracles, no fingerprints
- one behaviour mirror remains — the resolvers — owned by `zshref-rs`, checked against a fixture co-released with the corpus
- one language crossing, one direction — TS → Rust — carried by data; the mirror above is its only behaviour component

Bespoke mechanisms left:

- `make vendor` (download + checksum)
- the `dataHash` check
- the resolver fixture test
- one Cargo feature
- the one-level TS upstream stamp — kept or removed by the evaluation step

Out of scope:

- renames
- npm distribution
- performing the `zshref-rs` split (the work makes it trivial)
- a maintainer repo

## The repo split

- as of the tag, three extractions are documented (`REPO-SHAPE.md`, one `EXTRACTION.md` each): `zshref-rs` → `zshref`, `zshref-web` → `zshref-web`, `packages/zshref-mcp` → `zshref-mcp`; user-facing READMEs already link to those repo names
- after the reorg, one remains: `zshref-rs` → `zshref` — intent unchanged; performing it is out of scope; the work makes it trivial (single upstream, release-asset vendoring, no Node toolchain post-split)
  - `zshref-mcp`: void — the MCP lives in the `zshref` crate; user-facing links to `carlwr/zshref-mcp` re-point to the `zshref` repo (MCP step)
  - `zshref-web`: withdrawn as a documented intent — one organization at a time; no user-facing links to revert; kept under Deferred for its payoff
- docs posture, during and after:
  - extraction is described in one place: `zshref-rs/EXTRACTION.md` (vendoring mechanics in `DATA-SYNC.md`)
  - `REPO-SHAPE.md` describes the current shape and points there
  - the `AGENTS.md` rule on post-extraction URLs narrows to `zshref-rs`
- every other mention (docs, comments, workflows) is re-judged by the step that touches it: obsolete (mcp, web) → delete; `zshref-rs` → keep, pointing at its checklist; the closing sweep covers the rest

## Working rules

- every step reads and follows the committed guidelines:
  - the `AGENTS.md` entry points of the dirs touched
  - every maintainer doc whose `read-when:` applies
  - the `STYLE-MD.md` pre-return audit for any `.md`
  - the validation gates before returning
- deliberate repetition (home: `STYLE-CODE.md`, `STYLE-MD.md`): DRY; naming and structure over comments — a comment that a rename or refactor makes obsolete is a refactor not done; concise prose and code. Agent output drifts the other way constantly.
- before/after capture: where a step re-implements or relocates behaviour, record its observable output before, re-record after, verify equality — or that the diff is exactly the expected one. Cheap insurance for the value already in the existing implementation (bugs found, edge cases handled).
  - general instruments: `zshref-rs/scripts/dump-help` (complete `--help`), `zshref schema`, `zshref info`, `zshref batch` over the pinned cases (`.aux/resolver-fixture/pinned.jsonl`)
  - step-specific captures are listed under each step

## Steps

In order. A step ends with the repo's validation gates green where touched and the docs it invalidates updated.

### DONE: Tag

- annotated tag `pre-reorg` on the commit that adds this dir in its initial form: the tagged tree holds the old shape and the reasoning
- pushed; may live indefinitely
- `rationale.md` names the tag — rename in both places if the name changes

### DONE: Extension drops LM tools

- remove the LM adapter, the generated `languageModelTools` manifest and their test
- drop the tooldef dependency
- same commit: remove the extension row from tooldef's `adapter-matrix.ts` — its test reads the adapter file at collection time and fails with ENOENT otherwise
- extension docs: drop the feature; note that MCP discoverability (VS Code's MCP server definition provider API) can be considered later
- _decided:_ functionality loss accepted — the MCP fills the role; the extension's part in the reorg ends here
- _before/after:_ the staged manifest differs only by the removed `languageModelTools` section

### DONE: NLP moves to zshref-web; zshref-web joins the workspace

- `nlp-move.md` — scope, decisions (incl. those made during execution), oracle captures, before/after gates, sub-stages, inventory, port notes
- `capture-nlp` — stages the Rust oracle and records it into `.aux/nlp-move/`
- `probe-embedder.mts` — TS embedder against the captured vectors
- `gates/` — the before/after gate scripts, run against `.aux/nlp-move/`; every row green in oracle mode before each sub-stage's commit
- _before/after:_ equal to the Rust captures, bit-equal where the gate table only asked for a tolerance:
  - retrieval texts
  - index vectors
  - boosts and scores
  - fixtures
  - every eval report
  - default `zshref` help, modulo the `## bin:` line
- follow-ups recorded in `packages/zshref-web/nlp/NLP.md` §Follow-ups (they outlive this dir)

### DONE: Resolver conformance fixture

- `resolver-fixture.md` — scope, decisions (incl. those made during execution), captures, gates, follow-ups
- _before/after:_ `zshref batch` over the parity pinned cases and `dump-help` equal throughout; the fixture's only movement across the `resolveRedir` fix is the bare `>&` / `<&` pair it was known to expose

### DONE: MCP in Rust

- `mcp-rust.md` — scope, decisions (incl. those made during execution), captures, gates, follow-ups
- `capture-mcp` — one MCP stdio session against a server command, recorded into `.aux/mcp-rust/`
- _before/after:_ `initialize` and `tools/list` TS server = Rust server; `tools/call` over the pinned parity cases equal modulo `isError: false` on success; `zshref batch` over the pinned cases and `dump-help` equal throughout

### DONE: Delete tooldef

- `tooldef-delete.md` — scope, decisions (incl. those made during execution), captures, gates, follow-ups
- _before/after:_ `dump-help`, `zshref schema`, `zshref batch` over the pinned cases, MCP `initialize` / `tools/list` / `tools/call` equal throughout; `zshref info` differs by the decided field swap (`buildInputHash` → `dataHash`)

### Stamp machinery: evaluate

- after every other code step; before the closing sweep, so the docs describe the outcome
- question: with zsh-core the only TS upstream and a star-shaped workspace graph, does the stamp/`upstream-ready` machinery (`BZ_SKIP_UPSTREAM`, content stamps, `scripts/build/upstream-ready.mjs`) still earn its keep, or does pnpm's own topological ordering cover it?
- weigh against what the reorg actually left in place, not this file's expectations
  - the SPA's index build is the costliest build step; `build:index` already skips itself when the on-disk index validates against the corpus
- an evaluation, not a foregone removal; the decision and its reason land in `scripts/build/README.md` either way

### Docs consolidation and closing

- `REPO-SHAPE.md`: current shape only; one arrow set; a pointer to `zshref-rs/EXTRACTION.md` for the one remaining extraction
- `zshref-rs/EXTRACTION.md` shrinks; `DATA-SYNC.md`: vendoring = corpus tarball + fixture tarball
- root `AGENTS.md`: architecture summary, dual-publish list, test markers; orient skill scripts
- leftovers sweep — `rg` for:
  - tooldef
  - nlp, outside `packages/zshref-web/`
  - `WEB-MIRROR`
  - `BZ_REQUIRE_PARITY`
  - `_selfcheck`
  - `fetch-artifacts`
  - `zshref-rs` paths outside `zshref-rs/`
  - extraction, post-extraction, to-be-extracted, pre-release — each hit re-judged, not deleted wholesale
- decide the home of `rationale.md` content (candidates: `DESIGN.md`, `PRINCIPLES.md`, `REPO-SHAPE.md`, source comments); then delete this dir

## Deferred

Decided not to decide now:

- npm/npx distribution of the Rust binaries — if ever: inside the `zshref-rs` repo, same release workflow (cargo-dist is a candidate)
- renaming: top repo, workspace packages, Rust crate and binary
- performing the `zshref-rs` split; whether a thin `zshref-mcp` repo is wanted
- a `zshref-web` split into its own repo — no technical driver; its payoff if done: the SPA's toolchain and dependency churn (SvelteKit, Vite, transformers.js) leave the workspace lockfile and root `qa`
- an MCP discoverability shim in the extension
- deprecating the published alphas of `@carlwr/zsh-core-tooldef` and `@carlwr/zshref-mcp` on npm and JSR
- the `zsh_docs` description (`docs_long` in `zshref-rs/src/tools/prose.rs`): its `matches[]` property list omits `title` and files the optional `subKind` / `feedback` under "mandatory" — ported verbatim; product text (`--help`, MCP descriptions), so a prose fix of its own, not a reorg change
- the NLP follow-ups recorded by the move: `packages/zshref-web/nlp/NLP.md` §Follow-ups
