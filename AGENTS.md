# AGENTS.md

Prefer executable discovery scripts over hand-maintained file lists. Scripts produce always-current output.

## Getting oriented

Always run (general project overview):
```sh
./skills/orient/scripts/overview
```

## _maintainer docs_

- **definition:** an `.md` file that has `audience: maintainer` in its YAML frontmatter
- always has a `read-when:` frontmatter entry
- may contain rules, guidelines and/or information
- normative when its `read-when:` applies
- `AGENTS.md` files and `.md` under `skills/` are not maintainer docs (entry points / skill content respectively)

List all maintainer docs and the `read-when:` value of each:
```sh
./scripts/list-maintainer-docs

# - or: -

./skills/orient/scripts/overview
  # invokes list-maintainer-docs, so no reason to run if `overview` output is in context
```

## Required before doing any work

read:
- any _maintainer doc_ whose `read-when:` apply
- a subdir `AGENTS.md`, for work affecting anything under that dir

## Symlinked files

All symlinked files are printed by the `overview` script. For symlinked files, edits **must** be done by referencing the physical file/the link target - never by referencing the symlink.

## Project state

Pre-1.0 everything (including public APIs) can still move freely.

## See also

- `skills/orient/` — discovery scripts and reading paths
- `plan-json-artifacts.md` — deferred plan for release-hosted JSON artifacts

## Architecture (summary)

`zsh-core` has three orthogonal domains (details: `DESIGN.md`):

- **A — Parsed Documentation** (`src/docs/`) — static vendored zsh knowledge
- **B — Fact Extraction** (`src/analysis/`) — coarse annotations about user code
- **C — Markdown Rendering** (`src/render/`) — doc records -> markdown

Sanctioned brand crossing inside `zsh-core`: `resolve(corpus, cat, raw)`.

Repo layering:

- `zsh-core` owns corpus, analysis, rendering, and resolver primitives.
- `zsh-core-tooldef` consumes `zsh-core` to define shared tools.
- Adapters consume tooldef; editor features compose `zsh-core` primitives directly.
- No "candidate in, markdown out" shortcut in `zsh-core`; consumers compose `resolve()` + `renderDoc()`.

### zsh-core package imports

Prefer explicit subpaths from `@carlwr/zsh-core` so dependency arrows stay visible and rollups stay legible. Subpath inventory: `packages/zsh-core/AGENTS.md`.

### Tooldef + adapters

Principle: tooldef consumes zsh-core; adapters consume tooldef. Do not add zsh-core query APIs just to support an adapter.

Static, read-only, no-execution posture is a product feature. Mechanics + scope-fence enforcement: `packages/zsh-core-tooldef/AGENTS.md`.

## Project-specific code rules

### Never enumerate or count `DocCategory`

Hand-written category lists drift. Same posture for other closed zsh-core unions (e.g. `ResolverFeedback` kinds).

- In JSDoc, comments, docs: give examples, not exhaustive lists.
- No hard-coded category counts in prose.
- Runtime strings and JSON Schema `enum` values interpolate from canonical zsh-core exports — never hand-typed.
- Category-indexed tables belong in zsh-core, structurally complete; consumers import them. Prefer mapped types so structure enforces completeness by construction. A compile-time guard is the fallback for tables that can't be derived (e.g. runtime order tuples).

Rationale: `DESIGN.md`, `PRINCIPLES.md`.

### Resolver vs analysis

A resolver answers one narrow question: whether a raw candidate names a documented corpus item. Close-variant normalization belongs there; parsing surrounding user expressions belongs in analysis. See `PRINCIPLES.md`.

### Rendered reference prose

Rendered reference text is shared by extension hovers, tools, and the CLI. Treat wording as user-facing zsh documentation, not extension-local UI copy. Parsing/rendering conventions and dump-review workflow: `packages/zsh-core/AGENTS.md`.

### `DocRecordMap` precedents (when shaping a new doc category)

- array fields for composite data
- `SyntaxDocBase` extension for sig-shaped records
- `args` arrays for parameterized flags

Follow when they model the domain — see `PRINCIPLES.md`.

### Other tools

`@carlwr/typescript-extra` and `@carlwr/fastcheck-utils` are workspace-root dev dependencies. Keep them even when temporarily unused; individual packages may add or drop based on actual use.

### TS↔Rust mirror discipline

For TS↔Rust mirrors (`// MIRRORED-IN:` / `// MIRROR-OF:`), a rename touches both sides plus `parity-units.ts` (see `DESIGN.md`).

## Validation before returning

Pre-commit gate: `pnpm qa` runs quiet success output for:

- typecheck
- lint
- unit tests

Related:

- Full logs: `pnpm qa:verbose`.
- Escalation order: `TESTING.md`.
- Build-script rationale: `scripts/build/README.md`.
- Bare `pnpm test` skips typecheck.

