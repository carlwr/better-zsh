# DEVELOPMENT

`server.ts` is the stdio bin. It does `loadCorpus → buildServer → StdioServerTransport`.

## Companion doc

- `EXTRACTION.md` — working checklist for the day this package leaves the monorepo. Delete it on the extraction commit.

## Architectural invariants

This package is only the MCP adapter. The tool layer itself lives in `@carlwr/zsh-core-tooldef`; read that package's `DEVELOPMENT.md` for tool invariants and the adding-a-tool checklist.

What stays here:
- `src/server/build-server.ts` builds a transport-agnostic MCP `Server` and registers `toolDefs`.
- `src/cli.ts` is the pure `(argv, isTTY) → CliAction` function for `--help`, `--version`, and TTY-hint behavior.

`classifyOrder` comes from zsh-core. Category additions should not require MCP-side maintenance.

## Tool naming

Every exposed tool is `zsh_<verb>[_<object>]`.

Why:
- MCP clients present tools from multiple servers in one flat namespace.
- The prefix avoids collisions with generic verbs such as `classify`.
- The prefix primes domain reasoning and makes logs self-describing.

Keep the prefix on every new tool. Use `snake_case`. Never move `zsh` into the middle or tail.

## Adding a tool

Implementations and metadata live in `@carlwr/zsh-core-tooldef`. MCP-side follow-up is limited to:

- extend `src/test/mcp-stdio.test.ts` if the tool deserves an end-to-end stdio check;
- update the extension manifest if the tool surface changed there too;
- run `pnpm run check && pnpm run test`.

`toolDefs` is the registry. There is no codegen layer.

## Test layout

- `src/test/cli.test.ts` — `--help`, `--version`, TTY-hint decision, and end-to-end bin invocation.
- `src/test/mcp-stdio.test.ts` — real MCP round-trip through a spawned server.
- `src/test/pkg-info.test.ts` — package identity and shared-surface drift guards.
- `scripts/test-smoke.mjs` — tarball packaging check.
- `scripts/probe-opencode` — manual agent-client probe; keep it out of package scripts and CI.

Tool-level unit tests live in `@carlwr/zsh-core-tooldef`.

## Published-state verification

`testREGISTRY:install` and `jsrREGISTRY:check` depend on external registries and are wrapped by `verifyREGISTRY`.

They are excluded from ordinary `test:*` flows because local development must not fail merely because an upstream alpha has not been republished yet. Run `verifyREGISTRY` explicitly, or in its own CI job, only after the relevant upstream versions are known to be live on npm and JSR.

## API Extractor

API Extractor rolls up only `index.ts`.
`server.ts` is a bin with top-level side effects, so tsup emits its `.d.ts` but API Extractor does not roll it up. If a second typed entry is ever needed, add it deliberately in `scripts/build-api.mjs`.

## Scope fence

The "no execution, no environment access" guarantee is enforced in `@carlwr/zsh-core-tooldef/src/test/scope.test.ts`, not here. The MCP layer may own stdio transport and fatal-error stderr output; the tool implementations remain fenced at source.

There is a complementary static-entrypoint fence in `@carlwr/zsh-core` to keep the corpus side execution-free too.

## JSR import map

`deno.json` declares the package surface and pins JSR imports for `@carlwr/zsh-core` and `@carlwr/zsh-core-tooldef`. Bump those pins together with upstream alpha moves.

### `deno.lock`

`deno.lock` is intentionally gitignored while this package lives inside the pnpm workspace. `pnpm-lock.yaml` is the real workspace lockfile. Revisit that when the package is extracted.

## Release checklist

- Bump `version` in `package.json`, `deno.json`, and `PKG_VERSION` in `src/pkg-info.ts`; all three must agree.
- Move `engines.node` and the CI workflow's `node-version` together.
- Verify the built bin locally; `node dist/server.mjs` should accept a `tools/list` JSON-RPC frame on stdin.
