export type CliAction = "help" | "version" | "tty-hint" | "run"

export interface CliCtx {
  readonly argv: readonly string[]
  readonly isTTY: boolean
}

/**
 * Identity fields interpolated into the CLI's human-facing strings.
 * Kept parametric (not imported from `pkg-info.ts` inside this module)
 * so `helpText`/`ttyHintText` are pure and trivially testable with
 * sentinel values.
 */
export interface PkgIdentity {
  readonly bin: string
  readonly version: string
  readonly pkgName: string
  readonly repo: string
}

/**
 * Decide what the bin should do given post-`node`-post-script argv and
 * whether stdin is a TTY. Pure; the side effects live in the bin itself.
 *
 * An MCP client launches the server with no flags and a piped stdin;
 * that returns `"run"`. A human invoking `npx @carlwr/zsh-ref-mcp` in a
 * terminal gets `"tty-hint"` instead of a silent process that looks hung.
 */
export function decide({ argv, isTTY }: CliCtx): CliAction {
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return "help"
    if (arg === "--version" || arg === "-V") return "version"
  }
  if (isTTY) return "tty-hint"
  return "run"
}

export function helpText(id: PkgIdentity): string {
  return `${id.bin} ${id.version}
Static zsh reference as Model Context Protocol tools.

This is an MCP server. It speaks JSON-RPC over stdio and is meant to be
launched by an MCP-aware client (Claude Desktop, Cursor, Claude Code,
Codex CLI, Zed, VS Code MCP, …), not run directly in a terminal.

Flags:
  -h, --help     show this help and exit
  -V, --version  print version and exit

Client config snippet:
  command: npx
  args:    ["-y", "${id.pkgName}"]

See ${id.repo} for setup per client.
`
}

export function ttyHintText(id: PkgIdentity): string {
  return `${id.bin} ${id.version}: MCP server; speaks JSON-RPC on stdio.
No flags given and stdin is a terminal — nothing will happen here.
Configure an MCP-aware client to launch this bin, or run \`${id.bin} --help\`.
`
}
