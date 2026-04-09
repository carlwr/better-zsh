# Agent / Contributor Guidelines

## Overview

A small monorepo with two packages:
- **zsh-core** — standalone package of structured zsh knowledge (not just a support lib for the extension). Expected to have exposed functionality not used by the extension. Exports its API surface in machine-readable forms (e.g. API Extractor, llms.txt) for AI-friendly consumption.
- **vscode-better-zsh** — a VS Code extension; consumer of zsh-core.

Nothing is released yet — APIs can move freely.

## Architecture & key concepts

### Facts

The analysis layer produces "facts" about user zsh code. Facts are coarse, potentially overlapping annotations with a confidence level ("hard" for structural syntax like reserved words, "heuristic" for command-head detection). The term "fact" is deliberate: the analysis is not exhaustive or conclusive — facts are what the analyzer asserts, not a complete description of the code.

### Doc records

Structured documentation for zsh language elements (builtins, options, operators, redirections, etc.), parsed from upstream Yodl sources. Types follow the `*Doc` naming convention (e.g. `BuiltinDoc`, `RedirDoc`, `PrecmdDoc`). Exception: `ZshOption` — too central and natural to rename.

### Syntactic context

Best-effort determination of which syntactic region the cursor is in (setopt, conditional, arithmetic, general). Built on top of facts.

### Data flow — how zsh-core delivers its knowledge

zsh-core ships vendored Yodl (`.yo`) documentation files from the zsh upstream project. Three consumption routes:

1. **Programmatic API** (`getBuiltins()`, `getOptions()`, etc.) — parse `.yo` at runtime, cached per getter. Requires the `.yo` files on disk. For consumers who bundle zsh-core (like the extension), `copyRuntimeZshData()` copies the `.yo` payload into their output directory. The extension currently materializes this static knowledge eagerly during activation and uses it as the canonical source for semi-static language knowledge (builtins, options, reserved words, shell-managed parameters, etc.).
2. **Pre-parsed JSON** (`dist/json/*.json`) — build-time artifacts containing the same data, pre-serialized. Available via package exports (`"./data/*.json"`). No runtime parsing needed. The extension does **not** currently use this route at runtime.
3. **Raw Yodl source** (`dist/data/zsh-docs/`) — the upstream `.yo` files for advanced consumers.

Routes 1 and 2 contain the same information in different forms. Route 3 is the raw source that feeds route 1. For live hover/completion docs, the extension uses parsed doc records plus the markdown render helpers (`mdOpt()`, `mdBuiltin()`, etc.); the bulk `hoverDocs()` corpus is for dump/dev tooling rather than the live hover path.

### Yodl parsing layout

`zsh-core`'s Yodl parsing is intentionally split into layers:
- `src/yodl/core/` — shared machinery only: macro-node parsing, section/list/entry structure, and text rendering/token extraction
- `src/yodl/docs/` — vendored-corpus extractors that map the shared Yodl representation to zsh doc records

Keep low-level parsing rules in the core layer. Keep corpus-specific interpretation in the docs layer. Doc extractors should not drift back toward ad hoc rescanning of raw Yodl strings.

### Providers

VS Code provider classes that wire zsh-core analysis and doc records to language features (hover, completions, semantic tokens, etc.). Reusable parsing/rendering logic should live in pure functions; some provider-local dispatch/lookup logic still lives in the provider modules.

## Design principles

### Scope philosophy

- Thinking: "pick the low-hanging fruit"
- We can't, in general, have zsh tokenize the zsh code in user files for us, since that would require zsh executing the user code

### Zsh-aware, not environment-aware

The extension uses `zsh -f` only where actual shell execution is worth the host-dependent cost: diagnostics (`zsh -n`) and tokenization used to enrich completions. Semi-static language knowledge comes from bundled `zsh-core` data, not from the host shell. It does **not** probe the user's environment.

