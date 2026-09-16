/**
 * Vendored zsh corpus identity — the upstream tag, commit, and date of
 * the `.yo` sources under `src/data/zsh-docs/`. Single runtime source
 * of truth; the sibling `SOURCE.md` and `THIRD_PARTY_NOTICES.md` in
 * that dir stay human-readable, kept in sync by a test.
 *
 * Surfaced through the zsh-core public API so every consumer names the
 * same zsh.
 */
export const ZSH_UPSTREAM = {
  tag: "zsh-5.9",
  commit: "73d317384c9225e46d66444f93b46f0fbe7084ef",
  date: "2022-05-14",
} as const

export type ZshUpstream = typeof ZSH_UPSTREAM
