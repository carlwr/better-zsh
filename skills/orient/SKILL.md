---
name: orient
description: Orient quickly in the better-zsh monorepo. Use at the start of any work session, when adding features, debugging, or navigating unfamiliar code. Provides discovery scripts and reading-path strategies rather than hardcoded filenames.
---

# Orientation: better-zsh monorepo

This skill adds navigation strategies and discovery scripts. Tool-agnostic posture: `WORKFLOW.md`.

## META: about this skill

> Source of truth lives under `$REPO_ROOT/skills/orient/`. For discoverability from different agent tools, symlinks point into this directory from tool-specific roots. Those roots today are:
>
> ```
> $REPO_ROOT/.agents/
> $REPO_ROOT/.claude/
> $REPO_ROOT/.cursor/
> $REPO_ROOT/.opencode/
> ```
>
> <!-- Enumerating these concrete paths is deliberate: they are not easily inferrable. -->
>
> **When editing:** always write to the physical files under `$REPO_ROOT/skills/orient/`, even if the path you see came via a symlink.

## Discovery scripts (always-fresh orientation)

Rather than listing files that may become stale, this project prefers executable scripts that produce always-current output.

Always run (general project overview):
```sh
./skills/orient/scripts/overview
```

Run selectively (TS packages only):
```sh
# print exports (grep-friendly; out lines are "<filename> <identifier>"):
./skills/orient/scripts/exports zsh-core
./skills/orient/scripts/exports zsh-core-tooldef
./skills/orient/scripts/exports zshref-mcp
./skills/orient/scripts/exports vscode-better-zsh

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

---

## Keeping this skill fresh

- Update discovery scripts when the directory structure changes in ways that break them.
- Design rationale belongs outside this skill:
  - source comments
  - `PRINCIPLES.md`
  - `DESIGN.md`
