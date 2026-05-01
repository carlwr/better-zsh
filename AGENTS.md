**Subpackage `AGENTS.md` — read before non-trivial work in any of these directories:**

- `packages/zsh-core/AGENTS.md`
- `packages/zsh-core-tooldef/AGENTS.md`
- `packages/zshref-mcp/AGENTS.md`
- `packages/vscode-better-zsh/AGENTS.md`
- `zshref-rs/AGENTS.md`

Each directory has its own `AGENTS.md` with rules local to that subpackage. `CLAUDE.md` in each is a symlink to `AGENTS.md` — edit the `AGENTS.md` target.

## `.md` edit ritual — non-negotiable. (placed here close to top for prominence - KEEP HERE)

Every `.md` edit, however small, follows these steps:

- **Before editing** — re-read `## Markdown style in docs` in full. It is short by design; reading it is cheap.
- **While editing** — each new sentence asks "could this be bullets?". >=3 distinct items -> "yes".
- If file is <600 lines, _full file must be put into context_, so repetitions can be avoided
- **Before returning** — **audit explicitly** against `## Markdown style in docs`

**The before-returning audit is mandatory.**

## Overview

Workspace shape and per-package distribution: `README.md` packages table. Pre-1.0; libraries still free to move.

## See also

- Package `dist/types/*.d.ts` — rolled-up public APIs with JSDoc.
- **`skills/orient/`** — discovery scripts and reading paths.
- **`plan-json-artifacts.md`** — deferred plan for release-hosted JSON artifacts.

## DRY across documentation layers

Keep docs non-redundant; audience decides placement.

- **JSDoc** — end-user facing. Terse. What/how, not why; no history or cross-file narrative.
- **Code comments** — maintainer facing:
  - local rationale
  - invariants
  - workarounds
  - "why not the obvious alternative"
- **File-header comments** — first few lines of any Makefile/config/source file. Keep locally essential. Do NOT:
  - claim global state about other files/packages ("everything else stays pnpm-driven");
  - restate what the file already expresses:
    - filename
    - location
    - structure
  - restate design decisions whose home is elsewhere.

  When implementing from a plan, treat plan prose as intent — re-derive header text from the destination file's own purpose.
- **`PRINCIPLES.md`** — cross-cutting design principles. Read before designing a feature or doc category; edit when a tradeoff genuinely shifts.
- **`DESIGN.md`** — subsystem-specific rationale. Subsystem-level "why".
  - Name load-bearing types and APIs:
    - `Documented`
    - `Observed`
    - `resolve`
    - category keys where the point is taxonomy
  - Concrete zsh syntax for examples.
  - Avoid volatile inventories:
    - record-type names
    - deep file paths
    - test filenames
    - version pins
    - counts
  - Prefer:
    - directory references
    - `see JSDoc`
    - one representative example
  - When a point belongs in `PRINCIPLES.md`, cross-link instead of restating.
- **`DEVELOPMENT.md`** — repo- or package-local operational notes:
  - package-specific invariants
  - build/test/release mechanics
  - pointers to truth

  Don't repeat:
  - repo-wide policy (`AGENTS.md`)
  - principles (`PRINCIPLES.md`)
  - subsystem rationale (`DESIGN.md`)
- **`AGENTS.md`** — contributor conventions:
  - style
  - testing
  - packaging
  - workflow

## Short architecture summary

Three orthogonal domains (details: `DESIGN.md`):

- **A — Parsed Documentation**
  - `src/docs/`
  - static vendored zsh knowledge
  - _notes:_ `DocCategory` is a closed taxonomy; each category has a doc-record type and a `Documented<K>`-keyed `DocCorpus` map
- **B — Fact Extraction**
  - `src/analysis/`
  - coarse annotations about user code
  - _notes:_ facts may carry `Observed<K>`, never `Documented<K>`
- **C — Markdown Rendering**
  - `src/render/`
  - doc records → markdown
  - _notes:_ depends on A; orthogonal to B

Sanctioned brand crossing: `resolve(corpus, cat, raw)`.

Principle: **_Consumers_ compose and combine** — `zsh-core` does not expose a "candidate in, markdown out" function.

- _tool adapters:_ raw input -> response records
- _extension:_ user-code facts -> doc records -> hover markdown

### zsh-core package imports

Prefer explicit subpaths from `@carlwr/zsh-core` so dependency arrows stay visible and rollups stay legible. Subpath inventory: `packages/zsh-core/AGENTS.md`.

### Tooldef + adapters

