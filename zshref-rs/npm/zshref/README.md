# @carlwr/zshref

Prebuilt [`zshref`](https://github.com/carlwr/zshref) binaries for npm: the `zshref` CLI and the `zshref-mcp` MCP server — an offline, structured reference for zsh syntax, built for agent pipelines.

```sh
npm i -g @carlwr/zshref    # installs both `zshref` and `zshref-mcp`
zshref docs --key AUTO_CD
```

Only the MCP server wanted? `npx -y @carlwr/zshref-mcp` — see [`@carlwr/zshref-mcp`](https://www.npmjs.com/package/@carlwr/zshref-mcp). Install one of the two globally, not both: both own the `zshref-mcp` command.

Every supported platform's binaries ship in this one package (macOS, Linux and Windows on x64 and arm64); the `bin` entries are tiny launchers that run the one for the current platform — nothing is downloaded at install time. Also available as `cargo install zshref --features mcp`, or as archives on the GitHub release.

Usage, MCP client configuration, tool descriptions: the [project README](https://github.com/carlwr/zshref#readme).
