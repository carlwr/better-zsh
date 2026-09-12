# NLP moves to zshref-web; zshref-web joins the workspace

Companion to `README.md` (rules for this dir, working rules, end state). Everything about this step lives here; the README section is a pointer.

The Rust `nlp` module (`zshref-rs/src/nlp/`, its rules YAML, fixtures and the node QA harness under `zshref-rs/tests/nlp-qa/`) is re-implemented in TypeScript inside `zshref-web`, then deleted. Rust is the oracle while porting.

## Scope

- `zshref-web` becomes a workspace package under `packages/`; name unchanged; depends on `@carlwr/zsh-core` via `workspace:*`
  - goes:
    - own lockfile
    - own CI job
    - `make web-qa`
    - its `EXTRACTION.md`
    - every `../zshref-rs` path
  - the TS API is the interface (typed, resolvers available), not the JSON assets
- consumer posture: build-time only
  - a Node build step derives index, lookup-map, categories and rules JSON from the corpus
  - the browser bundle stays zsh-core-free; the index stays self-contained (`mdBody` baked in)
- embedder: transformers.js for both the index build (Node) and queries (browser) — one embedder, one model
- the model: fetched once into a gitignored dir at a pinned revision (today: `zshref-rs/scripts/fetch-model`); index build, tests and evals read it from there
  - root commands may require it; a present model is never re-downloaded
  - CI starts from a fresh environment: some cache of the model is required there
- hosting as in README §"End state"; `docs-zsh-core.yml` becomes, or folds into, the one deployment; whether the SPA deploy lands in this step or a follow-up: the step's call
  - the hosting intent's home once `EXTRACTION.md` goes: the package's `AGENTS.md`
- port scope: everything under `src/nlp/` the SPA or its quality work needs
  - product path:
    - retrieval-text construction
    - index build
    - lookup-map build
    - contract
    - rules (YAML stays the editable form)
  - the eval tooling too (curated sentence eval, mechanical sentences, tune dashboard/sweep/diff, QA-harness scoring) — built for a reason; keep
  - `NLP.md` moves with it; holdout rules unchanged, now single-language
- Rust nlp is deleted when the TS side matches
- Rust side after:
  - no `nlp` feature
  - no `_selfcheck`
  - no fastembed/ort; one MSRV
  - one binary
  - no `WEB-MIRROR` markers
  - the build-input hash stays until the parity gate goes (tooldef step)
- `REPO-SHAPE.md`: the `zshref → zshref-web` arrow becomes `zsh-core → zshref-web`
- stamp machinery: zsh-core gains a second downstream; nothing to change (derived from manifests)
- _decided:_ no extraction preparation for `zshref-web`

## Decisions

Made in preparation; the step follows them unless it finds a reason not to, and then records the reason here.

- _package shape:_ all NLP inside the SPA package; no lib package. The browser/Node seam is a static import fence (see §"Tests that outlive the move"), not a package boundary.
- _resolver hit:_ the ranker keeps its resolver-hit input. Two modes:
  - _product:_ `none` — what the SPA does; the default for every eval and reporter once the gates are passed
  - _oracle:_ the hit computed as Rust does it — zsh-core's `resolve` over the category filter if given, else over `classifyOrder`, first hit wins — used only to reproduce the Rust captures (Rust `batch` and every Rust eval ran with a hit)
  - the resolver boost has no product input afterwards; dropping it (knob, debug part, fixture field) is a recorded follow-up, after the gates
