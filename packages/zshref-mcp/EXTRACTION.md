# Extraction checklist

> **Scope and lifetime.** Working checklist for the day
> `@carlwr/zshref-mcp` leaves the `better-zsh` monorepo for its own repo.
> Keep it local; delete it on the extraction commit or move it to private notes.
>
> Nothing here is a promise or a spec. Add items as you notice them; cross them off as they land.

---

## Items that become actionable at extraction time

### Lockfile / toolchain

- `deno.lock` — currently gitignored (see `DEVELOPMENT.md` §`deno.lock`).
  Remove from `.gitignore`, commit it. `pnpm-lock.yaml` disappears with
  the workspace; `deno.lock` becomes the JSR-side lockfile.
- `pnpm-lock.yaml` — today the authoritative lockfile is the workspace root one. Decide on extraction whether the standalone repo stays on pnpm or switches to npm/yarn.
- `packageManager` field in `package.json` — currently inherited from the workspace root. If the standalone repo keeps pnpm, add it.

### `package.json` edits

- `repository.url` — currently points at `carlwr/better-zsh`. Update to
  the new repo URL.
- `dependencies.@carlwr/zsh-core` — currently `workspace:*`. Replace with a pinned registry version. Requires zsh-core to be published first.
- `dependencies.@carlwr/zsh-core-tooldef` — currently `workspace:*`. Replace with a pinned registry version. Requires tooldef to be published first.
- ~~`engines.node` — carry forward (currently `>=22`; keep in sync with the new repo's CI).~~ **Done** — `engines.node: ">=22"` present in `package.json`; carry-forward note still applies at extraction.
- `scripts.prebuild`, `scripts.pretypecheck`, `scripts.pretest` currently prebuild workspace deps (`@carlwr/zsh-core` and `@carlwr/zsh-core-tooldef`). Post-extraction those lines go away; published deps are no longer prebuilt locally.
- ~~`files` — double-check still accurate; currently `["dist", "LICENSE",
  "THIRD_PARTY_NOTICES.md", "deno.json"]`.~~ **Verified** — matches `package.json` today; re-check on extraction day.

### `deno.json` edits

- ~~`imports` points at `jsr:@carlwr/zsh-core@…` (done once `@carlwr/zsh-core` was published).~~ **Done** — `deno.json` already pins `jsr:@carlwr/zsh-core@^0.1.0-alpha.0`. On version bumps of the dep, update the pinned JSR specifier here in the same commit.
- `imports` must also include `jsr:@carlwr/zsh-core-tooldef@...` — already present post-tooldef-extraction; same version-bump-in-same-commit discipline applies.

### CI / act

- New `.github/workflows/ci.yml` at the repo root. Template: the `mcp`
  job currently in the monorepo's `.github/workflows/ci.yml`
  (`jobs.mcp`). That job is deliberately self-contained to minimize
  translation work.
- New `scripts/test-integration-act` at the repo root. Template: the
  monorepo's script. This repo's version is much simpler — no
  Electron/xvfb/zsh/libasound2t64 step — so it's mostly delete work.
- `scripts.test:integration` and `scripts.test:integration:act` in `package.json` — today the split exists because the monorepo also hosts the extension. Post-extraction, either collapse to a single `test:integration` or keep both if the native aggregator still pays for itself. Decide on extraction day.
- Release workflow: tag → build → `npm publish --provenance` plus `jsr publish` (or equivalent). Port the current monorepo workflow to standalone-repo paths.

### Docs

- `README.md` — replace internal monorepo links with stable public URLs.
- `DEVELOPMENT.md §deno.lock` — replace with "committed; standard JSR lockfile policy."
- This file (`EXTRACTION.md`) — delete on the extraction commit.
- Workspace-level `DESIGN.md` §"MCP as a consumer" can move to past tense and keep a short pointer to the new repo.
- Workspace-level `AGENTS.md` should drop MCP-specific layout details and keep a pointer.

### Cross-repo drift guards

- `packages/vscode-better-zsh/src/test/zsh-ref-tools.test.ts` imports `toolDefs` from `@carlwr/zsh-core-tooldef`, not from the MCP package. That guard should survive extraction unchanged as long as tooldef stays published and the extension pins a compatible version.

### Scope fence

- The scope fence already lives in `@carlwr/zsh-core-tooldef/src/test/scope.test.ts`. No extraction-time action needed there.

### Orient skill

- The orientation skill should still avoid MCP-package naming by its own hard rules; do a quick audit on extraction day.

---

## Conventions while this file exists

- Keep entries short and actionable. Rationale belongs elsewhere.
- If a non-extraction commit already satisfies an item, cross it off here in the same commit.
