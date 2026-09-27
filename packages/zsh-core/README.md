# @carlwr/zsh-core

> **Status: pre-release (alpha).** API surface is still free to move. Published on npm and JSR as part of the [`better-zsh`](https://github.com/carlwr/better-zsh) monorepo. First non-alpha release has not yet been cut.

Structured zsh reference knowledge as a typed TypeScript library. Parses vendored Yodl (`.yo`) source from upstream zsh-5.9 into typed records, exposes a closed taxonomy of doc categories, and ships markdown rendering.

Library-first: the VS Code extension, the web SPA, and the Rust crate (CLI + MCP server) in the same monorepo are each separate consumers of this package, not internal users of it. Further consumers are expected.

## What you get

- **The data model at the root** — the corpus (`loadCorpus`, `DocCorpus`), the category ontology (`DocCategory`, `docCategories`, `DocRecordMap`) and the record types, each carrying its `category` and its identity brand (`Documented<K>`).
- **Operations as subpaths** — `./resolver`, `./render`, `./assets`, `./meta`.
- **Orthogonal primitives** — raw-to-doc resolution and markdown rendering stay separate.
- **Release assets** — a versioned index plus one record file (every category's records under its category), one JSON Schema bundle (the record file validates against its root, a category's records against `#/$defs/<category>`), and a resolver conformance fixture for resolver mirrors; attached to the GitHub release tag for consumers outside TypeScript.

Public reading surface: `dist/types/*.d.mts` after `pnpm build`.

## Install

```sh
npm install @carlwr/zsh-core
# or
pnpm add @carlwr/zsh-core
```

Node ≥ 22; ESM (`import`) and CommonJS (`require`), typed for both.

Deno / JSR:

```sh
deno add jsr:@carlwr/zsh-core
# or, from Node
npx jsr add @carlwr/zsh-core
```

## Minimal usage

```ts
import { loadCorpus } from "@carlwr/zsh-core"
import { resolve } from "@carlwr/zsh-core/resolver"
import { renderRecord } from "@carlwr/zsh-core/render"

const corpus = loadCorpus()
const hit = resolve(corpus, "option", "NO_AUTO_CD")
if (hit) {
  console.log(hit.record.id)         // → autocd
  console.log(hit.feedback)          // → { kind: "input-negated" }
  const { title, mdBody } = renderRecord(corpus, hit.record)
  console.log(`${title}\n\n${mdBody}`)
}
```

## Design posture

- **Static, not environment-aware.** The corpus is bundled; no probing of the host zsh, no `$commands` / `$aliases` / runtime `setopt` readout. Answers are the same on every machine.
- **Lazy corpus.** `loadCorpus()` locates the data and returns; a category is parsed on first access, once. Touch few categories, parse few files.
- **Parametric over per-category specialisation.** `DocCategory` is a closed union; adding a category is a local drop-in that the type system propagates.
- **Focused imports.** The root is the data model; import the operations on it — resolution, rendering, assets, metadata — from named subpaths.
- **Orthogonal API.** `resolve` + `renderRecord` compose; a hit carries the record, so nothing is looked up twice, and no combined "raw string → markdown" convenience is exposed — that's a deliberate design choice, not an omission. See [`DESIGN.md`](https://github.com/carlwr/better-zsh/blob/main/DESIGN.md) §"API orthogonality".

## Performance

Measured on an Apple M1 with Node 26, calling the built ESM entry points (`dist/*.mjs`). Median of 5–7 fresh processes for cold figures. Corpus: 40 `.yo` files (1.06 MB, 25k lines) → 1,312 records.

Loading, cold (fresh process):

| step | time |
|---|---|
| import `@carlwr/zsh-core` | ~5 ms |
| `loadCorpus()` | ~0.1 ms (locates the data; parses nothing) |
| first access, one category (`option`, 197 records) | ~14 ms |
| first access, one category (`builtin`, 131 records) | ~35 ms |
| first access, every category | ~105 ms |

Of the all-categories figure, parsing the Yodl source is ~30 ms; extracting records is the rest.

Warm: `loadCorpus()` is memoized per process and each category is built once, so later calls and re-accesses cost microseconds. A long-lived host (editor, server) pays the cold cost once.

Queries, corpus already loaded, over every record's `id` (1,312 queries):

| operation | throughput | per op |
|---|---|---|
| `resolve(corpus, cat, raw)`, hit | ~7.7M/s | ~0.1 µs |
| `resolve(corpus, cat, raw)`, miss | ~3M/s | ~0.3 µs |
| `resolveAll(corpus, raw)` | ~250k/s | ~4 µs |
| `renderRecord(corpus, record)` | ~180k/s | ~5.5 µs |
| `resolve` + `renderRecord` | ~190k/s | ~5 µs |
| `resolveAll` + `renderRecord` per hit | ~90k/s | ~11 µs |

Steady state after JIT warm-up; the first pass runs at 20–60% of these rates. In-process library calls, no I/O or serialization — not directly comparable to a CLI's batch-mode rate.

One-shot lookup, as a CLI would do it (fresh process, wall clock; bare `node -e 0` takes ~30 ms):

- `resolve` + render of one option: ~50 ms
- `resolveAll` + render (touches every category): ~150 ms

## See also

- [`zshref`](https://github.com/carlwr/zshref) — single-file executable Rust CLI, and the same reference as a Model Context Protocol server.
- [`better-zsh`](https://github.com/carlwr/better-zsh/tree/main/packages/vscode-better-zsh) — VS Code extension.
- [`DESIGN.md`](https://github.com/carlwr/better-zsh/blob/main/DESIGN.md) — architectural rationale.

## License

MIT. See `LICENSE`. Upstream zsh documentation notices: `THIRD_PARTY_NOTICES.md`.