- _QA harness:_ `run-qa.mjs` is not ported as a process driver. Its scoring (weighted expected sets, per-category hard checks) is re-implemented in-process; `nlp-corpus.yaml` moves with the port as a second holdout set, same rules as the sentence fixture's holdout split.
- _fixture generators:_ the parity fixture's synthetic vectors (splitmix64 + fnv1a seeded, self-contained mini index) and the sanity fixture's invariants are ported; the TS side owns every `UPDATE_*` regeneration. After deletion the parity fixture is a TS golden: it pins the ranker's arithmetic against its own past, no longer against Rust.
- _category tables:_ the NLP package may hold partial, category-keyed tables (`Partial<Record<DocCategory, …>>`) where a rule applies to some categories only — the NL-question templates, the identifier-like categories of the lookup map. Nothing category-indexed is added to zsh-core for this.
- _f32:_ `Math.fround` emulation stays through every gate (byte-equal boosts and scores need it). Removing it is a recorded follow-up; `Float32Array` for vectors stays regardless.
- _root `qa`:_ model-free. Tests needing the model or the index skip by default and fail under `BZ_REQUIRE_WEB_ARTIFACTS=1`, as today.
- _CI:_ one `nlp` job with the model cached (`actions/cache` keyed on the pinned revision) runs the asset-gated tests under `BZ_REQUIRE_WEB_ARTIFACTS=1` plus capped smokes of every reporter. Not part of `integration`.
- _reporters:_ dashboard, sweep, diff and the two eval reports are scripts (`tsx`), each with a smoke test on a capped subset so they cannot rot unnoticed.
- _model dir:_ where the model lives after `zshref-rs/data-nlp/` goes — the step's call; one gitignored dir, one fetch script.
- _package-local test notes:_ the package's `AGENTS.md` (repo-root `TESTING.md` stays generic).
- _`corpus_hash`:_ reimplemented over the TS projection (same inputs: package version, upstream tag, per-record JSON), not byte-matched to Rust's — its only job is "index built from this corpus?"

### Decided during execution

Appended as found; each item is a deviation from, or a refinement of, the list above.

