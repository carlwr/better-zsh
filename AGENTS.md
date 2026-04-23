## Overview

Four workspace packages plus one Rust crate:
- **`@carlwr/zsh-core`** — standalone package of structured zsh knowledge. Not merely extension support code; it should expose useful surface area beyond current consumers. Ships API Extractor rollups and an `llms.txt` docs-site artifact alongside the typed API.
- **`@carlwr/zsh-core-tooldef`** — framework-neutral tool definitions over zsh-core: pure `(DocCorpus, input) → output` tool implementations plus shared `ToolDef` metadata, consumed by adapters.
- **`@carlwr/zshref-mcp`** — Node MCP server exposing the shared tool surface as `zsh_*` tools; published to npm and JSR.
- **`better-zsh`** (`packages/vscode-better-zsh/`) — VS Code extension; consumes zsh-core and the shared tooldef layer, including LM tool registration.
- **`zshref-rs/`** — Rust+clap CLI (`zshref` bin) over the baked-in corpus + tool-def JSON. Built via `make cli`; not a pnpm workspace package. Not touched by the TS toolchain.

Published state remains pre-1.0. The libraries are still free to move.

## See also

- **[`PRINCIPLES.md`](./PRINCIPLES.md)** — cross-cutting design principles (scope, category ontology, adapter judgement). Read before new feature work.
- **[`DESIGN.md`](./DESIGN.md)** — subsystem-specific design rationale.
- **`packages/zsh-core/dist/types/*.d.ts`** — rolled-up public API with JSDoc.
- **`packages/zsh-core-tooldef/`** — shared tool layer consumed by adapters.
- **`zshref-rs/`** — Rust CLI over the baked-in tool-def JSON.
- **`skills/orient/`** — discovery scripts and reading paths.
- **[`plan-json-artifacts.md`](./plan-json-artifacts.md)** — deferred plan for release-hosted JSON artifacts.

## DRY across documentation layers

Keep documentation non-redundant; audience decides placement.

- **JSDoc** — end-user facing. Terse. Covers what/how, not why. Avoid rationale, history, and cross-file narrative.
- **Code comments** — maintainer facing. Local rationale, invariants, workarounds, and "why not the obvious alternative."
- **File-header comments** — the first few lines of any Makefile/config/source file. Stick to what's locally essential. Do NOT: (a) claim global state about other files, packages, or tools ("everything else stays pnpm-driven"); (b) restate what the filename, location, or structure already expresses; (c) restate design decisions whose home is elsewhere. When implementing from a plan, treat plan prose as intent, not as copy-paste-ready file content — re-derive header text from the destination file's own purpose.
- **`PRINCIPLES.md`** — cross-cutting design principles. Read before designing a new feature or doc category; edit when a tradeoff genuinely shifts.
- **`DESIGN.md`** — subsystem-specific design rationale. Refer to identifiers by name; avoid signatures, paths, counts, and other drift-prone specifics.
- **`DEVELOPMENT.md`** — repo- or package-local operational notes. Good for package-specific invariants, build/test/release mechanics, and concise pointers to the source of truth. Avoid repeating repo-wide policy from `AGENTS.md`, principles from `PRINCIPLES.md`, or subsystem rationale from `DESIGN.md`.
- **`AGENTS.md`** — contributor conventions: style, testing, packaging, and workflow.

When editing one layer, check whether the same point already belongs in another. Prefer cross-references over repetition.

## Short architecture summary

Three orthogonal domains; details live in `DESIGN.md`.

- **A — Parsed Documentation** (`src/docs/`) — static vendored zsh knowledge. `DocCategory` is a closed taxonomy; each category has a doc-record type and a `Documented<K>`-keyed `DocCorpus` map.
- **B — Fact Extraction** (`src/analysis/`) — coarse annotations about user code. Facts may carry `Observed<K>` values, never `Documented<K>`.
- **C — Markdown Rendering** (`src/render/`) — turns doc records into markdown. Depends on A; orthogonal to B.

Consumers plumb A+B→C procedurally. zsh-core does not provide a combined "candidate in, markdown out" API. The sanctioned brand crossing is `resolve(corpus, cat, raw)`; markdown generation is `renderDoc(corpus, pieceId)`.

### Layout rules

