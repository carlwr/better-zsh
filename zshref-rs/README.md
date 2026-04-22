# zshref

A command-line reference for zsh syntax. Ask what a token is, search the manual, or print the docs for a known element — from a terminal, a script, or an agent pipeline. Tool subcommands emit one JSON object on stdout per invocation — pipe into `jq` for human reading. The `completions` and `mangen` utility subcommands emit their script / roff man page on stdout instead.

> **Status: pre-release (alpha).** This crate is developed inside the [`better-zsh`](https://github.com/carlwr/better-zsh) monorepo and will be extracted to its own repository on first stable release. Until then, the install path below requires a full monorepo checkout (the bundled JSON corpus is generated from the TypeScript side of the repo). The `cargo install zshref` entry point from crates.io is not yet live.

## Why zshref?

Built for agents, acceptable for humans. One of three adapters over the same parsed zsh reference (alongside the [MCP server](https://github.com/carlwr/zshref-mcp) and the [VS Code extension](https://github.com/carlwr/better-zsh/tree/main/packages/vscode-better-zsh)). What the CLI adds on top of the shared corpus:

- **Single statically-linked binary** — no Node, Python, or zsh at runtime; drops into containers, air-gapped CI, and minimal base images.
- **Pipes and scripts.** JSON on stdout, human prose on stderr, stable exit-code contract. `zshref classify --raw AUTO_CD | jq ...` is the intended shape, including for LLM agents composing through `sh`.
- **Protocol-independent.** MCP is young; POSIX CLIs have fifty years of backward-compat. Insurance against whichever agent protocol comes next.

What it shares with the other adapters — and, for most users, the reason to pick any of them over `man zshall | grep`:

- **Structured, not textual.** Parsed from upstream Yodl source into typed per-category records, not regex-scraped from `man`. Every record carries its own shape; every category carries its own resolver.
- **Non-trivial resolvers.** Corpus-aware `NO_*` negation (including the `NOTIFY` / `TIFY` edge case), redirection decomposition into `groupOp` + tail, parameter-expansion sig matching. The real value-add.
- **Token-efficient.** `search` returns identity-only rows (no markdown body); `classify` / `describe` / `lookup_option` are single-match direct lookups. The closed category enum surfaces as shell-completion values and clap `PossibleValues`, not prose — callers don't burn tokens recalling category names.
- **No trust surface.** No shell execution, no subprocess, no network, no filesystem writes, no logs, no caches, no config files, no telemetry, no environment-variable reads beyond the `NO_COLOR` / `CLICOLOR_FORCE` color gates. Structurally enforced by a scope-fence test, not policy.

Primary audience: agent pipelines (Claude Code, Codex CLI, Cursor, shell-wrapped LLM flows). Humans aren't locked out, but every design trade-off picks the agent-first answer.

## What it covers

Builtins, precommand modifiers, reserved words, shell options (with zsh's case / underscore / `NO_*` quirks resolved), special parameters, redirections, conditional operators, process substitutions, parameter / glob / history / subscript flags, prompt escapes, and ZLE widgets.

If you need to introspect a live shell (`setopt` output, `$commands`, aliases), that is a different tool.

## At a glance

<!-- README-examples TODO: add a small dev-only harness that extracts fenced
     shell blocks below, runs them against the built binary + jq, and fails on
     output drift. For now these examples are verified by hand; jq is an
     acceptable dev-time dep. -->

```sh
# One-shot classification. Pick the interesting fields with jq.
zshref classify --raw AUTO_CD | jq '.match | {category, display}'
# → { "category": "option", "display": "AUTO_CD" }

# Fuzzy search + describe, piped as an agent would.
zshref search --query autoc --limit 1 \
  | jq -r '.matches[0] | "--category \(.category) --id \(.id)"' \
  | xargs zshref describe \
  | jq -r '.match.markdown' \
  | head -3

# NO_* negation resolves to the base option; `negated` tells you the state.
zshref lookup_option --raw NO_AUTO_CD | jq '.match | {display, negated}'
# → { "display": "AUTO_CD", "negated": true }
```

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

Companion projects sharing the same underlying reference: the [`@carlwr/zshref-mcp`](https://github.com/carlwr/zshref-mcp) MCP server and the [`better-zsh`](https://github.com/carlwr/better-zsh) VS Code extension.

## License

MIT. See the repository root [LICENSE](../LICENSE). Upstream zsh documentation notices: see the root [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Bundled Rust crate notices: see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
