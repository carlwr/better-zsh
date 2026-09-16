---
audience: maintainer
read-when: working on zshref-web's NLP (ranker, index, rules, evals) or its held-out sets
---

# NLP

Local semantic retrieval over zsh-core records: the query embedded with BGE-small, ranked against a precomputed vector index, a lookup-map promote on top. Code: `src/lib/ranker/` (the browser ranker) and `nlp/` (the Node side: index build, rules, evals). Layout, toolchain, tests: `../AGENTS.md`.

## Hard rules: holdout isolation

Held-out eval sets: `nlp/data/nlp-corpus.yaml` and the `holdout`-split entries of `nlp/rules/sentence-fixture.yaml`. Steering anything toward them is leakage — hardcoded boosts/hints that memorized these queries were removed; do not reintroduce the pattern.

- **No editing NLP code or data with a holdout set in context.** "NLP" = anything under `nlp/` (incl. `rules/*.yaml`) and `src/lib/ranker/`. If you have read either eval set this session, delegate the edit to a fresh subagent that has not.
- **Touch a holdout set only via a subagent** that edits no NLP logic and whose reply leaks nothing about it — none of:
  - queries
  - expected records
  - scores
  - counts
  - paraphrases
- **The parent verifies** the reply leaks nothing before proceeding.
- **New domain data** (synonyms, vocab) is authored blind — by a subagent that has not read the eval sets.
- The `train` split is not holdout; tuning against it is fine. Parity/sanity fixture inputs are not holdout either, but must not themselves be drawn from the eval sets (neither query nor target record).
- Dashboards/reports may show holdout only as a labelled overfit-watch — never as a tuning target.

A human may waive any of these by explicit, clear instruction.

### Reading the train split blind

From the package dir:

```sh
yq '.entries |= map(select(.holdout != true))' nlp/rules/sentence-fixture.yaml
```

## Eval architecture (A / B / C)

Three layers, distinct jobs:

- **A — bare lookup contract** (committed `nlp/data/lookup-contract.json`; `tests/lookup-contract.test.ts`) — deterministic must-pass. Every bare canonical surface form resolves via the lookup-map hard-promote. Pure corpus/resolver, no ranker.
- **B — sentence eval** (`nlp/eval/`) — the tunable scoring source of truth. Two sources, one continuous discount metric:
  - *curated* (`pnpm nlp:eval-sentence`) — the hand-authored sentence fixture; per-entry `targetDepth` + `weight` + `split`.
  - *mechanical* (`pnpm nlp:eval-mechanical`) — corpus-derived per-record entries (terse decorated forms + NL-question forms), uniform `targetDepth=1`; each has a single defined answer (one item → one vote).
  - blend `total = λ·curated_train + (1−λ)·mechanical` (λ=0.5); both evals and the dashboard print these numbers live.
  - the tuning trio (`pnpm nlp:tune-*`) moves rank-time knobs only (`BZ_TUNE_BASE` overrides; the keys: `nlp/eval/sweep.ts`), scores the blend, prints holdout as the overfit watch.
  - cost on CPU, roughly: the curated eval seconds, the mechanical eval or the diff a minute, the dashboard a few minutes, the sweep tens of minutes (every knob point re-ranks the whole mechanical set) — run a sweep only when a knob change is actually on the table
- **C — QA scoring** (`pnpm nlp:qa-score`; `nlp/eval/qa-score.ts`) — in-process; an overfit watch, not where scoring quality is judged:
  - templated self-retrieval hard checks over a few categories
  - the QA corpus as a second held-out set: weighted expected sets, negatives as penalties
  - prints the hard-check section and the summary lines only

Metric — the scored unit is each (expectedSet item, query) pair; an entry just groups one or more items under a shared query:

- item graded on its OWN rank → one gain; an N-item entry yields N independent gains (N× influence, by design).
- `targetDepth`/`weight` are per-item, defaulting to fixture `default-target-depth`/`default-weight`.
- every matching item is rewarded on its own rank — not just the best of a set, and with no diversity/anti-swamp dampening (unlike web rankers): the corpus is a fixed known set, all relevant records wanted near the top.
- gain `g(rank; d, β) = (1+(1/d)^β)/(1+(rank/d)^β)`; per-category weighted mean over items → unweighted mean across categories.
- β, `target_depth`, λ: fixed human-judgment values — never enter `Tuning`/`tuning.yaml`, never auto-tuned.

## No committed score snapshots

Scores, QA averages, and #1-violation counts are **never** committed — not in a file, comment, constant, or doc. A committed number drifts with the model/corpus into a false invariant, and committing holdout figures breaks the isolation rules above. Judge a change by re-running both evals before and after the edit and comparing — never a recalled or committed value.

Exempt: the lookup/parity/sanity fixtures — asserted by equality, the sanity scores within a tolerance. Their numbers pin *behaviour*, not *quality* — determinism is the point of committing them.

## Synonyms: restraint + anti-swamp

Two mechanisms in `nlp/rules/synonyms.yaml` (index-time `index_groups`, query-time `query_expansions`). Field notes + measurements: `nlp-observations.md`.

- **Keep both lists short.** The model already bridges most generic synonymy (`nlp-observations.md`); add a term only after an ON/OFF probe shows it's missed.
- **Query expansion is embedding-only.** `query_expansions` append to the *embedded* query string only; the raw query still drives lexical boosts (`src/lib/ranker/rank.ts` `wordOverlap` / exact-word). Feeding expansions into the lexical bag promotes literal-name records and swamps short queries — don't.
- **Minimal RHS + cap.** One canonical `add` per rule, capped append count (`src/lib/ranker/query-expand.ts`). Don't grow `add` into a bag, or short queries collapse toward a generic centroid.

## Measurements (2026-05-19)

Dated history; re-measure before relying on a number.

| Asset | Size |
|---|---:|
| BGE-small ONNX model | 127M |
| tokenizer / config JSONs | ~708K |
| generated vector index JSON | 18M |

Compression checks:

| Payload | gzip -9 | zstd -19 |
|---|---:|---:|
| ONNX model | 76M | 66M |
| index JSON | 6.6M | 5.7M |
| quantized ONNX model | 61M | 61M |

## Open

- Retrieval-quality eval on quantized BGE-small (gates mobile-friendly browser-side embedding).