- `src/docs/yodl/core/` holds shared Yodl parsing machinery only.
- `src/docs/yodl/extractors/` holds corpus-specific extraction from the shared Yodl shape into zsh doc records.
- `src/analysis/facts.ts` is the public fact-model surface. Keep scanner mechanics and heuristics in sibling modules, not in the public vocabulary file.

### Tooldef + adapters

The tool layer is shared; adapters stay thin.

`packages/zsh-core-tooldef/`:
- `index.ts` — public surface: pure tool implementations plus metadata.
- `src/tools/` — one file per tool. Pure `(DocCorpus, input) → output`; no IO, env, or `vscode`.
- `src/tool-defs.ts` — aggregate `toolDefs` list; adapters walk this uniformly.

Primary adapters:
- `packages/zshref-mcp/` — MCP adapter.
- `zshref-rs/` — Rust+clap CLI adapter; consumes the tool-def JSON baked into the binary at build time.
- `packages/vscode-better-zsh/src/zsh-ref-tools.ts` — VS Code LM tool adapter.

Principle: tooldef is a consumer of zsh-core; adapters are consumers of tooldef. Do not add new zsh-core query APIs just to support an adapter.

Before proposing new tools, reshaping the tool surface, or loosening the scope fence, read:
- `packages/zshref-mcp/README.md` and `zshref-rs/README.md` — user-facing pitches; the out-of-scope list and "No trust surface" claims matter. The two "Why …?" sections are written independently per adapter and are expected to drift in phrasing; the load-bearing claims (static-only, non-trivial resolvers, token-efficient) should stay true in both.
- `DESIGN.md` §"Consumers of the tooldef layer" / §"MCP as a consumer" / §"CLI as a consumer" — rationale for the static, read-only posture and the multi-adapter shape.
- `packages/zsh-core-tooldef/DEVELOPMENT.md` — tool-layer invariants, adding-a-tool checklist, and `brief` vs `flagBriefs` vs `description` asymmetry.

The static, read-only, no-execution posture is a product feature. Host-dependent capabilities such as live `setopt`, `$commands`, process env, filesystem access, or shell execution do not belong in the tool layer.

### Providers

VS Code provider classes wire zsh-core analysis and doc records to language features. Reusable parsing/rendering logic belongs in pure helpers; provider-local dispatch may stay in provider modules.

## Code style

- Prefer naming over comments.
- Prefer functional, pure code.
- No classes except where VS Code APIs require provider classes.
- Avoid mutable state; isolate it when unavoidable.
- Extract pure, testable helpers freely if they clarify intent.
- Prefer call sites that read through function names rather than inline code.
- Keep files focused.
- Prefer structure, names, and types over explanatory prose.
- Use established terms consistently; e.g. once a concept is named "facts", keep using that term.

### Conciseness

- Prefer short identifiers.
- Collapse repeated patterns into shared helpers.
- Consider conciseness explicitly; a mild clarity tradeoff may still be worth it, but decide consciously.
- For conciseness-only changes, compare `wc -w` or `wc -c` before/after; at minimum, make sure the change did not grow the text.

### Types

- Use branded types for domain strings.
- Smart constructors (`mkObserved`, `mkDocumented`, `mkOptFlag`, ...) are the trusted cast points for brands.
- Prefer named type aliases for literal unions.
- Prefer short field names (`desc`, `op`) where they stay clear.
- If a value deserves to travel, give it a type.
- No `enum`; use literal unions.
- Prefer discriminated unions over scattered booleans.
- Prefer deferred computation (`memoized`, `cached`) over mutable tracking.
- Do not add inner `readonly` reflexively. Add it when the type itself must be non-mutable across call boundaries.
- Module-level `Set`/`Map` constants that must not mutate carry `ReadonlySet` / `ReadonlyMap`.

### Casts (`as`)

Every `as` is a trust assertion.

Principled:
- Brand minting inside smart constructors.
- Central dispatchers whose job is to bridge a correlation TypeScript cannot express, such as `renderDoc`, `resolve`, or category resolver tables.
- Correlated-union constructors such as `mkPieceId`.
- Literal-union narrowing at a single table entry.
- Brand-to-string peeling for display or string-native operations.

Smells:
- Cross-brand casts outside the sanctioned crossing; route through `resolve(corpus, cat, raw)`.
- Ad-hoc construction of discriminated-union members at call sites; use `mkPieceId`.
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

