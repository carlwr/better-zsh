# DEVELOPMENT

CLI bin (`zshref`) that walks `toolDefs` from `@carlwr/zsh-core-tooldef` and exposes each tool as a subcommand. The CLI framework (cliffy) is inlined into `dist/bin.mjs` at build time; end-user installs need no registry config.

## Build and run locally

From the workspace root:

```sh
pnpm --filter @carlwr/zshref build

./packages/zshref/dist/bin.mjs --help
./packages/zshref/dist/bin.mjs classify --raw AUTO_CD
./packages/zshref/dist/bin.mjs search --query echo --category builtin
```

The `build` pre-hook rebuilds upstream packages (`@carlwr/zsh-core`, `@carlwr/zsh-core-tooldef`) automatically. The built bin has a shebang + executable bit, so invoking the file directly is enough — `node` not required.

For a fresh run after pulling: `pnpm install && pnpm --filter @carlwr/zshref build`.

## Architectural invariants

- **Framework isolation.** Cliffy is imported only from `src/adapter.ts`. Other files depend on `@carlwr/zsh-core` + `@carlwr/zsh-core-tooldef` only. Swapping the CLI framework is a single-file change.
- **Cliffy is inlined.** `build.ts` aliases `@cliffy/command` → `@jsr/cliffy__command` and esbuild inlines it; the published tarball has no `@jsr/*` runtime dependency. Cliffy is declared as a **dev dependency** only.
- **Pure tool execution.** The adapter treats each `ToolDef` as opaque: collect JSON args, call `execute(corpus, input)`, serialize to stdout. No tool-specific branching in the CLI layer.
- **Exit codes.** `0` well-formed (including empty results), `1` unexpected/internal error, `2` bad input (cliffy `ValidationError`).
- **Stream discipline.** JSON payload on stdout; help, errors, and TTY hints on stderr or cliffy's default stream (see `README.md` install note).

## Subcommand naming

The `zsh_` prefix on tool names is stripped for subcommand names: `zsh_classify` → `classify`, `zsh_lookup_option` → `lookup_option`. The root bin (`zshref`) already scopes the call, so the redundant prefix costs typing without adding discrimination. See `src/adapter.ts` §`subcommandName`.

## Tests

- `src/test/adapter.test.ts` — unit: the cliffy tree built from a real `toolDefs` array (subcommand count, required flags, category enum population).
- `src/test/bin.test.ts` — end-to-end: gated on `existsSync(dist/bin.mjs)`; spawns the bin and checks `--help`, `--version`, a happy-path call per tool, and a bad-input call (exit 2).
- `src/test/pkg-info.test.ts` — identity constants stay in sync with `package.json` and `deno.json`.

`scripts/test-smoke.mjs` — tarball-level packaging check (required/forbidden paths + every `package.json` reference resolves in-tarball).
`scripts/test-install.mjs` — packs the tarball, `npm install`s it into a temp dir, invokes the installed bin. Verifies the end-user install story: no registry config, no cliffy fetch.

## JSR import map

`deno.json` declares `@cliffy/command` as a JSR import plus JSR pins for `@carlwr/zsh-core` and `@carlwr/zsh-core-tooldef`. Bump the pinned specifiers when moving to a newer upstream.

## Adding a new subcommand

Subcommands are generated from `toolDefs`. To add one, add a `ToolDef` to `@carlwr/zsh-core-tooldef` (see that package's `DEVELOPMENT.md`). Nothing in `@carlwr/zshref` needs to change.
