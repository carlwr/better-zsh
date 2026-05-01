/**
 * Vendored zsh corpus identity — the upstream tag, commit, and date of
 * the `.yo` sources under `src/data/zsh-docs/`. Single runtime source
 * of truth; the sibling `SOURCE.md` and `THIRD_PARTY_NOTICES.md` in
 * that dir stay human-readable, kept in sync by `pkg-info.test.ts`.
 *
 * Surfaced through the zsh-core public API so consumers (the MCP
 * server's `--version` + tool descriptions, the extension's startup
 * log, the generated `dist/json/index.json`) all name the same zsh.
 */
export const ZSH_UPSTREAM = {
  tag: "zsh-5.9",
  commit: "73d317384c9225e46d66444f93b46f0fbe7084ef",
  date: "2022-05-14",
} as const

export type ZshUpstream = typeof ZSH_UPSTREAM
