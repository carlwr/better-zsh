# Test status — snapshot

Snapshot of which tests have been run and which are deferred at the
current state of `main`. Written for cross-session continuity.
**Stale after the next code change** — re-confirm before relying on
these claims.

> Snapshot date: 2026-04-19

## Confirmed green at this state

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

Also green: `pnpm format`, `pnpm check`, `pnpm test:smoke`, `pnpm vsix`,
`pnpm --filter @carlwr/zsh-core run jsrREGISTRY:check`, and per-package
`test:integration` for zsh-core / tooldef / mcp / zshref.

## Deferred (not run at this state)

These are **not known broken** — they were simply not run during the
latest pass. Re-run before any release.

- **INTERACTIVE tests** (`pnpm testINTERACTIVE:electron`,
  `testINTERACTIVE:electron-bundled`, `zsh-path-matrix`). Long-running;
  electron/xvfb-bound. CI's `integration` job covers these on Linux.
- **`vscode-better-zsh` `test:integration`.** Runs the `integration`
  workflow job through `act` (Docker). Not run locally without explicit
  user consent; CI covers it.
- **Registry-dependent checks** (`REGISTRY`-marked scripts: per-package
  `testREGISTRY:install`, `jsrREGISTRY:check`, plus the `verifyREGISTRY`
  wrapper for tooldef / mcp / zshref). Will fail against the current
  registry state because the relevant alpha publishes have not yet
  happened — see "Known orthogonal blockers" below. Agents must not run
  these without explicit user consent; see `AGENTS.md` §"Script naming
  axes".

## Known orthogonal blockers

Predate the current snapshot; the gating items for full green CI.

**Alpha-publish chain not yet executed.** `@carlwr/zsh-core`
`0.1.0-alpha.1` (with `ZSH_UPSTREAM` in the public API) needs to ship
first; then `@carlwr/zsh-core-tooldef` `0.1.0-alpha.0`, then a matching
`@carlwr/zshref-mcp` alpha pinning it, then `@carlwr/zshref`
`0.1.0-alpha.0`. Until this lands, three CI checks are red against
registry-pinned versions:

- `@carlwr/zshref-mcp run jsrREGISTRY:check` and `testREGISTRY:install`
- `@carlwr/zsh-core-tooldef run jsrREGISTRY:check`
- `@carlwr/zshref run jsrREGISTRY:check` and `testREGISTRY:install`

See `RELEASE-HANDOFF.md` for the publish-workflow details and
`packages/zshref-mcp/DEVELOPMENT.md` § "Published-state verification".

## Followups still open

- **Post-release `dist/json/param-expns.json` cleanup.** When the deferred
  `plan-json-artifacts.md` lands (JSON as GitHub release assets rather
  than npm subpaths), retire the `./data/param-expns.json` /
  `./schema/param-expns.schema.json` exports alongside the other data
  exports.
- **MCP sanity render of `param_expn` after next alpha.** Once the
  MCP ships with the updated zsh-core, verify `zsh_describe { category:
  "param_expn", id: "${name:-word}" }` renders a well-formed doc block
  and `zsh_search { query: "expansion" }` returns sensible matches.
- **Two upstream zsh doc typos** to report and eventually fix at source
  (so the `fixupUpstreamTypos` patches in
  `packages/zsh-core/src/docs/yodl/extractors/{options,param-expns}.ts`
  can be retired on the next vendoring update):
  - `options.yo:556` — missing closing `'` after `` `var(name)tt(=)var(pattern) `` in GLOB_ASSIGN.
  - `expn.yo:838` — missing closing `'` after `` `tt(%)' and `tt(#%) are not active ``.
