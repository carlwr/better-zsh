# Release handoff

Written 2026-04-19 at the close of a pre-release wiring session. Intended audience: whoever (human or agent) picks up release work later — possibly months from now, possibly after the repo has shifted.

## Posture — read this first

This is a handoff note, not a runbook. Every concrete claim below was true *at the time of writing*. By the time anyone reads this, the repo may have changed: workflow files renamed, tag prefixes adjusted, version sites added or consolidated, MCP extracted, assets landed. **Read this for orientation; verify each step against the current repo state before acting on it.** Where this document and the current repo disagree, the repo wins.

If the repo has drifted meaningfully, consider updating this file before you publish — it exists to shorten the next handoff.

## What was done (pre-release)

All three publishable packages have working release plumbing. Two already shipped an alpha.

| Package | State at time of writing | Publish auth |
|---|---|---|
| `@carlwr/zsh-core` | alpha published (npm + JSR) | Tokenless (npm Trusted Publishing + JSR repo link) |
| `@carlwr/zshref-mcp` | alpha published (npm + JSR) | Tokenless (same) |
| `better-zsh` (VS Code extension) | unpublished; release workflow dry-run verified end-to-end | `secrets.VSCE_PAT` + `secrets.OPEN_VSX_TOKEN` |

Shared conventions across the three release workflows under `.github/workflows/`:
- Tag push → real release.
- `workflow_dispatch` → dry-run by default; set `dry_run=false` to publish from an ad-hoc manual run.
- Tag-vs-version guard: workflow fails early if the pushed tag does not match the package's in-repo version sites.

Other housekeeping that landed in the same window:
- Dependabot configured with grouped minor/patch updates and an `ignore` rule pinning `@types/node` to the `engines.node` major (currently Node 22).
- Workspace and package `.md` files were scanned for rename-survivors and stale state and corrected.

## What was deliberately *not* done

These were in scope to consider and explicitly deferred:

- **Presentation polish.** Workspace-level `README.md`, extension README, extension icon, Marketplace gallery banner, screenshots. Creative work the user owns. The first non-alpha of the extension is blocked on this.
- **First non-alpha cut.** All packages sit on alpha / `0.0.1`. No non-alpha has been tagged.
- **MCP extraction to its own repo.** Scheduled to happen *simultaneously with* the first non-alpha, not before. The live checklist is `packages/zshref-mcp/EXTRACTION.md`.
- **TypeScript 6 upgrade.** Dependabot PR was open at handoff; deferred.

## The intended path forward (the Y steps)

Sequence assumed at time of writing. Re-evaluate before following.

**Y0 — presentation polish lands.** Whatever set of README + asset changes the user considers complete. This unblocks the rest.

**Y1 — version bump to first non-alpha.** Each package has *multiple* version sites that must all agree; a guard in each release workflow fails the publish if they drift. For `@carlwr/zshref-mcp` the sites at time of writing include `package.json`, `deno.json`, and `src/pkg-info.ts`. Read the in-package release checklist before bumping rather than trusting this list.

**Y2 — tag and push per package.** Tag prefixes at time of writing:
- `@carlwr/zsh-core` — see its workflow for the current pattern
- `@carlwr/zshref-mcp` — `zshref-mcp-v*`
- `better-zsh` (ext) — `ext-v*`

For the extension, a version string containing `-` (e.g. `0.1.0-alpha.0`) publishes with `--pre-release`; a clean version publishes stable. Marketplace convention: stable on even-minor, pre-release on odd-minor — honor it if you care about clean pre-release→stable rollovers for opted-in users.

**Y3 — MCP extraction.** At the moment of the first non-alpha, `packages/zshref-mcp/` leaves this repo. Use `packages/zshref-mcp/EXTRACTION.md` as the checklist; it was maintained alongside the pre-release work.

## "Don't forget" list

- **Version-site drift is a hard failure, not a warning.** Each workflow's tag-vs-version guard compares the tag against every in-package version site. Do not paper over a failure — find the site that's out of sync.
- **`engines.node` and the workflow `node-version` move together.** Raising one without the other has bitten the repo before.
- **The extension VSIX is built once, published byte-identically to Marketplace and Open VSX.** The workflow uploads the VSIX as a run artifact before publishing — download that to sanity-check a build before flipping `dry_run` off.
- **Always rehearse with `workflow_dispatch` + `dry_run=true` first.** The default is dry-run for a reason.
- **The `contributes.languageModelTools` manifest mirrors the MCP `toolDefs`.** A unit test asserts equality. If you add or edit a tool, update both — the test tells you if you forgot.
- **Dependabot will churn against the release workflows.** Expect periodic PRs bumping actions versions. Low-risk; merge them. The `@types/node` ignore rule should stay in place until `engines.node` is raised deliberately.

## Likely drift points to re-verify before acting

- Workflow files — action versions, step order, tag patterns, secret names.
- Per-package version-site inventory — sites added or consolidated.
- Dependabot `ignore` rules — expired or reshaped.
- MCP extraction status — if it already happened, large parts of this document no longer apply; trust the current repo and the new MCP repo's own docs.
- Whether Marketplace / Open VSX still accept the publish flags used at time of writing.

If this file contradicts the current repo, the repo wins. Then — if you're feeling generous — fix the file.
