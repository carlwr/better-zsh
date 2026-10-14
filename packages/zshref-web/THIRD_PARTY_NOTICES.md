`zshref-web` ships third-party material in its built site (`build/`): bundled
npm packages, fonts, and data derived from the zsh documentation.

zsh documentation
-----------------

The search index and record pages (`static/artifacts/`) carry text derived
from the zsh documentation sources (tag `zsh-5.9`), under the zsh licence.
Provenance and full licence text:
`packages/zsh-core/src/data/zsh-docs/THIRD_PARTY_NOTICES.md`.

Bundled packages
----------------

| Package | Licence | Ships as |
|---|---|---|
| `@huggingface/transformers` | Apache-2.0 | JS |
| `onnxruntime-web` | MIT | JS, `.wasm` |
| `shiki`, `@shikijs/*` | MIT | JS |
| `markdown-it` | MIT | JS |
| `zod` | MIT | JS |
| `svelte`, `@sveltejs/kit` | MIT | JS |
| `@fontsource-variable/inter` (Inter) | OFL-1.1 | `.woff2` |
| `@fontsource-variable/jetbrains-mono` (JetBrains Mono) | OFL-1.1 | `.woff2` |

`@shikijs/langs` and `@shikijs/themes` collect TextMate grammars and themes
from many upstreams, each under its own licence (mostly MIT); the build emits
every one as a lazily loaded chunk, not only those the site uses.

Embedding model
---------------

`BAAI/bge-small-en-v1.5` (MIT) is not bundled: the browser downloads it at
runtime from the Hugging Face Hub. The shipped search vectors
(`search-vectors.bin`) are its output.
