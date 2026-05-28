# AGENTS.md — `zshref-web`

Static SPA: NLP search demo over zsh-core records. Sibling of `zshref-rs/` at repo root; not a pnpm workspace member; extracts to its own repo on release. Non-membership mirrors the post-release peer-repo relationship and blocks accidental cross-package imports.

## Stack

- SvelteKit 2 + Svelte 5 (`adapter-static`) — single-page app prerendered as static HTML+JS+CSS for Cloudflare Pages
- TypeScript (strict + `noUncheckedIndexedAccess`, matching the workspace), Vitest; lint via Biome (`.ts`) + svelte-check (`.svelte`)
- `@huggingface/transformers` (ONNX Runtime Web) for browser-side BGE-small query embeddings
- `markdown-it` + `shiki` (dual light/dark theme via CSS variables) for record markdown
- `zod` for artifact schema validation at load time
- Self-hosted variable fonts via `@fontsource-variable/{inter,jetbrains-mono}`
- pnpm, non-workspace (own lockfile)

Alternatives ruled out: React / Elm / PureScript front-ends; WASM port of `rank.rs`; per-record SSG (records are dynamic at runtime).

## Star-pattern deps

Two upstreams, both pinned by version:

- **`zshref` release assets** (post-release) or **local `../zshref-rs/` paths** (pre-release):
  - `index.json` — vector index; self-contained (carries `mdBody` per record)
  - `rules/*.json` — `tuning`, `stopwords`, `synonyms`; emitted by zshref-rs from YAML. `rules/schema/*` is not consumed here.
  - `parity-fixture.json` — ranker-parity test input (pre-computed `queryVec` + `resolverHit` per query)
  - `sanity-fixture.json` — full-stack sanity test input (curated "clear-winner" queries)
  - `categories.json` — category order + labels
  - `lookup-map.json` — permalink lookup data
- **HuggingFace Hub** — `BAAI/bge-small-en-v1.5` ONNX + tokenizer files at runtime (production); tests use the local `zshref-rs/data-nlp/model/` directory to stay network-free

No runtime dep on `@carlwr/zsh-core`: everything the UI renders lives inside `index.json`.

## TS↔Rust mirror discipline (web namespace)

Marker convention + rename rules: `zshref-rs/AGENTS.md`. Two integrity layers for this pair:

- **Marker lint** — `tests/mirror-pairs.test.ts` (kind/extension match, target exists, pairs symmetric). No `parity-units.ts` SoT; the markers are the SoT.
- **Runtime contract** — `tests/parity.test.ts` (the parity-fixture test).

## Parity & sanity tests

Two-tier verification with disjoint failure modes:

| | parity-fixture | sanity-fixture |
|---|---|---|
| What it isolates | Ranker math only | Full stack (embedder + ranker) |
| TS side | `tests/parity.test.ts` — feeds pre-computed `queryVec` directly to `rank()`, no embedder | `tests/sanity.test.ts` — runs `embedder + rank()`, asserts top-1 identity |
| Rust SoT | `nlp::fixtures::parity_fixture_matches_committed` | `nlp::fixtures::sanity_fixture_matches_committed` + `sanity_invariants_hold` |
| Failure means | Ranker math diverged | Embedder integration broke OR ranker drift |

Parity enforces byte-equality at f32 precision; `rank.ts` mirrors Rust's f32 arithmetic via `Math.fround` + `Float32Array`.

Default-skip + opt-in-fail (mirrors Rust): artifact-gated tests skip with a visible reason when artifacts are missing; CI sets `BZ_REQUIRE_WEB_ARTIFACTS=1` to flip skip → fail, so a pipeline can't go green on missing artifacts.

## Routes

- `/` — search box + results list with markdown bodies (`markdown-it` + Shiki)
- `/r/[category]/[id]` — per-record permalink (deep links from result cards)

## Theming

- CSS-variable based; `data-theme="dark" | "light"` on `<html>`
- Pre-paint script in `app.html` reads persisted choice / `prefers-color-scheme` before first render (no flash)
- Toggle widget writes `localStorage` and flips the attribute
- Shiki rendered with `themes: { light, dark }` so the same code-block HTML reacts to the toggle via CSS variables

## Pre-release data staging

`scripts/fetch-artifacts` (or `make artifacts-web`) stages the SPA-runtime artifact subset (the rest of the release set isn't fetched by the SPA — see the script) into `.artifacts/`, exposed via a `static/artifacts -> ../.artifacts` symlink the script creates. The symlink is not committed: a dangling one pre-stage breaks SvelteKit's static walk with a cryptic `ENOENT` across dev/check/build. The script does not build zshref; post-extraction it flips to release-asset download.

Fails loudly on:

- a missing binary, a non-`nlp` build (lacks `nlp-search`), or a missing artifact
- a binary stale w.r.t. its source (`_selfcheck --check-build-fresh`) — the index check below validates *against* the binary, so this guards the oracle itself
- a stale index (`_selfcheck --validate-index`, vs the binary's corpus)

Fixture drift (parity/sanity/categories) stays the Rust `cargo test` gate.

Binary freshness is a runtime self-check, not a `cli-nlp` make prerequisite — staging stays build-free (a per-stage rebuild would dominate). Cost: a `data_fingerprint` module shared across `build.rs` and runtime; revisit if a build prerequisite proves simpler.

## See also

- `REPO-SHAPE.md` (repo root) — overall arrow diagram, current + post-release
- `zshref-rs/AGENTS.md` — Rust CLI; SoT for ranker, index builder, rules
- `zshref-rs/src/nlp/NLP.md` — module measurements + packaging direction
- `zshref-rs/src/nlp/fixtures.rs` — Rust-side fixture emission + sanity invariants
