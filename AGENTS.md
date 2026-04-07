# Agent / Contributor Guidelines

## repo, packages

a small monorepo with two packages:
- zsh-core
  - does not (will not) exists only for the sake of vscode-better-zsh
  - i.e. is expected to have exposed functionality that is not used by the extension
  - its dist contains, and is intended to contain, structured knowledge on zsh, in the form of json files
  - to be maximally usable with AI workflows, esp. for consumers of the package, it should try to export its API surface in suitable machine-readable forms (currently, e.g. API Extractor is used) (see further: the llms.txt file written into the dist)
- vscode-better-zsh
  - a consumer of zsh-core


## Meta: keeping docs fresh

- Avoid duplicating information that lives in source (e.g. package.json scripts, file names, directory layout) — it becomes stale
- Express constraints and intent rather than enumerating specifics
- Prefer patterns ("unit tests live next to the code they test") over exact paths

## Validation before returning to user

- Before presenting results, run: `pnpm check && pnpm test && pnpm test:smoke && pnpm vsix && pnpm test:integration &>/dev/null`
- If any step fails, attempt to fix and re-run — don't return with known failures
- any build script whose name includes "INTERACTIVE" are **excluded** from this loop — only run when user explicitly requests it

## Testing

- if the user mentions running "all tests", that **does not include** build scripts whose name include "INTERACTIVE"
- **NEVER run build scripts whose names include "INTERACTIVE"** unless the user explicitly instructs you to
  - on macOS they launch a full VS Code app momentarily and brings it into focus - it therefore cannot be safely run while the user is possibly doing other work
- `test:integration` 
  - is headless
  - has lengthy output (approx 700 lines)
    - -> run with &>/dev/null, investigate output only if a reason to
  - is long-running (minutes)
    - -> run this only as the very last check, when all other tests have been iterated on
- build scripts whose name does not include INTERACTIVE may not call build scripts whose name inlcude INTERACTIVE
- Unit test coverage is the baseline; integration tests are a bonus layer
- Unit tests should not be skipped just because integration tests cover the same area
- Integration tests may and should overlap with unit tests — they exercise a richer harness
- Tests must be well-abstracted and concise — every test should carry its weight
- Pure logic (parsing, filtering, text analysis) should always have unit tests independent of external dependencies (zsh, VS Code APIs)
- Integration tests that depend on external tools (e.g., zsh on PATH) must skip gracefully when the tool is absent
- The VS Code Electron test harness intentionally runs ALL tests (unit + integration) — unit tests re-running there serve as meta-tests under a richer harness
- Functions that are "obviously correct" (general/simple enough) do not need unit tests

## Code style

- Short identifiers, minimal comments — prefer naming over comments
- Functional style preferred; pure functions where possible
- **No classes** — except where VS Code API demands (provider interfaces that implement `vscode.*Provider`). All logic in pure functions; providers are thin shells calling them.
- Avoid mutable state; when needed, handle with care and isolate
- Extract pure, testable functions — even single-use if they clarify intent or enable testing
- Abstract repeated patterns into shared utilities
- At call sites, a self-explanatory function name is cheaper cognitive load than inline code
- No unnecessary abstractions; three similar lines > a premature helper — but once a pattern appears twice with non-trivial logic, extract it
- Keep files focused — one concern per module
- Conciseness is key, everywhere

### Types

- Use **branded types** for domain strings (option names, operators, etc.) — nominal-ish typing with zero runtime cost via phantom `__brand` field
- Smart constructors (`mkOptName`, `mkCondOp`) are the only trusted cast points for branded types — they normalize and cast
- Prefer **named type aliases** for literal unions: `type CondKind = "unary" | "binary"` — not inline in interfaces. Type name appears in signatures and error messages.
- Short field names: `desc` not `description`, `op` not `operator`
- If a value has a reason to be passed around (even potentially), give it its own type — puts documentation in the signature, enables shorter variable names, improves readability
- `enum` is not used — literal unions + type aliases are preferred in this codebase

### Testing tools

- `@fast-check/vitest` and `@carlwr/fastcheck-utils` are available as dev dependencies
- Property-based tests are encouraged for pure parsers and normalizers
- `@carlwr/fastcheck-utils` provides a few convenience generators with better shrinking and types — check if it offers something useful if writing fast-check tests

### Other tools

- `@carlwr/typescript-extra` (a dev dep, small) has some convenience utilities, including NonEmpty types and more - it is available to use if anything from it brings value

