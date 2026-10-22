`better-zsh` ships copied third-party material in two places:

- `syntaxes/shell-unix-bash.tmLanguage.json`
- `out/zsh-lexicon-data/*` in built VSIX artifacts

Primary notice locations:

- Grammar notice: `syntaxes/THIRD_PARTY_NOTICES.md`
- Vendored zsh-doc notice in built output: `out/zsh-lexicon-data/THIRD_PARTY_NOTICES.md`

The zsh-doc notice is copied from `@carlwr/zsh-lexicon`, which vendors the
zsh documentation sources.
