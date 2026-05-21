---
audience: maintainer
read-when: writing TypeScript or shell scripts
---

# STYLE-CODE.md

Code style for TypeScript and shell scripts. Project-agnostic principles; project-specific addenda live in `AGENTS.md`.

## TypeScript

- Prefer naming over comments.
- Prefer functional, pure code.
- No classes except where framework APIs require provider classes.
- Avoid mutable state; isolate when unavoidable.
- Extract pure, testable helpers freely if they clarify intent.
- Prefer call sites that read through function names over inline code.
- Keep files focused.
- Over explanatory prose, prefer:
  - structure
  - names
  - types
- Use established terms consistently; once a concept is named "facts", keep using it.

Preferred style for multiline string literals (top-level/file level):

```ts
const str = `\
first line
second line\
`
```

## Conciseness

- Prefer short identifiers.
- Collapse repeated patterns into shared helpers.
- Decide conciseness consciously; a mild clarity tradeoff may still be worth it.
- Steering metric: `wc -w` (or `wc -c`); never `wc -l`. Line count is a structural shape signal (too big -> split), not a content metric.
- Counter the line-count-as-conciseness bias actively in any agent-facing prose.
- For conciseness-only changes: at minimum, do not grow `wc -w`.

## Single source of truth

Same value (literal, shape, behaviour) in two places: declare once and reference. Parallel definitions drift silently; type-checking rarely catches it.

```diff
- // file-a.ts and file-b.ts both declare:
- const fileName = "things.json"
- const countKey = "things"
+ // shared.ts: one base, derive the rest
+ const base = "things"
+ export const fileName = `${base}.json`
+ export const countKey = base
```

Where N entries follow a rule from one per-row input, derive — don't hand-list shape. Same for type shapes: when fields follow a rule from a closed key set, prefer a mapped type over a hand-listed interface. Where most rows share a default, list deviations only and fall through. When such a table needs to be materialized in full, iterate the canonical key source (e.g. the union's literal list), not the table's own keys — otherwise default-bearing keys are silently absent.

A drift-catcher (completeness guard, parity test, "must stay in sync" comment) next to a hand-listed table is itself the signal: the structure is derivable. Remove the duplication; the guard becomes unnecessary. Reserve guards for shapes the type system can't enforce by construction (e.g. a runtime tuple whose ordering matters).

Accidental similarity of conceptually-different values may stay duplicated; when the *implementation* must match but the *meaning* differs, share a helper, not the name.

## Module layout

- no `index.ts` barrels under `src/**/` — use `src/<area>.ts` beside `src/<area>/` when an aggregate is needed
- published TS packages: each non-glob `package.json` `exports` key has a matching package-root facade (`.` -> `index.ts`, `./foo` -> `foo.ts`)

## Types

- Branded types for domain strings.
- Smart constructors (e.g. `mkBrand`) are the trusted cast points for brands.
- Named type aliases for literal unions.
- Short field names where clear.
- If a value deserves to travel, give it a type.
- No `enum`; literal unions.
- Discriminated unions over scattered booleans.
- Deferred computation (memoized, cached) over mutable tracking.
- Do not add inner `readonly` reflexively. Add it when the type itself must be non-mutable across call boundaries.
- Module-level `Set` / `Map` constants that must not mutate: `ReadonlySet` / `ReadonlyMap`.

## Casts (`as`)

Every `as` is a trust assertion.

Principled:

- Brand minting inside smart constructors.
- Central dispatchers bridging a correlation TypeScript cannot express.
- Correlated-union constructors.
- Literal-union narrowing at a single table entry.
- Brand-to-string peeling for display or string-native operations.

Smells:

- Cross-brand casts outside the sanctioned crossing — route through a resolver/dispatcher.
- Ad-hoc construction of discriminated-union members at call sites — use a typed constructor.
- Hand-rolled string forms of branded / typed identifiers — use the typed constructor; the rule applies in tests and tables, not just production code.
- Scaffolding casts hiding a design issue (sometimes look like `as unknown as T` - but note that this pattern is not always a smell).

Rules of thumb:

- A new cast needs an articulable invariant.
- If the same cast appears in multiple places, extract a typed constructor.

## Surface invariants

- Small declaration comments are fine for scanning-loop state.
- Prefer "obviously correct islands": narrow, pure, strongly-typed helpers.
- Prefer structural enforcement over advisory comments.
- Prefer type-level invariants over runtime assertions when the type system can express the property.
- Evaluate a package's public surface from a general-consumer perspective, not only through one consumer's needs.

## Shell scripts: tooling preferences

Authoring zsh/shell scripts:

- `set -e` (or `set -eu -o pipefail`) at top — free linting on tool errors.
- Prefer `yq` for YAML; `set -e` turns parse errors into loud failures.
- Prefer `perl -wne`, `sed`/`sed -E`, or `pcre2grep` over `grep` — BSD/GNU `grep` divergence eventually bites.
- Avoid zsh/bash `read` loops for parsing — readability poor, IFS hazards.
- Underlying principle: prefer tools whose parsing and regex behavior is locked across platforms.