- **Static zsh knowledge** (builtins, options, shell-managed parameters, parameter expansion flags, grammar) is preferred for editor features — it is intrinsic to zsh, stable enough to bundle, and more consistent than asking the host shell at activation time
- **Environment-dependent data** (`$commands`, `$aliases`, `$functions_source`, `$fpath` beyond system defaults) is *not* used for core features — it varies by machine, launch method, editor, and target execution environment
- `-f` (NO_RCS) skips user rc files, but note that `/etc/zshenv` still runs. Spawned zsh processes receive only an explicit allowlist of env vars (`HOME`, `PATH`, locale vars, etc.) — see `ZSH_ENV_KEEP` in the extension source. Even this filtered set varies by VS Code launch method (Dock vs terminal, bash vs zsh, Cursor vs VS Code, etc.).
- The file being edited may run on a completely different machine (CI, container, remote); exposing local environment data can actively mislead
- Mental model: "if we could bundle a zsh binary and run it in an isolated container, we would." We use system zsh only where execution is intrinsic, and otherwise prefer bundled/static knowledge for consistency, startup latency, and smaller security surface.
- Environment-dependent introspection may later be offered through agent-facing tools (Language Model Tools API) where agents explicitly opt in, with clear caveats about side effects and env-specificity

### External input boundaries

- **Parse, don't validate** — at boundaries with external APIs (VS Code settings, filesystem, process env), parse raw values into domain types at the point of entry. Everything downstream operates on parsed domain types, never on raw values.
- **Contain boundaries structurally** — the module that reads an external API is the sole reader. The module boundary *is* the policy. A `settings` module that is the only importer of `vscode.workspace.getConfiguration` is more durable than a comment saying "don't read settings elsewhere."
- **Minimize the dangerous path** — the path from raw external input to the first strongly typed representation should be as short and contained as possible. Smart constructors at parse boundaries; no function should accept raw external values unless parsing is its explicit job.

### Hover docs

- Prefer hover docs that explain actual zsh usage, not raw upstream doc notation
- For option hovers: show executable `zsh` forms first; keep category at the bottom; prioritize the default in plain zsh over other emulation defaults
- When adjusting Yodl parsing for hover docs, preserve visible prose/reference text unless there is a strong reason not to; use the hover dump script to inspect regressions in generated markdown

### Syntax highlighting and semantic tokens

A complete, custom zsh textMate grammar is beyond the scope of this extension:
- Shell script parsing/tokenization is hairy
- textMate grammars are not likely the long-term future for syntax highlighting; tree-sitter is — this reduces the value of a potential zsh-specific grammar

Design choice:
- Vendor in the current sh/bash-focused VS Code textMate grammar (from its upstream)
- **Offer some semantic tokens for limited parts of zsh syntax** that happen to be parseable with limited/reasonable effort (semantic token scopes layer on top of the textMate scopes and hide imperfections/errors in the underlying scoping)

Semantic token scope mappings (`package.json`):
- Baseline highlighting is the textMate grammar, so semantic tokens should result in consistent highlighting with the TM grammar (where it highlights correctly)
- Map to specifically-qualified scopes — this adds flexibility for user- and theme-level overrides
  - Example: if an operator semantic token can distinguish unary vs binary, use `keyword.operator.logical.unary.shell` and `keyword.operator.logical.binary.shell` rather than the generic `keyword.operator.logical.shell`

Semantic token design choices:
- (verify against actual code before relying on these)
- `{` and `}` are emitted as `reserved-word` facts by the analysis layer but are *skipped* in the token provider — the TM grammar already handles `f() { … }` correctly, and distinguishing block-`{` from word-`{` at the heuristic level is non-trivial
- `((` and `))` are emitted as `reserved-word` facts and *do* get `keyword` tokens — reuses existing provider logic without a new token type or `semanticTokenScopes` entry
- New token types should be weighed against the need to add matching `semanticTokenScopes` entries in `package.json`

## Code style

- Short identifiers, minimal comments — prefer naming over comments
- Functional style preferred; pure functions where possible
- **No classes** — except where VS Code API demands (provider interfaces that implement `vscode.*Provider`). All logic in pure functions; providers are thin shells calling them.
- Avoid mutable state; when needed, handle with care and isolate
- Extract pure, testable functions — even single-use if they clarify intent or enable testing
- Abstract repeated patterns into shared utilities
- At call sites, a self-explanatory function name is cheaper cognitive load than inline code
- Do not hard-code things that should be global constants, or that can be read from somewhere. Example: the languageId string, the name of the extension.
- No unnecessary abstractions; three similar lines > a premature helper — but once a pattern appears twice with non-trivial logic, extract it
- Keep files focused — one concern per module
- Conciseness is key, everywhere
- Prefer directory structure richness (subdirectories) — aids agentic discoverability and script-based navigation
- When choosing between expressing intent through a concept/term vs generic description, prefer the term if it's well-chosen (cf. "facts")
- When a concept or term is established (e.g. "facts"), use it consistently — prefer the established term over ad-hoc synonyms
- Prefer expressing intent and constraints through code shape (module boundaries, types, function signatures) over comments or documentation — structural expression is self-enforcing; comments are advisory
- Strengthen documentation through identifier names and JSDoc rather than separate documentation files
- JSDocs on every exported identifier from `zsh-core` _is **not**_ a requirement - add JSDoc if it adds value beyond what function name + type signature already communicates