Principle: tooldef consumes zsh-core; adapters consume tooldef. Do not add zsh-core query APIs just to support an adapter.

Static, read-only, no-execution posture is a product feature. Mechanics + scope-fence enforcement: `packages/zsh-core-tooldef/AGENTS.md`.

## Code style

- Prefer naming over comments.
- Prefer functional, pure code.
- No classes except where VS Code APIs require provider classes.
- Avoid mutable state; isolate when unavoidable.
- Extract pure, testable helpers freely if they clarify intent.
- Prefer call sites that read through function names over inline code.
- Keep files focused.
- Over explanatory prose, prefer:
  - structure
  - names
  - types
- Use established terms consistently; once a concept is named "facts", keep using it.

### Conciseness

- Prefer short identifiers.
- Collapse repeated patterns into shared helpers.
- Decide conciseness consciously; a mild clarity tradeoff may still be worth it.
- For conciseness-only changes, compare `wc -w` or `wc -c` before/after — at minimum, do not grow the text.

### Types

- Branded types for domain strings.
- Smart constructors (`mkObserved`, `mkDocumented`, `mkOptFlag`, ...) are the trusted cast points for brands.
- Named type aliases for literal unions.
- Short field names (`desc`, `op`) where clear.
- If a value deserves to travel, give it a type.
- No `enum`; literal unions.
- Discriminated unions over scattered booleans.
- Deferred computation (`memoized`, `cached`) over mutable tracking.
- Do not add inner `readonly` reflexively. Add it when the type itself must be non-mutable across call boundaries.
- Module-level `Set`/`Map` constants that must not mutate: `ReadonlySet` / `ReadonlyMap`.

### Casts (`as`)

Every `as` is a trust assertion.

Principled:
- Brand minting inside smart constructors.
- Central dispatchers bridging a correlation TypeScript cannot express (`renderDoc`, `resolve`, category resolver tables).
- Correlated-union constructors (`mkPieceId`).
- Literal-union narrowing at a single table entry.
- Brand-to-string peeling for display or string-native operations.

Smells:
- Cross-brand casts outside the sanctioned crossing — route through `resolve(corpus, cat, raw)`.
- Ad-hoc construction of discriminated-union members at call sites — use `mkPieceId`.
- Scaffolding casts hiding a design issue, especially `as unknown as T`.

Rules of thumb:
- A new cast needs an articulable invariant.
- If the same cast appears in multiple places, extract a typed constructor.
- Outside brand minting, the resolver layer is the sanctioned brand crossing.

### Surface invariants

- Small declaration comments are fine for scanning-loop state.
- Prefer "obviously correct islands": narrow, pure, strongly-typed helpers.
- Prefer structural enforcement over advisory comments.
- Evaluate zsh-core's public surface from a general-consumer perspective, not only through extension needs.

### Makefile conventions

- `.PHONY: <target>` inline on its own line directly above each target block — not one grouped declaration at the top. Keeps diffs minimal as targets come and go.
- No top-of-file prose duplicating the target list; see DRY across documentation layers above.

### Never enumerate or count `DocCategory`

Hand-written category lists drift. Same posture for other closed zsh-core unions (e.g. `ResolverFeedback` kinds).

- In JSDoc, comments, docs: give examples, not exhaustive lists.
- No hard-coded category counts in prose.
- Runtime strings and JSON Schema `enum` values interpolate from canonical zsh-core exports — never hand-typed.
- Category-indexed tables belong in zsh-core with structural completeness guards; consumers import them.

Rationale: `DESIGN.md`, `PRINCIPLES.md`.

### Resolver scope

Close-variant normalization of a raw token against a documented identity is in scope. In-context decomposition of user expressions is not. See `PRINCIPLES.md`.

### Hover docs

- Prefer actual zsh usage over raw upstream notation.
- Option hovers: `zsh` forms first, category last, plain-zsh defaults over emulation forms.
- When adjusting Yodl parsing for rendered markdown, preserve visible prose unless there is a strong reason not to.
- After parsing changes, inspect reference dumps for regressions: workflow in `packages/zsh-core/AGENTS.md`.

### Other tools

- `@carlwr/typescript-extra` and `@carlwr/fastcheck-utils` are workspace-root dev dependencies. Keep them even when temporarily unused; individual packages may add or drop based on actual use.

## Testing

- Reproducibility matters: randomness uses a fixed checked-in seed.
- Property-based tests encouraged for suitable pure logic.

### Validation before returning

