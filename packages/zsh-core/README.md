# @carlwr/zsh-core

> **Status: pre-release (alpha).** API surface is still free to move. Published on npm and JSR as part of the [`better-zsh`](https://github.com/carlwr/better-zsh) monorepo. First non-alpha release has not yet been cut.

Structured zsh reference knowledge as a typed TypeScript library. Parses vendored Yodl (`.yo`) source from upstream zsh-5.9 into typed records, exposes a closed taxonomy of doc categories, and ships markdown rendering plus a small analysis layer for zsh source code.

Library-first: the VS Code extension, MCP server, and Rust CLI in the same monorepo are each separate consumers of this package, not internal users of it. Further consumers are expected.

## What you get

- **Tiny root** — `loadCorpus`, `DocCorpus`, aggregate corpus metadata.
- **Focused subpaths** — `./types`, `./analysis`, `./resolver`, `./taxonomy`, `./render`, `./assets`, `./meta`.
- **Orthogonal primitives** — brands/types, raw-to-doc resolution, markdown rendering, and static analysis stay separate.
- **Pre-parsed JSON artifacts** — the same data shipped as package-exported `./data/*.json` files, for consumers that want the corpus without importing the runtime.

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
import { resolverFeedback, resolve } from "@carlwr/zsh-core/resolver"
import { renderDoc } from "@carlwr/zsh-core/render"

const corpus = loadCorpus()
const pid = resolve(corpus, "option", "NO_AUTO_CD")
if (pid) {
  console.log(pid.id)                                    // → autocd
  console.log(resolverFeedback(corpus, "option", "NO_AUTO_CD"))
                                                         // → { kind: "input-negated" }
  console.log(renderDoc(corpus, pid))
}
```

## Design posture

- **Static, not environment-aware.** The corpus is bundled; no probing of the host zsh, no `$commands` / `$aliases` / runtime `setopt` readout. Answers are the same on every machine.
- **Parametric over per-category specialisation.** `DocCategory` is a closed union; adding a category is a local drop-in that the type system propagates.
- **Focused imports.** Root is corpus-only; import analysis, types, resolver, taxonomy, and metadata from named subpaths.
- **Orthogonal API.** `resolve` + `renderDoc` compose; no combined "raw string → markdown" convenience is exposed — that's a deliberate design choice, not an omission. See [`DESIGN.md`](https://github.com/carlwr/better-zsh/blob/main/DESIGN.md) §"API orthogonality".

## See also

- [`@carlwr/zsh-core-tooldef`](https://github.com/carlwr/better-zsh/tree/main/packages/zsh-core-tooldef) — declarative tool definitions over this library, consumed by the MCP, CLI, and VS Code adapters.
- [`@carlwr/zshref-mcp`](https://github.com/carlwr/zshref-mcp) — Model Context Protocol server.
- [`zshref`](https://github.com/carlwr/zshref) — single-file executable Rust CLI.
- [`better-zsh`](https://github.com/carlwr/better-zsh/tree/main/packages/vscode-better-zsh) — VS Code extension.
- [`DESIGN.md`](https://github.com/carlwr/better-zsh/blob/main/DESIGN.md) — architectural rationale.

## License

MIT. See `LICENSE`. Upstream zsh documentation notices: `THIRD_PARTY_NOTICES.md`.
