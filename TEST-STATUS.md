# Test status — snapshot

Snapshot of which tests have been run and which are deferred at the current
HEAD. Written for cross-session continuity. **Stale after the next code
change** — re-confirm before relying on these claims.

> Snapshot date: 2026-04-19
> Snapshot HEAD: `0e0e391` (fix(options): patch missing closing apostrophe in GLOB_ASSIGN desc; drain knownBacktickOffenders)

## Confirmed green at this HEAD

Run via `BZ_SKIP_UPSTREAM=1 pnpm test` (after a one-shot sequential
bootstrap build of upstream packages — see `AGENTS.md` § `BZ_SKIP_UPSTREAM`):

| Package | Files | Tests |
|---|---|---|
| `@carlwr/zsh-core` | 24 | 330 |
| `@carlwr/zsh-core-tooldef` | 7 | 62 |
| `@carlwr/zshref-mcp` | 3 | 28 |
| `@carlwr/zshref` | 3 | 19 |
| `vscode-better-zsh` | 10 | 82 |
| **total** | **47** | **521** |

The `+30` zsh-core tests vs. the cats-handoff baseline are the
`param-expns` and related render assertions added in `f5c3ed8`.

## Deferred (not run at this HEAD)

These are **not known broken** at this HEAD — they were simply not run
during the recent integration. Re-run before any release.

- **Integration tests** (`pnpm testINTERACTIVE:electron`,
  `testINTERACTIVE:electron-bundled`, `zsh-path-matrix`). Long-running;
  electron/xvfb-bound. CI's `integration` job covers these on Linux.
- **Smoke/install/JSR**: `pnpm test:smoke`, per-package `test:install`,
  `jsr:check`. The `test:install` and `jsr:check` checks for
  `@carlwr/zshref` and `@carlwr/zsh-core-tooldef` will fail against the
  current registry state because their alpha publishes have not yet
  happened — see "Known orthogonal blockers" below.
- **Type checks** (`pnpm check`). Implicit in tsup `build` + vitest, but
  not explicitly run as a standalone step in this snapshot.

## CI on `main`

Last confirmed CI monitor was on commit `2507fe0` (cliffy → devDep). It
timed out without a reported result; no monitor has been re-armed for
later commits (`9ba08e1`, `223d9d9`, `f5c3ed8`, `d22102a`).

The `integration` and `mcp`/`tooldef`/`zshref` jobs in
`.github/workflows/ci.yml` are wired correctly; they will run on the
push of these commits, but the JSR/install jobs are expected to be red
until the publish chain (next section) is executed.

## Known orthogonal blockers

These predate the current snapshot and are the gating items for full
green CI.

1. **Alpha-publish chain not yet executed.** `@carlwr/zsh-core`
   `0.1.0-alpha.1` (with `ZSH_UPSTREAM` in the public API) needs to ship
   first; then `@carlwr/zsh-core-tooldef` `0.1.0-alpha.0`, then a
   matching `@carlwr/zshref-mcp` alpha pinning it, then `@carlwr/zshref`
   `0.1.0-alpha.0`. Until this lands, three CI checks are red against
   registry-pinned versions:
   - `@carlwr/zshref-mcp run jsr:check` and `test:install`
   - `@carlwr/zsh-core-tooldef run jsr:check`
   - `@carlwr/zshref run jsr:check` and `test:install`

   See `RELEASE-HANDOFF.md` for the publish-workflow details and
   `packages/zshref-mcp/DEVELOPMENT.md` § "Published-state verification".

## Followups still open

- **`HANDOFF-param-expn.md` post-merge TODO list.** Items 1
  (extension tests) and 6 (drain `knownBacktickOffenders`) are now
  addressed; items 2 (lockfile — N/A, no boundary changed), 3
  (DESIGN.md fold-in of param-expn rationale), 4 (post-release
  `dist/json/param-expns.json` — depends on next zsh-core publish),
  5 (sanity-render via MCP — depends on next MCP release pulling the
  updated zsh-core) remain open.
- **Two upstream zsh doc typos** to report and eventually fix at
  source (so the `fixupUpstreamTypos` patches in
  `packages/zsh-core/src/docs/yodl/extractors/{options,param-expns}.ts`
  can be retired on the next vendoring update):
  - `options.yo:556` — missing closing `'` after `` `var(name)tt(=)var(pattern) `` in GLOB_ASSIGN.
  - `expn.yo:838` — missing closing `'` after `` `tt(%)' and `tt(#%) are not active ``.