Pre-commit gate: `pnpm qa` = `pnpm check && pnpm test` (typecheck + lint + unit). Bare `pnpm test` skips typecheck.

```sh
# after any edits:
pnpm format && pnpm qa

# after code edits — fuller chain:
pnpm format && pnpm qa && pnpm test:smoke && pnpm vsix && pnpm test:integration &>/dev/null
```

- `pnpm format` first.
- `pnpm qa` failure blocks commit — fix and re-run.
- `INTERACTIVE`, `REGISTRY` excluded unless asked.
- Docs-only / non-code: skip tests unless asked.
- `.md` edits — run the pre-return audit at the end of `## Markdown style in docs` over the diff (mechanical regex + manual checklist). Required even for "small" edits.

### Test-running policy

Independent name markers in `package.json` scripts:

- `*:integration` — long-running, noisy CI-parity checks. Safe. Run last, silence with `&>/dev/null`.
- `*INTERACTIVE*` — takes over the desktop (VS Code/Electron). Explicit consent only — on macOS steals focus.
- `*REGISTRY*` / `verifyREGISTRY` — depends on currently published npm/JSR state. Can fail legitimately before upstream republish. Explicit consent.

Rules:

- "All tests" excludes `INTERACTIVE` and `REGISTRY`.
- Non-scary scripts must not chain into scary ones (no `test:*`, `build*`, `vsix`, `dump:*` routing into `INTERACTIVE`, `REGISTRY`, or `verifyREGISTRY`).
- Unit tests are the baseline; integration tests are an extra layer and may overlap.
- External-tool-dependent integration tests must skip gracefully when the tool is absent.
- "Obviously correct" helpers don't need tests.

Discover scary scripts via the markers: `jq '.scripts | keys' package.json packages/*/package.json | rg 'REGISTRY|INTERACTIVE'`.

Per-package `test:integration` is intentionally not one mechanism:
- extension: `act`
- MCP: native-host CI-parity aggregator
- workspace: delegates via `pnpm -r --if-present`

### Test conciseness

If you touch tests, look for conciseness wins unless that would hide intent.

- Remove repetition.
- Prefer tables/helpers when arrange/act/assert repeats.
- Keep `desc`/labels only when they add information.
- Derive titles from the sample or a small discriminator.
- Use the smallest fixture that still proves the point.
- Shared fixture shapes become helpers.
- `test.each` / `describe.each` when it truly reduces duplication.

### Test helpers

- Unit-test files are `*.test.ts` under `src/test/`.
- Shared test helpers live alongside but must not match `*.test.ts`.
- Don't rely on a leading underscore; the glob is the real inclusion mechanism.

### Testing tools

- Vitest for unit tests.
- Mocha for Electron tests.
- `fast-check` via `@fast-check/vitest`. If `fc.char()` or `fc.stringOf()` unavailable, fall back to `fc.mapToConstant(...)` + `fc.array(...)`.

## Packaging

### npm + JSR dual publish

These publish to npm and JSR:
- `@carlwr/zsh-core`
- `@carlwr/zsh-core-tooldef`
- `@carlwr/zshref-mcp`

The Rust CLI in `zshref-rs/` publishes via cargo/crates.io — see `zshref-rs/` for release conventions.

- No runtime `package.json` reads in library code; JSR consumers receive source-form packages plus declared data/assets, not npm `dist`.
- Package identity lives in a package-local `src/meta/pkg-info.ts`; runtime and build code import from there.
- `pkg-info.test.ts` guards manifest drift.
- Shared subpath exports must stay aligned across `package.json` and `deno.json`.
- npm-only generated artifacts and workspace-internal entrypoints stay out of `deno.json.exports`.

### Linguist hints (deferred)

`.gitattributes` (`linguist-generated`, `linguist-vendored`, `linguist-documentation`) can steer GitHub's Linguist to keep the language-bar honest and collapse generated diffs. Yodl sources are vendored — decide separately whether Linguist noise warrants marking them.

### `BZ_SKIP_UPSTREAM`

Two contracts prevent races on shared upstream `dist/` (tsup `clean: true` wipes it at every concurrent rebuild):

- downstream `pre*` hooks short-circuit on `BZ_SKIP_UPSTREAM`
- workspace-recursive aggregators route through `scripts/upstream-ready.mjs`

Spec + enforcement: `scripts/verify-upstream-contract.mjs`. New aggregators invoking upstream-rebuilding `pre*` hooks follow the pattern; hook-less aggregators (`format`, `lint`) need not.

## Contributor guidance

