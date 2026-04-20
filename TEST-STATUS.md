# Test status — snapshot

Snapshot for cross-session continuity.
Written against `main` on 2026-04-19.
Stale after the next code change.

## Confirmed green at this snapshot

Confirmed via `BZ_SKIP_UPSTREAM=1 pnpm test` after a one-shot upstream bootstrap build:

- `@carlwr/zsh-core`
- `@carlwr/zsh-core-tooldef`
- `@carlwr/zshref-mcp`
- `@carlwr/zshref`
- `vscode-better-zsh`

Also green at the same snapshot:
- `pnpm format`
- `pnpm check`
- `pnpm test:smoke`
- `pnpm vsix`
- `pnpm --filter @carlwr/zsh-core run jsrREGISTRY:check`
- per-package `test:integration` for zsh-core, tooldef, mcp, and zshref

## Deferred, not known broken

- `INTERACTIVE` tests such as the Electron desktop runs and the zsh-path matrix. CI covers these on Linux.
- `better-zsh` `test:integration`, which runs the `integration` workflow job through `act`.
- Registry-dependent checks (`testREGISTRY:install`, `jsrREGISTRY:check`, `verifyREGISTRY`) that depend on published upstream state. See `AGENTS.md` for the `REGISTRY` rule and `packages/zshref-mcp/DEVELOPMENT.md` for the MCP-side rationale.

## Known orthogonal blocker

Registry verification in downstream packages stays red until the next intended publish chain lands in order: zsh-core first, then packages that depend on its newly published surface. That is a publish-state issue, not an ordinary local-test issue.

See `RELEASE-HANDOFF.md` for release workflow context.

## Followups still open

- When `plan-json-artifacts.md` lands, retire the remaining JSON subpath exports that only exist for packaged data delivery.
- After the next alpha that includes the current `param_expn` work, do one MCP sanity pass on `zsh_describe` and `zsh_search` for that category.
- Report the two upstream zsh doc typos that are currently patched locally in the Yodl extractors, then retire those fixups on the next vendoring update.