## Packaging (vsce)

- All `vsce` commands must use `--no-dependencies` — the extension is bundled by tsup, so there are no runtime node_modules; and `vsce` internally runs `npm list` which is incompatible with pnpm's symlinked layout

## Broader: intent and scope of the extension

- thinking: "pick the low-hanging fruit"
- we can't, in general, have zsh tokenize the zsh code in user files for us, since that would require zsh executing the user code

### Zsh-aware, not environment-aware

The extension uses `zsh -f` to query what zsh knows about *itself*: builtins, options, reserved words, syntax rules. It does **not** probe the user's environment.

- **Static zsh knowledge** (builtins, options, parameter expansion flags, grammar) is safe to use — it is intrinsic to zsh, same across machines
- **Environment-dependent data** (`$commands`, `$aliases`, `$functions_source`, `$fpath` beyond system defaults) is *not* used for core features — it varies by machine, launch method, editor, and target execution environment
- `-f` (NO_RCS) skips user rc files, but the process still inherits `PATH` and other env vars from VS Code — which itself varies by launch method (Dock vs terminal, bash vs zsh, Cursor vs VS Code, etc.)
- The file being edited may run on a completely different machine (CI, container, remote); exposing local environment data can actively mislead
- Mental model: "if we could bundle a zsh binary and run it in an isolated container, we would." We use system zsh and tolerate inherited env as a necessary cost — not a feature to exploit.
- Environment-dependent introspection may later be offered through agent-facing tools (Language Model Tools API) where agents explicitly opt in, with clear caveats about side effects and env-specificity

### Hover docs

- Prefer hover docs that explain actual zsh usage, not raw upstream doc notation
- For option hovers: show executable `zsh` forms first; keep category at the bottom; prioritize the default in plain zsh over other emulation defaults
- When adjusting Yodl parsing for hover docs, preserve visible prose/reference text unless there is a strong reason not to; use the hover dump script to inspect regressions in generated markdown

Regarding syntax highlighting:
- a complete, custom zsh textmateGrammar is beyond the scope of this extension
  - reasoning: shell script parsing/tokenization is hairy
  - textMate grammars is not likely the long-time future for syntax highlighting; tree-sitter is - this reduces the value of a potential zsh-specific grammar
  - design choice:
    - vendor in the current sh/bash-focused VS Code textMate grammar (from its upstream)
    - offer some semantic tokens for limited parts of zsh syntax that happens to be easily parse-able by simple regex matching (the semantic token scopes will, from a syntax-highlighting perspective, layer on top of the textMate scopes and for those hide imperfections/errors in the underlying textMate scoping

## About: new features ideation

Potential new features should be judged roughly along the axis of:
- implementation complexity ("how low is the fruit hanging")
- added value
- robustness, future-proofness, and testability of added functionality

## Ref's/sources

misc:
- `zsh` available on the system (macOS-shipped; zsh 5.9)


zsh sources
- https://github.com/zsh-users/zsh (zsh repo mirror)
- https://github.com/zsh-users/zsh/blob/master/Doc documentation primary source (.yo/Yodl)

Yodl doc markup/tool:
- repo: https://gitlab.com/fbb-git/yodl
- homepage: https://fbb-git.gitlab.io/yodl/
- userguide (TOC, with links): https://fbb-git.gitlab.io/yodl/yodl-doc/yodl.html
- (note: the zsh repo defines a number of custom yodl macros)
- (note: the Yodl program/toolkit has converters for output as: html, latex, man, txt)

### zsh man page

- is available on the system (complete zsh 5.9 manual)
- `man zshall`
  - headings only: `man zshall | col -b | grep -E '^\S'` (172 lines)
  - headings, incl 1st sublevel: `man zshall | col -b | grep -E '^ {0,3}\S'` (305 lines)
  - `info zsh` is also available, with the same material, if an `info` interface is preferred)

manuals:
```bash
# full manual:
man zshall

# subsections (everything is covered by zshall):
man zshcompctl
man zshcontrib
man zshmodules
man zshroadmap
man zshzle
man zshall
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

getting "man page TOC":
```bash
man zshall|col -b|grep -E '^\S'         # headings (top-level); 172 lines
man zshall|col -b|grep -E '^ {0,3}\S'`  # headings (top+1st level); 305 lines
```

size of full man page:
```bash
man zshall|col -b|wc -l       # 30378
man zshall|col -b|wc -w       # 204773
man zshall|col -b|tokenCount  # 314083
```
