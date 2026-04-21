# Better Zsh

> **Status: pre-release (alpha).** This extension is developed inside the [`better-zsh`](https://github.com/carlwr/better-zsh) monorepo and has not yet cut its first non-alpha release on the VS Code Marketplace / Open VSX.

Improved zsh shellscript editing for VS Code. Layers structured zsh knowledge — parsed from the upstream zsh-5.9 documentation — on top of the standard bash/shell TextMate grammar.

## Features

- **Hovers** for builtins, shell options (with zsh's `NO_*` / case / underscore quirks resolved), special parameters, redirections, conditional operators, process substitutions, parameter-expansion forms, glob / param / history / subscript flags, prompt escapes, and ZLE widgets. Content comes from a structured reference, not a regex-scraped manpage.
- **Completions** for the same set, category-aware (only shell options are offered after `setopt` / `unsetopt`; only builtins/precmds/functions at command position; …).
- **Semantic tokens** that refine the vendored TM grammar where zsh needs it (`((` / `))` as keywords, known builtins as `support.function.builtin.shell`, etc.).
- **Go-to-definition, references, rename, document/workspace symbols** for user-defined functions in the workspace.
- **Optional diagnostics** via `zsh -n` (syntax check). Disabled per-document if the file reports as a non-zsh shell.
- **Snippets** for common zsh patterns.
- **Language Model tools** — four zsh-reference tools (`zshClassify`, `zshLookupOption`, `zshSearch`, `zshDescribe`) registered with VS Code's Language Model API. The same tool surface is shipped as an [MCP server](https://github.com/carlwr/better-zsh/tree/main/packages/zshref-mcp) and as a [single-binary CLI](https://github.com/carlwr/better-zsh/tree/main/zshref-rs).

File associations: `.zsh`, `.zshrc`, `.zshenv`, `.zprofile`, `.zlogin`, `.zlogout`, `.zsh-theme`, plus the bare `zshrc` / `zshenv` / `zlogin` / `zprofile` / `zlogout` filenames.

## Install

Once the first stable release is published:

- VS Code Marketplace: search for **Better Zsh** by `carlwr`.
- Open VSX: same publisher and name.

Pre-release alphas are not yet listed on either registry.

## Settings

- **`betterZsh.diagnostics.enabled`** — run `zsh -n` on save for syntax checking. Default `true`.
- **`betterZsh.zshPath`** — path to the `zsh` binary. Empty = use `zsh` from PATH; `"off"` = never invoke zsh (diagnostics disabled at runtime). Machine-scoped; non-empty relative paths are rejected rather than resolved against the workspace.

## Design posture

- **Static, not environment-aware.** Hovers, completions, and reference content come from a bundled parsed zsh reference, not from probing the host's installed zsh. Same answer on every machine.
- **Targeted zsh execution only.** The only time this extension spawns `zsh` is for optional `zsh -n` diagnostics and for one narrow tokenization path used to enrich completions. Never for reference content. Spawned processes receive a strict env allowlist, not the ambient environment.
- **Not a tree-sitter replacement.** A full custom zsh grammar is out of scope; semantic tokens layer on the existing sh/bash TM grammar where zsh-specific accuracy is worth the cost.

## See also

- [`@carlwr/zsh-core`](https://github.com/carlwr/better-zsh/tree/main/packages/zsh-core) — the structured-reference library the extension consumes.
- [`@carlwr/zshref-mcp`](https://github.com/carlwr/better-zsh/tree/main/packages/zshref-mcp) — the same tool surface as a Model Context Protocol server.
- [`zshref`](https://github.com/carlwr/better-zsh/tree/main/zshref-rs) — single-binary Rust CLI over the same corpus.
- [Better Zsh on GitHub](https://github.com/carlwr/better-zsh) — source, issues, companion packages.

## License

MIT. See [LICENSE](./LICENSE). Upstream zsh documentation notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