- _data files stay put until deletion:_ rules YAML, schemas, fixtures, `NLP.md` keep their Rust paths through S2–S4 (Rust `include_str!`s the YAML; `ci-rust.yml` runs the `--features nlp` leg). TS reads them through `packages/zshref-web/nlp/paths.ts`; the `git mv` is S5's first move.
- _schemas:_ zod is the source of truth; `rules/schema/*.schema.json` and the QA `schema.json` are regenerated from it (`UPDATE_SCHEMAS=1`) at S5, in the same commit as the move — the committed form changes once (inlined defs, no `format: float`). The rule zod shapes live in `src/lib/ranker/types.ts` (browser-safe, the one definition); `nlp/rules-schema.ts` is the Node-side facade + schema generator.
- _model dir:_ `packages/zshref-web/.aux/model/` (root `.gitignore` covers `.aux/` at any depth); `fetch-model` moves with the Node embedder at S3; `build:index` writes into `static/artifacts/` directly (already gitignored; no `.artifacts` + symlink). CI caches the model keyed on the fetch script's hash.
- _contract in S2:_ the contract generator ports with the lookup map (S2), `corpus_hash` as a function in S2; both are inputs of later gates.
- _gate scripts:_ under `.reorg-work/gates/`, not in the package; deleted with the dir at the closing step.
- _category tables:_ the lookup map's surface-form table is a complete mapped type over `DocCategory` (a category not naming its forms fails to compile); the partial-table allowance above stays for the NL-question templates.
- _resolver-key mirror gap (pre-existing, recorded, not fixed here):_ zsh-core `resolveRedir` and Rust `resolve_redir` disagree on a bare two-character redirection group operator with no tail (TS returns the `word`-tailed record of the shorter one-char operator; Rust returns nothing — zsh lexes the longest operator, so Rust looks right). Two train-split queries hit it; the batch gate treats them as a documented modulo. Follow-up: fix in zsh-core (+ its Rust mirror, tooldef parity case).
- _`resolve_in` = `lookupRaw`:_ zsh-core's `lookupRaw` already does the trimmed direct-`_id` check before `resolve`; the TS oracle uses it as is.
- _`corpusTexts(corpus, indexGroups)`:_ the synonyms' `index_groups` is a required parameter, so a forgotten argument cannot make build and validate silently agree.
- _sweep capture:_ the first capture's sweep was truncated; the oracle was recaptured whole (same binaries, same index) before S2.
- _SPA deploy:_ deferred to a follow-up step (maintainer decision); hosting intent goes into the package `AGENTS.md`.
- _`corpus_hash` byte-matches Rust after all:_ `JSON.stringify` of the projected record equals serde's compact form, so the TS hash reproduces Rust's — the gate row "differs" became an informational line. The decision above ("not byte-matched") stands as a non-requirement, not as a fact.
- _vectors are f32-identical:_ transformers.js on onnxruntime-node reproduces fastembed's vectors bit for bit (index: 3936/3936 f32-identical; batch gate: max |Δscore| = 0 over 743 requests). The cosine/ε tolerances in the gate table were never needed; kept as the gate's contract anyway.
- _fixtures regenerated without a changed byte:_ `UPDATE_PARITY_FIXTURE=1` / `UPDATE_SANITY_FIXTURE=1` from the TS side reproduce the committed files byte for byte (f32-shortest printing matches ryu on every number present). They are TS goldens from here on. One cosmetic difference is known: `f32Shortest` breaks an exact decimal tie half-up where ryu goes half-even (one byte in the built `index.json`; same f32).
- _sanity test split:_ `tests/sanity.test.ts` stays the product-mode smoke (browser embedder path, no resolver hit) with a tolerance derived from the effective resolver boost instead of the old `−0.05`; the exact oracle-mode checks (`sanity_fixture_matches_committed`, `sanity_fixture_reproduces_rust_within_eps`, `sanity_invariants_hold`) live in `tests/nlp/fixtures.test.ts`. Fixture zod shapes moved from `tests/_helpers.ts` to `nlp/fixtures.ts` (one shape for generator and loader).
- _oracle on an unknown category:_ the TS oracle throws (Rust returned zero matches). No capture exercises it.
- _Rust model dir after S3:_ `zshref-rs/data-nlp/model` keeps serving the oracle binary until deletion but has no fetch script any more (copy from `packages/zshref-web/.aux/model` if wiped).
- _embedder batching:_ padded batches of 32 are ~4× slower than 32 single calls on CPU (padding to the longest row); kept for now since it mirrors the capture. Follow-up: drop batching once the Rust captures stop mattering.
- _reporter modes:_ every eval reporter (`nlp:eval-sentence`, `nlp:eval-mechanical`, `nlp:qa-score`, the tuning trio) runs in oracle mode by default while the captures are the reference, with `--product` for the SPA's no-resolver mode. Flipping the default to product mode (one identifier per script and per report test) is part of the post-gate follow-up that drops the resolver boost.
- _resolver gap in the evals:_ the two train-split queries hitting the `resolveRedir` mirror gap move one `redirection` row of the sentence eval; the eval gates substitute Rust's captured `zsh_docs` verdicts for those queries (listed, not counted), as the batch gate does.
- _QA corpus shape:_ `schema.json` had no `additionalProperties: false`; the zod shape is strict on entry/expected items and loose at the root (the YAML carries an editor `$schema` key). The regenerated schema thus tightens once. `warnings` counts what `run-qa.mjs` counted (negative present, positive absent); the per-query section is gone for good (holdout).
- _`scripts/**` typechecked:_ the package's svelte-check include now reaches `nlp/**` and `scripts/**`.
- _Rust number formatting:_ Rust `{:.N}` rounds exact binary ties half-to-even where JS `toFixed` rounds half-up (two dashboard cells hit it); every report formatter goes through `nlp/eval/format.ts` (`rustFixed`, `signed`, `rustDebugString`). The tune sweep in TS takes ~70 min against Rust's ~27 (one mechanical ranking pass ≈ 1 min: `rank.ts` rebuilds and lowercases each record's overlap haystack per query). Follow-up: memoize the per-record haystack (behaviour-preserving; touches the browser ranker, so after the gates).
- _dashboard `[qa]` row_ is computed over the dashboard's own (candidate) tuning, not the committed one as the binary-driven harness did — identical without `BZ_TUNE_BASE`, honest with one.
- _`UPDATE_*` regeneration_ is one mechanism (`assertCommittedJson` in the tests: compare, or rewrite under the env): `UPDATE_CATEGORIES_JSON`, `UPDATE_LOOKUP_MAP`, `UPDATE_LOOKUP_CONTRACT`, `UPDATE_PARITY_FIXTURE`, `UPDATE_SANITY_FIXTURE`, `UPDATE_SCHEMAS` (the four rule schemas and the QA `schema.json`). No separate emit path for schemas.
- _biome and the data dirs:_ the package's `biome.jsonc` excludes `nlp/data` and `nlp/rules/schema` (the 2 MiB contract JSON exceeds biome's size cap, as it did under `zshref-rs/`).

