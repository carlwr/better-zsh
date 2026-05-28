---
audience: maintainer
read-when: working on the nlp module; evaluating nlp packaging or asset sizes
---

# nlp

Experimental local semantic retrieval for zsh-core records. Embeds queries with a local BGE-small ONNX model; ranks against a precomputed vector index. Source at `../src/nlp/`; the crate stays single-crate with `#[cfg(feature = "nlp")]` (see `../AGENTS.md`).

## Hard rules: holdout isolation

Held-out eval sets: `tests/nlp-qa/nlp-corpus.yaml` and the `holdout`-split entries of `src/nlp/rules/sentence-fixture.yaml`. Steering anything toward them is leakage — hardcoded boosts/hints that memorized these queries were removed; do not reintroduce the pattern.

- **No editing NLP code or data with a holdout set in context.** "NLP" = anything under `src/nlp/` (incl. `rules/*.yaml`) and the `zshref-web/` ranker mirror. If you have read either eval set this session, delegate the edit to a fresh subagent that has not.
- **Touch a holdout set only via a subagent** that edits no NLP logic and whose reply leaks nothing about it — no queries, expected records, scores, counts, or paraphrases. The parent verifies this before proceeding.
- **New domain data** (synonyms, vocab) is authored blind — by a subagent that has not read the eval sets.
- The `train` split is not holdout; tuning against it is fine. Parity/sanity fixture inputs are not holdout either, but must not themselves be drawn from the eval sets (neither query nor target record).
- Dashboards/reports may show holdout only as a labelled overfit-watch — never as a tuning target.

A human may waive any of these by explicit, clear instruction.

### Reading the train split blind

```sh
yq '.entries |= map(select(.holdout != true))' src/nlp/rules/sentence-fixture.yaml
```

## Eval architecture (A / B / C)

Three layers, distinct jobs:

- **A — bare lookup contract** (committed `tests/nlp-qa/lookup-contract.json`) — deterministic must-pass. Every bare canonical surface form resolves via the lookup-map hard-promote. Pure corpus/resolver, no ranker.
- **B — Rust sentence eval** — the tunable scoring source-of-truth. Two sources, one continuous discount metric:
  - *curated* — the hand-authored sentence fixture; per-entry `targetDepth` + `weight` + `split`.
  - *mechanical* — corpus-derived per-record entries (terse decorated forms + NL-question forms), uniform `targetDepth=1`; each has a single defined answer (one item → one vote). Release-only.
  - blend `total = λ·curated_train + (1−λ)·mechanical` (λ=0.5); both evals and the dashboard print these numbers live.
- **C — node QA harness** — e2e parity smoke only: drives the release nlp binary, exercising the Rust↔node ranker mirror + CLI path; prints the held-out average score as an overfit watch. Not where scoring quality is judged.

Metric — the scored unit is each (expectedSet item, query) pair; an entry just groups one or more items under a shared query:

- item graded on its OWN rank → one gain; an N-item entry yields N independent gains (N× influence, by design).
- `targetDepth`/`weight` are per-item, defaulting to fixture `default-target-depth`/`default-weight`.
- every matching item is rewarded on its own rank — not just the best of a set, and with no diversity/anti-swamp dampening (unlike web rankers): the corpus is a fixed known set, all relevant records wanted near the top.
- gain `g(rank; d, β) = (1+(1/d)^β)/(1+(rank/d)^β)`; per-category weighted mean over items → unweighted mean across categories.
- β, `target_depth`, λ: fixed human-judgment values — never enter `Tuning`/`tuning.yaml`, never auto-tuned.

## No committed score snapshots

Scores, QA averages, and #1-violation counts are **never** committed — not in a file, comment, constant, or doc. A committed number drifts with the model/corpus into a false invariant, and committing holdout figures breaks the isolation rules above. Judge a change by re-running both evals before and after the edit and comparing — never a recalled or committed value.

Exempt: the lookup/parity/sanity fixtures, asserted by equality. Their numbers pin *behaviour*, not *quality* — determinism is the point of committing them.

## Synonyms: restraint + anti-swamp

Two mechanisms in `rules/synonyms.yaml` (index-time `index_groups`, query-time `query_expansions`). Field notes + measurements: `nlp-observations.md`.

- **Keep both lists short.** The model already bridges most generic synonymy (`nlp-observations.md`); add a term only after an ON/OFF probe shows it's missed.
- **Query expansion is embedding-only.** `query_expansions` append to the *embedded* query string only; the raw query still drives lexical boosts (`rank.rs` `word_overlap`/`exact_word`). Feeding expansions into the lexical bag promotes literal-name records and swamps short queries — don't.
- **Minimal RHS + cap.** One canonical `add` per rule, capped append count (`query_expand.rs`). Don't grow `add` into a bag, or short queries collapse toward a generic centroid.

## Packaging direction

Same-repo `nlp` Cargo feature. Two binaries from one crate:

- `zshref` (default features) — no NLP code, no ONNX / fastembed deps, small
- `zshref-nlp` (`--features nlp`) — adds local semantic search

Index, rule data, fixtures, categories, and lookup-map JSON ship as zshref release artifacts; consumers (CLI users, `zshref-web`) pin to a release. See repo-root `REPO-SHAPE.md`.

Standalone embedded-asset packaging (raw / zstd / quantized model bytes baked into the binary) deferred — `cargo install` is not the delivery channel for the NLP variant.

## Measurements (2026-05-19)

Asset sizes:

| Asset | Size |
|---|---:|
| BGE-small ONNX model | 127M |
| tokenizer / config JSONs | ~708K |
| generated vector index JSON | 18M |

Release-binary shapes:

| Variant | Binary | Warm runtime | Max RSS |
|---|---:|---:|---:|
| External assets | 22M binary + 145M assets | ~0.20s | ~432M |
| Raw embedded model + index | 166M binary | ~0.19s | ~610M |
| zstd embedded model + index | 89M binary | ~0.48s | ~557M |
| Quantized model smoke, no index | 84M binary | ~0.09s | ~352M |

Compression checks:

| Payload | gzip -9 | zstd -19 |
|---|---:|---:|
| current ONNX model | 76M | 66M |
| current index JSON | 6.6M | 5.7M |
| quantized ONNX model | 61M | 61M |

## Open

- Retrieval-quality eval on quantized BGE-small (gates mobile-friendly browser-side embedding for `zshref-web`).
- Investigate the ~2 pp QA-harness regression after the zsh-option md format change from `SOME_OPT` to **`SOME_OPT`** (baseline 2026-05-22: ~93 % pass, 5 warnings, 75 hard-check failures).

## Upstream API references

- `fastembed::UserDefinedEmbeddingModel` accepts ONNX + tokenizer bytes — `https://docs.rs/fastembed/latest/fastembed/struct.UserDefinedEmbeddingModel.html`
- `ort::SessionBuilder` commits ONNX from memory — `https://docs.rs/ort/latest/ort/session/builder/struct.SessionBuilder.html`
