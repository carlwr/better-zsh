# zsh-ref-mcp

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
- **parameter/glob/history/subscript flags**
 
All data is the result of parsing the official documentation.

The server performs **no network requests** - the parsed upstream sources are vendored and included statically, i.e. shipped inside the package.

The server performs **no shell execution and reads nothing from the user environment** — this is a feature: the answers it gives are stable, reproducible, and independent of whatever zsh happens to be installed on the host.

**Out of scope features for this MCP:** Any runtime introspection — no `setopt` listing, no process environment, no filesystem, no shell invocation. If you need to know what options are set in a live shell, that's a different tool.

## Run/install

```sh
npx -y @carlwr/zsh-ref-mcp            # run with npx
npm install -g @carlwr/zsh-ref-mcp    # install globally
npm install @carlwr/zsh-ref-mcp       # install as a project dep
```

The package ships a `zsh-ref-mcp` bin that speaks MCP over stdio.

## Client configuration

### Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`; Windows: `%APPDATA%\Claude\claude_desktop_config.json`) and add an entry under `mcpServers`:

```json
{
  "mcpServers": {
    "zsh-ref": {
      "command": "npx",
      "args": ["-y", "@carlwr/zsh-ref-mcp"]
    }
  }
}
```

Restart Claude Desktop to pick up the new server.

### Claude Code (CLI)

Register the server with the `claude mcp add` command:

```sh
claude mcp add zsh-ref -- npx -y @carlwr/zsh-ref-mcp
```

This writes an entry equivalent to the Claude Desktop snippet above into the CLI's MCP config.

### Cursor

Add an entry to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project):

```json
{
  "mcpServers": {
    "zsh-ref": {
      "command": "npx",
      "args": ["-y", "@carlwr/zsh-ref-mcp"]
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
      "args": ["-y", "@carlwr/zsh-ref-mcp"]
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
        "args": ["-y", "@carlwr/zsh-ref-mcp"]
      }
    }
  }
}
```

### Generic MCP client

Any MCP-aware client that can spawn a subprocess over stdio can use the server. The invocation is:

```
command: npx
args:    ["-y", "@carlwr/zsh-ref-mcp"]
```

The server communicates via standard MCP JSON-RPC on stdin/stdout; no protocol flags, no environment variables. For CLI introspection, `--help` / `-h` and `--version` / `-V` are available.

## Tools

### `zsh_classify`

Classify a raw zsh token against the bundled reference. Returns the first match across all categories — option, builtin, reserved word, redirection, conditional operator, parameter, glob/history/param/subscript flag, precommand modifier, process substitution. Handles case-insensitive matching, underscore stripping, and the `NO_*` option-negation convention (including the `NOTIFY` / `NO_NOTIFY` edge case).

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

## License

MIT. See [LICENSE](./LICENSE). Upstream zsh documentation notices: see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
