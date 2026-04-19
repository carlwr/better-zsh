# zshref

A command-line reference for zsh syntax. Ask what a token is, search the manual, or print the docs for a known element — from a terminal, a script, or an agent pipeline. Output is one JSON object per invocation on stdout; pipe into `jq` for human reading.

Answers come from a structured reference parsed from the upstream zsh-5.9 docs and shipped inside the package (via `@carlwr/zsh-core`), so they are stable and independent of whatever zsh is installed on the host.

## What it covers

Builtins, precommand modifiers, reserved words, shell options (with zsh's case / underscore / `NO_*` quirks resolved), special parameters, redirections, conditional operators, process substitutions, parameter / glob / history / subscript flags, prompt escapes, and ZLE widgets.

## What it doesn't do

- No shell execution, no subprocesses.
- No network.
- No filesystem writes: output goes to stdout; no logs, no caches, no config files.
- No environment variables read, no user shell config consulted.
- No telemetry.

Structurally enforced: a scope-fence test in the shared tool package bans `child_process`, networking modules, `node:fs`, and `process.env` reads in every tool the CLI exposes. If you need to introspect a live shell (`setopt` output, `$commands`, aliases), that is a different tool.

## Install

```sh
npm config set @jsr:registry https://npm.jsr.io   # once, globally
npm install -g @carlwr/zshref
```

The `npm config` line points npm at the JSR registry for a transitive dependency; without it, install fails with an unresolved `@jsr/*` package. A project-local `.npmrc` with the same line works too.

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

## More

See the [monorepo](https://github.com/carlwr/better-zsh) for source, issues, and companion packages — the MCP server `@carlwr/zshref-mcp` and the `better-zsh` VS Code extension share the same underlying reference.

## License

MIT. See [LICENSE](./LICENSE). Upstream zsh documentation notices: see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
