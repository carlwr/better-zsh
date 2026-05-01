# AGENTS.md — `@carlwr/zsh-core`

Library: typed zsh-knowledge corpus, brand types, render, analysis, resolver.

## Layout rules

- `src/docs/yodl/core/` — shared Yodl parsing machinery only.
- `src/docs/yodl/extractors/` — corpus-specific extraction into zsh doc records.
- `src/analysis/facts.ts` — public fact-model surface. Keep scanner mechanics and heuristics in sibling modules.

## Package imports

Prefer explicit subpaths so dependency arrows stay visible and rollups stay legible. Canonical subpath list: `package.json` `exports`; per-subpath surface: `dist/types/*.d.ts`. High-level shape:

- **`@carlwr/zsh-core`** — tiny corpus surface:
  - load
  - type
  - aggregate metadata
- **`@carlwr/zsh-core/types`** — record types and brand smart constructors.
- **`@carlwr/zsh-core/analysis`** — line-local analysis and scanner helpers.
- **`@carlwr/zsh-core/taxonomy`**:
  - category enumeration
  - ordering
  - labels
  - piece-id helpers
- **`@carlwr/zsh-core/resolver`** — raw → identity, feedback channel.
- **Other subpaths** — `./render`, `./exec`, `./assets`, `./meta`.

## Gotchas

**Yodl macro args can contain literal parentheses:** a `)` only closes the current macro arg when it closes the outermost level. Matters for corpus forms like `tt(AUTO_CD) (tt(-J))`.

**Yodl macro detection allows digit-adjacent macros:** vendored docs contain forms like `1tt(})`, so a preceding digit must not suppress macro parsing even though a preceding letter or underscore should.

**Static entrypoint fence:** a test in `src/test/` walks the import graph from the static entrypoints (`.`, `./analysis`, `./types`, `./meta`, `./render`, `./assets`, `./resolver`, `./taxonomy`) and rejects reached files that import execution/network/env APIs. `./exec` is excluded (exposes a `ZshRunner` injection type). Prophylactic — keeps static-reference consumers structurally execution-free even when zsh-core gains new internal helpers.

## Reference-dump review workflow

When adding or changing parsing/rendering, dump the full rendered corpus and inspect — both parse and render bugs surface there.

- Generate: `pnpm --filter better-zsh run dump:refs [OUTDIR]` (default `.aux/refs`).
- Review: for one-category changes read that category's file; for cross-cutting changes scan `all.md` or delegate an Explore subagent. `suspicious.md` lists heuristic hits.
- When a bug is found: prefer widening `suspiciousPatterns` in `src/render/dump.ts` so the family is caught corpus-wide; fall back to a targeted regression test only when a general heuristic is not tractable.
