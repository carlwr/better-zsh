## Overview

Workspace shape (pnpm packages plus one Rust crate):
- **`@carlwr/zsh-core`** — standalone package of structured zsh knowledge. Not merely extension support; exposes useful surface beyond current consumers. Ships API Extractor rollups and an `llms.txt` docs-site artifact.
- **`@carlwr/zsh-core-tooldef`** — framework-neutral tool definitions over zsh-core: pure `(DocCorpus, input) → output` impls plus shared `ToolDef` metadata.
- **`@carlwr/zshref-mcp`** — Node MCP server exposing the shared tool surface as `zsh_*` tools; published to npm and JSR.
- **`better-zsh`** (`packages/vscode-better-zsh/`) — VS Code extension; consumes zsh-core and tooldef, including LM tool registration.
- **`zshref-rs/`** — Rust+clap CLI (`zshref` bin) over the baked-in corpus + tool-def JSON. Built via `make cli`; not a pnpm workspace package.

Pre-1.0; libraries still free to move.

## See also

- **`packages/zsh-core/dist/types/*.d.ts`** — rolled-up public API with JSDoc.
- **`skills/orient/`** — discovery scripts and reading paths.
- **[`plan-json-artifacts.md`](./plan-json-artifacts.md)** — deferred plan for release-hosted JSON artifacts.

For doc-layer roles see §"DRY across documentation layers".

## DRY across documentation layers

Keep docs non-redundant; audience decides placement.

- **JSDoc** — end-user facing. Terse. What/how, not why. No rationale, history, cross-file narrative.
- **Code comments** — maintainer facing. Local rationale, invariants, workarounds, "why not the obvious alternative."
- **File-header comments** — first few lines of any Makefile/config/source file. Keep locally essential. Do NOT: (a) claim global state about other files/packages ("everything else stays pnpm-driven"); (b) restate what filename, location, or structure already expresses; (c) restate design decisions whose home is elsewhere. When implementing from a plan, treat plan prose as intent — re-derive header text from the destination file's own purpose.
- **`PRINCIPLES.md`** — cross-cutting design principles. Read before designing a feature or doc category; edit when a tradeoff genuinely shifts.
- **`DESIGN.md`** — subsystem-specific rationale. Name load-bearing types and APIs (`Documented`, `Observed`, `resolve`, category keys where the point is taxonomy); use concrete zsh syntax for examples. Avoid volatile inventories: long parallel lists of record-type names, deep file paths, test filenames, version pins, and counts—prefer directory references, "see JSDoc", or a single representative example. When a point is already a cross-cutting principle in `PRINCIPLES.md`, reference it there instead of restating (e.g. resolver identity vs feedback — PRINCIPLES owns the contract; DESIGN keeps adapter- or zsh-core-specific "why").
- **`DEVELOPMENT.md`** — repo- or package-local operational notes: package-specific invariants, build/test/release mechanics, pointers to truth. Don't repeat repo-wide policy (`AGENTS.md`), principles (`PRINCIPLES.md`), or subsystem rationale (`DESIGN.md`).
- **`AGENTS.md`** — contributor conventions: style, testing, packaging, workflow.

When editing one layer, check whether the point belongs in another. Prefer cross-references over repetition.

## Short architecture summary

Three orthogonal domains; details in `DESIGN.md`.

- **A — Parsed Documentation** (`src/docs/`) — static vendored zsh knowledge. `DocCategory` is a closed taxonomy; each category has a doc-record type and a `Documented<K>`-keyed `DocCorpus` map.
- **B — Fact Extraction** (`src/analysis/`) — coarse annotations about user code. Facts may carry `Observed<K>`, never `Documented<K>`.
- **C — Markdown Rendering** (`src/render/`) — doc records → markdown. Depends on A; orthogonal to B.

Consumers compose only the domains they need: editor paths map facts to docs to markdown; tool adapters resolve raw input and render records. No combined "candidate in, markdown out" API. Sanctioned brand crossing: `resolve(corpus, cat, raw)`; markdown: `renderDoc(corpus, pieceId)`.

