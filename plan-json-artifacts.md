# Plan: pre-parsed JSON as GitHub release assets

Small, standalone refactor. Independent of the tooldef/CLI work. Defer until that work lands.

## Goal

Stop shipping generated JSON artifacts inside the `@carlwr/zsh-core` npm/JSR package. Attach them as tarball assets to GitHub releases on tag push.

## Rationale

- JSON artifacts are a *projection* of the corpus for non-TS consumers. TS/JS consumers use the typed API; the JSON ballasts their install.
- Non-TS consumers (Python, Go, Rust) fetch more naturally from a predictable release URL than from an npm subpath.
- Generation code is already a consumer of zsh-core's runtime API — nothing in the public API changes, only where outputs land.
- A separate npm/JSR package for JSON generation would incur disproportionate infra overhead (package.json, tsconfig, vitest.config, deno.json, build.ts, THIRD_PARTY_NOTICES, manifest-sync tests, CI wiring) relative to a directory of JSON. The lean lever is CI artifacts, not package extraction.

## Non-goals

- No new package.
- No checked-in JSON.
- No change to the generation logic or its code location.

## Target state

- Generator code stays in `packages/zsh-core/src/docs/` — unchanged in shape.
- `./data/*` subpath exports removed from `packages/zsh-core/package.json` and `deno.json`.
- `dist/json/` no longer in `package.json.files`.
- CI release workflow (extend the existing zsh-core release) runs the generator on tag push, tars the output (`zsh-core-data-vX.Y.Z.tar.gz`), uploads as a GitHub release asset.
- `DEVELOPMENT.md` gains a one-line pointer: pre-parsed JSON is available on the GitHub releases page, not via npm/JSR.

## Steps

1. Grep the workspace for `@carlwr/zsh-core/data/` — confirm no internal consumers rely on the subpath.
2. Remove `./data/*` from `packages/zsh-core/package.json` exports + `deno.json` exports.
3. Remove `dist/json/` from `package.json.files`.
4. Update `packages/zsh-core/src/test/pkg-info.test.ts` shared-surface assertion if it covers `./data/*`.
5. Extend the zsh-core release workflow: after the existing build step, `tar czf zsh-core-data-${VERSION}.tar.gz -C dist json` and upload as a release asset.
6. `DEVELOPMENT.md` one-line note under a reasonable section.
7. Release notes for the version that lands the change: "pre-parsed JSON now ships as a release asset, not an npm subpath."

## Risks

- External consumers already relying on `./data/*`: none expected (still alpha).
- Release asset size: current `dist/json/` compressed should be small (single-digit MB expected); worth a quick check during implementation, not a blocker.

## Sequencing

Standalone; do after the tooldef/CLI work lands. Not urgent.
