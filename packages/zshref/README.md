# zshref

A small CLI over the static zsh reference bundled with `@carlwr/zsh-core`. Every documented builtin, option, parameter, reserved word, redirection, conditional operator, process substitution, prompt escape, and ZLE widget is queryable from the shell — JSON out, pipe-friendly.

Same data and the same pure-function tool layer that powers `@carlwr/zshref-mcp` (MCP server) and the `better-zsh` VS Code extension. Different adapter: each tool becomes a cliffy subcommand.

## Install

The package is published to npm. Because its `cliffy` dependency is pulled from the JSR registry via an npm alias, install requires a one-line `.npmrc` pointing `@jsr` at `https://npm.jsr.io`:

```sh
npm config set @jsr:registry=https://npm.jsr.io     # once, globally
npm install -g @carlwr/zshref
```

Or publish via JSR directly for Deno consumers; see `deno.json` in the repo.

## Examples

```sh
zshref --help
zshref --version

zshref classify --raw AUTO_CD
zshref classify --raw '<<<'

zshref search --query echo --category builtin --limit 5
zshref search --category option

zshref describe --category option --id autocd

zshref lookup_option --raw NO_AUTO_CD
```

All successful commands emit one JSON object per invocation on stdout. No pretty-printing; pipe into `jq` for human reading.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Well-formed invocation (including empty matches). |
| 1 | Unexpected internal error (bug). |
| 2 | Bad input (unknown flag, bad `--category` value, type mismatch, missing required). |

## Shell completions

Cliffy ships completion generators:

```sh
zshref completions zsh  > ~/.zsh/completions/_zshref
zshref completions bash > ~/.local/share/bash-completion/completions/zshref
zshref completions fish > ~/.config/fish/completions/zshref.fish
```

Then source/reload. See `zshref completions --help` for details.

## No telemetry, no execution

The tool layer consumed by `zshref` is structurally prevented from opening a subprocess, touching the network, reading `node:fs`, or looking at `process.env` — enforced by a scope-fence test in the shared `@carlwr/zsh-core-tooldef` package. The CLI adapter adds only argv parsing and JSON output.

## More

See the [monorepo repo](https://github.com/carlwr/better-zsh) for source, issue tracker, and companion packages (`@carlwr/zsh-core`, `@carlwr/zsh-core-tooldef`, `@carlwr/zshref-mcp`, `vscode-better-zsh`).

## License

MIT. See [LICENSE](./LICENSE). Upstream zsh documentation notices: see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