### Keeping docs fresh

- Worked on from multiple agent tools — contributor docs and skills stay tool-agnostic.
- Prefer constraints and intent over enumerating volatile specifics; prefer patterns over exact filenames when source or scripts already supply the list.
- `DEVELOPMENT.md` scope stays local — package-local in package, repo-wide policy in root docs.
- Public repo. Treat as public:
  - checked-in docs
  - skills
  - handoffs
  - workflow comments

  Forbidden:
  - secrets
  - tokens
  - recovery codes
  - session material

  OK when operationally necessary: secret names, high-level auth posture.
- Snapshot/handoff docs declare their staleness posture near the top and stay short. Orientation notes, not specs or runbooks, unless written as one.
- If a detail is cheaply derivable, point there and summarize the invariant rather than copying. Sources:
  - manifests
  - workflows
  - scripts
  - tests

  When a copy is needed, add a drift guard. Renaming or deleting a symbol or file counts as "a copy" — see Renames below.
- Agents may not edit `SECURITY.md`; tell the user and suggest updates. Likely triggers:
  - changes to extension zsh execution
  - `source`/`.` link resolution
  - extension settings

### Repo symlinks

- `scripts/list-repo-symlinks` — enumerates symlinks in HEAD; flags broken targets.
- `scripts/check-claude-md-pairs` — every `AGENTS.md` has a sibling `CLAUDE.md`.
- Editing a symlink writes through to its target.
- Both scripts gate `pnpm qa` via `pnpm lint:symlinks` (quiet mode).

### Post-extraction repo URLs in user-facing docs

On first stable release: `zshref-rs/` → `zshref` repo; `packages/zshref-mcp/` → `zshref-mcp` repo. Rest stays `better-zsh`.

- User-facing `.md` (`README.md`, `DEVELOPMENT.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md`) in workspace root and each to-be-extracted dir already uses post-extraction repo URLs. Don't revert to monorepo-subpath form.
- Project name is `zshref`; `zshref-rs` is only the current monorepo dir path.
- Maintainer-focused docs (`AGENTS.md`, `DESIGN.md`, `*EXTRACTION.md`, handoffs) keep describing pre-release monorepo state.

### Markdown style in non-user-facing docs

"non-user-facing docs": AGENTS.md, DESIGN.md and similar - NOT README.md, DEVELOPMENT.md etc.

> **Self-application:** each rule has one home. When extending, search first; add a new heading rather than restating elsewhere.

Default forms:

- bullets
- fenced code blocks
- tables

Prose is the fallback for:

- continuous reasoning
- contrast pairs
- `;`-joined cohesive thoughts that read as one flow

#### The bullet rule (most-violated)

A passage naming 3-4 distinct items is USUALLY a bullet list - if items are single-word, the _may_ be left as prose.
A passage naming >=5 distinct items is ALWAYS a bullet list.

Per-item conciseness comes from shortening each bullet, never from joining bullets into prose.

No exceptions for:

- per-item brevity
- per-item rationale moved to a pointer
- items being short names or labels
- the surrounding sentence being a pointer
- nesting context

Forms that do NOT satisfy "list":

- semicolon-chains in prose
- `(a)/(b)/(c)` parentheticals
- colon-introduced inline series ("the categories: X, Y, Z")
- "X, Y, and Z" series
- parenthesised item enumerations (`(X, Y, Z)`)

Two items: bullets when scanning aids comparison; inline when they read as one phrase.

#### Nested bullets

- first-class
- sub-bullets may themselves nest
- no depth cap

Packed → unpacked example:

```
- **Item** (`/path`) — what it is. Note; another note.
```

```
- **Item**
  - `/path`
  - what it is
  - _notes:_ note; another note
```

#### Other rules

- one thought per bullet or sentence
- bullets do not restate adjacent code/structure
- pointers replace per-item rationale, not the bullet structure
- fenced code blocks carry command sequences; never paraphrase them in prose
- comments inside a fenced code block label variants
- a list of files or links is a list — path alone by default; rationale only when it changes the reader's next action and isn't at the target
- cross-refs default to file-level (`see DESIGN.md`); section-quoted (`§"..."`) reserved for large files where the section adds signal — drifts on heading rename
- numbered ordinals only when semantically load-bearing
- concrete enumerations (files, paths) OK when not inferrable — mark with inline HTML comment
- incomplete sentences in bullets fine
- structured form is target state even at modestly higher word count; phrase-level edits (tighten, reword) stay within existing word budget
- no markdown links to repo files: `file.md`, not `[text](file.md)`