## Oracle and captures

Staged and recorded by `capture-nlp` in this dir; everything under `.aux/nlp-move/`. `probe-embedder.mts` (same dir) checks the TS embedder against the captured vectors.

```sh
.reorg-work/capture-nlp all                 # fetch model, build both binaries, rebuild a stale index, capture
.reorg-work/capture-nlp capture             # re-record against the staged binaries
pnpm exec tsx .reorg-work/probe-embedder.mts   # embedder parity on a record sample (needs a capture)
```

Layout: <!-- concrete: the after-side harness reads these paths -->

- `provenance.txt` — git rev, binary hashes, model revision, index corpus hash, toolchain versions
- `bin/nlp/zshref`, `bin/default/zshref` — release builds with and without `--features nlp`, under the real binary name (clap prints argv[0] in every `Usage:` line)
- `rust/index.json` — the retrieval-text oracle (`records[*].text`) and the vector oracle (`records[*].vectors`)
- `rust/rules/*.json` — rules JSON as the Rust side emits it
- `rust/dump-help.nlp.txt`, `rust/dump-help.default.txt` — `dump-help` per binary
- `queries/set.jsonl` — the query set as `batch` requests, `--debug`, limit 10; `queries/README.txt` names the sources and the `src` tag
- `rust/batch-debug.jsonl` — one response per query: the top 10 after the lookup-map promote, with score, semantic parts, boosts and retrieval text; numbers rounded to 6 decimals
- `rust/docs.jsonl` — the `zsh_docs` response per query, same order: the Rust resolver's per-category verdicts; `resolver_key` is the first match, modulo the `history_expn` filter in `tools/docs.rs`
- `rust/eval/` — `sentence.txt`, `mechanical.txt`, `dashboard.txt`, `sweep.txt`, `diff.txt`, `run-qa-summary.txt`
- `rust/cargo-test-nlp.txt` — the release nlp test run at staging time (all green, no skips)

Oracle in place (committed, no capture needed): `zshref-rs/tests/nlp-qa/{lookup-map,categories,lookup-contract,parity-fixture,sanity-fixture}.json`, `zshref-rs/src/nlp/rules/schema/*.json`.

Re-capture when the corpus or the Rust nlp code moves under the step (the provenance file says what was captured against).

## Before/after gates

The TS side is compared against the captures in oracle mode (resolver hit as Rust computed it). A gate is a script or test in the package, run by the step, not kept afterwards unless listed under §"Tests that outlive the move".

