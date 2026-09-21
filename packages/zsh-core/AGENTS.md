# AGENTS.md — `@carlwr/zsh-core`

## Layout rules

- `src/docs/yodl/core/` — shared Yodl parsing machinery only.
- `src/docs/yodl/extractors/` — corpus-specific extraction into zsh doc records.
- `src/docs/yodl/extractors/modules/` — quirky modules get their own file; table-driven region modules go in `by-regions.ts`, flat lists in `trivial.ts`.
- `src/analysis/facts.ts` — public fact-model surface. Keep scanner mechanics and heuristics in sibling modules.

## Package imports

Canonical subpath list: `package.json` `exports`; per-subpath surface: `dist/types/*.d.ts`.

## Gotchas

**Static entrypoint fence:** the whole public surface is execution-, network- and env-free; hosts that run a zsh binary own that code, never zsh-core — tests are exempt (the rule is about the published surface). Enforced by a test in `src/test/`.

**Potential gap (observation, not a decision):** `docCategoryPreamble` has no out-of-process consumer — it is not in `index.json`, so `zshref` lists a category without its preamble. Consider carrying it in the index.

## Reference-dump review workflow

When adding or changing parsing/rendering, dump the full rendered corpus and inspect — both parse and render bugs surface there.

- Prefer actual zsh usage over raw upstream notation.
- Option docs: `zsh` forms first, plain-zsh defaults over emulation forms, `_Section:_` last.
- No category line in bodies (the record's `category` field is the structured form; `DESIGN.md`); typed extras (`_Module:_`, `_Args:_`, ...) end the body.
- Preserve visible prose unless there is a strong reason to change user-facing output.
- Generate: `dump:refs [OUTDIR]`. Diff dumps before/after edits to spot regressions.
- Review: for one-category changes read that category's file; for cross-cutting changes scan `all.md`.
- Drift catchers: `src/test/render/heuristics.ts` + `known-offenders.ts` (contract in its header).
- When a bug is found: prefer widening a heuristic so the family is caught corpus-wide; fall back to a targeted regression test only when a general heuristic is not tractable.
