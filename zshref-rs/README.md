<!-- Not maintained during pre-release dev; re-derive at release time. -->

# zshref

> **Status: pre-release (alpha).** This crate is developed inside the [`better-zsh`](https://github.com/carlwr/better-zsh) monorepo and will be extracted to its own repository on first stable release. Stable install docs are not live yet; alpha crates.io packages exist for packaging validation.

A reference for zsh syntax, as a command-line tool and as a [Model Context Protocol](https://modelcontextprotocol.io) server. Ask what a token is, search the manual, or print the docs for a known element — from a terminal, a script, an agent pipeline, or an MCP-aware client. CLI tool subcommands emit one compact JSON line on stdout per invocation (pass `--pretty` for indented multi-line) — pipe into `jq` for projection. `zshref info` does likewise; `zshref completions` emits its shell script on stdout instead.

## Why zshref?

Built for agents, acceptable for humans. One crate, two faces over the same parsed zsh reference: the `zshref` CLI and the `zshref-mcp` MCP server. What the CLI adds on top of the shared corpus:

- **Single-file executable** — no Node, Python, or zsh at runtime; drops into containers, air-gapped CI, and minimal base images.
- **Pipes and scripts.** Parseable output stays on stdout; errors and warnings stay on stderr. Explicit help/version also uses stdout. Exit codes are stable. `zshref docs --key AUTO_CD | jq ...` is the intended shape, including for LLM agents composing through `sh`.
- **Protocol-independent.** MCP is young; POSIX CLIs have fifty years of backward-compat. Insurance against whichever agent protocol comes next.

What the MCP server adds: one line in a client config (Claude Code, Claude Desktop, Cursor, VS Code's built-in MCP, Zed, opencode, any generic MCP host) and the same tools appear alongside the client's other MCP servers, selectable by the agent like any built-in — and, unlike most shell-flavored MCP servers, this one never executes shell or touches the host environment.

What both share — and, for most users, the reason to pick either over `man zshall | grep`:

- **Structured, not textual.** Parsed from upstream Yodl source into typed per-category records, not regex-scraped from `man`. Every record carries its own shape; every category carries its own resolver.
- **Non-trivial resolvers.** Corpus-aware `NO_*` negation (including the `NOTIFY` / `NO_NOTIFY` edge case), redirection decomposition into `groupOp` + tail, parameter-expansion sig matching. The real value-add.
- **Token-efficient.** `search` and `list` return identity-only rows (no `mdBody`); only `docs` returns the rendered markdown body. The closed category enum surfaces as shell-completion values and clap `PossibleValues`, not prose — callers don't burn tokens recalling category names.
- **No trust surface.** No shell execution, no subprocess, no network, no filesystem writes, no logs, no caches, no config files, no telemetry, no environment-variable reads beyond the CLI's `NO_COLOR` / `CLICOLOR_FORCE` color gates. The MCP server's only side effect is writing JSON-RPC frames to stdout (fatal errors to stderr). Structurally enforced by a scope-fence test, not policy.

Primary audience: agent pipelines (Claude Code, Codex CLI, Cursor, shell-wrapped LLM flows). Humans aren't locked out, but every design trade-off picks the agent-first answer.

## What it covers

Documented zsh syntax such as options, builtins, redirections, parameter expansion, prompt escapes, and ZLE widgets. Use `zshref list`, `zshref search`, completions, or `zshref schema` to discover the current category surface.

If you need to introspect a live shell (`setopt` output, `$commands`, aliases), that is a different tool.

## At a glance

<!-- README-examples TODO: add a small dev-only harness that extracts fenced
     shell blocks below, runs them against the built binary + jq, and fails on
     output drift. For now these examples are verified by hand; jq is an
     acceptable dev-time dep. -->

```sh
# One compact JSON line by default. Pick fields with jq, or pass --pretty for indented output.
zshref docs --key AUTO_CD | jq '.matches[0] | {category, display}'
# → { "category": "option", "display": "AUTO_CD" }

# Fuzzy search + docs, piped as an agent would.
zshref search --query autoc --limit 1 \
  | jq -r '.matches[0] | "--category \(.category) --key \(.id)"' \
  | xargs zshref docs \
  | jq -r '.matches[0].mdBody' \
  | head -3

# NO_* negation resolves to the base option; `feedback` records the path taken.
zshref docs --key NO_AUTO_CD --category option | jq '.matches[0] | {display, feedback}'
# → { "display": "AUTO_CD", "feedback": { "kind": "input-negated" } }
```

## Install

Build from source. Requires a stable Rust toolchain **and** the full monorepo checkout (the `better-zsh` Node/pnpm workspace), because the bundled JSON corpus is generated from the TypeScript side and embedded at compile time:

```sh
git clone https://github.com/carlwr/better-zsh
cd better-zsh
corepack enable
pnpm install --frozen-lockfile
make cli            # release binary at zshref-rs/target/release/zshref
(cd zshref-rs && cargo build --release --features mcp)   # adds target/release/zshref-mcp
```

For alpha package testing only:

```sh
cargo install zshref --version 0.1.0-alpha.2                  # the CLI
cargo install zshref --version 0.1.0-alpha.2 --features mcp   # CLI + MCP server
```

Homebrew distribution is also planned; the formula under [`Formula/zshref.rb`](./Formula/zshref.rb) is a pre-release scaffold. Once released, install via:

```sh
brew tap carlwr/zshref https://github.com/carlwr/zshref.git
brew install zshref
```

## Usage

```sh
zshref --help
zshref --version

# Look up the docs for a zsh key across every category. Default output
# is one compact JSON line; pass `--pretty` for indented multi-line.
zshref docs --key AUTO_CD
zshref docs --key AUTO_CD --pretty
zshref docs --key '<<<'

# Constrain to one category (e.g. resolve `for` as a complex command,
# not as a reserved word).
zshref docs --key for --category complex_command

# `NO_*` option negation: same canonical id, plus `feedback: { kind: "input-negated" }`.
zshref docs --key NO_AUTO_CD --category option

# Fuzzy search; optionally narrow by category. Pair with `docs` for the body.
zshref search --query echo --category builtin --limit 5

# Enumerate records in a category — id-only, no `mdBody`.
zshref list --category option --limit 200

# Emit corpus + upstream/build metadata.
zshref info

# Emit JSON Schema for tool inputs + outputs (codegen / programmatic
# validation only — not for human or agent reading; large, see
# `zshref schema --help`).
zshref schema

# Streaming JSONL mode for cross-language tests / IPC: one request per
# stdin line, one compact-JSON response per stdout line.
printf '%s\n' '{"tool":"zsh_docs","input":{"key":"AUTO_CD"}}' | zshref batch
```

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | Well-formed invocation (including empty matches). |
| 1 | Unexpected internal error. |
| 2 | Bad input (unknown flag, bad `--category` value, type mismatch, missing required). |

`batch` reports per-request validation errors in-band as `{ "ok": false, ... }`
and exits 0 unless stream I/O fails.

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

## MCP server

`zshref-mcp` speaks MCP JSON-RPC over stdio; an MCP client launches it — no flags, no environment variables. For introspection, `--help` / `-h` and `--version` / `-V` are available; run in a terminal without flags it prints a hint and exits.

Any MCP-aware client that can spawn a subprocess over stdio can use it:

```
command: zshref-mcp
args:    none
```

Per client:

```sh
# Claude Code
claude mcp add zshref -- zshref-mcp
```

```json
// Claude Desktop: claude_desktop_config.json (macOS: ~/Library/Application Support/Claude/;
// Windows: %APPDATA%\Claude\), under "mcpServers"; restart Claude Desktop afterwards.
// Cursor: ~/.cursor/mcp.json (global) or .cursor/mcp.json (per project), same shape.
{
  "mcpServers": {
    "zshref": { "command": "zshref-mcp" }
  }
}
```

```json
// VS Code (built-in MCP client): .vscode/mcp.json in the workspace, or the
// `mcp.servers` block in user/workspace settings.
{
  "servers": {
    "zshref": { "command": "zshref-mcp" }
  }
}
```

```json
// Zed: settings.json
{
  "context_servers": {
    "zshref": { "command": { "path": "zshref-mcp" } }
  }
}
```

```json
// opencode: opencode.json (per project) or ~/.config/opencode/opencode.json
{
  "mcp": {
    "zshref": { "type": "local", "command": ["zshref-mcp"], "enabled": true }
  }
}
```

### Tools

Three tools, one intent axis each; the same three the CLI exposes as subcommands. All return the envelope `{ matches, matchesReturned, matchesTotal }`; `matchesReturned < matchesTotal` means `limit` truncated the result. Only `zsh_docs` carries the rendered markdown body — pair `zsh_search` / `zsh_list` results with `zsh_docs` for the full doc. Every tool advertises an `outputSchema`; responses carry `structuredContent` alongside the JSON text block.

- **`zsh_docs`** — look up the docs for a zsh key (`key`, optional `category`). Resolution is corpus-aware: case-insensitive option matching, underscore stripping, `NO_*` negation, redirection decomposition, history event designators. With `category` omitted, every category is tried; a few tokens (`for`, `[[`, `function`, `nocorrect`) match in more than one. Matches reached through a lossy normalization carry `feedback`.

  ```json
  { "key": "NO_AUTO_CD" }
  ```

  ```json
  {
    "matches": [
      {
        "category": "option",
        "id": "autocd",
        "display": "AUTO_CD",
        "mdBody": "### AUTO_CD ...",
        "feedback": { "kind": "input-negated" }
      }
    ],
    "matchesReturned": 1,
    "matchesTotal": 1
  }
  ```

- **`zsh_search`** — fuzzy discovery by name (`query`, optional `category`, `limit`). Ranking: exact id/display > resolver match > prefix > fuzzy score; rows carry `{ category, id, display, subKind?, score }`, no body.

  ```json
  { "query": "echo", "category": "builtin", "limit": 5 }
  ```

  ```json
  {
    "matches": [
      { "category": "builtin", "id": "echo", "display": "echo", "score": 1.0 },
      { "category": "builtin", "id": "echotc", "display": "echotc", "score": 1.0 },
      { "category": "builtin", "id": "echoti", "display": "echoti", "score": 1.0 }
    ],
    "matchesReturned": 3,
    "matchesTotal": 3
  }
  ```

- **`zsh_list`** — enumerate records (optional `category`, `limit`); identity-only rows like `zsh_search`. `{}` lists the first records of every category with `matchesTotal` = the whole corpus; `limit: 0` returns counts only.

  ```json
  { "category": "precmd_modifier", "limit": 100 }
  ```

  ```json
  {
    "matches": [
      { "category": "precmd_modifier", "id": "noglob", "display": "noglob" },
      { "category": "precmd_modifier", "id": "nocorrect", "display": "nocorrect" }
    ],
    "matchesReturned": 2,
    "matchesTotal": 2
  }
  ```

For options, `id` is the normalized lookup key (lowercase, underscores stripped) and `display` the human-friendly form; categories with literal identities (builtins, reserved words, …) have `id == display`. The full descriptions and schemas are what `tools/list` — and `zshref schema` — return.

## More

Companion project sharing the same underlying reference: the [`better-zsh`](https://github.com/carlwr/better-zsh) VS Code extension.

## License

MIT. See [LICENSE](./LICENSE). Upstream zsh documentation notices: see the root [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Bundled Rust crate notices: see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
