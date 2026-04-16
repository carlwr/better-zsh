# DEVELOPMENT

`main()` (`server.ts`):
- is the stdio bin
- does: loadCorpus → buildServer → StdioServerTransport

## Companion docs

- `EXTRACTION.md` — working checklist for the day this package is split out of the monorepo. Scoped to that transition; deleted on the extraction commit.


## Architectural invariants

Three rules keep the package honest:

- **Pure tool implementations.** Files under `src/tools/` are `(DocCorpus, input) → output`. No `child_process`, no networking, no `node:fs`. The tool layer never looks at process env or disk; the corpus is passed in.
- **Shared `ToolDef` metadata.** `src/tool-defs.ts` is the single source of tool name, description, JSON-Schema input, and an `execute` wrapper. Any adapter (the stdio server here, or an embedder) walks the `toolDefs` array uniformly — no per-tool switch statements at adapter level.
- **Transport-agnostic server.** `src/server/build-server.ts` returns an `@modelcontextprotocol/sdk` `Server` with no transport attached. The bin (`server.ts`) wires stdio; tests wire an in-process client via `StdioClientTransport` spawning the built bin.

The classifier has one non-obvious rule worth calling out. `src/tools/classify.ts` walks categories in a fixed order (`classifyOrder`); closed-identity categories (`reserved_word`, `precmd`, `builtin`, …) come before `option`. The option resolver does `no_`-stripping, so without the ordering `nocorrect` would also match "NO_CORRECT" with negation and shadow its precmd identity. If you add a new category, think about whether its resolver is closed-identity (slot it near the top) or does transforms (slot it near `option`/`redir`).

## Tool naming: the `zsh_` prefix

Every tool exposed here is named `zsh_<verb>[_<object>]` — `zsh_classify`, `zsh_lookup_option`, and so on. The prefix is deliberate, not decoration.

MCP clients present tools from **every connected server in a single flat namespace**. When an agent reasons about which tool to call, it does not see "server X offers `classify`, server Y offers `read_file`" — it sees one list of bare tool names side by side, with no server grouping. An unqualified `classify` would compete for attention (and keyword matching) against any other MCP server's generically-named verb, and agents have no robust way to disambiguate.

The `zsh_` prefix buys three things:

- **collision avoidance** — no clash with other servers' `classify`, `lookup_option`, etc.
- **domain priming** — `zsh_*` in a prompt nudges the agent toward zsh-flavored reasoning before the tool is even called
- **self-describing traces** — logs and tool-call dumps are readable without cross-referencing "which server was this?"

Keep the prefix on every new tool. `snake_case` throughout; the short name after the prefix should be a verb or verb-object. Don't add "zsh" in the middle or tail (`lookup_zsh_option` — no); always leading.

## Adding a new tool

1. New file under `src/tools/`, e.g. `src/tools/describe-builtin.ts`. Export input/output types and a pure function `(corpus, input) → result`. Must not import execution, network, or `node:fs` APIs.
2. Re-export from `src/tools/index.ts`.
3. Add a `ToolDef` in `src/tool-defs.ts`: stable `snake_case` name — **must** start with `zsh_` (see "Tool naming" above) — user-facing description, JSON-Schema for the input, `execute` wrapper that narrows the schema input to your typed shape. Push the def into the `toolDefs` array.
4. Add unit tests to `src/test/tools/<tool>.test.ts` (one file per tool). Cover the happy path plus one negative case and any quirk the tool promises to handle.
5. Add the tool's metadata assertions (name + per-tool description-shape check) to `src/test/tool-defs.test.ts` — the existing "shape guards" describe block uses per-tool assertions; keep that pattern.
6. If the tool is user-visible over stdio, extend `src/test/mcp-stdio.test.ts` with a call-through assertion.
7. Run `pnpm run check && pnpm run test` — the scope fence will trip if imports slipped in.

No codegen step, no registry file to edit — `toolDefs` is the registry.

## Test layout

- `src/test/tools/<tool>.test.ts` — pure-function unit tests, one file per tool.
- `src/test/tool-defs.test.ts` — `ToolDef` metadata invariants + description-shape guards shared across all tools.
- `src/test/cli.test.ts` — `--help` / `--version` / TTY-hint decision + end-to-end bin invocation.
- `src/test/scope.test.ts` — structural scope fence (see below).
- `src/test/mcp-stdio.test.ts` — end-to-end MCP round-trip via a spawned, real SDK client.

