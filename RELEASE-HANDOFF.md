# Release handoff

Written 2026-04-19 at the end of a pre-release wiring session.
Audience: whoever picks up release work later, human or agent.

## Posture

This is a handoff note, not a runbook. Treat every concrete claim here as "true when written, verify before acting." If this file and the repo disagree, the repo wins.

If you end up publishing from a meaningfully drifted repo, update this file first or immediately after.

## Release state at handoff

Dedicated release workflows existed for:

| Package | State at handoff | Publish auth |
|---|---|---|
| `@carlwr/zsh-core` | alpha published on npm + JSR | tokenless: npm Trusted Publishing + JSR repo link |
| `@carlwr/zshref-mcp` | alpha published on npm + JSR | tokenless: same |
| `better-zsh` | unpublished; release workflow dry-run verified end-to-end | `secrets.VSCE_PAT` + `secrets.OPEN_VSX_TOKEN` |

Shared workflow conventions:
- tag push means real publish;
- `workflow_dispatch` defaults to dry-run;
- each workflow fails early if tag and in-repo version sites disagree.

Only those packages had dedicated release workflows at handoff. Before tagging anything new, walk `.github/workflows/release-*.yml` against the current publishable package set and close any gaps first.

Other housekeeping that landed in the same window:
- Dependabot was configured with grouped minor/patch updates and an `ignore` rule pinning `@types/node` to the current `engines.node` major.
- Repo and package docs were scanned for rename survivors and stale state.

## Manual publishing (when CI can't be used)

The `release-*.yml` workflows are the normal path. Use manual publish only when CI is blocked — e.g. the npm side already landed (so CI's `npm publish` step would 403) and only the JSR half is left, or when adding a package that doesn't yet have a workflow (`@carlwr/zsh-core-tooldef` at time of writing).

### npm (token-free on the dev machine via `pnpm`)

`pnpm publish` picks up the logged-in user from `~/.npmrc` (`npm login` once; `npm whoami` to check).

```
cd packages/<pkg>
pnpm publish --access public --tag next --no-git-checks
```

Use `--tag next` for pre-releases (anything with `-` in the version); that keeps `latest` pointing at the most recent stable so `npm install <pkg>` without a tag still resolves safely. Run in topological order if multiple packages share workspace deps — the current graph is `zsh-core → zsh-core-tooldef → zshref-mcp`.

`npm view <pkg> versions` can lag by a few minutes for brand-new scoped packages, even after `pnpm publish` reports success; the tarball URL (`https://registry.npmjs.org/<scope>/<pkg>/-/<pkg>-<ver>.tgz`) returns 200 immediately.

### JSR (interactive browser auth; TTY required)

`deno publish` itself requires a token (`--token`). `pnpm dlx jsr publish` wraps it with a browser-based auth flow — but only when stdin is a TTY. In a non-TTY shell (agent tools that pipe stdout, `ssh -T`, CI without OIDC), the wrapper falls through to the raw `deno publish` error: "No means to authenticate. Pass a token to `--token`."

Run each invocation in a real interactive terminal, per package, in topological order:

```
cd packages/<pkg>
pnpm dlx jsr publish --allow-dirty
```

The CLI prints a code and URL on the first run; approve in the browser, return to the terminal — the publish continues automatically. Each new shell session re-prompts (auth is per-process, not persisted).

`--allow-dirty` is required whenever the working tree has uncommitted changes (version bump, etc.). JSR propagation is typically quicker than npm; `curl -sfI https://jsr.io/<scope>/<pkg>/meta.json` shows the new version almost immediately.

### When to prefer CI over manual

The release workflows include provenance (`npm publish --provenance`) and OIDC-based tokenless JSR publishing. Manual publishes from a dev machine drop provenance and use user-scoped JSR auth. For stable releases, always prefer the CI path. Manual publish is for recovering from partial release states or for packages without a workflow yet.

## Deliberately deferred

- Presentation polish: README work, extension icon/banner/screenshots, and other creative packaging the user owns.
- The first non-alpha release line.
- MCP extraction into its own repo; the working checklist is `packages/zshref-mcp/EXTRACTION.md`.
- The TypeScript 6 upgrade.

## Likely next path

Treat this as a likely sequence, not a prescription:

- Presentation polish lands.
- The first non-alpha version bumps land. Read each package's current release checklist or package-local docs instead of trusting any frozen list of version sites here.
- Tags are pushed using whatever patterns the current `release-*.yml` files define.
- MCP extraction happens alongside the first non-alpha if that plan still stands; use `packages/zshref-mcp/EXTRACTION.md`.

For the extension, versions containing `-` publish with `--pre-release`; clean versions publish stable. Verify current Marketplace/Open VSX behavior before relying on that.

## Don’t-forget list

- Version-site drift is a hard failure, not a warning. Fix the mismatched site rather than papering over the guard.
- `engines.node` and workflow `node-version` move together.
- The extension VSIX is built once and then published byte-identically to both marketplaces; use the workflow artifact to sanity-check it before a real publish.
- Rehearse with `workflow_dispatch` in dry-run mode before a real publish.
- The extension `contributes.languageModelTools` manifest mirrors the shared `toolDefs`; a test guards the equality.
- Dependabot will keep touching release workflows. Low risk, but the `@types/node` ignore rule should remain until `engines.node` moves deliberately.
- After a zsh-core public-API addition, `verifyREGISTRY` stays red in downstream packages until the new zsh-core publish exists on the registries. Local ordinary tests are intentionally insulated from that.

## Re-check before acting

- Workflow files: names, action versions, tag patterns, secret names, step order.
- Per-package version sites.
- Dependabot rules.
- MCP extraction status.
- Current Marketplace/Open VSX publish-flag behavior.

If you fix drift here, keep the file terse; it is for orientation, not archival completeness.
