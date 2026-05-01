# AGENTS.md — `better-zsh` (VS Code extension)

VS Code extension; editor providers + LM-tool adapter + host-zsh execution.

## Layout

`src/`:

- `editor/` — language-feature providers (hover, completions, semantic tokens, …):
  - wires zsh-core analysis + doc records to VS Code APIs
  - reusable parsing/rendering belongs in pure helpers; provider-local dispatch may stay here
- `lm-adapter/` — VS Code LM tool registration:
  - sibling of the MCP server; consumes only the shared tool surface
- root (`extension.ts`, `cache.ts`, `settings.ts`, `zsh.ts`, …):
  - activation
  - infrastructure
  - host-zsh execution

## Packaging

### `vsce`

Always use `--no-dependencies`. The extension is bundled, and `vsce`'s internal `npm list` is incompatible with pnpm's layout.

### Generated `contributes.languageModelTools`

- generated from `toolDefs`; committed for VSIX inlining
- rebuilt after tooldef edits; not hand-edited
- contract spec: file-header JSDoc on `src/build/lm-tools-manifest.ts`
- drift test: `src/test/zsh-ref-tools.test.ts`

## Container-only integration tests

The zsh-path matrix integration harness is CI/Docker-only. On macOS, VS Code's shell-env resolution defeats the test's env isolation before extension activation.

## Gotchas

**`{`/`}` reserved-word facts are filtered out** in the semantic token provider (intentional). `((` / `))` are not filtered and get `keyword` tokens. Adding a new token type requires a matching `semanticTokenScopes` entry in `package.json`.

**Zsh process env isolation:** spawned zsh processes receive only an explicit allowlist of env vars. Check the zsh exec module in `src/` if a subprocess is missing an expected variable (search for `ZSH_ENV_KEEP` or `ZSH_ENV_DROP`).

**Zsh binary setting is hardened at the settings boundary:**

- machine-scoped
- `""` means PATH lookup
- `"off"` disables runtime zsh execution
- non-empty relative paths are rejected as invalid config rather than resolved against workspace or cwd

**Extension unit tests mock `vscode`:** the vitest config aliases `vscode` to `/dev/null`. Tests that use VS Code types must provide their own mock — find examples with `rg 'vi.mock.*vscode' src/test/`.
