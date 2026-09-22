# AGENTS.md — `better-zsh` (VS Code extension)

VS Code extension package: editor providers and host-zsh execution.

## Layout

`src/`:

- `manifest.ts` + `manifest/` — the manifest's contribution points, staged into the published `package.json`; per-point data and generated-asset sources under `manifest/`
- `contributions.ts` — everything registered at activation
- `analysis/` — the user-code analyzer: coarse zsh syntax facts
  - editor-neutral and corpus-free; a seam test under `test/analysis/` fences its imports
  - `facts.ts` is its surface; scanner mechanics stay in sibling modules
- `editor/` — one module per language feature: providers wiring facts + doc records to VS Code APIs
  - provider-local dispatch stays here; reusable parsing goes to `document/`
- `document/` — per-document models the providers share
- `settings.ts` — the settings boundary: raw configuration values parsed into domain types
- `zsh.ts` + `zsh/` — host zsh execution; `zsh.ts` is the single gate
- `build/` — asset generation and extension staging
- `test/` — unit tests mirror `src/`; Electron-hosted suites in their own subdirs (`vitest.config.ts` excludes them)
- everything else at the root

### The two inventories

`manifest.ts` and `contributions.ts` are the inventories of what the extension adds — static and runtime. Keep them readable as such: declarative, one entry per contribution, no logic — data and dispatch live in `manifest/` and `editor/`.

- `manifest.ts` and `manifest/` load outside VS Code (the build imports them): no `vscode` imports
- contribution sources are typed TS modules; nothing is parsed and validated at build time

## Packaging

### `vsce`

Always use `--no-dependencies`. The extension is bundled, and `vsce`'s internal `npm list` is incompatible with pnpm's layout.

### Marketplace presentation

A stable Marketplace release needs `icon` plus gallery presentation assets in the staged manifest; pre-release alphas ship without them.

### Staged extension root

- checked-in `package.json` is the pnpm workspace manifest; the staged manifest derives from it plus `src/manifest.ts` (`src/build/extension-stage.ts`)
- `pnpm build` refreshes the package-local `.tmp/staged-extension/`
- VSIX, publish, and VS Code test entrypoints use the staged root

## Agent access

No Language Model tools; the MCP server is the agent-facing surface over the same reference. Registering it from the extension (VS Code's MCP server definition provider API): only once `zshref-mcp` has a repo of its own — the server's code stays in the `zshref` crate regardless.

## Testing scope

Extension tests cover the analyzer (`test/analysis/`, incl. the lock-in tests pinning its vocabularies to the corpus) and VS Code wiring: position→record dispatch, command/provider registration, priority resolution. Hover/doc-record content and formatting are `@carlwr/zsh-core`'s concern — assert them in zsh-core unit tests, not here.

## Container-only integration tests

The zsh-path matrix harness (`scripts/testINTERACTIVE-zsh-path-matrix`) is CI/Docker-only; its header says why.

## Gotchas

**Delimiter-like reserved-word facts are filtered out** in the semantic token provider (`{`, `[[`, …); the analyzer may still emit them for other editor features. Token types and modifiers are declared under `src/manifest/`, beside their TM scope mapping.

**Zsh process env isolation:** spawned zsh processes receive only an explicit allowlist of env vars. Check the exec module under `src/zsh/` if a subprocess is missing an expected variable (search for `ZSH_ENV_KEEP` or `ZSH_ENV_DROP`).

**Zsh binary setting is hardened at the settings boundary** (`parseZshPath`, `src/settings.ts`): relative paths are rejected as invalid config, never resolved against workspace or cwd. Workspace Trust gates the spawn at the same boundary (`readZshConfig`); the manifest declares `limited` support.

**Two fence tests pin the trust surface** (`src/test/scope-fence.test.ts`, the chat-instructions fence under `src/test/build/`): a new spawn site, env read, filesystem write, or a non-ASCII character in the instructions fails them. Extend the allowlist deliberately; the extension `README.md` advertises what they pin.

**Extension unit tests run against a `vscode` stub** (`src/test/vscode-stub.ts`, aliased in `vitest.config.ts`): extend it when a provider needs more of the API.
