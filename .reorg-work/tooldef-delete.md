# Delete tooldef

Companion to `README.md` (rules for this dir, working rules, end state). Everything about this step lives here; the README section is a pointer.

_Status: executed._

Tool metadata — names, prose, limits, input and output schemas — moves from the TS package `@carlwr/zsh-core-tooldef` into the `zshref` crate; the package, its embed/vendor/hash lines, workflow and CI job go, and so does the build fingerprint whose last consumer was the parity gate. One implementation, two adapters, one crate.

## Scope

- `src/tools.rs` owns `ToolDef` (name, brief, description, flag briefs, input schema, output schema, `run`) and `ToolDefs::build(&Corpus)`; `dispatch` calls `run` — no name match
- `src/tools/prose.rs`: the tool prose verbatim from `prose.ts` + the suite preamble + `DEFAULT_LIMIT`; the category list rendered from `CLASSIFY_ORDER` + `index.json`'s labels; the zsh tag from `index.json`
- `src/tools/schema.rs`: input-schema and output-schema generators (hand-rolled `json!`, TS key order); `SubKind.<cat>` enums from the loaded records; `Feedback` from `ResolverFeedback::kind_schemas`; `matchesReturned.maximum` = the loaded record total
- `tools/{docs,search,list}.rs`: `def(corpus)` each; tooldef-pointing `MIRROR-OF` lines go
- `corpus.rs`: corpus only — `tooldef_path!`, `TOOLDEF_JSON`, `load_tool_defs` go; `build.rs` detects the data source without `tooldef.json`
- fingerprint machinery goes (`data_fingerprint.rs`, `build-inputs.txt`, `sha2`, `ZSHREF_BUILD_INPUT_HASH`); `zshref info` reports `dataHash` instead of `buildInputHash`
- tests re-homed: `tool-defs.test.ts` → `tools.rs` unit tests; `scope.test.ts` → a Rust source-walk test; `round-trip.test.ts`'s close-variant half → zsh-core `resolver.test.ts`; `output-schema-prop.test.ts` → already covered by `run_json`'s validation of every tool response; `tests/common` builds the defs through the lib
- deleted: `packages/zsh-core-tooldef/`, `release-zsh-core-tooldef.yml`, the `tooldef` CI job and its registry/bootstrap lines, the `ci-rust.yml` parity step and path filters, root `jsrREGISTRY:tooldef:*`, `qa`'s `pnpm cli` leg, the Makefile `vendor` cp and `artifacts` package argument, the orient-skill tooldef arms
- docs: the TS tool narrative leaves root `README.md`, `AGENTS.md`, `DESIGN.md`, `PRINCIPLES.md`, `REPO-SHAPE.md`, `DEVELOPMENT.md` and the crate docs; tooldef's rationale (tool naming, the three prose fields, adding a tool) → Rust doc comments in `src/tools.rs`

## Decisions

- _tool semantics Rust-only; zsh-core's TS API keeps primitives:_ deliberate (`rationale.md`); `tooldef.schema.json` has no successor
- _adapter-side prose transforms stay:_ `rewrite_refs` and the CLI's line filter transform single-owner strings; the strings themselves have one home (`tools/prose.rs`)
- _no schemars_ (the README said "envelope via schemars"): the tools emit `serde_json::Value`, not typed structs — a derived envelope schema would describe a struct nothing serialises, and `matches.items` / `matchesReturned.maximum` are corpus-dependent anyway; one hand-rolled generator, one mechanism
- _`run` fn pointer on `ToolDef`:_ dispatch by construction; the name `match` goes
- _`ToolDefs::build(&Corpus)`:_ schemas depend on the corpus (subKind enums, total); built once per process
- _`SCHEMA_VERSION = 1`:_ the bundle format version; `zshref schema` stays byte-equal
- _markers:_ `MIRRORED-IN` / `MIRROR-OF` kept on the two remaining pairs (resolver, record-fields) as orientation comments; no mechanical check — the fixture is the behavioural one; both `AGENTS.md` discipline texts rewritten
- _pinned cases:_ not re-homed as a Rust table — `run_json` validates any input; they live on in `.aux/` for the remaining reorg gates
- _`qa` drops `pnpm cli`:_ its only purpose was the parity suite; done here, not in the stamp-evaluation step

### Decided during execution

- `Field` (key, prose, shape, required) is the one table per tool; `flag_briefs` and `input_schema` derive from it — the successor of TS's `K`-typed coupling
- the scope fence lives in `tests/scope_fence.rs`, outside the fenced tree: inside `src/tools/` it would trip on its own file reads
- `ResolverFeedback::kind_schemas` beside `to_json`; the kind literals appear in both, a unit test validates each variant's JSON against its schema
- `build.rs` emits `rerun-if-changed` only for candidate paths that exist: a missing path re-runs the script — and rebuilds the crate — on every build; an appearing candidate is seen through `ZSHREF_DATA_SOURCE`, which every make target sets (a plain `cargo build` right after `make vendor` needs it too) — the fingerprint code had the same reach
- `build-tasks.test.mjs` went whole: its one test guarded the `qa` ordering that went with the parity suite; `build-stamp.test.mjs` re-targets zsh-core with `typedoc.json` as the "config no entry point imports" probe
- the fuzzy-score cross-adapter note in `DESIGN.md` went with its TS counterpart
- tooldef's rationale went to the narrowest home: tool naming, adding a tool and the never-hand-typed rule to the `tools.rs` module doc; the three-field split to `ToolDef`'s doc; `DESIGN.md` points there

## Captures

`.aux/tooldef-delete/` (gitignored):

- `capture <label>`: `zshref batch` over `.aux/resolver-fixture/pinned.jsonl` + `dump-help` + `zshref schema` + `--version` + `zshref info` + `capture-mcp` (`initialize`, `tools/list`, `tools/call` per pinned case)
- `before/`: recorded on `main` before any edit; `after-s1/`, `after-s2/`, `after-s3/` after each sub-stage
  - everything byte-equal throughout except `info.json`: `buildInputHash` moved at S1 (the `src/` tree was a hash input) and became `dataHash` at S2
- `act-integration.log`: the `integration` job under act after the package went

## Gates

Sub-stages, one commit each: tool metadata Rust-owned (S1); fingerprint gone, `info` emits `dataHash` (S2); package and plumbing deleted (S3); docs (S4).

```sh
make cli-check && make cli-test && make cli-vendored-test && make cli-package   # every commit
pnpm format && pnpm qa && pnpm test:pack && pnpm test:scripts                   # S3 on; `pnpm lint:md` for S4
ACT_JOB=integration scripts/test-integration-act                                # once, S3
```

Not run: the NLP sweep; `ci-rust.yml` under act.

## Follow-ups

- the CLI could go through `tools::call` and drop clap's `default_value` injection — one default-filling path (from `mcp-rust.md`)
- zsh-core exports without a consumer after this step (`subKindEnums`, `resolverFeedbackKindSchemas`, `resolverFeedbackKinds`, `RECORDS_TOTAL` and its drift test): keep-or-drop is a public-API question for the closing step
- deprecate the published `@carlwr/zsh-core-tooldef` alphas (README §Deferred); the npm/JSR trusted-publisher grants naming `release-zsh-core-tooldef.yml` are dangling — revoke with the deprecation
