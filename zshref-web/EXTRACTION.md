---
audience: maintainer
read-when: orienting on zshref-web publishing intent and extraction changes
---

# Extraction orientation

> **Scope and lifetime.** Where the thinking stands ahead of the day `zshref-web` leaves the `better-zsh` monorepo. Orientation, not a step list: whoever does the extraction knows the repo as it is then, and specifics recorded now would only go stale. Delete on the extraction commit or move to private notes.

## What this project is for

Building and publishing the SPA **is** the point of the project; everything else here serves it. What the SPA is, and what it depends on: `zshref-web/AGENTS.md`.

## Publishing intent

- Host wherever is simplest. Current leaning: GitHub Pages.
- `zshref-web/AGENTS.md` still names Cloudflare Pages. Reconcile the two when the decision is actually made, not before.

## Why publishing is deferred to post-extraction

- The deploy consumes `zshref` **release assets**, and the zshref release workflow is itself deferred to first release.
- Pre-extraction there is nothing to consume, so a pipeline would have to fetch the model, build the nlp binary and rebuild the index purely to stage throwaway inputs — then be rewritten against real releases anyway.
- Building it once, against the actual post-extraction repos, is both simpler and less discarded work.

CI is a separate question and is **not** deferred — a `web` job already runs `pnpm qa`.

## What changes shape at extraction

- `scripts/fetch-artifacts` — flips from local sibling paths to release-asset download.
- `tests/_helpers.ts` — every test reads `../zshref-rs/` directly, never `.artifacts/`. Those paths vanish at extraction, and the two unconditional tests (parity, lookup contract) then hard-fail rather than skip.
- SPA base path — depends on the final repo / Pages URL; `svelte.config.js` sets no `kit.paths.base` today.
- `pnpm-workspace.yaml` — the self-rooting marker exists only to fend off the monorepo workspace; it goes away, and with it the reason to keep workspace non-membership.
- _unchanged:_ the BGE model is fetched from the HuggingFace CDN at runtime, so nothing model-shaped needs hosting.

## Don't forget

Unlike the other to-be-extracted dirs, this one has no `README.md`, `DEVELOPMENT.md`, `LICENSE` or `THIRD_PARTY_NOTICES.md`. The SPA bundles third-party code (transformers.js, shiki, fonts), so notices are a real obligation, not a formality.
