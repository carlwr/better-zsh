`better-zsh` ships copied third-party material in two places:

- `syntaxes/shell-unix-bash.tmLanguage.json`
- `out/zsh-core-data/*` in built VSIX artifacts

Primary notice locations:

- Grammar notice: `syntaxes/THIRD_PARTY_NOTICES.md`
- Vendored zsh-doc notice in built output: `out/zsh-core-data/THIRD_PARTY_NOTICES.md`

The zsh-doc notice is copied from `@carlwr/zsh-core`, which vendors the
zsh documentation sources.