### Types

- Use **branded types** for domain strings (option names, operators, etc.) — nominal-ish typing with zero runtime cost via phantom `__brand` field
- Smart constructors (`mkOptName`, `mkCondOp`) are the only trusted cast points for branded types — they normalize and cast
- Prefer **named type aliases** for literal unions: `type CondKind = "unary" | "binary"` — not inline in interfaces. Type name appears in signatures and error messages.
- Short field names: `desc` not `description`, `op` not `operator`
- If a value has a reason to be passed around (even potentially), give it its own type — puts documentation in the signature, enables shorter variable names, improves readability
- `enum` is not used — literal unions + type aliases are preferred in this codebase
- **Discriminated unions for state spaces** — prefer a single tagged union over scattered booleans/flags. Only represent states that consumers can observe; impossible states should be unrepresentable.
- **Deferred computation over mutable tracking** — prefer `memoized`/`cached` (from `@carlwr/typescript-extra`) over boolean flags tracking "has this been done?". Memoization encapsulates the state; the thunk boundary replaces the flag.

### Other tools

- `@carlwr/typescript-extra` (a dev dep, small) has some convenience utilities, including NonEmpty types and more — available to use if anything from it brings value. Do not remove as a dep/dev dep even if at some point nothing from it is used

## Testing

### Validation before returning to user

- Before presenting results, run: `pnpm check && pnpm test && pnpm test:smoke && pnpm vsix && pnpm test:integration &>/dev/null`
- If any step fails, attempt to fix and re-run — don't return with known failures
- Any build script whose name includes "INTERACTIVE" are **excluded** from this loop — only run when user explicitly requests it

### Rules

- If the user mentions running "all tests", that **does not include** build scripts whose name include "INTERACTIVE"
- **NEVER run build scripts whose names include "INTERACTIVE"** unless the user explicitly instructs you to
  - On macOS they launch a full VS Code app momentarily and bring it into focus — cannot be safely run while the user is possibly doing other work
- `test:integration`
  - is headless
  - has lengthy output (approx 700 lines) — run with `&>/dev/null`, investigate output only if a reason to
  - is long-running (minutes) — run this only as the very last check, when all other tests have been iterated on
- Build scripts whose name does not include INTERACTIVE may not call build scripts whose name include INTERACTIVE
- Unit test coverage is the baseline; integration tests are a bonus layer
- Unit tests should not be skipped just because integration tests cover the same area
- Integration tests may and should overlap with unit tests — they exercise a richer harness
- Tests must be well-abstracted and concise — every test should carry its weight
- Pure logic (parsing, filtering, text analysis) should always have unit tests independent of external dependencies (zsh, VS Code APIs)
- Integration tests that depend on external tools (e.g., zsh on PATH) must skip gracefully when the tool is absent
- The VS Code Electron test harness intentionally runs ALL tests (unit + integration) — unit tests re-running there serve as meta-tests under a richer harness
- Functions that are "obviously correct" (general/simple enough) do not need unit tests

### Container-only integration tests

- `testINTERACTIVE:electron-zsh-path` (zsh-path-matrix) runs in CI/Docker only. On macOS, VS Code's shell environment resolution replaces test-injected PATH before the extension host activates, defeating environment isolation. With pure logic surfaced in unit-testable functions, container integration tests are a bonus layer over local coverage.

**Reproducibility is important: any randomness must use a fixed, checked-in seed.**

### Testing tools

- `@fast-check/vitest` and `@carlwr/fastcheck-utils` are available as dev dependencies
- Property-based tests are encouraged for pure parsers and normalizers
- `@carlwr/fastcheck-utils` provides a few convenience generators with better shrinking and types — check if it offers something useful if writing fast-check tests; do not remove as a dev dep even if at some point nothing from it is used
- fast-check version note: `fc.char()` and `fc.stringOf()` are **possibly not** available in the version used — if not available, use `fc.mapToConstant(...)` + `fc.array(...)` for character-level arbitraries

