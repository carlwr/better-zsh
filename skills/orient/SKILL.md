---
name: orient
description: Orient quickly in the better-zsh monorepo. Use at the start of any work session, when adding features, debugging, or navigating unfamiliar code. Provides discovery scripts and reading-path strategies rather than hardcoded filenames.
---

# META: ABOUT THIS SKILL

> Source of truth lives under `$REPO_ROOT/skills/orient/`. For discoverability from different agent tools, symlinks point into this directory from tool-specific roots. Those roots today are:
>
> ```
> $REPO_ROOT/.agents/
> $REPO_ROOT/.claude/
> $REPO_ROOT/.cursor/
> $REPO_ROOT/.opencode/
> ```
>
> <!-- Enumerating these concrete paths is deliberate: they are not easily
>      inferrable, and naming them here is more useful than the general rule.
>      Treated as an acceptable enumeration under AGENTS.md §"Markdown style
>      in docs". -->
>
> **When editing:** always write to the physical files under `$REPO_ROOT/skills/orient/`, even if the path you see came via a symlink.

# Orientation: better-zsh monorepo

Read first:

- root `AGENTS.md` — conventions, testing rules, contributor workflow
- `PRINCIPLES.md` — cross-cutting design principles
- `DESIGN.md` — subsystem rationale
- subpackage `AGENTS.md` for the area you're touching (loud pointer at top of root `AGENTS.md`)

This skill adds navigation strategies and discovery scripts. Tool-agnostic posture: see root `AGENTS.md` "Keeping docs fresh".

## Discovery scripts (always-fresh orientation)

Rather than listing files that may become stale, the skill provides executable scripts that produce always-current output. Run these at the start of a session. Script paths below are relative to the skill directory.

```sh
# print ts package source/test files, Rust CLI source/tests, API rollup status:
./scripts/overview

# these do not include `zshref`:

# print exports (grep-friendly; out lines are "<filename> <identifier>"):
./scripts/exports zsh-core  # packages/zsh-core
./scripts/exports tooldef   # packages/zsh-core-tooldef
./scripts/exports mcp       # packages/zshref-mcp
./scripts/exports ext       # packages/vscode-better-zsh

# print extension provider registrations, classes, and semantic token scope config:
./scripts/providers

```

These are the **primary navigation entry point**. Start here, then read specific files as needed. `./scripts/overview` also prints repo symlink topology.

## API snapshots

Read rolled-up `dist/types/*.d.ts` for each built package. The overview script lists what's built; build a package first if its rollup is missing.

## Symbol navigation

In Cursor: prefer the `Grep` and `SemanticSearch` agent tools. In CLI sessions (claude, codex, etc.): use `rg` directly.

```sh
# Find definition of a symbol
rg "^export.*(function|const|type|interface|class) SymbolName" --type ts

# Find all usages
rg "\bsymbolName\b" --type ts
```

## Cross-cutting gotchas

Subpackage-local gotchas live in each subpackage's `AGENTS.md`. The two below span packages or are visible to any consumer:

**Analysis is partial:**

- command-position analysis remains line-local
- cross-line quote suppression is narrow
- `$()` contents are active code, not quoted-region silence

**Tool layer must not depend on `vscode`:** `packages/zsh-core-tooldef/` is pure tools + metadata; LM registration lives in the extension. `contributes.languageModelTools` vs `toolDefs` is drift-tested. MCP/LM wiring is locked to:

- root `@carlwr/zsh-core`
- root tooldef
- brace imports
- per-adapter tooldef symbols

Enforced from `packages/zsh-core-tooldef/src/test/` (see root `AGENTS.md` "Tooldef + adapters").

---

## RULES: keeping this skill fresh

These are **hard rules**, not suggestions. Agents modifying this file must follow them.

- **NEVER add filenames.** Reference directories, not files. The discovery scripts and `ls`/`rg` commands produce current filenames at read-time.
  - Allowed: `packages/zsh-core/src/docs/yodl/`
  - Forbidden: `packages/zsh-core/src/docs/yodl/core/nodes.ts`
  - Exception: `package.json` is acceptable (stable, universal name).
- **NEVER add function/class/variable names.** The exports script and `rg` produce current symbol names at read-time.
  - Exception: names in cross-cutting gotchas where the gotcha is about a specific behavior of a named thing.
- **NEVER add line counts, file counts, or other volatile metrics.** The overview script produces these fresh.
- **DO add new directory paths** when a new source directory becomes a common entry point.
- **DO add new gotchas** only when truly cross-cutting (spanning multiple packages or visible to any consumer). Subpackage-local invariants belong in that subpackage's `AGENTS.md` or a source comment.
- **DO update discovery scripts** when the directory structure changes in ways that break them.
- **Design rationale** belongs in source comments, `PRINCIPLES.md`, or `DESIGN.md`, not here.
