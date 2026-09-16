# AGENTS.md — `zshref-web`

Static SPA: NLP search over zsh-core records — plus the Node-side NLP toolchain that builds its artifacts and evaluates its ranking. Workspace member, private, not published.

## Stack

Decisions only; the dependency list is `package.json`:

- `adapter-static` (`svelte.config.js`) — prerendered, no server; `index.html` fallback
- TypeScript strict + `noUncheckedIndexedAccess`; svelte-check's include reaches `nlp/` and `scripts/` too (`svelte.config.js`)
- one embedder, one model (BGE-small), two runtimes: ORT-Web in the browser, `onnxruntime-node` on the Node side
- `zod` — artifact schemas at load time; also the source of truth for the editor schemas of the rules YAML, the sentence fixture and the QA corpus
- fonts self-hosted (`@fontsource-variable/*`)

Alternatives ruled out: React / Elm / PureScript front-ends; per-record SSG (records are dynamic at runtime); a Rust ranker compiled to WASM (the NLP is TS end-to-end: one language, one embedder); in-browser index building (too slow for first load).

## Layout: the tiers

- `nlp/` — the NLP as one unit; three tiers, each importing only downward:
  - `nlp/core/` — runtime-agnostic: artifact shapes, rules schemas, ranker, search pipeline
  - `nlp/browser/` — the SPA's runtime: embedder (ORT-Web), search, artifact fetch; `nlp/browser.ts` — the facade, the app's one door
  - `nlp/node/` — everything that reads the corpus or the model; the evals under `nlp/node/eval/`; every path, and what each dir holds: `nlp/node/paths.ts`
- `src/` — the app only; reaches `nlp/` through `$nlp` (`kit.alias`, `svelte.config.js`), nothing else
- `scripts/` — the `tsx` entry points behind the `package.json` scripts, and `fetch-model`; the node tier's CLI face, so they import it deep
- `tests/` — Vitest; `tests/app/`, `tests/nlp/{core,browser,node}/` by the tier under test; helpers and the fence at `tests/`

The seams are a static import fence, not package boundaries — `tests/import-fence.test.ts` holds the tier table (what each may import); `vite build` is the fence's other half. `nlp/` never imports `src/`: a later package split is a `git mv` plus configs.

## Upstreams

Two, both pinned:

- **`@carlwr/zsh-core`** at build time — `workspace:*`; corpus, taxonomy, resolver
  - every script reading it carries a `pre*` hook -> `upstream-ready.mjs ensure` (`PACKAGING.md`; `BZ_SKIP_UPSTREAM`: root `AGENTS.md`)
  - the browser bundle is zsh-core-free: the index carries each record's markdown body
- **Hugging Face Hub** at runtime — the browser embedder downloads the model on first visit
  - model id: `MODEL_ID` in `nlp/core/types.ts`; `scripts/fetch-model` repeats it, drift-checked by a test
  - the revision is pinned in `scripts/fetch-model` only; the browser pipeline names none

## Model and artifacts

Both gitignored:

- `scripts/fetch-model` -> `.aux/model/` — what every reporter needs (a missing or stale index is built in memory, never written)
- `.aux/query-cache.json` — query vectors the reporters and the gated tests keep across runs; self-invalidating (`nlp/node/query-cache.ts`), delete to reset
- `pnpm build:index` -> `static/artifacts/` — what `nlp/browser/artifacts.ts` fetches under `/artifacts`
  - an index that still validates against the corpus is kept; `--force`, `--validate`: `--help`
  - a rebuild embeds the corpus: a minute on CPU
  - the rules YAML is the editable form; the JSON is build output

## Tests

The package-specific part of `TESTING.md`:

- `pnpm test` is model-free by default: a test needing a gitignored input (`STAGED` in `nlp/node/paths.ts`) skips via `artifactGate` (`tests/_helpers.ts`)
  - `pnpm run test --reporter=verbose` prints the reason (bare `pnpm test` hands `--reporter` to pnpm itself)
  - committed inputs get no gate: their absence is a defect
