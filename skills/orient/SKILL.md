---
name: orient
description: Orient quickly in the better-zsh monorepo. Use at the start of any work session, when adding features, debugging, or navigating unfamiliar code. Provides discovery scripts rather than hardcoded filenames.
---

# Orientation: better-zsh monorepo

This skill adds navigation strategies and discovery scripts. Tool-agnostic posture: `WORKFLOW.md`.

## META: about this skill

> Source of truth: `$REPO_ROOT/skills/orient/`; tool-specific roots reach it through symlinks (`scripts/list-repo-symlinks`). Edit the physical files only, even if the path you see came via a symlink.

## Discovery scripts (always-fresh orientation)

Always run (general project overview):
```sh
./skills/orient/scripts/overview
```

Run selectively (TS packages only):
```sh
# print exports (see --help):
./skills/orient/scripts/exports zsh-core
./skills/orient/scripts/exports vscode-better-zsh
./skills/orient/scripts/exports zshref-web

# print extension provider metadata:
./skills/orient/scripts/providers
```

## Symbol navigation

In Cursor: prefer the `Grep` and `SemanticSearch` agent tools. In CLI sessions (claude, codex, etc.): use `rg` directly.

```sh
# Find definition of a symbol
rg "^export.*(function|const|type|interface|class) SymbolName" --type ts

# Find all usages
rg "\bsymbolName\b" --type ts
```
