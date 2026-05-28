# AGENTS.md — `zshref` (Rust CLI)

Rust CLI; tool-surface mirror of the TS adapters. NLP subsystem at `src/nlp/`, opt-in via the `nlp` Cargo feature.

**Editing any part of the NLP subsystem (`src/nlp/**`, incl. `rules/*.yaml`, and the `zshref-web/` ranker mirror) requires reading `src/nlp/NLP.md` first — its holdout-isolation rules are binding.**

## NLP feature + two-binary release

Default build excludes `nlp` plus its optional deps; `Cargo.toml` owns the exact set. `--features nlp` re-introduces them. Release matrix:

- `zshref` (default) — small, minimal trust surface; no `nlp-search` subcommand
- `zshref-nlp` (`--features nlp`) — adds local semantic search

Both Cargo configurations are exercised by `tests/feature_flag.rs` (subcommand presence + `batch` error envelope).

Release artifacts of the `nlp` build feed `zshref-web` (separate repo post-extraction):

- `index.json`
- `rules/*.json` (emitted from embedded YAML at staging time; not committed)
- `parity-fixture.json`
- `sanity-fixture.json`
- `categories.json`
- `lookup-map.json`

`rules/schema/*.schema.json` are editor-only, not shipped. SoT for the ranker is `src/nlp/rank.rs`; TS mirror lives in `zshref-web/`, parity-checked against the fixture.

Release workflow deferred to first release. Shape: matrix `[default, --features nlp]` produces both binaries; release assets are those plus the JSON artifacts above. Pre-extraction it lives in better-zsh `.github/workflows/`; post-extraction it moves to the zshref repo's.

### Internal `_selfcheck` subcommand (`nlp` build)

Hidden, internal-only verb — freshness/drift checks for the staging script + CI. Deliberately kept out of `--help` and completions; don't expose it. See `src/nlp/selfcheck.rs`.

`--check-build-fresh`'s fingerprint hashes every `src/**/*.rs` incl. `#[cfg(test)]`, so a test-only edit flags the release binary stale — deliberately conservative (over-rebuild is cheap; missing real staleness isn't).

### NLP parameter taxonomy

- **index-time** — changes the embedded corpus; iteration cost = re-embed.
- **rank-time** — changes scoring over precomputed vectors; iteration cost = re-rank only.

### NLP iteration

- Scoring source-of-truth is the Rust sentence eval (curated + mechanical); no scores committed or gated — `src/nlp/NLP.md` covers how to judge a change. Reporters:
  - `sentence_fixture_eval_report` (curated `train`/`holdout`).
  - `mechanical_sentences_report` (release-only) + dashboard (`BZ_TUNE_DASHBOARD=1`).
  - `tune_sweep` (release-only, `make cli-tune-sweep`) — embed-once knob sweep over the combined objective; `BZ_TUNE_BASE` composes a base for greedy rounds.
- Node QA harness (fresh release nlp build) — e2e parity + held-out overfit watch, never a quality gate.
- Scalar tuning constants live in `src/nlp/rules/tuning.yaml`; struct is `Tuning` in `src/nlp/rules.rs`.
- Every NLP yaml is parse + schema vetted on a plain `cargo test --bin zshref --features nlp` (rules-schema drift, fixture/rules parse, phantom-record guard, `nlp-corpus` vs `schema.json`) — no separate command.
- Drift-checked artifacts regenerate with one of `UPDATE_*=1`. Pattern: write back on env-var present, else assert equality with the committed file.

  | Artifact | Env var | Test filter |
  |---|---|---|
  | `src/nlp/rules/schema/*.schema.json` | `UPDATE_SCHEMAS` | `nlp::rules::tests::schemas_match_committed_files` |
  | `tests/nlp-qa/categories.json` | `UPDATE_CATEGORIES_JSON` | `nlp::retrieval_text::tests::categories_json_matches_committed_file` |
  | `tests/nlp-qa/parity-fixture.json` | `UPDATE_PARITY_FIXTURE` | `nlp::fixtures::parity_fixture_matches_committed` |
  | `tests/nlp-qa/sanity-fixture.json` | `UPDATE_SANITY_FIXTURE` | `nlp::fixtures::sanity_fixture_matches_committed` |

  ```sh
  <ENV>=1 cargo test --bin zshref --features nlp <FILTER>
  ```

  Fixture-emission tests (`src/nlp/fixtures.rs`) call the ranker in-process to
  capture the pre-computed `queryVec` + `resolverHit` that the TS mirror in
  `zshref-web` consumes. The sanity
  fixture also has an always-on invariant test (`sanity_invariants_hold`):
  curated "clear winner" queries must satisfy `absoluteFloor` + `minMargin`
  on the recorded top-1 vs. runner-up; failure → re-curate the query list
  (do not relax invariants).

