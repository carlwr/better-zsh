# AGENTS.md — `better-zsh` (VS Code extension)

VS Code extension package:

- editor providers
- LM-tool adapter
- host-zsh execution

## Layout

`src/`:

- `editor/` — language-feature providers:
  - wires zsh-core analysis + doc records to VS Code APIs
  - reusable parsing/rendering belongs in pure helpers; provider-local dispatch may stay here
- `lm-adapter/` — VS Code LM tool registration:
  - sibling of the MCP server; consumes only the shared tool surface
- extension-root modules:
  - activation
  - infrastructure
  - host-zsh execution

## Packaging

### `vsce`

Always use `--no-dependencies`. The extension is bundled, and `vsce`'s internal `npm list` is incompatible with pnpm's layout.

### Staged extension root

- checked-in `package.json` is the pnpm workspace manifest
- `pnpm build` refreshes `.non-vcs/vscode-better-zsh-extension/`
- VSIX, publish, and VS Code test entrypoints use the staged root
- generated `contributes` fields in the staged manifest:
  - `languageModelTools` from `toolDefs`
  - `configuration` from `settings-metadata`

## Testing scope

Extension tests cover VS Code wiring: position→record dispatch, command/provider registration, priority resolution. Hover/doc-record content and formatting are `@carlwr/zsh-core`'s concern — assert them in zsh-core unit tests, not here. Integration tests are expensive: anything assertable from a unit test (or any assumption an integration test relies on) belongs in a unit test.

## Container-only integration tests

The zsh-path matrix integration harness is CI/Docker-only. On macOS, VS Code's shell-env resolution defeats the test's env isolation before extension activation.

## Gotchas

**Delimiter-like reserved-word facts are filtered out** in the semantic token provider:

- `{` / `}`
- `[[` / `]]`
- `((` / `))`

The analysis layer may still emit those facts for other editor features. Adding a new token type requires a matching semantic-token scope contribution in the extension manifest source.

**Zsh process env isolation:** spawned zsh processes receive only an explicit allowlist of env vars. Check the zsh exec module in `src/` if a subprocess is missing an expected variable (search for `ZSH_ENV_KEEP` or `ZSH_ENV_DROP`).

**Zsh binary setting is hardened at the settings boundary:**

- machine-scoped
- `""` means PATH lookup
- `"off"` disables runtime zsh execution
- non-empty relative paths are rejected as invalid config rather than resolved against workspace or cwd

**Extension unit tests mock `vscode`:** the vitest config aliases `vscode` to `/dev/null`. Tests that use VS Code types must provide their own mock — find examples with `rg 'vi.mock.*vscode' src/test/`.