### Layout rules

- `src/docs/yodl/core/` — shared Yodl parsing machinery only.
- `src/docs/yodl/extractors/` — corpus-specific extraction into zsh doc records.
- `src/analysis/facts.ts` — public fact-model surface. Keep scanner mechanics and heuristics in sibling modules.

### Tooldef + adapters

Tool layer is shared; adapters stay thin.

`packages/zsh-core-tooldef/`:
- `index.ts` — public surface: pure tool impls plus metadata.
- `src/tools/` — tool impls plus shared pure helpers. Pure `(DocCorpus, input) → output`; no IO, env, or `vscode`.
- `src/tool-defs.ts` — aggregate `toolDefs` list; adapters walk this uniformly.

Checked-in adapters cover MCP, Rust+clap, and VS Code LM hosts; each walks `toolDefs` or the exported JSON uniformly.

Principle: tooldef consumes zsh-core; adapters consume tooldef. Do not add zsh-core query APIs just to support an adapter.

Before proposing new tools, reshaping the tool surface, or loosening the scope fence, read:
- `packages/zshref-mcp/README.md` and `zshref-rs/README.md` — user-facing pitches; the out-of-scope list and "No trust surface" claims matter. The "Why …?" sections drift in phrasing across adapters; load-bearing claims (static-only, non-trivial resolvers, token-efficient) must stay true in both.
- `DESIGN.md` §"Consumers of the tooldef layer" / §"MCP as a consumer" / §"CLI as a consumer".
- `packages/zsh-core-tooldef/DEVELOPMENT.md` — tool-layer invariants, adding-a-tool checklist, `brief` vs `flagBriefs` vs `description` asymmetry.

The static, read-only, no-execution posture is a product feature. Host-dependent capabilities (live `setopt`, `$commands`, process env, filesystem, shell execution) do not belong in the tool layer.

### Providers

VS Code provider classes wire zsh-core analysis and doc records to language features. Reusable parsing/rendering logic belongs in pure helpers; provider-local dispatch may stay in provider modules.

## Code style

- Prefer naming over comments.
- Prefer functional, pure code.
- No classes except where VS Code APIs require provider classes.
- Avoid mutable state; isolate when unavoidable.
- Extract pure, testable helpers freely if they clarify intent.
- Prefer call sites that read through function names over inline code.
- Keep files focused.
- Prefer structure, names, and types over explanatory prose.
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
- No top-of-file prose duplicating the target list; see §"File-header comments".

### Never enumerate or count `DocCategory`

Hand-written category lists drift.

- In JSDoc, comments, docs: give examples, not exhaustive lists.
- No hard-coded category counts in prose.
- Runtime strings interpolate from zsh-core exports — never hand-type category names or ordering.
- JSON Schema `enum` values mirroring closed zsh-core unions interpolate from canonical exports, not hand-typed.
- Category-indexed tables belong in zsh-core with structural completeness guards; consumers import them.

The same posture extends to other closed zsh-core unions (e.g. `ResolverFeedback` kinds): interpolate from canonical exports, never hand-enumerate.

Rationale: `DESIGN.md` §"Category-indexed artifacts belong in zsh-core"; `PRINCIPLES.md` §"Category inflation cost".

### Resolver scope

Stay on the right side of the scope balance: close-variant normalization of a raw token against a documented identity is in scope; in-context decomposition of user expressions is not. See `PRINCIPLES.md` §"Resolver scope balance".

### Hover docs

- Prefer actual zsh usage over raw upstream notation.
- Option hovers: executable `zsh` forms first, category last, plain-zsh defaults over other emulations.
- When adjusting Yodl parsing for rendered markdown, preserve visible prose unless there is a strong reason not to; inspect reference dumps for regressions.

### Reference-dump review workflow

When adding or changing parsing/rendering, dump the full rendered corpus and inspect. Both parse and render bugs surface in the output.

