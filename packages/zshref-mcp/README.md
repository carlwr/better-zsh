# zshref-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that
- exposes a structured `zsh` reference in the form of tools an agent can call,
- only uses static data shipped with the package, and
- has a trust model that is conservative and simple.

The exposed structured knowledge includes:
- **shell builtins**
- **precommand modifiers**
- **reserved words**
- **shell options**
  - resolves with zsh's quirks (case, underscores, `NO_*` negation)
- **special parameters** (`$?`, `$argv`, `$pipestatus`, ...)
- **redirections** (`1>&2`, `&>`, ...)
- **conditional operators** (`-f`, `-eq`, `=~`, ...)
- **process substitutions** (`<(..)`, `>(..)`, `=(..)`)
- **parameter-expansion forms** (`${name:-word}`, `${name/pattern/repl}`, ...)
- **parameter/glob/history/subscript flags**
- **prompt escapes** (`%n`, `%~`, `%F{…}`, ...)
- **ZLE widgets** (standard + special)
 
All data is the result of parsing the official documentation.

The server performs **no network requests** - the parsed upstream sources are vendored and included statically, i.e. shipped inside the package.

The server performs **no shell execution and reads nothing from the user environment** — this is a feature: the answers it gives are stable, reproducible, and independent of whatever zsh happens to be installed on the host.

**Out of scope features for this MCP:** Any runtime introspection — no `setopt` listing, no process environment, no filesystem, no shell invocation. If you need to know what options are set in a live shell, that's a different tool.

## Run/install

```sh
npx -y @carlwr/zshref-mcp            # run with npx
npm install -g @carlwr/zshref-mcp    # install globally
npm install @carlwr/zshref-mcp       # install as a project dep
```

The package ships a `zshref-mcp` bin that speaks MCP over stdio.

## Client configuration

### Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows: `%APPDATA%\Claude\claude_desktop_config.json`) and add an entry under `mcpServers`:

```json
{
  "mcpServers": {
    "zsh-ref": {
      "command": "npx",
      "args": ["-y", "@carlwr/zshref-mcp"]
    }
  }
}
```

Restart Claude Desktop to pick up the new server.

### Claude Code (CLI)

Register the server with the `claude mcp add` command:

```sh
claude mcp add zsh-ref -- npx -y @carlwr/zshref-mcp
```

This writes an entry equivalent to the Claude Desktop snippet above into the CLI's MCP config.

### Cursor

Add an entry to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project):

```json
{
  "mcpServers": {
    "zsh-ref": {
      "command": "npx",
      "args": ["-y", "@carlwr/zshref-mcp"]
    }
  }
}
```

Cursor will surface the tools under the MCP-enabled model automatically.

### VS Code (generic MCP client)

VS Code's built-in MCP support reads `.vscode/mcp.json` in the workspace (or the equivalent `mcp.servers` block in user/workspace settings). Note: this is the generic MCP client, independent of any specific extension.

```json
{
  "servers": {
    "zsh-ref": {
      "command": "npx",
      "args": ["-y", "@carlwr/zshref-mcp"]
    }
  }
}
```

### Zed

Add the server to `settings.json` under `context_servers`:

```json
{
  "context_servers": {
    "zsh-ref": {
      "command": {
        "path": "npx",
        "args": ["-y", "@carlwr/zshref-mcp"]
      }
    }
  }
}
```

### Generic MCP client

Any MCP-aware client that can spawn a subprocess over stdio can use the server. The invocation is:

```
command: npx
args:    ["-y", "@carlwr/zshref-mcp"]
```

The server communicates via standard MCP JSON-RPC on stdin/stdout; no protocol flags, no environment variables. For CLI introspection, `--help` / `-h` and `--version` / `-V` are available.

## Tools

There are two main entry paths:
- Generic reference lookup: `zsh_search` to discover candidates, then `zsh_describe` to fetch the exact `{ category, id }` you want.
- Direct token lookup: `zsh_classify` for an arbitrary raw token, or `zsh_lookup_option` when you already know it is a shell option.

### `zsh_search`

