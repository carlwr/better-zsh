# Extraction checklist

> **Scope and lifetime.** This file is a working checklist for the day
> `@carlwr/zsh-ref-mcp` is extracted from the `better-zsh` monorepo into
> its own git repo. It is intentionally local: it lives in version
> control here, but is expected to be **deleted on the extraction
> commit** (or moved to that new repo's private notes). It will not be
> pushed to any public remote.
>
> Nothing here is a promise or a spec — it's a running todo. Add items
> as you notice them; cross them off as they land.

---

## Items that become actionable at extraction time

### Lockfile / toolchain

- `deno.lock` — currently gitignored (see `DEVELOPMENT.md` §`deno.lock`).
  Remove from `.gitignore`, commit it. `pnpm-lock.yaml` disappears with
  the workspace; `deno.lock` becomes the JSR-side lockfile.
- `pnpm-lock.yaml` — not currently present at package level (the one
  that matters today is at the workspace root). Decide: keep using pnpm
  in the standalone repo (retain a lockfile at the package root), or
  switch to npm/yarn — pnpm has no advantage once the workspace is
  gone, but equally no cost.
- `packageManager` field in `package.json` — currently absent here
  (inherited from workspace root). If sticking with pnpm, add it.

### `package.json` edits

- `repository.url` — currently points at `carlwr/better-zsh`. Update to
  the new repo URL.
- `dependencies.zsh-core` — currently `workspace:*`. Replace with a
  pinned version from the npm/JSR registry (`"zsh-core": "^X.Y.Z"`).
  Requires `zsh-core` to have been published first.
- `engines.node` — carry forward (currently `>=22`; keep in sync with the new repo's CI).
- `scripts.prebuild`, `scripts.pretypecheck`, `scripts.pretest` all
  currently do `pnpm --filter zsh-core build`. Post-extraction these
  lines go away — `zsh-core` is a published dep, nothing to pre-build.
- `files` — double-check still accurate; currently `["dist", "LICENSE",
  "THIRD_PARTY_NOTICES.md", "deno.json"]`.

### `deno.json` edits

- `imports` currently contains the workspace workaround:
  ```json
  "zsh-core":        "../zsh-core/index.ts",
  "zsh-core/render": "../zsh-core/render.ts"
  ```
  Replace with:
  ```json
  "zsh-core":        "jsr:@carlwr/zsh-core@X.Y.Z",
  "zsh-core/render": "jsr:@carlwr/zsh-core@X.Y.Z/render"
  ```
- `imports["@carlwr/typescript-extra"]` — kept in the map today **only**
  because Deno resolves `zsh-core` from its `.ts` sources which import
  it. Once `zsh-core` comes from JSR, Deno resolves that dep
  transitively via JSR metadata; this entry can be removed.

### CI / act

- New `.github/workflows/ci.yml` at the repo root. Template: the `mcp`
  job currently in the monorepo's `.github/workflows/ci.yml`
  (`jobs.mcp`). That job is deliberately self-contained to minimize
  translation work.
- New `scripts/test-integration-act` at the repo root. Template: the
  monorepo's script. This repo's version is much simpler — no
  Electron/xvfb/zsh/libasound2t64 step — so it's mostly delete work.
- `scripts.test:integration` and `scripts.test:integration:act` in
  `package.json`: today the `:act` variant exists only because the
  monorepo co-hosts the extension (which needs act for its electron
  matrix), and the MCP's cheap native aggregator is worth keeping as
  the default. Post-extraction there is no second package to mirror,
  so the split collapses: either keep the act wrapper as
  `test:integration` (single CI job, one ACT invocation) or retain
  both — the native aggregator stays faster to iterate on. Decide on
  extraction day; either is coherent.
- Release workflow: tag → build → `npm publish --provenance` + `jsr
  publish` (or equivalent). Not present in the monorepo today.

### `test:install` script

`scripts/test-install.mjs` currently packs both `@carlwr/zsh-ref-mcp`
and `zsh-core` from the workspace and installs the MCP tarball with an
npm `overrides: { "zsh-core": "file:<tgz>" }` block, because `zsh-core`
isn't published yet. Post-extraction:

- Drop the zsh-core pack step.
- Drop the `overrides` block from the synthetic install package.json —
  npm will resolve `zsh-core` from the registry like any other dep.

### Docs

- `README.md` — internal monorepo links (if any) → stable URLs (GitHub
  releases, JSR page, etc.).
- `DEVELOPMENT.md` — drop the `## JSR publishing: pre-publish
  workaround` section and the `@carlwr/typescript-extra` nuance
  paragraph (both become obsolete).
- `DEVELOPMENT.md §deno.lock` — replace with "committed; standard JSR
  lockfile policy."
- This file (`EXTRACTION.md`) — delete on the extraction commit.
- Workspace-level `DESIGN.md` §"MCP as a consumer" stays in the
  monorepo but can be reworded to past-tense ("the MCP *was* a second
  consumer, now lives at …"). Optionally keep a 2-line pointer.
- Workspace-level `AGENTS.md` — prune MCP layout/paragraphs; leave a
  pointer to the new repo for agents starting from the monorepo.

### Cross-repo drift guards

- `packages/vscode-better-zsh/src/test/zsh-ref-tools.test.ts` currently
  imports `toolDefs` from the workspace-local MCP package. Post-split:
  either pin the published version in the extension's dependencies so
  the drift guard keeps working unchanged, or rewrite the guard to
  fetch `toolDefs` metadata from the installed package's tarball. The
  first is simpler.

### Orient skill

- `.agents/skills/orient/` does not reference the MCP package by name
  per its hard rules (directories only; no file names). A quick audit
  at extraction time to confirm nothing has crept in since.

---

## Conventions while this file exists

- Keep entries short and actionable. No prose rationale — the rationale
  already lives elsewhere (`DESIGN.md`, `DEVELOPMENT.md`, commit
  messages). Reference rather than duplicate.
- When an item is addressed by a non-extraction commit (e.g. landing
  new work that already respects the future shape), cross it off here
  in the same commit.
