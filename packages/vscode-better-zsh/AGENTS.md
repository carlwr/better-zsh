# AGENTS.md — `better-zsh` (VS Code extension)

VS Code extension package: editor providers and host-zsh execution.

## Layout

`src/`:

- `editor/` — language-feature providers, wiring zsh-core analysis + doc records to VS Code APIs
  - reusable parsing/rendering belongs in pure helpers; provider-local dispatch may stay here
- everything else at the root

## Packaging

### `vsce`

Always use `--no-dependencies`. The extension is bundled, and `vsce`'s internal `npm list` is incompatible with pnpm's layout.

### Marketplace presentation

A stable Marketplace release needs `icon` plus gallery presentation assets in the staged manifest; pre-release alphas ship without them.

### Staged extension root

- checked-in `package.json` is the pnpm workspace manifest; the staged manifest derives from it (`src/build/extension-stage.ts`)
- `pnpm build` refreshes the package-local `.tmp/staged-extension/`
- VSIX, publish, and VS Code test entrypoints use the staged root

## Agent access

No Language Model tools; the MCP server is the agent-facing surface over the same reference. Registering it from the extension (VS Code's MCP server definition provider API): only once `zshref-mcp` has a repo of its own — the server's code stays in the `zshref` crate regardless.

## Testing scope

Extension tests cover VS Code wiring: position→record dispatch, command/provider registration, priority resolution. Hover/doc-record content and formatting are `@carlwr/zsh-core`'s concern — assert them in zsh-core unit tests, not here.

## Container-only integration tests

The zsh-path matrix harness (`scripts/testINTERACTIVE-zsh-path-matrix`) is CI/Docker-only; its header says why.

## Gotchas

**Delimiter-like reserved-word facts are filtered out** in the semantic token provider (`{`, `[[`, …); the analysis layer may still emit them for other editor features. Adding a new token type requires a matching semantic-token scope contribution in the extension manifest source.

**Zsh process env isolation:** spawned zsh processes receive only an explicit allowlist of env vars. Check the zsh exec module in `src/` if a subprocess is missing an expected variable (search for `ZSH_ENV_KEEP` or `ZSH_ENV_DROP`).

**Zsh binary setting is hardened at the settings boundary** (`parseZshPath`, `src/settings.ts`): relative paths are rejected as invalid config, never resolved against workspace or cwd.

**Extension unit tests mock `vscode`** (`vitest.config.ts`): tests using VS Code types provide their own mock — examples: `rg 'vi.mock.*vscode' src/test/`.