Fuzzy discovery across the bundled reference. Matches the query against record ids and human display headings; optionally filtered to a single `category`. Ranking: exact id/display > prefix > fuzzy score. Results carry `{ category, id, display, score? }` but **not** the rendered markdown body — compose with `zsh_describe` (exact `{category, id}`) or `zsh_classify` (raw token) when you need the full doc. The response also carries `matchesReturned` (== `matches.length`) and `matchesTotal` (pre-truncation total); `matchesReturned < matchesTotal` signals the `limit` truncated the result — raise `limit` or narrow `category` / `query` to see the rest.

**Input**

```json
{ "query": "echo", "category": "builtin", "limit": 5 }
```

**Output** (match)

```json
{
  "matches": [
    { "category": "builtin", "id": "echo", "display": "echo" },
    { "category": "builtin", "id": "echotc", "display": "echotc" },
    { "category": "builtin", "id": "echoti", "display": "echoti" }
  ],
  "matchesReturned": 3,
  "matchesTotal": 3
}
```

**Output** (no match)

```json
{ "matches": [], "matchesReturned": 0, "matchesTotal": 0 }
```

Other example inputs: `{"category": "option"}` (list all options, capped by `limit`), `{"query": "autocd"}`, `{"query": "redir", "limit": 50}`.

### `zsh_describe`

Exact fetch for a known `{ category, id }`. Unlike `zsh_classify` / `zsh_lookup_option`, this tool does **not** apply per-category normalization (no case folding, no underscore stripping, no `NO_*` handling) — `id` must be an exact corpus key. Canonical ids usually come from a prior `zsh_search` response.

**Input**

```json
{ "category": "option", "id": "autocd" }
```

**Output** (match)

```json
{
  "match": {
    "category": "option",
    "id": "autocd",
    "display": "AUTO_CD",
    "markdown": "### AUTO_CD ..."
  }
}
```

**Output** (no match)

```json
{ "match": null }
```

Other example inputs: `{"category": "builtin", "id": "echo"}`, `{"category": "reserved_word", "id": "[["}`.

### `zsh_classify`

Classify a raw zsh token against the bundled reference. Returns the first match across every documented category (e.g. option, builtin, reserved word — see the "exposed structured knowledge" list above for the full set). Handles case-insensitive matching, underscore stripping, and the `NO_*` option-negation convention (including the `NOTIFY` / `NO_NOTIFY` edge case).

**Input**

```json
{ "raw": "AUTO_CD" }
```

**Output** (match)

```json
{
  "match": {
    "category": "option",
    "id": "autocd",
    "display": "AUTO_CD",
    "markdown": "### AUTO_CD ..."
  }
}
```

For options, `id` is the normalized lookup key (lowercase, underscores stripped) while `display` is the human-friendly form. Categories with literal identities (builtins, reserved words, etc.) have `id === display`.

**Output** (no match)

```json
{ "match": null }
```

Other example inputs: `"echo"`, `"[["`, `"<<<"`, `"!$"`, `"<(...)"`, `"NO_NOTIFY"`, `"nocorrect"`.

### `zsh_lookup_option`

Look up a zsh shell option (the names used with `setopt` / `unsetopt`). Matching is case-insensitive and ignores underscores. Surfaces `negated: true` when the input was a `NO_*` form so agents can reason about the state being set, not just the option's identity.

**Input**

```json
{ "raw": "NO_AUTO_CD" }
```

**Output** (match)

```json
{
  "match": {
    "id": "autocd",
    "display": "AUTO_CD",
    "negated": true,
    "markdown": "### AUTO_CD ..."
  }
}
```

**Output** (no match)

```json
{ "match": null }
```

Other example inputs: `"AUTO_CD"`, `"autocd"`, `"NOTIFY"`, `"NO_NOTIFY"`.

## Privacy & side effects

The server has no side effects beyond writing MCP JSON-RPC frames to stdout (and fatal errors to stderr):

- No telemetry.
- No files written, no logs to disk.
- No network connections.
- No environment variables read.
- No shell execution, no subprocesses.

This posture is structurally enforced, not just policy: a scope-fence test in the shared tool package bans `child_process`, networking modules, `node:fs`, and `process.env` reads in every tool implementation consumed by this server.

## License

MIT. See [LICENSE](./LICENSE). Upstream zsh documentation notices: see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