- `BZ_REQUIRE_WEB_ARTIFACTS=1` flips skip -> fail
  - the CI `nlp` job (`.github/workflows/ci.yml`) sets it after fetching the model and building the index; not part of `integration`
  - rehearse that job locally: `ACT_JOB=nlp scripts/test-integration-act` from the repo root (VM sizing: root `DEVELOPMENT.md`)
- `BZ_NLP_SLOW=1` additionally runs the full mechanical report (embeds thousands of queries); CI stays at the capped smoke

### `UPDATE_*`: committed generated data

One mechanism, `assertCommittedJson` (`tests/_helpers.ts`): compare, or rewrite the file when the variable is `1`. Regenerate under the variable, commit the diff with the change that caused it.

<!-- concrete on purpose: the regeneration contract; `rg UPDATE_ tests/` verifies -->

| variable | regenerates | test (`tests/nlp/node/`) |
|---|---|---|
| `UPDATE_CATEGORIES_JSON` | `nlp/data/categories.json` | `categories.test.ts` |
| `UPDATE_LOOKUP_MAP` | `nlp/data/lookup-map.json` | `lookup-map.test.ts` |
| `UPDATE_LOOKUP_CONTRACT` | `nlp/data/lookup-contract.json` | `contract.test.ts` |
| `UPDATE_PARITY_FIXTURE` | `nlp/data/parity-fixture.json` | `fixtures.test.ts` |
| `UPDATE_SANITY_FIXTURE` | `nlp/data/sanity-fixture.json` — needs the model and the index | `fixtures.test.ts` |
| `UPDATE_SCHEMAS` | `nlp/rules/schema/*.schema.json`, `nlp/data/schema.json` | `rules.test.ts`, `qa-score.test.ts` |

## Parity and sanity fixtures

TS goldens generated by `nlp/node/fixtures.ts` (its header: what each pins); two tiers with disjoint failure modes:

- parity-fixture red -> ranker math diverged; `tests/nlp/core/parity.test.ts` — no embedder, no staged inputs
- sanity-fixture red -> embedder integration broke, or ranker drift; `tests/nlp/browser/sanity.test.ts` and `tests/nlp/node/fixtures.test.ts` — each header says what it checks

Parity asserts equality (the ranker is deterministic); sanity a tolerance (the embedder runtime carries platform noise).

## Reporters

- `pnpm nlp:*` in `package.json`; each `--help` is its usage
- the tuning trio: `nlp/NLP.md`

## Holdout hygiene

`nlp/NLP.md` — binding for every edit under `nlp/`.

## Routes

`src/routes/` — SvelteKit file routing; the record permalink is the deep link from a result card.

## Theming

`data-theme` on `<html>` drives CSS variables; mechanics: `src/app.html` (pre-paint), `src/lib/theme.ts` (toggle), `src/lib/markdown.ts` (Shiki dual theme).

## Hosting intent

- static SPA, no server; deploying is a follow-up — artifacts build locally and in the CI `nlp` job, nothing publishes them
- GitHub Pages first, Cloudflare Pages the alternative
- Pages hosts one site per repo, and `docs-zsh-core.yml` already claims it: the SPA takes the site root, the zsh-core docs move under `/zsh-core-docs/`, one deployment carries both
- before publishing:
  - `svelte.config.js` sets no `kit.paths.base`; the final URL decides
  - `THIRD_PARTY_NOTICES.md` — the bundle ships transformers.js, shiki and fonts; a real obligation, and this package has none of the user-facing docs its siblings carry

## Deferred

- the SPA deploy: §"Hosting intent"
- a split into its own repo: no technical driver; the payoff: the SPA's toolchain and dependency churn (SvelteKit, Vite, transformers.js) leave the workspace lockfile and root `qa`

## See also

- `nlp/NLP.md` — holdout rules, eval architecture
- `nlp/nlp-observations.md` — non-authoritative field notes
- `REPO-SHAPE.md` (repo root) — arrow diagram