- `.PHONY: <target>` inline on its own line directly above each target block, not one grouped declaration at the top. Keeps diffs minimal as targets come and go.
- No top-of-file prose that duplicates what the target list already expresses; see §"File-header comments".

### Never enumerate or count `DocCategory`

Hand-written category lists drift.

- In JSDoc, comments, and docs: give examples, not exhaustive lists.
- Do not hard-code category counts in prose.
- Runtime strings must interpolate from zsh-core exports, never hand-type category names or ordering.
- Category-indexed tables belong in zsh-core with structural completeness guards; consumers import them.

Rationale: `DESIGN.md` §"Category-indexed artifacts belong in zsh-core"; `PRINCIPLES.md` §"Category inflation cost" for the agent-visibility cost.

### Resolver scope

When writing or extending a per-category resolver, stay on the right side of the scope balance: close-variant normalization of a raw token against a documented identity is in scope; in-context decomposition of user expressions is not. See `PRINCIPLES.md` §"Resolver scope balance" for the load-bearing examples.

### Hover docs

- Prefer actual zsh usage over raw upstream notation.
- Option hovers should show executable `zsh` forms first, category last, and prefer plain-zsh defaults over other emulations.
- When adjusting Yodl parsing for rendered markdown, preserve visible prose unless there is a strong reason not to; inspect reference dumps for regressions.

### Other tools

- `@carlwr/typescript-extra` is a workspace-root dev dependency. Keep it there even if temporarily unused; individual packages may add or drop it based on actual use.
- `@carlwr/fastcheck-utils` may likewise remain as a dev dependency even when temporarily unused.

## Testing

- Reproducibility matters: randomness uses a fixed checked-in seed.
- Property-based tests are encouraged for suitable pure logic.

### Validation before returning

Only if you edited code, run:

`pnpm format && pnpm check && pnpm test && pnpm test:smoke && pnpm vsix && pnpm test:integration &>/dev/null`

Rules:
- `pnpm format` goes first.
- If any step fails, fix and re-run.
- `INTERACTIVE` and `REGISTRY` scripts are excluded unless the user explicitly asks.
- If you only answered questions or edited docs/non-code files, do not run tests unless explicitly asked.

### Test-running policy

- "All tests" excludes `INTERACTIVE` and `REGISTRY` scripts.
- Never run `INTERACTIVE` scripts without explicit user consent; on macOS they steal focus by launching VS Code.
- Never run `REGISTRY` scripts, or `verifyREGISTRY`, without explicit user consent; they depend on currently published npm/JSR state and can fail legitimately before upstream republish.
- `test:integration` is long-running and noisy; run it last and silence it with `&>/dev/null`.
- Non-scary scripts must not call scary ones. No `test:*`, `build*`, `vsix`, `dump:*`, or other routine aggregators may chain into `INTERACTIVE`, `REGISTRY`, or `verifyREGISTRY`.
- Unit tests are the baseline. Integration tests are an extra layer and may overlap with unit coverage.
- External-tool-dependent integration tests must skip gracefully when the tool is absent.
- "Obviously correct" helpers do not need tests.

### Script naming axes

The markers are independent:

- `*:integration` — long-running, noisy CI-parity checks. Safe to run any time; run last.
- `*INTERACTIVE*` — takes over the desktop. Needs explicit user consent.
- `*REGISTRY*` and `verifyREGISTRY` — depends on published registry state. Needs explicit user consent.

Known scary scripts:
- `jsrREGISTRY:check` — `deno publish --dry-run`.
- `jsrREGISTRY:dry` — `jsr publish --dry-run`.
- `testREGISTRY:install` — install the packed tarball into a temp project and resolve runtime deps from npm.
- `verifyREGISTRY` — `testREGISTRY:install` plus `jsrREGISTRY:check`.
- `testINTERACTIVE:*` — VS Code/Electron desktop tests.

Per-package `test:integration` is intentionally not one mechanism:
- the extension uses `act`;
- the MCP uses a native-host CI-parity aggregator;
- the workspace command delegates with `pnpm -r --if-present`.

### Test conciseness

If you touch tests, look for conciseness wins unless that would hide intent.

