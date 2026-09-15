# @carlwr/zshref-mcp

The `zshref-mcp` [Model Context Protocol](https://modelcontextprotocol.io) server as an `npx`-able package: an offline, structured reference for zsh syntax — look up a token, search the manual, print the docs for a known element — with no shell execution and no network.

```sh
# Claude Code
claude mcp add zshref -- npx -y @carlwr/zshref-mcp
```

```json
// Claude Desktop, Cursor, VS Code, …: the stdio server entry
{ "command": "npx", "args": ["-y", "@carlwr/zshref-mcp"] }
```

The binaries come from the dependency [`@carlwr/zshref`](https://www.npmjs.com/package/@carlwr/zshref), which also carries the `zshref` CLI; this package adds only the `zshref-mcp` command. Install one of the two globally, not both.

Tool descriptions, per-client configuration, other install channels: the [project README](https://github.com/carlwr/zshref#readme).