- Generate: `pnpm --filter better-zsh run dump:refs [OUTDIR]` writes per-category markdown files plus `all.md` and `suspicious.md` to `OUTDIR` (default `.aux/refs`).
- Review: for changes touching one category, read that category's file; for cross-cutting changes, scan `all.md` or delegate an Explore subagent. `suspicious.md` lists lines tripped by built-in heuristics (unbalanced inline backticks, leftover yodl markers, dangling continuations, ...).
- When a bug is found: prefer adding a wider-catching heuristic in `src/render/dump.ts` (`suspiciousPatterns`) so the family is caught corpus-wide; fall back to a targeted regression test only when a general heuristic is not tractable. Prototypical shape: count non-escaped backticks in each markdown chunk; assert even.

### Other tools

- `@carlwr/typescript-extra` and `@carlwr/fastcheck-utils` are workspace-root dev dependencies. Keep them even when temporarily unused; individual packages may add or drop based on actual use.

## Testing

- Reproducibility matters: randomness uses a fixed checked-in seed.
- Property-based tests encouraged for suitable pure logic.

### Validation before returning

Only if you edited code, run:

`pnpm format && pnpm check && pnpm test && pnpm test:smoke && pnpm vsix && pnpm test:integration &>/dev/null`

Rules:
- `pnpm format` first.
- On any failure, fix and re-run.
- `INTERACTIVE` and `REGISTRY` excluded unless user explicitly asks.
- For docs-only or non-code edits, skip tests unless explicitly asked.

### Test-running policy

- "All tests" excludes `INTERACTIVE` and `REGISTRY` scripts.
- Never run `INTERACTIVE` scripts without explicit consent; on macOS they steal focus by launching VS Code.
- Never run `REGISTRY` scripts or `verifyREGISTRY` without explicit consent; they depend on currently published npm/JSR state and can fail legitimately before upstream republish.
- `test:integration` is long-running and noisy; run last, silence with `&>/dev/null`.
- Non-scary scripts must not call scary ones. No `test:*`, `build*`, `vsix`, `dump:*`, or other routine aggregators may chain into `INTERACTIVE`, `REGISTRY`, or `verifyREGISTRY`.
- Unit tests are the baseline; integration tests are an extra layer and may overlap.
- External-tool-dependent integration tests must skip gracefully when the tool is absent.
- "Obviously correct" helpers don't need tests.

### Script naming axes

Independent markers:

- `*:integration` — long-running, noisy CI-parity checks. Safe to run; run last.
- `*INTERACTIVE*` — takes over the desktop. Explicit consent.
- `*REGISTRY*` and `verifyREGISTRY` — depends on published registry state. Explicit consent.

Known scary scripts:
- `jsrREGISTRY:check` — `deno publish --dry-run`.
- `jsrREGISTRY:dry` — `jsr publish --dry-run`.
- `testREGISTRY:install` — install packed tarball into a temp project; resolves runtime deps from npm.
- `verifyREGISTRY` — `testREGISTRY:install` plus `jsrREGISTRY:check`.
- `testINTERACTIVE:*` — VS Code/Electron desktop tests.

Per-package `test:integration` is intentionally not one mechanism:
- extension uses `act`;
- MCP uses a native-host CI-parity aggregator;
- workspace command delegates with `pnpm -r --if-present`.

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
- `fast-check` via `@fast-check/vitest`; if `fc.char()` / `fc.stringOf()` unavailable, fall back to `fc.mapToConstant(...)` + `fc.array(...)`.

### Container-only integration tests

The zsh-path matrix integration harness is CI/Docker-only. On macOS, VS Code's shell-env resolution defeats the test's env isolation before extension activation.

## Packaging

### npm + JSR dual publish

`@carlwr/zsh-core`, `@carlwr/zsh-core-tooldef`, and `@carlwr/zshref-mcp` publish to npm and JSR. The Rust CLI in `zshref-rs/` publishes via cargo/crates.io; see `zshref-rs/` for its release conventions.

