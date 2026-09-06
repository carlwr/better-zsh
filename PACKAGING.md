---
audience: maintainer
read-when: build, packaging, release patterns
---

# PACKAGING.md

Universal patterns for build, packaging, and release. Project-specific package names and env-var names live in `AGENTS.md`.

## Makefile conventions

- `.PHONY: <target>` inline on its own line directly above each target block — not one grouped declaration at the top. Keeps diffs minimal as targets come and go.
- No top-of-file prose duplicating the target list.

## Dual-registry publishing (npm + JSR)

When a TS package targets both npm (compiled `dist`) and JSR (source-form):

- No runtime `package.json` reads in library code; JSR consumers receive source-form packages plus declared data/assets, not npm `dist`.
- Package identity (name, version) lives in a package-local source module; runtime and build code import from there.
- Add a drift guard on package identity (`pkg-info.test.ts` style).
- Shared subpath exports must stay aligned across `package.json` and `deno.json`.
- npm-only generated artifacts and workspace-internal entrypoints stay out of `deno.json.exports`.

## Release wiring

`.github/workflows/release-*.yml` headers own the per-package specifics — trigger tag pattern, dry-run default, auth posture, dist-tag and pre-release rules. Don't restate them.

Invariants those headers don't carry:

- Every publishable package needs its own release workflow; before tagging, walk `release-*.yml` against the publishable set and close gaps first.
- `engines.node` and workflow `node-version` move together.
- A version bump updates every site the workflow's tag guard checks — the guard fails the release, it does not warn.

### Manual publish (fallback)

Workflows are the normal path: npm provenance plus tokenless OIDC. Publish by hand only to recover a partial release, or for a package that has no workflow yet. Topological order when packages share workspace deps.

npm — uses the `~/.npmrc` login (`npm whoami` to check); `--tag next` for any version containing `-`, keeping `latest` on the most recent stable:

```sh
cd packages/<pkg>
pnpm publish --access public --tag next --no-git-checks
```

JSR — browser auth, per process, and requires a real TTY; piped or otherwise non-interactive shells fall through to `deno publish`'s "No means to authenticate" error:

```sh
cd packages/<pkg>
pnpm dlx jsr publish --allow-dirty
```

`--allow-dirty` whenever the tree is dirty, e.g. an uncommitted version bump.

After a first publish of a new scoped package, `npm view <pkg> versions` can lag several minutes behind the tarball URL; fetch the tarball to confirm, rather than re-publishing. JSR propagates faster — `curl -sfI https://jsr.io/<scope>/<pkg>/meta.json`.

## Linguist hints

`.gitattributes` (`linguist-generated`, `linguist-vendored`, `linguist-documentation`) can steer GitHub's Linguist to keep the language-bar honest and collapse generated diffs. Decide separately whether language noise warrants marking generated/vendored sources.

## Upstream-rebuild short-circuit env var

When a workspace has multiple aggregator scripts that re-trigger `pre*` hooks racing on shared upstream `dist/`, route through a single upstream-readiness script. A skip-upstream env var lets downstream `pre*` hooks short-circuit when they know upstream is already fresh.

Required contracts:

- downstream `pre*` hooks short-circuit on the env var
- workspace-recursive aggregators route through the upstream-readiness script

New aggregators invoking upstream-rebuilding `pre*` hooks follow the pattern. Hook-less aggregators (e.g. `format`, `lint`) need not.
