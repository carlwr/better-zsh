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

## Linguist hints

`.gitattributes` (`linguist-generated`, `linguist-vendored`, `linguist-documentation`) can steer GitHub's Linguist to keep the language-bar honest and collapse generated diffs. Decide separately whether language noise warrants marking generated/vendored sources.

## Upstream-rebuild short-circuit env var

When a workspace has multiple aggregator scripts that re-trigger `pre*` hooks racing on shared upstream `dist/`, route through a single upstream-readiness script. A skip-upstream env var lets downstream `pre*` hooks short-circuit when they know upstream is already fresh.

Required contracts:

- downstream `pre*` hooks short-circuit on the env var
- workspace-recursive aggregators route through the upstream-readiness script

New aggregators invoking upstream-rebuilding `pre*` hooks follow the pattern. Hook-less aggregators (e.g. `format`, `lint`) need not.
