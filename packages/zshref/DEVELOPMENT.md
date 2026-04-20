# DEVELOPMENT

`zshref` is the cliffy-based CLI adapter over `@carlwr/zsh-core-tooldef`.
Each tool becomes a subcommand. The published tarball inlines the CLI framework, so end-user installs need no extra registry config.

## Build and run locally

From the workspace root:

```sh
pnpm --filter @carlwr/zshref build

./packages/zshref/dist/bin.mjs --help
./packages/zshref/dist/bin.mjs classify --raw AUTO_CD
./packages/zshref/dist/bin.mjs search --query echo --category builtin
```

The `build` pre-hook rebuilds upstream packages automatically. The built bin has a shebang and executable bit, so invoking the file directly is enough.

## Architectural invariants

- Cliffy is imported only from `src/adapter.ts`; swapping CLI frameworks should be a one-file change.
- `build.ts` aliases `@cliffy/command` to `@jsr/cliffy__command` and inlines it; the published tarball has no `@jsr/*` runtime dependency.
- The adapter treats each `ToolDef` as opaque: parse args, call `execute(corpus, input)`, write JSON to stdout.
- Exit codes are `0` for well-formed results, `1` for unexpected/internal failure, `2` for bad input.
- JSON belongs on stdout; help, errors, and TTY hints belong on stderr or cliffy's own stream.

## Subcommand naming

The CLI strips the `zsh_` prefix from tool names: `zsh_classify` becomes `classify`, `zsh_lookup_option` becomes `lookup_option`. The bin name already scopes the call.

## Tests

- `src/test/adapter.test.ts` — cliffy tree structure from the real `toolDefs`.
- `src/test/bin.test.ts` — end-to-end bin invocation.
- `src/test/pkg-info.test.ts` — package identity drift guards.
- `scripts/test-smoke.mjs` — tarball packaging check.
- `scripts/test-install.mjs` — pack, install into a temp dir, invoke the installed bin.

## JSR import map

`deno.json` declares `@cliffy/command` plus JSR pins for `@carlwr/zsh-core` and `@carlwr/zsh-core-tooldef`. Bump those pins when moving to a newer upstream.

## Adding a subcommand

Subcommands are generated from `toolDefs`. Add the new `ToolDef` in `@carlwr/zsh-core-tooldef`; nothing in `@carlwr/zshref` should need bespoke work.
