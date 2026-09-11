# AGENTS.md — `zshref-web`

Static SPA: NLP search demo over zsh-core records. Workspace member; its pre-release data path reads `zshref-rs/` at the repo root directly (below).

## Stack

- SvelteKit 2 + Svelte 5 (`adapter-static`) — single-page app prerendered as static HTML+JS+CSS
- TypeScript (strict + `noUncheckedIndexedAccess`, matching the workspace), Vitest; lint via Biome (`.ts`) + svelte-check (`.svelte`)
- `@huggingface/transformers` (ONNX Runtime Web) for browser-side BGE-small query embeddings
- `markdown-it` + `shiki` (dual light/dark theme via CSS variables) for record markdown
- `zod` for artifact schema validation at load time
- Self-hosted variable fonts via `@fontsource-variable/{inter,jetbrains-mono}`

Alternatives ruled out: React / Elm / PureScript front-ends; WASM port of the ranker; per-record SSG (records are dynamic at runtime).

_Why not WASM:_ the larger version — ship the whole NLP binary as WASM — reduces to the same ruling. The embedder can't come: its Rust ONNX runtime is native-only, and porting lands back on the browser ONNX runtime already loaded here, so the embedder is *already* WASM, just not ours. Model and index are fetched either way; the CLI surface is dead weight in a browser. That leaves the ranker alone, bought at the price of a Cargo feature split to detach the embedder, a WASM toolchain, and a binary release asset — a pull-only data arrow turned build-artifact, the only binary crossing a repo boundary — plus a blob where debuggable source was. The drift it would prevent is already caught by the parity fixture, which survives extraction unchanged. Revisit post-extraction if the mirror bites; the shape then is a ranker-only target, never the binary.

## Star-pattern deps

Two upstreams, both pinned by version:

- **`zshref` release assets** (post-release) or **local `zshref-rs/` paths** (pre-release):
  - `index.json` — vector index; self-contained (carries `mdBody` per record)
  - `rules/*.json` — `tuning`, `stopwords`, `synonyms`; emitted by zshref-rs from YAML. `rules/schema/*` is not consumed here.
  - `parity-fixture.json` — ranker-parity test input; self-contained (own miniature index + pre-computed `queryVec` / `resolverHit` per query)
  - `sanity-fixture.json` — full-stack sanity test input (curated "clear-winner" queries)
  - `categories.json` — category order + labels
  - `lookup-map.json` — permalink lookup data
- **HuggingFace Hub** — `BAAI/bge-small-en-v1.5` ONNX + tokenizer files at runtime (production); tests use the local `zshref-rs/data-nlp/model/` directory to stay network-free

No runtime dep on `@carlwr/zsh-core`: everything the UI renders lives inside `index.json`.

## Hosting intent

- GitHub Pages first; Cloudflare Pages the alternative
- Pages hosts one site per repo, and the zsh-core docs workflow already claims this one: the SPA takes the site root, the zsh-core docs move under `/zsh-core-docs/`, one deployment carries both
- deferred: the deploy consumes `zshref` release assets, which are not built yet
- before publishing:
  - `svelte.config.js` sets no `kit.paths.base`; the final URL decides
  - `THIRD_PARTY_NOTICES.md` — the bundle ships transformers.js, shiki and fonts; a real obligation, and this package has none of the user-facing docs its siblings carry

## TS↔Rust mirror discipline (web namespace)

Marker convention + rename rules: `zshref-rs/AGENTS.md`. Two integrity layers for this pair:

- **Marker lint** — `tests/mirror-pairs.test.ts` (kind/extension match, target exists, pairs symmetric). No `parity-units.ts` SoT; the markers are the SoT.
- **Runtime contract** — `tests/parity.test.ts` (the parity-fixture test).

## Parity & sanity tests

Two-tier verification with disjoint failure modes:

| | parity-fixture | sanity-fixture |
|---|---|---|
| What it isolates | Ranker math only | Full stack (embedder + ranker) |
| TS side | `tests/parity.test.ts` — feeds the fixture's own index + `queryVec` to `rank()`, no embedder | `tests/sanity.test.ts` — runs `embedder + rank()`, asserts top-1 identity |
| Rust SoT | `nlp::fixtures::parity_fixture_matches_committed` | `nlp::fixtures::sanity_fixture_matches_committed` + `sanity_invariants_hold` |
| Needs staged artifacts | no | yes — skips by default |
| Failure means | Ranker math diverged | Embedder integration broke OR ranker drift |

Parity enforces byte-equality at f32 precision; `rank.ts` mirrors Rust's f32 arithmetic via `Math.fround` + `Float32Array`.

Default-skip + opt-in-fail (mirrors Rust): tests needing the gitignored artifacts (`zshref-rs/data-nlp/index.json`, `zshref-rs/data-nlp/model/`) skip via `ctx.skip(reason)`; `--reporter=verbose` prints the reason. `BZ_REQUIRE_WEB_ARTIFACTS=1` flips skip → fail — whichever pipeline stages artifacts must set it, or missing artifacts pass silently. Committed artifacts get no such gate: their absence is a defect, so those tests fail outright.

### Provisional: self-contained parity index

- _what:_ the fixture ships its own miniature index, vectors deterministically generated
- _buys:_ neither side needs the model or the full index to run or regenerate parity — the mirror contract stays inside ordinary CI
- _costs:_ a self-contained arithmetic contract rather than a slice of production data
- _status:_ **not reviewed by the maintainer in detail** — revisitable, not settled
- _if revisiting:_ re-derive the options from the constraint (parity asserts TS ≡ Rust arithmetic at f32 precision), not from this note

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