## Packaging (vsce)

- All `vsce` commands must use `--no-dependencies` — the extension is bundled by tsup, so there are no runtime node_modules; and `vsce` internally runs `npm list` which is incompatible with pnpm's symlinked layout

## Contributor guidance

### Agent tool agnostic

This repo is worked on from multiple agent tools (Cursor, Claude CLI, Codex CLI, etc.). All guidance in this file, in `SKILL.md`, and in any contributor docs must be tool-agnostic — avoid assuming any particular IDE, agent framework, or tool API.

### Keeping docs fresh

- Avoid duplicating information that lives in source (e.g. package.json scripts, file names, directory layout) — it becomes stale
- Express constraints and intent rather than enumerating specifics
- Prefer patterns ("unit tests live in `src/test/`, grouped into subdirs mirroring source structure") over exact paths

### Recording design decisions

When suitable, record design decisions, answer "why questions" etc.:
- Rationale: let future work on the code know why choices were made, possibly what was tried
- Keep short and concise
- Possible ways to record: in-source code comments, in AGENTS.md, or in a dedicated file (discuss with user)

### Keeping the orientation skill fresh

A project skill lives at `skills/orient/`. It provides:
- Discovery scripts that produce always-current output
- Reading paths by task type (which **directories** to explore, not which files to read)
- Known gotchas

The skill has its own freshness rules section — read and follow those when editing it. The overriding principles:

**HARD RULES for the orientation skill:**
- **NEVER add filenames** (reference directories, not files; exception: `package.json`)
- **NEVER add function/class/variable names** (exception: names in "Key gotchas" where the gotcha is about that specific name)
- **NEVER add line counts, file counts, or other volatile metrics**
- **DO add new directory paths** when a new directory becomes a common entry point
- **DO add new gotchas** that span multiple files or aren't obvious from reading the code
- **DO update discovery scripts** when directory structure changes break them

When making structural changes:
- New public API: no update needed — the d.ts rollup reflects it after a build
- New source directory that's a common entry point: add a reading-path entry to the skill
- Anything that belongs in code (design rationale, invariants): put it in a source comment, not in the skill

### New features ideation

Potential new features should be judged roughly along the axes of:
- Implementation complexity ("how low is the fruit hanging")
- Added value
- Robustness, future-proofness, and testability of added functionality

## References & sources

### zsh

- `zsh` available on the system (macOS-shipped; zsh 5.9)
- To check or verify actual zsh behaviour, run test commands with zsh. For tricky cases, reading up on the functionality in the manual/man pages, then verifying with a few zsh commands, is a good strategy.
- https://github.com/zsh-users/zsh (zsh repo mirror)
- https://github.com/zsh-users/zsh/blob/master/Doc — documentation primary source (.yo/Yodl)

### Yodl doc markup/tool

- Repo: https://gitlab.com/fbb-git/yodl
- Homepage: https://fbb-git.gitlab.io/yodl/
- Userguide (TOC, with links): https://fbb-git.gitlab.io/yodl/yodl-doc/yodl.html
- Note: the zsh repo defines a number of custom Yodl macros
- Note: the Yodl program/toolkit has converters for output as: html, latex, man, txt

### zsh man page

- Complete zsh 5.9 manual available on the system
- `man zshall`
  - Headings only: `man zshall | col -b | grep -E '^\S'` (172 lines)
  - Headings, incl 1st sublevel: `man zshall | col -b | grep -E '^ {0,3}\S'` (305 lines)
  - `info zsh` is also available, with the same material

Manuals:
```bash
# full manual:
man zshall

# subsections (everything is covered by zshall):
man zshcompctl
man zshcontrib
man zshmodules
man zshroadmap
man zshzle
man zshcompsys
man zshexpn
man zshoptions
man zshtcpsys
man zshbuiltins
man zshcompwid
man zshmisc
man zshparam
man zshzftpsys
```

Getting "man page TOC":
```bash
man zshall|col -b|grep -E '^\S'         # headings (top-level); 172 lines
man zshall|col -b|grep -E '^ {0,3}\S'   # headings (top+1st level); 305 lines
```

Size of full man page:
```bash
man zshall|col -b|wc -l       # 30378
man zshall|col -b|wc -w       # 204773
man zshall|col -b|tokenCount  # 314083
```
