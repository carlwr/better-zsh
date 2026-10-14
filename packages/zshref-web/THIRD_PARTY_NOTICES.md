`zshref-web` ships third-party material in its built site (`build/`): data
derived from the zsh documentation, and bundled npm packages and fonts under
their own licences.

zsh documentation
-----------------

The search index carries text derived from the zsh documentation sources
(tag `zsh-5.9`), under the zsh licence.
Provenance and full licence text:
`packages/zsh-core/src/data/zsh-docs/THIRD_PARTY_NOTICES.md`.

Embedding model
---------------

`BAAI/bge-small-en-v1.5` (MIT) is not bundled: the browser downloads it at
runtime from the Hugging Face Hub. The shipped search vectors
(`search-vectors.bin`) are its output.