- Remove repetition.
- Prefer tables/helpers when arrange/act/assert repeats.
- Keep `desc`/labels only when they add information.
- Derive titles from the sample or a small discriminator.
- Use the smallest fixture that still proves the point.
- Shared fixture shapes should become helpers.
- Prefer `test.each` / `describe.each` when it truly reduces duplication.

### Test helpers

- Unit-test files are `*.test.ts` under `src/test/`.
- Shared test helpers live alongside them but must not match `*.test.ts`.
- Do not rely on a leading underscore; the glob is the real inclusion mechanism.

### Testing tools

- Vitest for unit tests.
- Mocha for Electron tests.
- `fast-check` via `@fast-check/vitest`; if `fc.char()` / `fc.stringOf()` are unavailable, fall back to `fc.mapToConstant(...)` plus `fc.array(...)`.

### Container-only integration tests

`testINTERACTIVE:electron-zsh-path` is CI/Docker-only. On macOS, VS Code's shell-env resolution defeats the test's env isolation before extension activation.

## Packaging

### npm + JSR dual publish

`zsh-core`, `@carlwr/zsh-core-tooldef`, and `@carlwr/zshref-mcp` publish to npm and JSR. The Rust CLI under `zshref-rs/` publishes through cargo/crates.io; see `zshref-rs/` for its own release conventions.

- No runtime `package.json` reads in library code; JSR consumers receive `.ts` sources only.
- Package identity lives in `src/pkg-info.ts`; runtime and build code import from there.
- `pkg-info.test.ts` guards manifest drift.
- Shared subpath exports offered to both npm and JSR must stay aligned across `package.json` and `deno.json`.
- npm-only generated artifacts and workspace-internal entrypoints stay out of `deno.json.exports`.

### `vsce`

Always use `--no-dependencies`. The extension is bundled, and `vsce`'s internal `npm list` is incompatible with pnpm's layout.

### Linguist hints (deferred)

GitHub's Linguist can be steered via `.gitattributes` (`linguist-generated`, `linguist-vendored`, `linguist-documentation`) to keep the language-bar honest and collapse generated diffs. Today nothing committed warrants it. Revisit if either: (a) `zshref-rs/data/` gets committed post-extraction (mark `linguist-generated`), or (b) upstream `.yo` Yodl sources start being vendored into the tree.

### `BZ_SKIP_UPSTREAM`

Downstream `pre*` hooks build upstream packages by default so per-package commands work in a fresh checkout. Any workspace-recursive run with those hooks live races on the shared `dist/` of upstream packages, because tsup's `clean: true` wipes the directory at the start of each concurrent rebuild.

Two contracts prevent the race:

- Downstream `pre*` hooks check `BZ_SKIP_UPSTREAM` and short-circuit when set. A caller that has already built upstreams sets the env to opt out.
- Workspace-level recursive aggregators run through `scripts/upstream-ready.mjs`; it bootstraps once, then runs the recursive phase with `BZ_SKIP_UPSTREAM=1`.

`scripts/verify-upstream-contract.mjs` is the executable guard for root recursive scripts, package `pre*` hooks, and CI workflow use of the guarded root scripts.

CI achieves the same outcome by setting `BZ_SKIP_UPSTREAM: "1"` at job level and running a bootstrap step before guarded recursive scripts.

When adding a new workspace-recursive aggregator that invokes a script with upstream-rebuilding `pre*` hooks (`build`, `typecheck`, `test`, etc. on downstream packages), follow the same bootstrap + `BZ_SKIP_UPSTREAM=1` pattern. Aggregators for scripts without such hooks (`format`, `lint`) do not need it.

## Contributor guidance

### Tool-agnostic docs

This repo is worked on from multiple agent tools. Contributor docs and skills must stay tool-agnostic.

### Keeping docs fresh

- Prefer constraints and intent over enumerating volatile specifics.
- Prefer patterns over exact filenames where source or scripts already provide the list.
- For `DEVELOPMENT.md`, keep the scope local: package-local docs stay package-local; repo-wide policy belongs in root docs.
- Snapshot or handoff docs should declare their staleness posture near the top and stay intentionally short. They are orientation notes, not specs or runbooks, unless explicitly written as one.
- If a detail is cheaply derivable from manifests, workflows, scripts, or tests, prefer pointing to that source of truth and summarizing the invariant rather than copying the current full inventory.
- If `SECURITY.md` needs updates, tell the user and suggest them. Agents may not edit `SECURITY.md`.
- `SECURITY.md` may need updates when extension zsh execution, `source`/`.` link resolution, or extension settings change.