- No runtime `package.json` reads in library code; JSR consumers receive source-form packages plus declared data/assets, not npm `dist`.
- Package identity lives in `src/pkg-info.ts`; runtime and build code import from there.
- `pkg-info.test.ts` guards manifest drift.
- Shared subpath exports must stay aligned across `package.json` and `deno.json`.
- npm-only generated artifacts and workspace-internal entrypoints stay out of `deno.json.exports`.

### `vsce`

Always use `--no-dependencies`. The extension is bundled, and `vsce`'s internal `npm list` is incompatible with pnpm's layout.

### Generated `contributes.languageModelTools`

Generated from `toolDefs` by `src/build/lm-tools-manifest.ts`; committed because VSIX needs it inline. Don't hand-edit. Rebuild after tooldef edits — drift test catches stale manifests.

### Linguist hints (deferred)

`.gitattributes` (`linguist-generated`, `linguist-vendored`, `linguist-documentation`) can steer GitHub's Linguist to keep the language-bar honest and collapse generated diffs. Yodl sources are vendored; decide separately whether Linguist noise warrants marking them.

### `BZ_SKIP_UPSTREAM`

Downstream `pre*` hooks build upstream packages by default so per-package commands work in a fresh checkout. A workspace-recursive run with those hooks races on the shared `dist/` of upstream packages because tsup's `clean: true` wipes the directory at the start of each concurrent rebuild.

Two contracts prevent the race:

- Downstream `pre*` hooks check `BZ_SKIP_UPSTREAM` and short-circuit when set.
- Workspace-level recursive aggregators run through `scripts/upstream-ready.mjs`: bootstrap once, then run the recursive phase with `BZ_SKIP_UPSTREAM=1`.

`scripts/verify-upstream-contract.mjs` is the executable guard for root recursive scripts, package `pre*` hooks, and CI workflow use of guarded root scripts. CI sets `BZ_SKIP_UPSTREAM: "1"` at job level and runs a bootstrap step before guarded recursive scripts.

New workspace-recursive aggregators invoking scripts with upstream-rebuilding `pre*` hooks (`build`, `typecheck`, `test`, etc.) must follow the same bootstrap + `BZ_SKIP_UPSTREAM=1` pattern. Aggregators for scripts without such hooks (`format`, `lint`) need not.

## Contributor guidance

### Tool-agnostic docs

This repo is worked on from multiple agent tools. Contributor docs and skills must stay tool-agnostic.

### Keeping docs fresh

- Prefer constraints and intent over enumerating volatile specifics.
- Prefer patterns over exact filenames where source or scripts already provide the list.
- `DEVELOPMENT.md` keeps scope local: package-local stays package-local; repo-wide policy in root docs.
- This repo is public. Treat checked-in docs, skills, handoffs, and workflow comments as public: no secrets, tokens, recovery codes, session material. Secret names and high-level auth posture are fine when operationally necessary.
- Snapshot/handoff docs declare their staleness posture near the top and stay short. Orientation notes, not specs or runbooks, unless written as one.
- If a detail is cheaply derivable from manifests, workflows, scripts, or tests, point to that source of truth and summarize the invariant rather than copying the inventory. When a copy is needed, add a drift guard. Renaming or deleting a symbol or file counts as "a copy" across the repo—see §"Renames, removals, and behavior changes".
- Agents may not edit `SECURITY.md`; tell the user and suggest updates. Likely triggers: changes to extension zsh execution, `source`/`.` link resolution, or extension settings.

### Post-extraction repo URLs in user-facing docs

On first stable release: `zshref-rs/` → `zshref` repo; `packages/zshref-mcp/` → `zshref-mcp` repo. Rest stays `better-zsh`.

- User-facing `.md` (`README.md`, `DEVELOPMENT.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md`) in workspace root and each to-be-extracted dir already uses post-extraction repo URLs; don't revert to monorepo-subpath form.
- Project name is `zshref`; `zshref-rs` is only the current monorepo dir path.
- Maintainer-focused docs (`AGENTS.md`, `DESIGN.md`, `*EXTRACTION.md`, handoffs) keep describing pre-release monorepo state.