```sh
# after any edits:
pnpm format && pnpm qa

# after packaging, build-script or public-API edits — the full ladder:
pnpm format && pnpm qa && pnpm test:pack && pnpm test:integration
```

- `pnpm format` first.
- Build-scripts may never be run in parallel (since: may race) — chain with `&&`.
- `pnpm qa` failure blocks commit — fix and re-run.
- `zshref-web` is outside the workspace — no root script reaches it: `make web-qa` locally, own `ci.yml` job in CI.
- `INTERACTIVE`, `REGISTRY` excluded unless asked.
- Docs-only / non-code: skip tests unless asked.
- `.md` edits — run the pre-return audit per `STYLE-MD.md`. Required even for "small" edits.

### Test-running policy: project-specific markers

Universal pattern: `TESTING.md`. Project-specific consent-required markers:

- `*INTERACTIVE*` — takes over the desktop (VS Code/Electron); macOS steals focus.
- `*REGISTRY*` / `verifyREGISTRY` — depends on currently-published npm/JSR state.
  - after a zsh-core public-API addition, stays red downstream until the new zsh-core publish lands
  - ordinary local tests are deliberately insulated from that
  - in CI: own job, manual dispatch only

Discover scary scripts via the markers: `jq '.scripts | keys' package.json packages/*/package.json | rg 'REGISTRY|INTERACTIVE'`.

Per-package `test:integration` is intentionally not one mechanism:

- extension: `act`
- MCP: native-host CI-parity aggregator
- workspace: delegates via `pnpm -r --if-present`

## Packaging

### npm + JSR dual publish

Universal pattern: `PACKAGING.md`. Project-specific packages targeting both registries:

- `@carlwr/zsh-core`
- `@carlwr/zsh-core-tooldef`
- `@carlwr/zshref-mcp`

The Rust CLI in `zshref-rs/` publishes via cargo/crates.io — see `zshref-rs/` for release conventions.

### `BZ_SKIP_UPSTREAM`

Universal pattern: `PACKAGING.md`. Project-specific bindings:

- env var name: `BZ_SKIP_UPSTREAM`
- upstream-readiness script: `scripts/build/upstream-ready.mjs`
- enforcement: `scripts/build/verify-upstream-contract.mjs`
- rationale: `scripts/build/README.md`

Mid-wipe, the TS LSP can emit transient TS7016 ghosts for `<pkg>/dist/*` — ignore.

## Repo tooling

### Repo symlinks

- `scripts/list-repo-symlinks` — enumerates symlinks in HEAD; flags broken targets.
- `scripts/check-claude-md-pairs` — every `AGENTS.md` has a sibling `CLAUDE.md`.
- Editing a symlink writes through to its target.
- Both gate `pnpm qa` via `pnpm lint:symlinks` (quiet mode).

### Maintainer-docs index

- `scripts/list-maintainer-docs` — lists every `.md` with `audience: maintainer` frontmatter; `--quiet` validates frontmatter shape.
- Gates `pnpm qa` via `pnpm lint:md`.

### Post-extraction repo URLs in user-facing docs

Destinations and eventual repo names: `REPO-SHAPE.md`.

- User-facing `.md` (`README.md`, `DEVELOPMENT.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md`) in workspace root and each to-be-extracted dir already uses post-extraction repo URLs. Don't revert to monorepo-subpath form.
- Maintainer-focused docs (`AGENTS.md`, `DESIGN.md`, `*EXTRACTION.md`) keep describing pre-release monorepo state.

### `SECURITY.md`

Agents may not edit `SECURITY.md`; tell the user and suggest updates. Likely triggers:

- changes to extension zsh execution
- `source`/`.` link resolution
- extension settings

### Keeping the orientation skill fresh

Source of truth: `$REPO_ROOT/skills/orient/`. Tool-specific discovery may use symlinks. Hard rules live alongside — see `skills/orient/SKILL.md`.

Structural-change notes:

- New public API needs no skill update; the `.d.ts` rollup reflects it.
- A new common entry-point directory needs a reading-path update.

## Git; commits

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

### references from local (system) zsh

manual(s):
```sh
man zshall | col -b

# subsections (all are included in zshall):
man zshexpn | col -b  # example
echo /usr/share/man/man1/zsh*  # list all subpages
```

modules:
```sh
mods=( $( print -l $module_path/zsh/**/*.so \
          | perl -pe "s|${module_path}/(.*)\.so|\1|" \
          | sort ) )

# list modules:
print -l $mods

# list features, per module:
print 'prefixes: (b)uiltin, (cC)ondition, (p)arameter, math(f)unc'
( zmodload $mods
  for m ($mods) {
    print "\n$m" && printf '  %s\n' $(zmodload -lF $m | sed 's/^.//')
  }
)
```