### Post-extraction repo URLs in user-facing docs

Extraction on first stable release: `zshref-rs/` → `zshref` repo; `packages/zshref-mcp/` → `zshref-mcp` repo. Rest stays `better-zsh`.

- User-facing `.md` (`README.md`, `DEVELOPMENT.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md`) in workspace root and each to-be-extracted dir already uses post-extraction repo URLs; don't revert to monorepo-subpath form.
- Project name is `zshref`; `zshref-rs` is only the current monorepo dir path.
- Maintainer-focused docs (`AGENTS.md`, `DESIGN.md`, `*EXTRACTION.md`, handoffs) keep describing pre-release monorepo state.

### Markdown style in docs

- No running numbering in headings or bullet lists. Renumbering on insert or delete balloons diffs and silently breaks cross-references; use bullets instead. Exception: the ordinal is semantically load-bearing (cross-referenced as "option 3", numbered steps in a runnable recipe).
- Prefer cross-references (`see DESIGN.md §…`) over restating another doc's content. Same-layer repetition drifts.
- Enumerating a concrete list (files, paths, tool dirs) is acceptable when the members are not easily inferrable and the enumeration's value outweighs its drift risk. Mark such exceptions inline with an HTML comment so future editors understand the intent.

### Recording design decisions

Record "why" when it helps future work. Prefer the narrowest home that stays discoverable:
- source comments for local rationale;
- `DESIGN.md` for subsystem-level intent (brand semantics, resolver shape, identity-per-record, ...);
- `PRINCIPLES.md` for cross-cutting tradeoffs that shape decisions across subsystems;
- `AGENTS.md` for contributor workflow and conventions;
- a dedicated doc only when the topic genuinely needs one.

Close-call local decisions where neither option was strongly preferred are worth pinning as a short source comment ("considered X; picked Y because …") — cheaper for future reviewers than re-derivation. Reserve this for genuinely local calls; wide-context decisions rot as the surrounding code moves.

### Refactoring-opportunities pass

For ordinary code-change tasks, always do one broad pass for simplification, refactoring opportunities, and type cleanup before returning. Skip that expectation for precisely-scoped tasks unless it is clearly worth raising.

After introducing shared infrastructure or parametric types, revisit consumer call sites once. The ROI often appears there. Consumer-side composition helpers belong in the consumer, not in zsh-core's public API.

### Research-agent proposals

Treat explore/survey proposals as hypotheses. Verify by reading the file before editing. Reject suggestions justified only by LOC reduction, architectural drift, or deletion of deliberate duplication. In conciseness passes, rejecting a meaningful fraction is normal.

### Keeping the orientation skill fresh

The source of truth is `$REPO_ROOT/skills/orient/`; tool-specific discovery may use symlinks elsewhere. The hard rules for editing the skill live alongside it — see `skills/orient/SKILL.md` §"RULES: keeping this skill fresh".

Structural-change notes:
- New public API does not require a skill update; the `.d.ts` rollup reflects it.
- A new common entry-point directory does require a reading-path update.

### New feature ideation

Judge ideas along implementation cost, value, robustness, future-proofness, and testability.

When shaping a new doc category or reshaping an existing one, compare the proposed record against existing precedents in `DocRecordMap`: array fields for composite data, `SyntaxDocBase` extension for sig-shaped records, `args` arrays for parameterized flags. Follow patterns when they genuinely model the domain. See `PRINCIPLES.md` §"Category types".

### Git; commits

If making commits:
- pre-release commits need not be perfectly atomic;
- subject line max 55 chars;
- subject line only by default. A commit body is justified only when the subject genuinely cannot carry the essential information a future reader needs; most commits do not meet that bar. When tempted to add a body, first try to write a better subject.

## References & sources

### zsh

- `zsh` is available locally (`5.9` on the macOS host at time of writing).
- For tricky cases, read the manual and then verify actual behavior with zsh commands.
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
- Related sub-manpages: `zshcompctl zshcontrib zshmodules zshroadmap zshzle zshcompsys zshexpn zshoptions zshtcpsys zshbuiltins zshcompwid zshmisc zshparam zshzftpsys`