| what | against | tolerance |
|---|---|---|
| retrieval text per record (structured, body, expanded) | `rust/index.json` | exact |
| record set and order | `rust/index.json` | exact |
| `lookup-map.json`, `categories.json`, `lookup-contract.json` | committed files | exact |
| rules JSON | `rust/rules/` | exact as parsed JSON (Rust prints `24.0` where JS prints `24`) |
| boosts per (query, record) | `rust/batch-debug.jsonl` | exact at the capture's 6-decimal rounding, over the captured top 10 |
| parity fixture regenerated from the TS generator | committed file | exact |
| vectors per record × view | `rust/index.json` | cosine ≥ 0.9999 each — the measured drift with matched truncation is below 1e-6 (§"Port notes"); a ~0.99 tail on long bodies is the truncation mismatch, not noise |
| semantic parts and final score per (query, record) | `rust/batch-debug.jsonl` | ε ≈ 1e-5 (the capture's rounding plus vector drift) |
| top-10 per query | `rust/batch-debug.jsonl` | same set and order, except ties within ε |
| eval numbers (sentence, mechanical, dashboard, sweep base row, QA summary) | `rust/eval/` | equal at the printed precision; a movement is investigated, not accepted |
| `dump-help` of the post-deletion binary | `rust/dump-help.default.txt` | exact modulo the `## bin:` header line |
| `index.json` | `rust/index.json` | same records; vectors within the tolerance above; `corpus_hash` differs — the expected diff |

The embedder is the only source of inexactness (fastembed → transformers.js), and with matched truncation it is below the capture's own rounding. Retrieval text, boosts and the JSON files do not depend on it, hence exact.

## Holdout hygiene during the step

NLP.md rules apply; concretely for this step:

- never read `zshref-rs/src/nlp/rules/sentence-fixture.yaml` or `zshref-rs/tests/nlp-qa/nlp-corpus.yaml`; the port moves them by path (`git mv`), schema-validated, unread
- the train split is read only through the blind `yq` filter in NLP.md
- everything under `.aux/nlp-move/` is safe to read: the query set holds no holdout query; the eval captures are aggregates; `run-qa-summary.txt` is filtered
- a TS QA-harness or eval-report run prints aggregates only; per-item output is filtered to the train split, as the Rust reporters do
- scores are never committed, in any form

## Sub-stages

Each ends green on the gates it names and commits. Later sub-stages may land in one commit where the gates make that safe.

- _S1 — workspace join_ — done in preparation
- _S2 — data path:_ `@carlwr/zsh-core` as `workspace:*` dependency with the `pre*` readiness hooks the other members carry (`scripts/build/*.test.mjs` mirror the graph and will want updating — `TESTING.md`); JSON projection exported from zsh-core; retrieval text; lookup map; categories; rules YAML → JSON with schema validation; `corpus_hash`. Gates: every exact row above except boosts and parity.
- _S3 — index and ranker:_ Node embedder with HF-style truncation; index build and validation; an oracle-mode runner (resolver hit, `--debug`-shaped output) beside the product `search.ts`, whose behaviour is unchanged; query expansion; contract; import fence; parity and sanity generators with `UPDATE_*`. Gates: boosts, vectors, scores, top-10, parity regen, sanity.
- _S4 — evals:_ sentence eval, mechanical set, tune dashboard/sweep/diff, QA scoring over `nlp-corpus.yaml`; reporters + smokes; CI `nlp` job. Gate: eval numbers.
- _S5 — deletion:_ Rust `nlp` module, feature, `_selfcheck`, fetch-model script, `data-nlp/`, node QA harness, `WEB-MIRROR` markers + `mirror-pairs.test.ts`, Makefile targets; fixtures become TS-owned; docs (§"Docs to touch"). Gates: `dump-help`; `make cli-test`; root `qa`; `pnpm test:pack`.

## Inventory

Rust module → what the TS side has today. Sizes: `wc -l zshref-rs/src/nlp/*.rs` — eval tooling is about two thirds of the module. <!-- concrete on purpose: the map the step would otherwise build first -->

| Rust (`zshref-rs/src/nlp/`) | role | TS today (`packages/zshref-web/`) |
|---|---|---|
| `retrieval_text.rs` | the three views per record; category label derivation | — |
| `index.rs` | index build, validation, `corpus_hash`, normalization | schema and loader only (`ranker/types.ts`, `ranker/index-loader.ts`) |
| `model.rs` | fastembed: CLS pooling, max length 512 | browser side only (`embedder.ts`) |
| `lookup_map.rs` | build from resolver + per-category surface forms | `LookupIndex` only (`ranker/lookup-map.ts`) |
| `rules.rs` | YAML load, normalization, range checks, JSON emit, schema emit | zod shapes only (`ranker/types.ts`, `ranker/rules.ts`) |
| `rank.rs` | ranker | `ranker/rank.ts` — complete, parity-tested |
| `query_expand.rs` | embedding-only query expansion | `ranker/query-expand.ts` — complete |
| `search.rs` | embed → resolver hit → rank → promote; the `batch` JSON shape | `search.ts` — product mode, no resolver |
| `selfcheck.rs` | index validation, rules emit, build freshness | goes; the first two become a test and a script |
| `contract.rs` | contract generation, bare-layer eval | consumer only (`tests/lookup-contract.test.ts`) |
| `fixtures.rs` | parity/sanity generation, synthetic vectors, asset gate, embed caches | consumers only (`tests/parity.test.ts`, `tests/sanity.test.ts`, `tests/_helpers.ts`) |
| `sentence_fixture.rs` | fixture schema, the metric (`g`, `score`), curated eval | — |
| `mechanical.rs` | mechanical set, eval, hard slices | — |
| `tune.rs`, `tune_sweep.rs`, `eval_diff.rs` | dashboard, sweep, diff, churn | — |
| `qa_corpus.rs` | `nlp-corpus.yaml` against `schema.json` | — |
| `test_support.rs` | `UPDATE_*` compare-or-rewrite | — |
| `tests/nlp-qa/run-qa.mjs` | QA harness: process driver + scoring | — (scoring only is ported) |

## Port notes

Facts the port depends on; verified against the Rust source at preparation time.

- _JSON projection:_ zsh-core's JSON emit augments each record with `mdBody`, `_id`, `_display`, `_title`, `_subKind` (`packages/zsh-core/src/docs/json-projection.ts`); not public today. The index build needs it as a public export — same shape, so the retrieval text sees what Rust saw. A `JSON.parse(JSON.stringify(record))` round-trip of the projected record is exactly Rust's input: `undefined`-valued keys gone, key order kept (serde's `preserve_order` is on).
- _record order:_ `docCategories` order, then map insertion order within a category — fixes the index record order and the `corpus_hash` input order.
- _ranking order:_ score descending, then category string, then id string (byte order; the corpus is ASCII) — `rank.rs`, mirrored in `rank.ts` already.
- _structured view:_ fixed header lines (category label, category id, id, display, subKind if any), then every projected field in emission order, skipping `_`-prefixed keys, `mdBody` and `desc`; values compacted (arrays joined by space, objects as `key value` pairs, `_`/`-` in keys → space).
- _body view:_ `desc` if present, else the markdown of `title + "\n\n" + mdBody` with backticks, asterisks and underscores removed; whitespace normalized.
- _expanded view:_ hint lines (label, category words, id words, display words, index-time synonym group members) — whole-word matching on the lowercased concatenation.
- _category label:_ derived mechanically from the category id (word split + a few token rewrites), not zsh-core's `docCategoryLabels`. Keep the derivation for the gates; switching to zsh-core's labels is a follow-up that re-embeds.
- _lowercasing:_ Rust uses ASCII lowercasing; the corpus is ASCII (zsh-core has a test for it), so `toLowerCase()` is equivalent.
- _embedder settings:_ CLS pooling and L2 normalization are explicit pipeline options (as `embedder.ts` passes them today — the defaults are none/false); `passage:` prefix on index text, `query:` on queries; model files = the five `fetch-model` fetches.
- _truncation:_ the pipeline truncates after adding the special tokens (511 content tokens, no `[SEP]`); HF tokenizers (fastembed) cut the content to 510, then wrap in `[CLS]`/`[SEP]`. Measured on a record sample: vectors identical to 6 decimals the HF way, a ~0.99 cosine tail on bodies over 512 tokens the pipeline way. Do it the HF way; `probe-embedder.mts` has the calls (tokenize with `add_special_tokens: false, truncation: true, max_length: 510`, wrap in the tokenizer's specials, run `AutoModel`, take `last_hidden_state[0][0]`, normalize). Queries never reach the limit.
- _Node embedder:_ `onnxruntime-node` via transformers.js; the workspace join lists it (with `protobufjs`, `sharp`) in root `pnpm-workspace.yaml` `allowBuilds`.
- _synthetic vectors:_ u64 arithmetic (splitmix64, fnv1a) — `BigInt` with explicit 64-bit masking; then `Math.fround` per component and normalization as Rust does it.
- _lookup map:_ built from the resolver over `classifyOrder` — the one place the mirror-of-a-mirror becomes one implementation; equality with the committed file also verifies the Rust resolver mirror one last time.
- _rules YAML:_ the schemas are committed under `rules/schema/`; the TS side validates against them (zod or JSON-schema) and emits the same JSON. YAML stays the editable form.
- _rules load:_ synonym terms (`index_groups` members, `when`, `add`) are trimmed and lowercased at load (`normalize_term` in `rules.rs`), and `tuning.yaml` values are range-checked there; the emitted JSON carries the normalized form. The current TS test helper reads the YAML raw — the port's loader normalizes, or a phrase term like `process ID` never matches the lowercased haystack.
- _contract labels:_ the decorated phrasings use the canonical `docCategoryLabels`, not the retrieval-text label derivation.
- _QA scoring:_ `run-qa.mjs` in full: hard checks over six templated categories (no `zle_widget`), template on `display ?? id`, limit 1, category-weighted mean of pass rates; scored entries with `limit ?? 20`, `topN ?? limit`, per-entry `weight`, negative-score items as penalties, duplicate expected items counted once; the `SUMMARY_JSON` line.
- _reporters:_ every Rust reporter is `#[cfg(test)]` and opts in by env (`BZ_TUNE_DASHBOARD`, `BZ_TUNE_SWEEP`, `BZ_TUNE_DIFF`, `BZ_TUNE_BASE=key=value,…`); the sweep's knob keys and per-knob point lists live in `tune_sweep.rs` — port them as data.
- _mirror markers:_ `WEB-MIRRORED-IN:` / `WEB-MIRROR-OF:` comments and `tests/mirror-pairs.test.ts` go at deletion (S5), not before.
- _eval metric:_ as NLP.md — per-item gain, per-category weighted mean, unweighted mean across categories; β, target depth and λ are constants, never knobs.

## Tests that outlive the move

Self-standing: each holds on its own merits after Rust is gone. None locks in a Rust number.

- _import fence:_ the browser-bound modules import neither `@carlwr/zsh-core` nor `node:*` nor the Node ONNX runtime; `vite build` confirms
- _index:_ validates against the corpus it was built from; a tampered record, vector or `corpus_hash` is rejected; every vector unit-length, dims as declared
- _lookup map:_ one surface form → one record; every resolver-canonical form round-trips
- _ranker properties:_
  - category filter ≡ rank-then-filter
  - permutation-invariant on the index, up to ties
  - score = Σ debug parts
  - boosts casing-invariant
  - semantic weights on the simplex; short-body shift continuous with exact endpoints
  - overlap boost saturates monotonically; boosts reliability-ordered
- _discount and scoring:_ normalized, monotone in rank; per-category normalization; vote weights; split partition
- _query expansion:_ trigger appends, whole-word only, capped, no duplicate
- _synthetic vectors:_ deterministic for a seed; unit-length
- _rules:_ every negative case the Rust tests have (unknown field, single-member group, weights over one, …)
- _model-gated:_ embedder dims and norm; sanity invariants; self-retrieval smoke on a capped sample; one smoke per reporter

## Docs to touch

- `zshref-rs/AGENTS.md` — nlp feature, two-binary release, release artifacts for web, `UPDATE_*` table, mirror discipline
- `zshref-rs/DEVELOPMENT.md`, `zshref-rs/EXTRACTION.md`, `zshref-rs/DATA-SYNC.md` — nlp mentions
- `zshref-rs/src/nlp/NLP.md` → the package; `nlp-observations.md` with it; §"Eval architecture" loses layer C's process-driver framing
- `packages/zshref-web/AGENTS.md` — stack, upstreams (one: zsh-core), tests, staging, test notes
- `REPO-SHAPE.md` — arrows; the paragraph forbidding a `zsh-core` arrow into `zshref-web`
- `Makefile` — `cli-nlp`, `cli-tune-*`, `nlp-model`, `artifacts-web`
- `.github/workflows/ci.yml` — the `nlp` job
- sweep: `rg` for `nlp`, `WEB-MIRROR`, `_selfcheck`, `fetch-artifacts`, `fetch-model`, `data-nlp`, `BZ_REQUIRE_NLP_ASSETS`, `ZSHREF_NLP_BIN` — each hit re-judged