#### Hierarchy devices

- italic prefix labels (`_notes:_`, `_Subject_:`, `_term_:`) rank info within a structure
- separate lines: principle and implication don't share a sentence
- arrows (`A -> B -> C`) for composition flows

#### Code↔doc coupling

After substantive code changes, audit relevant `.md` for stale or restructure-worthy mentions of the changed code. Phrasing what code *truly is* requires implementer context — a doc-only pass cannot make these calls.

### Recording design decisions

Record "why" when it helps future work. Prefer the narrowest discoverable home:
- source comments for local rationale
- `DESIGN.md` for subsystem-level intent (brand semantics, resolver shape, identity-per-record, …)
- `PRINCIPLES.md` for cross-cutting tradeoffs
- `AGENTS.md` for contributor workflow and conventions
- a dedicated doc only when the topic genuinely needs one

Close-call local decisions where neither option was strongly preferred: pin as a short source comment ("considered X; picked Y because …"). Reserve for genuinely local calls — wide-context decisions rot as surrounding code moves.

### Refactoring-opportunities pass

For ordinary code-change tasks, do one broad pass before returning, covering:

- simplification
- refactoring opportunities
- type cleanup

Skip for precisely-scoped tasks unless clearly worth raising.

After introducing shared infrastructure or parametric types, revisit consumer call sites once — ROI often appears there. Consumer-side composition helpers belong in the consumer, not in zsh-core's public API.

### Renames, removals, and behavior changes

When **renaming or removing** any of the following — or **changing behavior** in a way callers could notice — run a deliberate full-repo `rg` on the old and new strings, including prose:

- function
- type
- variable
- file
- tool
- setting key
- JSON/schema field

Typecheck plus `pnpm check` is not enough: identifiers also live in:

- markdown, JSDoc, comments
- manifests, JSON Schema
- copy-pasted examples
- test titles, string literals

Missed prose references become silent drift.

For TS↔Rust mirrors (`// MIRRORED-IN:` / `// MIRROR-OF:`), the rename touches both sides plus `parity-units.ts` (see DESIGN.md).

### Research-agent proposals

Treat explore/survey proposals as hypotheses. Verify by reading the file before editing. Reject suggestions justified only by LOC reduction, architectural drift, or deletion of deliberate duplication. In conciseness passes, rejecting a meaningful fraction is normal.

### Keeping the orientation skill fresh

Source of truth: `$REPO_ROOT/skills/orient/`. Tool-specific discovery may use symlinks. Hard rules live alongside — see `skills/orient/SKILL.md`.

Structural-change notes:
- New public API needs no skill update; the `.d.ts` rollup reflects it.
- A new common entry-point directory needs a reading-path update.

### New feature ideation

Judge ideas on:

- implementation cost
- value
- robustness
- future-proofness
- testability

When shaping a new doc category, compare against existing `DocRecordMap` precedents:

- array fields for composite data
- `SyntaxDocBase` extension for sig-shaped records
- `args` arrays for parameterized flags

Follow patterns when they model the domain — see `PRINCIPLES.md`.

### Executable scripts should be extension-less

Files with executable permissions and a shebang:
- YES: `a`, `b` etc.
- no: `a.sh`, `b.zsh` etc.

Files WITHOUT executable permissions and a shebang, but that still contain shell script code (e.g. shell script source for tests, files intended to be `source`-ed) may still have extension such as `.sh` or `.zsh`.

### Git; commits

If making commits:
- pre-release commits need not be perfectly atomic
- subject line max 55 chars
- **subject line only** — **commit bodies are FORBIDDEN**

_Any SUBAGENTS that may commit **must** be given the above instructions._

## References & sources

### zsh

- `zsh` is available locally (`5.9` on the macOS host at time of writing).
- For tricky cases, read the manual and verify actual behavior with zsh commands.
- https://github.com/zsh-users/zsh
- https://github.com/zsh-users/zsh/blob/master/Doc

### Yodl

- https://gitlab.com/fbb-git/yodl
- https://fbb-git.gitlab.io/yodl/
- https://fbb-git.gitlab.io/yodl/yodl-doc/yodl.html
- The zsh repo defines custom Yodl macros.

### zsh manuals

- `man zshall`
- `info zsh`
- Sub-manpages: `zshcompctl zshcontrib zshmodules zshroadmap zshzle zshcompsys zshexpn zshoptions zshtcpsys zshbuiltins zshcompwid zshmisc zshparam zshzftpsys`
