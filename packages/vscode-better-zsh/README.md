# Better Zsh

> **Status: pre-release (alpha).** This extension is developed inside the [`better-zsh`](https://github.com/carlwr/better-zsh) monorepo and has not yet cut its first non-alpha release on the VS Code Marketplace / Open VSX.

Improved zsh shellscript editing for VS Code. Layers structured zsh knowledge — parsed from the upstream zsh-5.9 documentation — on top of the standard bash/shell TextMate grammar.

## Features

- **Hovers** for documented zsh syntax: builtins, precommand modifiers, shell options (also the `set -e` / `-o` forms), conditional operators, redirections, process substitution, special parameters, and complex commands / reserved words — plus the `#` docstring of a function defined in the file. Content comes from a structured reference, not a regex-scraped manpage.
- **Completions** over the same structured reference, context-aware: shell options after `setopt` / `unsetopt`, conditional operators inside `[[ … ]]`, otherwise builtins, reserved words, precommand modifiers, special parameters — plus the functions (with their `#` docstring) and parameters of the file itself.
- **Semantic tokens** that refine the vendored TM grammar where zsh needs it (reserved words such as `typeset` as keywords, known builtins as `support.function.builtin.shell`).
- **Go-to-definition, references, rename, highlights and outline** for functions defined in the file; **workspace symbols** across open zsh files.
- **Links** on `source` / `.` paths.
- **Optional diagnostics** via `zsh -n` (syntax check), on open, save, and while typing.
- **Snippets** for common zsh patterns.
- **Chat instructions** for VS Code chat: zsh language notes (bash differences, idioms, expansion flags, the snippet list), attached to requests while a zsh editor is visible.

Opens as Zsh:

- `.zsh`, `.zsh-theme`; the startup files `.zshrc`, `.zshenv`, `.zprofile`, `.zlogin`, `.zlogout` — also in their `/etc` and chezmoi `dot_` forms
- files under an installed zsh's `share/zsh/…/functions` and `site-functions` dirs
- a file no other language claims by name whose first line declares zsh: a `zsh` shebang, `#compdef` / `#autoload`, `emulate -L zsh`, or a vim/emacs modeline

Your own function dirs: `files.associations`, e.g. `"**/.zsh/functions/*": "zsh"`.

## Install

Once the first stable release is published:

- VS Code Marketplace: search for **Better Zsh** by `carlwr`.
- Open VSX: same publisher and name.

Pre-release alphas are not yet listed on either registry.

## Settings

- **`betterZsh.diagnostics.enabled`** — syntax-check with `zsh -n`. Default `true`. This is the only thing the host zsh is used for; off means no zsh is spawned.
- **`betterZsh.zshPath`** — path to the `zsh` binary. Empty = `zsh` from PATH; `"off"` = never invoke zsh. Machine-scoped: never read from workspace settings. Relative paths are rejected, not resolved against the workspace.

## Design posture

- **Static, not environment-aware.** Hovers, completions, and reference content come from a bundled zsh reference, not from probing the host's installed zsh. Same answer on every machine.
- **Targeted zsh execution only.** The host zsh runs for one thing: `zsh -n` diagnostics. Never for reference content, completions, or navigation.
- **Light activation.** Activating registers the features and reads no reference data. Each part of the bundled reference is parsed on the first request that needs it, once.
- **Not a tree-sitter replacement.** A full custom zsh grammar is out of scope; semantic tokens layer on the existing sh/bash TM grammar where zsh-specific accuracy is worth the cost.

## Security and trust surface

What the extension does on your machine, and what it never does. "Pinned" means a test fails if it changes.

- **No network, no telemetry.** Nothing is fetched or sent; the reference is bundled. Pinned.
- **Your files are never executed.** `zsh -n` parses without executing: command substitutions, process substitutions and aliases in a file are inert.
- **Every zsh invocation is contained:**
  - `-f`: no user startup files (`.zshenv`, `.zshrc`, …); `/etc/zshenv` still runs, as zsh mandates
  - an explicit environment allowlist; `ZDOTDIR`, `ENV`, `BASH_ENV`, `FPATH` are dropped
  - argument arrays, never a shell command line; file text travels as data — a private temp file, deleted after the check
  - 5 s timeout, 1 MiB output cap
  - one spawn site in the extension's source. Pinned.
- **A repository cannot redirect the spawn.** `betterZsh.zshPath` is machine-scoped, so workspace settings cannot set it, and relative paths are rejected. `"off"` is a kill switch.
- **Restricted Mode (Workspace Trust): limited.** In an untrusted workspace the host zsh is not spawned, so no diagnostics; everything else keeps working.
- **Filesystem.** Reads: open documents and the bundled data. Existence checks: the zsh binary, and `source` targets — never network paths. Writes: the temp file above.
- **Logs** (Output › Better Zsh): the extension's version banner, the resolved zsh path, the `zshPath` value, error codes; at the *Debug* log level, each `zsh -n` run's outcome (`ok` or the error's line number). Never file contents or the environment, at any level.
- **Chat instructions.** The file VS Code attaches to chat requests while a zsh editor is visible:
  - ships in the installed extension as `out/zsh-chat-instructions.md` (`~/.vscode/extensions/carlwr.better-zsh-<version>/`; `~/.vscode-server/…` on remotes); the Extensions view lists it under the extension's **Features › Chat Instructions**
  - is generated from `src/manifest/chat-instructions.md` plus the snippet list — diff it against the source
  - is listed under a response's **References** when applied
  - is printable ASCII only — the build refuses anything else rather than converting it; no links, no HTML comments, bounded size. Pinned.
- **Auditable bundle.** The VSIX ships source maps with embedded sources.

Vulnerability reports: `SECURITY.md` at the repository root.

## See also

- [`@carlwr/zsh-core`](https://github.com/carlwr/better-zsh/tree/main/packages/zsh-core) — the structured-reference library the extension consumes.
- [`zshref`](https://github.com/carlwr/zshref) — single-file executable Rust CLI over the same reference, and a Model Context Protocol server for agents.
- [Better Zsh on GitHub](https://github.com/carlwr/better-zsh) — source, issues, companion packages.

## License

MIT. See `LICENSE`. Upstream zsh documentation notices: `THIRD_PARTY_NOTICES.md`.