### Markdown style in docs

- Prefer bullet lists over prose enumerations of 3+ items. Semicolon-chains, "(a)/(b)/(c)" parentheticals, and colon-introduced inline lists scan worse than vertical bullets with incomplete-sentence items. Two-item enumerations stay inline. When adding content, reach for bullets first; when editing, look for prose enumerations to lift out. Structural prose→bullets passes may grow word count slightly — §"Conciseness"'s "do not grow the text" clause governs phrase-level rewrites, not reorganization.
- No running numbering in headings or bullet lists. Renumbering on insert/delete balloons diffs and silently breaks cross-references; use bullets. Exception: the ordinal is semantically load-bearing (cross-referenced as "option 3", numbered steps in a runnable recipe).
- Prefer cross-references (`see DESIGN.md §…`) over restating another doc's content. Same-layer repetition drifts.
- Enumerating a concrete list (files, paths, tool dirs) is acceptable when members are not easily inferrable and the value outweighs drift risk. Mark such exceptions inline with an HTML comment.

### Recording design decisions

Record "why" when it helps future work. Prefer the narrowest discoverable home:
- source comments for local rationale;
- `DESIGN.md` for subsystem-level intent (brand semantics, resolver shape, identity-per-record, ...);
- `PRINCIPLES.md` for cross-cutting tradeoffs;
- `AGENTS.md` for contributor workflow and conventions;
- a dedicated doc only when the topic genuinely needs one.

Close-call local decisions where neither option was strongly preferred: pin as a short source comment ("considered X; picked Y because …"). Reserve for genuinely local calls; wide-context decisions rot as surrounding code moves.

### Refactoring-opportunities pass

For ordinary code-change tasks, do one broad pass for simplification, refactoring opportunities, and type cleanup before returning. Skip for precisely-scoped tasks unless clearly worth raising.

After introducing shared infrastructure or parametric types, revisit consumer call sites once — ROI often appears there. Consumer-side composition helpers belong in the consumer, not in zsh-core's public API.

### Renames, removals, and behavior changes

When you **rename or remove** a function, type, variable, file, tool, setting key, or JSON/schema field—or **change what it does** in a way callers could notice—run a **deliberate full-repo search** (e.g. `rg` on the old and new strings, and on related prose) in addition to letting the typechecker and refactors update call sites. Refactoring and `pnpm check` alone are not sufficient: identifiers and behavior are also referenced in markdown, JSDoc, comments, manifests, JSON Schema, copy-pasted examples, test titles, and string literals. Missed prose references become silent drift.

### Research-agent proposals

Treat explore/survey proposals as hypotheses. Verify by reading the file before editing. Reject suggestions justified only by LOC reduction, architectural drift, or deletion of deliberate duplication. In conciseness passes, rejecting a meaningful fraction is normal.

### Keeping the orientation skill fresh

Source of truth: `$REPO_ROOT/skills/orient/`; tool-specific discovery may use symlinks. Hard rules live alongside — see `skills/orient/SKILL.md` §"RULES: keeping this skill fresh".

Structural-change notes:
- New public API needs no skill update; the `.d.ts` rollup reflects it.
- A new common entry-point directory needs a reading-path update.

### New feature ideation

Judge ideas on implementation cost, value, robustness, future-proofness, testability.

When shaping a new doc category or reshaping one, compare against existing precedents in `DocRecordMap`:

- array fields for composite data;
- `SyntaxDocBase` extension for sig-shaped records;
- `args` arrays for parameterized flags.

Follow patterns when they model the domain. See `PRINCIPLES.md` §"Category types".

### Git; commits

If making commits:
- pre-release commits need not be perfectly atomic;
- subject line max 55 chars;
- **subject line only** - **commit bodies are FORBIDDEN**

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
