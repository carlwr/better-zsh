# @carlwr/zsh-core

> **Status: pre-release (alpha).** API surface is still free to move. Published on npm and JSR as part of the [`better-zsh`](https://github.com/carlwr/better-zsh) monorepo. First non-alpha release has not yet been cut.

Structured zsh reference knowledge as a typed TypeScript library. Parses vendored Yodl (`.yo`) source from upstream zsh-5.9 into typed records, exposes a closed taxonomy of doc categories, and ships markdown rendering plus a small analysis layer for zsh source code.

Library-first: the VS Code extension, MCP server, and Rust CLI in the same monorepo are each separate consumers of this package, not internal users of it. Further consumers are expected.

## What you get

- **`DocCorpus`** — typed, category-keyed maps of parsed doc records. One map per `DocCategory`.
- **`DocCategory`** — a closed, enumerable `as const` union of the ~16 categories (`option`, `cond_op`, `builtin`, `redir`, `param_expn`, …). Iterable at runtime; exhaustive at compile time.
- **Brand types `Observed<K>` / `Documented<K>`** — separate "normalized from user code" and "corpus-confirmed" identities so they cannot be confused. See [`DESIGN.md`](https://github.com/carlwr/better-zsh/blob/main/DESIGN.md) §"Brand semantics" for the rationale.
- **`resolve(corpus, cat, raw)` / `resolveOption`** — the sanctioned crossing from raw user-code text to a corpus-verified `DocPieceId`. Handles zsh-specific quirks: corpus-aware `NO_*` negation (including the `NOTIFY` / `TIFY` edge case), redirection decomposition into `groupOp` + tail, parameter-expansion sig matching.
- **`renderDoc(corpus, pieceId)`** — markdown generation for a known `DocPieceId`. Per-category renderers internal; the public API is uniform.
- **A line-local analysis layer** (`src/analysis/`) — coarse, best-effort facts about zsh source without requiring shell execution.
- **Pre-parsed JSON artifacts** — the same data shipped as package-exported `./data/*.json` files, for consumers that want the corpus without importing the runtime.

Full typed surface: `dist/types/index.d.ts` (rolled up by API Extractor) after `pnpm build`.

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
import { loadCorpus, resolveOption } from "@carlwr/zsh-core"
import { renderDoc } from "@carlwr/zsh-core/render"

const corpus = await loadCorpus()
const hit = resolveOption(corpus, "NO_AUTO_CD")
if (hit) {
  console.log(hit.id, hit.negated)          // → autocd true
  console.log(renderDoc(corpus, hit.pieceId))
}
```

## Design posture

- **Static, not environment-aware.** The corpus is bundled; no probing of the host zsh, no `$commands` / `$aliases` / runtime `setopt` readout. Answers are the same on every machine.
- **Parametric over per-category specialisation.** `DocCategory` is a closed union; adding a category is a local drop-in that the type system propagates.
- **Orthogonal API.** `resolve` + `renderDoc` compose; no combined "raw string → markdown" convenience is exposed — that's a deliberate design choice, not an omission. See [`DESIGN.md`](https://github.com/carlwr/better-zsh/blob/main/DESIGN.md) §"API orthogonality".

## See also

- [`@carlwr/zsh-core-tooldef`](https://github.com/carlwr/better-zsh/tree/main/packages/zsh-core-tooldef) — declarative tool definitions over this library, consumed by the MCP, CLI, and VS Code adapters.
- [`@carlwr/zshref-mcp`](https://github.com/carlwr/better-zsh/tree/main/packages/zshref-mcp) — Model Context Protocol server.
- [`zshref`](https://github.com/carlwr/better-zsh/tree/main/zshref-rs) — single-binary Rust CLI.
- [`better-zsh`](https://github.com/carlwr/better-zsh/tree/main/packages/vscode-better-zsh) — VS Code extension.
- [`DESIGN.md`](https://github.com/carlwr/better-zsh/blob/main/DESIGN.md) — architectural rationale.

## License

MIT. See [LICENSE](./LICENSE). Upstream zsh documentation notices: [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
