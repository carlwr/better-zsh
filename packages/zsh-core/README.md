# @carlwr/zsh-core

> **Status: pre-release (alpha).** API surface is still free to move. Published on npm and JSR as part of the [`better-zsh`](https://github.com/carlwr/better-zsh) monorepo. First non-alpha release has not yet been cut.

Structured zsh reference knowledge as a typed TypeScript library. Parses vendored Yodl (`.yo`) source from upstream zsh-5.9 into typed records, exposes a closed taxonomy of doc categories, and ships markdown rendering plus a small analysis layer for zsh source code.

Library-first: the VS Code extension, the web SPA, and the Rust crate (CLI + MCP server) in the same monorepo are each separate consumers of this package, not internal users of it. Further consumers are expected.

## What you get

- **The data model at the root** — the corpus (`loadCorpus`, `DocCorpus`), the category ontology (`DocCategory`, `docCategories`, `DocRecordMap`) and the record types with their identity brand (`Documented<K>`).
- **Operations as subpaths** — `./resolver`, `./render`, `./analysis`, `./json`, `./assets`, `./meta`.
- **Orthogonal primitives** — raw-to-doc resolution, markdown rendering, and static analysis stay separate.
- **Release assets** — per-category JSON record files plus a versioned index, one JSON Schema bundle (each record file validates against its `#/$defs/<category>`), and a resolver conformance fixture for resolver mirrors; attached to the GitHub release tag for consumers outside TypeScript.

Public reading surface: `dist/types/*.d.ts` after `pnpm build`.

## Install

```sh
npm install @carlwr/zsh-core
# or
pnpm add @carlwr/zsh-core
```

Deno / JSR:

```ts
import { loadCorpus } from "jsr:@carlwr/zsh-core"
```

## Minimal usage

```ts
import { loadCorpus } from "@carlwr/zsh-core"
import { resolve } from "@carlwr/zsh-core/resolver"
import { renderRecord } from "@carlwr/zsh-core/render"

const corpus = loadCorpus()
const hit = resolve(corpus, "option", "NO_AUTO_CD")
if (hit) {
  console.log(hit.id)                // → autocd
  console.log(hit.feedback)          // → { kind: "input-negated" }
  const { title, mdBody } = renderRecord(corpus, hit.category, hit.record)
  console.log(`${title}\n\n${mdBody}`)
}
```

## Design posture

- **Static, not environment-aware.** The corpus is bundled; no probing of the host zsh, no `$commands` / `$aliases` / runtime `setopt` readout. Answers are the same on every machine.
- **Lazy corpus.** `loadCorpus()` locates the data and returns; a category is parsed on first access, once. Touch few categories, parse few files.
- **Parametric over per-category specialisation.** `DocCategory` is a closed union; adding a category is a local drop-in that the type system propagates.
- **Focused imports.** The root is the data model; import the operations on it — resolution, rendering, analysis, JSON projection, assets, metadata — from named subpaths.
- **Orthogonal API.** `resolve` + `renderRecord` compose; a hit carries the record, so nothing is looked up twice, and no combined "raw string → markdown" convenience is exposed — that's a deliberate design choice, not an omission. See [`DESIGN.md`](https://github.com/carlwr/better-zsh/blob/main/DESIGN.md) §"API orthogonality".

## See also

- [`zshref`](https://github.com/carlwr/zshref) — single-file executable Rust CLI, and the same reference as a Model Context Protocol server.
- [`better-zsh`](https://github.com/carlwr/better-zsh/tree/main/packages/vscode-better-zsh) — VS Code extension.
- [`DESIGN.md`](https://github.com/carlwr/better-zsh/blob/main/DESIGN.md) — architectural rationale.

## License

MIT. See `LICENSE`. Upstream zsh documentation notices: `THIRD_PARTY_NOTICES.md`.
