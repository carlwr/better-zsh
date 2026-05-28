# nlp observations

> **Non-authoritative field notes — may be stale the moment you read them.**
> Snapshots of empirical behaviour, not rules. Rules live in `NLP.md`. Re-measure
> before trusting any bullet; delete bullets that no longer hold.

Method: BGE-small, ON/OFF re-embed A/B (synonyms baked vs empty) + manual query probes (2026-05-30).

- BGE already bridges generic English synonymy (folder≈directory, remove≈delete) — synonym lists are mostly redundant.
- Query-side expansion of short queries can swamp: scores compress, literal-name records get promoted — the main regression risk.
- Swamping rides the lexical channel → query expansion must be embedding-only (kept out of `word_overlap`).
- Minimal RHS (one canonical term) + a small append cap keep embedding drift bounded.
- Plurals carry only a faint, noisy signal; conflating singular/plural costs ~nothing.
- The `element` vs `elements` → different-subscript-flag nuance is not model-capturable anyway.
- Highest-value synonyms are zsh jargon the model misses, not generic English.
- Verify any candidate synonym with an ON/OFF probe before adding it.

Eval maturity (2026-05-31) — the scored corpus + sentence fixtures are still rudimentary:

- Hard-check template wording matters: a colloquial word ("command") inflated pass rates via vocabulary that echoed the test — use the canonical category word.

Lexical false-positive suppression (2026-06-03) — net-negative, abandoned:

- Tried: auto-suppress the exact-name lexical boost for "common" query words, with commonness derived from corpus frequency (to avoid a hand-maintained stopword list).
- It fixed the targeted false positives but lost more elsewhere: in this domain many common English words are themselves legitimate record names (control-flow keywords and the like), so a frequency gate strips their exact-name signal along with the prose noise.
- Core limitation: corpus frequency can't tell a word-used-as-prose from the same word naming a construct — the discriminator the idea needs doesn't exist at that level. Reverted.
