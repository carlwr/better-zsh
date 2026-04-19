# DEVELOPMENT

`main()` (`server.ts`):
- is the stdio bin
- does: loadCorpus → buildServer → StdioServerTransport

## Companion docs

- `EXTRACTION.md` — working checklist for the day the MCP package is split out of the monorepo. Scoped to MCP extraction (not tooldef, which is shared infrastructure and stays in-repo); deleted on the extraction commit.


## Architectural invariants

This package is the MCP-adapter slice. The tool layer itself — pure `(DocCorpus, input) → output` implementations, `ToolDef` metadata, and the scope fence — lives in `@carlwr/zsh-core-tooldef`. See that package's `DEVELOPMENT.md` for the tool-layer invariants and the adding-a-tool checklist.

What stays here:

- **Transport-agnostic server.** `src/server/build-server.ts` returns an `@modelcontextprotocol/sdk` `Server` with the tools from `toolDefs` (imported from `@carlwr/zsh-core-tooldef`) registered. No transport attached. The bin (`server.ts`) wires stdio; tests wire an in-process client via `StdioClientTransport` spawning the built bin.
- **CLI-flag decision logic.** `src/cli.ts` is the pure `(argv, isTTY) → CliAction` function driving `--help`, `--version`, and the TTY-hint behavior for humans who run the bin directly.

The classifier walks `classifyOrder` imported from zsh-core; rationale and completeness guard live there (`DESIGN.md` §"Tie-break in classify"). No MCP-side maintenance when categories are added.

## Tool naming: the `zsh_` prefix

Every tool exposed here is named `zsh_<verb>[_<object>]` — `zsh_classify`, `zsh_lookup_option`, and so on. The prefix is deliberate, not decoration.

MCP clients present tools from **every connected server in a single flat namespace**. When an agent reasons about which tool to call, it does not see "server X offers `classify`, server Y offers `read_file`" — it sees one list of bare tool names side by side, with no server grouping. An unqualified `classify` would compete for attention (and keyword matching) against any other MCP server's generically-named verb, and agents have no robust way to disambiguate.

The `zsh_` prefix buys three things:

- **collision avoidance** — no clash with other servers' `classify`, `lookup_option`, etc.
- **domain priming** — `zsh_*` in a prompt nudges the agent toward zsh-flavored reasoning before the tool is even called
- **self-describing traces** — logs and tool-call dumps are readable without cross-referencing "which server was this?"

Keep the prefix on every new tool. `snake_case` throughout; the short name after the prefix should be a verb or verb-object. Don't add "zsh" in the middle or tail (`lookup_zsh_option` — no); always leading.

## Adding a new tool

Tool implementations, metadata, and unit tests all live in `@carlwr/zsh-core-tooldef`. Follow that package's checklist. The cross-adapter updates are:

1. Extend `src/test/mcp-stdio.test.ts` here if the new tool should have a stdio-visible end-to-end check (recommended for any tool exposed to MCP clients).
2. The VS Code extension's `contributes.languageModelTools` manifest mirrors each tool's name + description + inputSchema; a test on the extension side (`packages/vscode-better-zsh/src/test/zsh-ref-tools.test.ts`) asserts full equality. Update the manifest when adding/editing a tool in tooldef.
3. `pnpm run check && pnpm run test` here verifies the MCP end of the wire picks up the new tool.

`toolDefs` (imported from `@carlwr/zsh-core-tooldef`) is the registry; no codegen.

## Test layout

- `src/test/cli.test.ts` — `--help` / `--version` / TTY-hint decision + end-to-end bin invocation.
- `src/test/mcp-stdio.test.ts` — end-to-end MCP round-trip via a spawned, real SDK client.
- `src/test/pkg-info.test.ts` — identity strings and shared-surface exports kept in sync with `package.json` / `deno.json`.

Tool-level unit tests (`src/test/tools/<tool>.test.ts`) and metadata-invariant tests (`tool-defs.test.ts`) live in `@carlwr/zsh-core-tooldef`.