`scripts/test-smoke.mjs` is the tarball-level packaging check (required/forbidden paths, plus every `package.json` ref — `main`, `types`, `bin`, `exports` — must resolve to a file actually in the tarball).
`scripts/test-install.mjs` is the install-from-tarball check: npm-install the packed tarball into a throwaway temp dir under `os.tmpdir()` (outside the workspace, so npm's upward `node_modules` walk can't find the repo's install) and invoke the installed bin with `--version`. See `EXTRACTION.md` for the override-based workaround that lets this run against unpublished `zsh-core`.
`pnpm run jsr:check` is the JSR publish dry-run. Deliberately **not** chained into `test:smoke` — CI runs it as its own step so failures name themselves.

## API Extractor note

`scripts/build-api.mjs`: API Extractor rollup; runs on `index` only

API Extractor only runs on the `index` entry. `server.ts` is a bin with top-level side effects (it connects stdio on import), so API Extractor errors on it; tsup still emits its `.d.ts` but no rollup is produced. If you find yourself wanting a second typed entry, add it to the `entries` array in `scripts/build-api.mjs`.

## Scope fence

`src/test/scope.test.ts` walks every `.ts` file under `src/tools/` and greps for forbidden imports / call patterns:

- any process-spawn or networking module (`child_process`, `dgram`, `net`, `tls`, `http`/`https`/`http2`)
- `node:fs` / `from "fs"`
- `from "vscode"` (the MCP package is `vscode`-free — any extension adapter lives in the VS Code package, not here)
- `process.env` reads (the tools must be env-agnostic)

This is the structural backing for the package's public promise ("no shell execution, no environment access"). The server layer is allowed stdio transport and the bin is allowed to write stack traces to stderr on fatal errors, but tool implementations are not.

If you have a legitimate need to loosen the fence, treat it as an intentional change: update the forbidden-imports list in `scope.test.ts` with a comment explaining which tool needed what and why, and update the package's marketing copy accordingly. Don't paper over a violation by moving code out of `src/tools/` to dodge the walker.

## JSR publishing: pre-publish workaround

`deno.json` declares the JSR package surface (`.` → `index.ts`, `./server` → `server.ts`) and an import map. The map currently points the companion `zsh-core` package at a source file outside this package:

```json
"imports": {
  "zsh-core": "../zsh-core/index.ts",
  "zsh-core/render": "../zsh-core/render.ts"
}
```

This is a workspace-development workaround so `deno publish --dry-run` can resolve TypeScript sources without needing `zsh-core` to be published yet. When `zsh-core` is published to JSR, replace these two entries with version-pinned specifiers:

```json
"imports": {
  "zsh-core": "jsr:@carlwr/zsh-core@X.Y.Z",
  "zsh-core/render": "jsr:@carlwr/zsh-core@X.Y.Z/render"
}
```

Sibling entry `"@carlwr/typescript-extra": "npm:@carlwr/typescript-extra@0.7.0"` lives in `deno.json` **only** because the workaround above makes Deno resolve `zsh-core` from its `.ts` sources, which in turn import `@carlwr/typescript-extra`. The published npm form of `@carlwr/zsh-ref-mcp` does not use this package, so it is (intentionally) absent from `package.json`. Once the import map points at published `jsr:@carlwr/zsh-core`, this entry can be dropped too.

### `deno.lock`

`deno.lock` is gitignored for now. Rationale while this package lives inside the pnpm workspace: pnpm's `pnpm-lock.yaml` is the authoritative lockfile for the Node/npm toolchain; a committed `deno.lock` would be a parallel, easily-drifting source of truth for the same deps without a corresponding lockfile-update workflow. When the MCP is extracted to its own repo, reconsider — at that point `deno.lock` should likely be committed for reproducible JSR/Deno dry-runs.


## Release checklist

- Bump `version` in `package.json`, `deno.json`, and `PKG_VERSION` in `src/pkg-info.ts` (the latter feeds both the `Server` constructor's self-announcement and the bin's `--version` output). All three must agree — `src/test/pkg-info.test.ts` enforces this, along with name/repo-URL drift.

- `engines.node` in `package.json` and the `node-version` used by the `mcp` CI job must move together. If you raise one, raise the other in the same commit.

- Verify the `bin` works locally: `node dist/server.mjs` should accept a `tools/list` JSON-RPC frame on stdin
