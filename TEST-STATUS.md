# Test status — snapshot

Snapshot for cross-session continuity, taken against `main` on 2026-04-21.
Stale after the next code change.

## Confirmed green at this snapshot

Confirmed via `pnpm test`:

- `@carlwr/zsh-core`
- `@carlwr/zsh-core-tooldef`
- `@carlwr/zshref-mcp`
- `vscode-better-zsh`

The Rust CLI under `zshref-rs/` is out of scope for `pnpm test`; its status is driven by `make cli-test` and was green at this snapshot.

Also green at the same snapshot:
- `pnpm format`
- `pnpm check`
- `pnpm test:smoke`
- `pnpm vsix`
- `pnpm --filter @carlwr/zsh-core run jsrREGISTRY:check`
- `pnpm test:integration` (all packages, including the extension's `act`-based job)

## Deferred, not known broken

- `INTERACTIVE` tests such as the Electron desktop runs and the zsh-path matrix. CI covers these on Linux.
- Registry-dependent checks (`testREGISTRY:install`, `jsrREGISTRY:check`, `verifyREGISTRY`) that depend on published upstream state. See `AGENTS.md` for the `REGISTRY` rule and `packages/zshref-mcp/DEVELOPMENT.md` for the MCP-side rationale.

## Known orthogonal blocker

Registry verification in downstream packages stays red until the next publish chain lands in order (zsh-core first, then dependents). Publish-state issue, not an ordinary local-test issue. See `RELEASE-HANDOFF.md` for release workflow context.

## Followups still open

- When `plan-json-artifacts.md` lands, retire the remaining JSON subpath exports that only exist for packaged data delivery.
- After the next alpha that includes the current `param_expn` work, do one MCP sanity pass on `zsh_docs` and `zsh_search` for that category.
- Report the two upstream zsh doc typos that are currently patched locally in the Yodl extractors, then retire those fixups on the next vendoring update.
