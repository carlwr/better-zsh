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

## Project-specific code rules

### zsh-core package imports

Prefer explicit subpaths from `@carlwr/zsh-core` so dependency arrows stay visible and rollups stay legible. Subpath inventory: `packages/zsh-core/AGENTS.md`.

### Never enumerate or count `DocCategory`

Hand-written category lists drift. Same posture for other closed zsh-core unions (e.g. `ResolverFeedback` kinds).

- JSDoc, comments, docs: examples, not exhaustive lists; no hard-coded counts.
- Runtime strings and JSON Schema `enum` values interpolate from canonical zsh-core exports — in the Rust crate, from the embedded `index.json` and corpus — never hand-typed.
- Category-indexed tables: `DESIGN.md` §"Category-indexed artifacts belong in zsh-core".

### Rendered reference prose

Rendered reference text is shared by extension hovers, tools, and the CLI. Treat wording as user-facing zsh documentation, not extension-local UI copy. Conventions and dump-review workflow: `packages/zsh-core/AGENTS.md`.

### Root dev dependencies

`@carlwr/typescript-extra` and `@carlwr/fastcheck-utils` stay workspace-root dev dependencies even when temporarily unused; individual packages add or drop them per actual use.

`zzz_LAST_dummy` stays: a permanent alphabetically-last entry, so adding a dep never touches the prior line's comma (JSON forbids trailing commas).

### TS↔Rust mirror discipline

For TS↔Rust mirrors (`// MIRRORED-IN:` / `// MIRROR-OF:`), a rename touches both sides; behaviour is pinned by the resolver fixture (`DESIGN.md`).

## Validation before returning

Pre-commit gate: `pnpm qa` — quiet on success; composition: `scripts/build/build-tasks.mjs`.

Related:

- Full logs: `pnpm qa:verbose`.
- Escalation order: `TESTING.md`.
- Build-script rationale: `scripts/build/README.md`.

```sh
# after any edits:
pnpm format && pnpm qa

# after packaging, build-script or public-API edits — the full ladder:
pnpm format && pnpm qa && pnpm test:pack && pnpm test:integration
```

- `pnpm format` first.
- Build-scripts may never be run in parallel (since: may race) — chain with `&&`.
- `pnpm qa` failure blocks commit — fix and re-run.
- `INTERACTIVE`, `REGISTRY` excluded unless asked.
- Docs-only / non-code: skip tests unless asked.
- `.md` edits — run the pre-return audit per `STYLE-MD.md`. Required even for "small" edits.

### Test-running policy: project-specific markers

Universal pattern: `TESTING.md`. Project-specific consent-required markers:

- `*INTERACTIVE*` — takes over the desktop (VS Code/Electron); macOS steals focus.
- `*REGISTRY*` / `verifyREGISTRY` — depends on currently-published npm/JSR state.

Discover scary scripts via the markers: `jq '.scripts | keys' package.json packages/*/package.json | rg 'REGISTRY|INTERACTIVE'`.

Per-package `test:integration` is intentionally not one mechanism; each `packages/*/package.json` picks its own.

## Packaging

### npm + JSR dual publish

Universal pattern: `PACKAGING.md`. Project-specific package targeting both registries: `@carlwr/zsh-core`.

### `BZ_SKIP_UPSTREAM`

Universal pattern: `PACKAGING.md`. Project-specific bindings:

- env var name: `BZ_SKIP_UPSTREAM`
- upstream-readiness script: `scripts/build/upstream-ready.mjs`
- build stamp: `scripts/build/build-stamp.mjs`
- rationale: `scripts/build/README.md`

Mid-wipe, the TS LSP can emit transient TS7016 ghosts for `<pkg>/dist/*` — ignore. Only a stale upstream is rebuilt, so the window is narrow.

## Repo conventions

### Lint scripts

Each has `--help`; all gate `pnpm qa`:

- `scripts/list-repo-symlinks`
- `scripts/check-claude-md-pairs`
- `scripts/list-maintainer-docs`

### One organization at a time

Docs describe the current shape. The one planned change — extracting `zshref-rs/` into its own repo — is described in one place, `zshref-rs/EXTRACTION.md` (`REPO-SHAPE.md` points there); nothing else keeps a second timeline.

- Exception: user-facing `.md` (`README.md`, `DEVELOPMENT.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md`, wherever they sit) already links the crate at its post-extraction repo URL. Don't revert to monorepo-subpath form.
- Maintainer-focused docs keep describing the monorepo state.

### `SECURITY.md`

Agents may not edit `SECURITY.md`; tell the user and suggest updates. Likely triggers:

- changes to extension zsh execution
- `source`/`.` link resolution
- extension settings

### Keeping the orientation skill fresh

- a new public API needs no skill update — the `.d.ts` rollup reflects it
- a directory-structure change: re-run the discovery scripts; fix what breaks

## Git; commits

If making commits:

- pre-release commits need not be perfectly atomic
- subject line: **imperative**, every clause — `cap x; test y`, never `x cap; y tests` or `x pads`
- subject line max 55 chars; shorter is better
- **subject line only** — **commit bodies are FORBIDDEN**
- history rewrites: `WORKFLOW.md`

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