### Tuning guardrails

- `tuning.yaml` holds scalar weights and thresholds only — constants, not functions.
- If a value wants to become a function, delete it from YAML and move the logic into `rank.rs` plus the TS mirror. Don't grow `tuning.yaml` into a DSL.

## TS↔Rust mirror discipline

Two namespaces of mirror markers — kept disjoint so a search for one never picks up the other:

- `// MIRRORED-IN:` (TS) ↔ `// MIRROR-OF:` (Rust) — zshref-rs ↔ pnpm-workspace TS code (`packages/zsh-core{,-tooldef}/`). Structural parity is enforced by `parity-units.ts` (rationale: `DESIGN.md`).
- `// WEB-MIRRORED-IN:` (Rust) ↔ `// WEB-MIRROR-OF:` (TS) — zshref-rs ↔ zshref-web (out-of-workspace, post-extraction peer repo). Not driven by `parity-units.ts`; the parity-fixture test in `zshref-web/` is the runtime contract.

When renaming a mirrored symbol on either side: update both markers (plus `parity-units.ts` for the first namespace).

## Iteration

- Rust-only edits: `cargo build` + `cargo test` (skip `pnpm qa`).
- From outside `zshref-rs/`: pass `--manifest-path zshref-rs/Cargo.toml`.
- Edits touching `packages/zsh-core-tooldef/` prose: rebuild tooldef first (`pnpm --filter @carlwr/zsh-core-tooldef build`), then `cargo build`.

## Tests

- `tests/properties.rs` — property-based (proptest)
- `tests/cli_invariants.rs` — deterministic invariant checks: CLI ↔ batch parity, every-category sweeps, full-corpus round-trip
- `tests/common/mod.rs` — shared helpers: spawn-and-parse vocabulary, tooldef path resolution, `outputSchema` validators, subcommand→tool-name map

`run_json` auto-validates every tool subcommand response against its bundled `outputSchema` — new tests get conformance checks for free.

For plain integration tests (exit status, stdout shape) that don't need `outputSchema` validation, spawn the binary directly via `Command::new(env!("CARGO_BIN_EXE_zshref"))`.

## CLI / batch parity

`cli.rs` and `batch.rs` are independent entry points into `tools::dispatch`. Both inject `inputSchema.default` for omitted flags — CLI via `clap::Arg::default_value`, batch via `fill_defaults_from_schema`. Edit one, mirror the other. Parity is pinned by `omit_equals_schema_default` + `cli_equals_batch` in `tests/cli_invariants.rs`.

## Make targets

- Agents: use `pnpm cli`, `pnpm cli:test`, etc — wrapped via `quiet-run.mjs`, silent on success.
- Direct `make cli`: stays verbose; silencing would duplicate `quiet-run.mjs` buffering for no agent-path benefit.

## `dump-help` script

Useful for:
- inspecting the `--help` output for top-level + all subcommands with a single command
- diffing complete `--help` output across changes

More info:
```sh
./zshref-rs/scripts/dump-help --help
```
