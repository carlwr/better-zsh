# zshref

A command-line reference for zsh syntax. Ask what a token is, search the manual, or print the docs for a known element — from a terminal, a script, or an agent pipeline. Output is one JSON object per invocation on stdout; pipe into `jq` for human reading.

> **Status: pre-release (alpha).** This crate is developed inside the [`better-zsh`](https://github.com/carlwr/better-zsh) monorepo and will be extracted to its own repository on first stable release. Until then, the install path below requires a full monorepo checkout (the bundled JSON corpus is generated from the TypeScript side of the repo). The `cargo install zshref` entry point from crates.io is not yet live.

Answers come from a structured reference parsed from the upstream zsh-5.9 docs and baked into the binary at build time, so they are stable, offline, and independent of whatever zsh is installed on the host.

## What it covers

Builtins, precommand modifiers, reserved words, shell options (with zsh's case / underscore / `NO_*` quirks resolved), special parameters, redirections, conditional operators, process substitutions, parameter / glob / history / subscript flags, prompt escapes, and ZLE widgets.

## What it doesn't do

- No shell execution, no subprocesses.
- No network.
- No filesystem writes: output goes to stdout; no logs, no caches, no config files.
- No environment variables read (other than `NO_COLOR` / `NOCOLOR`), no user shell config consulted.
- No telemetry.

The corpus and all tool logic are bundled into a single statically-linked binary; there are no runtime dependencies on zsh, node, or any other toolchain. If you need to introspect a live shell (`setopt` output, `$commands`, aliases), that is a different tool.

## Install

Build from source. Requires a stable Rust toolchain **and** the full monorepo checkout (the `better-zsh` Node/pnpm workspace), because the bundled JSON corpus is generated from the TypeScript side and embedded at compile time:

```sh
git clone https://github.com/carlwr/better-zsh
cd better-zsh
make cli            # release binary at zshref-rs/target/release/zshref
```

A `cargo install zshref` entry point (via crates.io) is planned for the first stable release.

Homebrew distribution is also planned; the formula under [`Formula/zshref.rb`](./Formula/zshref.rb) is a pre-release scaffold. Once released, install via:

```sh
brew tap carlwr/zshref https://github.com/carlwr/zshref.git
brew install zshref
```

## Usage

```sh
zshref --help
zshref --version

# Classify a raw token across every category.
zshref classify --raw AUTO_CD
zshref classify --raw '<<<'

# Fuzzy search; optionally narrow by category.
zshref search --query echo --category builtin --limit 5

# Fetch docs for a known { category, id }.
zshref describe --category option --id autocd

# Look up a shell option by name, `NO_*` forms included.
zshref lookup_option --raw NO_AUTO_CD
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Well-formed invocation (including empty matches). |
| 1 | Unexpected internal error. |
| 2 | Bad input (unknown flag, bad `--category` value, type mismatch, missing required). |

## Shell completions

Recommended: source the generated script on shell start — one line in your rc file, no `$fpath` setup, no silently-ignored files.

```sh
# ~/.zshrc
source <(zshref completions zsh)

# ~/.bashrc
source <(zshref completions bash)

# ~/.config/fish/config.fish
zshref completions fish | source
```

For cached completions (slightly faster startup), write the zsh script to a directory already on your `$fpath` (inspect with `print -l $fpath`), named exactly `_zshref`, with `compinit` running after.

See `zshref completions --help` for other supported shells.

## Man page

`zshref mangen` emits a roff-format man page (section 1) to stdout — pipe it where your packager expects. The Homebrew formula installs it automatically.

## More

See the [monorepo](https://github.com/carlwr/better-zsh) for source, issues, and companion packages — the MCP server `@carlwr/zshref-mcp` and the `better-zsh` VS Code extension share the same underlying reference.

## License

MIT. See the repository root [LICENSE](../LICENSE). Upstream zsh documentation notices: see the root [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Bundled Rust crate notices: see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
