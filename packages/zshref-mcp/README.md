# zshref-mcp

> **Status: pre-release (alpha).** This package is developed inside the [`better-zsh`](https://github.com/carlwr/better-zsh) monorepo and will be extracted to its own repository on first stable release. The npm package `@carlwr/zshref-mcp` is already published and the install paths below work today; the monorepo is transparent to end users.

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes a structured `zsh` reference as tools an agent can call. Static data only, shipped inside the package.

Categories covered:

- **shell builtins**
- **precommand modifiers**
- **reserved words**
- **shell options** (resolves zsh's case / underscore / `NO_*` quirks)
- **special parameters** (`$?`, `$argv`, `$pipestatus`, …)
- **redirections** (`1>&2`, `&>`, …)
- **conditional operators** (`-f`, `-eq`, `=~`, …)
- **process substitutions** (`<(..)`, `>(..)`, `=(..)`)
- **parameter-expansion forms** (`${name:-word}`, `${name/pattern/repl}`, …)
- **parameter / glob / history / subscript flags**
- **prompt escapes** (`%n`, `%~`, `%F{…}`, …)
- **ZLE widgets** (standard + special)

## Why zshref-mcp?

Built for agents, acceptable for humans. One of three adapters over the same parsed zsh reference (alongside the [single-binary CLI `zshref`](https://github.com/carlwr/better-zsh/tree/main/zshref-rs) and the [VS Code extension](https://github.com/carlwr/better-zsh/tree/main/packages/vscode-better-zsh)). What the MCP server adds:

- **First-class in MCP-aware clients.** One line in a client config (Claude Desktop, Cursor, VS Code's built-in MCP, Zed, any generic MCP host) and the tools appear alongside the client's other MCP servers, selectable by the agent like any built-in.
- **Conservative by default.** Unlike most shell-flavored MCP servers, this one does not execute shell or touch the host environment at all. Installing it is low-commitment — no trust boundary to defend, no shell review to do before adopting.

What it shares with the other adapters — and, for most users, the reason to pick any of them over a "shell out to `man zshall`" MCP:

- **Structured, not textual.** Parsed from upstream Yodl source into typed per-category records, not regex-scraped from `man`. Every record carries its own shape; every category carries its own resolver.
- **Non-trivial resolvers.** Corpus-aware `NO_*` negation (including the `NOTIFY` / `TIFY` edge case), redirection decomposition into `groupOp` + tail, parameter-expansion sig matching. The real value-add.
- **Token-efficient.** `zsh_search` and `zsh_list` return identity-only rows (no markdown body); only `zsh_docs` returns rendered markdown. Tool `modelDescription` strings enumerate the closed category set so agents don't burn tokens guessing.
- **No trust surface.** No shell execution, no subprocess, no network, no filesystem writes, no logs, no environment reads, no telemetry. Structurally enforced by a scope-fence test in the shared tool layer, not policy.

Runtime introspection is deliberately out of scope: no `setopt` listing, no process environment, no filesystem, no shell invocation. If you need live-shell introspection, that is a different tool.

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

Three tools, one intent axis each. All three return the same envelope: `{ matches, matchesReturned, matchesTotal }`. Only `zsh_docs` carries the rendered markdown body — pair `zsh_search` / `zsh_list` results with `zsh_docs` for the full doc.

- **`zsh_docs`** — look up the docs for a raw token (handles `NO_*` option negation; returns markdown).
- **`zsh_search`** — fuzzy discovery by name (id-only).
- **`zsh_list`** — enumerate records in the corpus (id-only).

### `zsh_docs`

Look up a raw zsh token against the bundled reference. With `category` set, the lookup is restricted to that category (0 or 1 matches). With `category` omitted, every category is tried in classify-walk order — most inputs resolve in 0 or 1 categories, but a few overlap (`for`, `[[`, `function`, `nocorrect`) and return more than one match.

Resolution is corpus-aware: case-insensitive option matching, underscore stripping, redirection group-op + tail decomposition, history event-designators, and the `NO_*` option-negation convention (including the `NOTIFY` / `NO_NOTIFY` edge case). Canonical record ids (e.g. `autocd`) round-trip exactly. Each option-category match additionally carries `negated: true|false`.

**Input**

```json
{ "raw": "NO_AUTO_CD" }
```

**Output** (match)

```json
{
  "matches": [
    {
      "category": "option",
      "id": "autocd",
      "display": "AUTO_CD",
      "markdown": "### AUTO_CD ...",
      "negated": true
    }
  ],
  "matchesReturned": 1,
  "matchesTotal": 1
}
```

**Output** (multi-match)

```json
{
  "matches": [
    { "category": "complex_command", "id": "for", "display": "for", "markdown": "..." },
    { "category": "reserved_word",   "id": "for", "display": "for", "markdown": "..." }
  ],
  "matchesReturned": 2,
  "matchesTotal": 2
}
```

**Output** (no match)

```json
{ "matches": [], "matchesReturned": 0, "matchesTotal": 0 }
```

For options, `id` is the normalized lookup key (lowercase, underscores stripped) while `display` is the human-friendly form. Categories with literal identities (builtins, reserved words, etc.) have `id === display`.

Other example inputs: `"echo"`, `"[["`, `"<<<"`, `"!$"`, `"%1"`, `"nocorrect"`, `{"raw": "for", "category": "reserved_word"}`.

### `zsh_search`

Fuzzy discovery across the bundled reference. Matches the query against record ids and human display headings; optionally filtered to a single `category`. Ranking: exact id/display > prefix > fuzzy score. Results carry `{ category, id, display, subKind?, score? }` but **not** the rendered markdown body — compose with `zsh_docs` when you need the full doc. `subKind` is populated for categories with a meaningful sub-facet (e.g. history `kind`, glob_op `kind`, reserved_word `pos`) and omitted otherwise. The response also carries `matchesReturned` (== `matches.length`) and `matchesTotal` (pre-truncation total); `matchesReturned < matchesTotal` signals the `limit` truncated the result — raise `limit` or narrow `category` / `query` to see the rest. `limit=0` returns metadata only.

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

Other example inputs: `{"query": "autocd"}`, `{"query": "redir", "limit": 50}`.

### `zsh_list`

Enumerate records, optionally filtered to one category. Same envelope as `zsh_search`; same identity-only payload (no markdown body — pair with `zsh_docs` for the full doc). Use this to answer "what options (builtins, reserved words, …) exist?" without burning tokens on a fuzzy query.

**Input**

```json
{ "category": "precmd", "limit": 100 }
```

**Output**

```json
{
  "matches": [
    { "category": "precmd", "id": "noglob", "display": "noglob" },
    { "category": "precmd", "id": "nocorrect", "display": "nocorrect" }
  ],
  "matchesReturned": 2,
  "matchesTotal": 2
}
```

Other example inputs: `{}` (first 20 records of every category, with `matchesTotal` = entire corpus), `{"category": "option", "limit": 0}` (metadata only — counts without payload), `{"category": "history"}`.

## Privacy & side effects

The server has no side effects beyond writing MCP JSON-RPC frames to stdout (and fatal errors to stderr). See the **No trust surface** bullet in [§ Why zshref-mcp?](#why-zshref-mcp) for the enumeration and the structural enforcement (scope-fence test in `@carlwr/zsh-core-tooldef`).

## License

MIT. See [LICENSE](./LICENSE). Upstream zsh documentation notices: see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
