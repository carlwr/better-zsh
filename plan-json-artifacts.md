# Plan: pre-parsed JSON as GitHub release assets

Small standalone refactor. Independent of the tooldef/CLI work. Defer until that lands (the TS tool surface landed; the Rust CLI under `zshref-rs/` is the current form).

## Goal

Stop shipping generated JSON artifacts inside `@carlwr/zsh-core`. Publish them as tarball assets on GitHub releases instead.

## Rationale

- The JSON is a projection of the corpus for non-TS consumers; TS/JS consumers use the typed API, so the JSON mainly adds package weight.
- Non-TS consumers fetch more naturally from a predictable release URL than from an npm subpath.
- The generator already consumes zsh-core's runtime API; the public API does not need to change.
- A separate npm/JSR package would add disproportionate manifest, build, test, notice, and CI overhead for what is just a directory of JSON.

## Non-goals

- No new package.
- No checked-in JSON.
- No change to generator logic or code location.

## Target state

- Generator code stays where it is in `packages/zsh-core/src/docs/`.
- `./data/*` exports disappear from `packages/zsh-core/package.json` and `deno.json`.
- `dist/json/` disappears from `package.json.files`.
- The zsh-core release workflow generates `zsh-core-data-vX.Y.Z.tar.gz` on tag push and uploads it as a GitHub release asset.
- `DEVELOPMENT.md` gains a short pointer that pre-parsed JSON lives on the GitHub releases page, not via npm/JSR.

## Steps

- Grep the workspace for `@carlwr/zsh-core/data/` and confirm no internal consumer still relies on the subpath.
- Remove `./data/*` from `packages/zsh-core/package.json` exports and `deno.json` exports.
- Remove `dist/json/` from `package.json.files`.
- Update `packages/zsh-core/src/test/pkg-info.test.ts` if its shared-surface assertion still mentions `./data/*`.
- Extend the zsh-core release workflow to tar `dist/json` and upload it as a release asset.
- Add the short pointer to `DEVELOPMENT.md`.
- Mention the delivery change in release notes when it lands.

## Risks

- External consumers may already rely on `./data/*`, though none are expected while the package is still alpha.
- Release-asset size is expected to stay modest; worth checking during implementation, not a blocker.

## Sequencing

Standalone. Not urgent.