`scripts/test-smoke.mjs` is the tarball-level packaging check (required/forbidden paths, plus every `package.json` ref — `main`, `types`, `bin`, `exports` — must resolve to a file actually in the tarball).
`scripts/probe-opencode` is a manual agent-client probe: it points opencode at the local built server `.mjs` file via a temp isolated config and performs a test or runs a custom prompt; see `probe-opencode --help` for details. It is intentionally manual-use only; keep it out of package scripts and CI.

### Published-state verification (`verify:published`)

Two checks depend on external registries: `scripts/test-install.mjs` npm-installs the packed tarball into a throwaway temp dir, which resolves the declared `@carlwr/zsh-core` and `@carlwr/zsh-core-tooldef` dependencies **from the npm registry**; `pnpm run jsr:check` (= `deno publish --dry-run`) resolves the JSR `imports` map in `deno.json`, which points at `jsr:@carlwr/zsh-core@...` and `jsr:@carlwr/zsh-core-tooldef@...`.

Both scripts are grouped under **`verify:published`** — a deliberately non-`test:*` name. They are excluded from `test:integration` and any `test:*` aggregator: ordinary tests must be runnable in a fresh clone with no published-state assumptions, so that a change that adds an upstream export cannot falsely fail the MCP's own test flow before that export has been republished. Invoke `verify:published` explicitly (manually, or as its own CI step) after the upstream alphas are known to be out on both registries with the needed surface. The CI workflow already calls `test:install` and `jsr:check` as separate jobs; the split here mirrors and formalizes that.

## API Extractor note

`scripts/build-api.mjs`: API Extractor rollup; runs on `index` only

API Extractor only runs on the `index` entry. `server.ts` is a bin with top-level side effects (it connects stdio on import), so API Extractor errors on it; tsup still emits its `.d.ts` but no rollup is produced. If you find yourself wanting a second typed entry, add it to the `entries` array in `scripts/build-api.mjs`.

## Scope fence

The "no execution, no environment access" guarantee is enforced by the scope-fence test in `@carlwr/zsh-core-tooldef` (`src/test/scope.test.ts`), which walks every tool file and rejects forbidden imports (`child_process`, networking modules, `node:fs`, `vscode`, `process.env` reads). See that package's `DEVELOPMENT.md` for details and the process for deliberately loosening the fence. The MCP server layer here is allowed stdio transport and the bin is allowed to write stack traces to stderr on fatal errors; the tools themselves are fenced at source.

In addition, a complementary fence in `@carlwr/zsh-core` (`src/test/static-scope.test.ts`) walks the import graph from the static entrypoints (`.`, `./render`, `./assets`) and asserts no reached file touches execution/network/env APIs — so the corpus layer consumed through `loadCorpus` is structurally guaranteed to be execution-free too.

## JSR import map

`deno.json` declares the JSR package surface (`.` → `index.ts`, `./server` → `server.ts`) plus an import map pointing `@carlwr/zsh-core` and `@carlwr/zsh-core-tooldef` at their published JSR specifiers. Bump the pinned versions in `deno.json` `imports` when moving to newer upstream alphas.

### `deno.lock`

`deno.lock` is gitignored while this package lives inside the pnpm workspace: pnpm's `pnpm-lock.yaml` is the authoritative lockfile for the Node/npm toolchain; a committed `deno.lock` would be a parallel, easily-drifting source of truth without a corresponding lockfile-update workflow. When the MCP is extracted to its own repo, reconsider — at that point `deno.lock` should likely be committed for reproducible JSR/Deno dry-runs.


## Release checklist

- Bump `version` in `package.json`, `deno.json`, and `PKG_VERSION` in `src/pkg-info.ts` (the latter feeds both the `Server` constructor's self-announcement and the bin's `--version` output). All three must agree — `src/test/pkg-info.test.ts` enforces this, along with name/repo-URL drift.

- `engines.node` in `package.json` and the `node-version` used by the `mcp` CI job must move together. If you raise one, raise the other in the same commit.

- Verify the `bin` works locally: `node dist/server.mjs` should accept a `tools/list` JSON-RPC frame on stdin
