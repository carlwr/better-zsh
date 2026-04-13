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

### Analysis layout

`src/analysis/facts.ts` is the public entry point and fact-model surface. Shared document/span helpers, line scanning, and context/setopt detection live in sibling analysis modules. Keep the public fact vocabulary centralized there, but keep scanner mechanics and context heuristics out of it — avoid growing it back into a mixed "types + orchestration + low-level scanning" file.

### Data flow — how zsh-core delivers its knowledge

zsh-core ships vendored Yodl (`.yo`) documentation files from the zsh upstream project. Three consumption routes:

1. **Programmatic API** (`loadCorpus()`) — parse `.yo` at runtime into a `DocCorpus`; cached. Requires the `.yo` files on disk. For consumers who bundle zsh-core (like the extension), `copyRuntimeZshData()` copies the `.yo` payload into their output directory. The extension calls `loadCorpus()` once at activation and uses the corpus as the canonical source for semi-static language knowledge (builtins, options, reserved words, shell-managed parameters, etc.).
2. **Pre-parsed JSON** (`dist/json/*.json`) — build-time artifacts containing the same data, pre-serialized. Available via package exports (`"./data/*.json"`). No runtime parsing needed. The extension does **not** currently use this route at runtime.
3. **Raw Yodl source** (`dist/data/zsh-docs/`) — the upstream `.yo` files for advanced consumers.

Routes 1 and 2 contain the same information in different forms. Route 3 is the raw source that feeds route 1. For live hover/completion docs, the extension passes the `DocCorpus` to providers; lookups go via `resolve()` + `renderDoc()`. The per-category `md*()` renderers are not part of the `zsh-core/render` package surface — they are internal dispatch targets reachable only via direct module imports (e.g. from within the package's own tests).

### Yodl parsing layout

`zsh-core`'s Yodl parsing is intentionally split into layers:
- `src/docs/yodl/core/` — shared machinery only: macro-node parsing, section/list/entry structure, and text rendering/token extraction
- `src/docs/yodl/extractors/` — vendored-corpus extractors that map the shared Yodl representation to zsh doc records

Keep low-level parsing rules in the core layer. Keep corpus-specific interpretation in the docs layer. Doc extractors should not drift back toward ad hoc rescanning of raw Yodl strings.

### Providers

VS Code provider classes that wire zsh-core analysis and doc records to language features (hover, completions, semantic tokens, etc.). Reusable parsing/rendering logic should live in pure functions; some provider-local dispatch/lookup logic still lives in the provider modules.

### Conceptual domains — A / B / C

Three orthogonal domains. Preserve this decomposition; it should be visible in directory structure, types, and naming.

- **A — Parsed Documentation** (`src/docs/`): static, vendored zsh knowledge. A closed taxonomy of 13 `DocCategory` values; each has a doc-record type (`ZshOption`, `CondOpDoc`, …), a corpus-identity branded type, and a collection of records parsed from `.yo` sources. Knows nothing about user code.
- **B — Fact Extraction** (`src/analysis/`): coarse, potentially overlapping annotations about user zsh code. A `Fact` discriminated union with confidence levels. Knows nothing about doc records or markdown. User-code-derived identifiers carry *candidate* brands — never proven corpus-identity brands.
- **C — Markdown Rendering** (`src/render/`): transforms doc records into human-readable markdown. Depends on A; orthogonal to B.

The consumer (extension) plumbs A+B→C: facts identify what to look up, doc records supply content, rendering produces output. This plumbing is procedural dispatch in consumer code — zsh-core does not wire A+B→C internally.

### Brand semantics

Branded types serve two distinct roles — do not conflate them.

**Corpus-identity brands** (`OptName`, `CondOp`, `BuiltinName`, …) — used in doc records and as `DocCorpus` map keys. Represent identifiers of known, documented zsh elements. Produced only by Yodl extractors via their smart constructors (`mkOptName`, …). Exceptions: `PrecmdName` and `ProcessSubstOp` are small closed sets, modelled as literal unions rather than phantom brands — no smart constructor needed.

**Candidate brands** (`CandidateOpt`, `CandidateCondOp`, `CandidateBuiltin`, …) — used by consumers for lookup candidates derived from user code. Well-formed and normalized, but not proven to identify a corpus member. Normalization may differ from the corpus counterpart (e.g. `mkCandidateOpt` strips `no_`; `mkOptName` does not).

The two families are structurally incompatible. The candidate→proven boundary is crossed **only through `resolve(corpus, candidateId)`** — the sole public brand-boundary crossing point. `renderDoc(corpus, provenId)` then produces markdown; the two steps are intentionally separate and no public API combines them.

`DocPieceId` (proven) and `CandidateDocPieceId` are discriminated unions keyed on `category`, providing parametric access across all 13 doc categories.

## Design principles

### Scope philosophy

- Thinking: "pick the low-hanging fruit"
- We can't, in general, have zsh tokenize the zsh code in user files for us, since that would require zsh executing the user code

### Zsh-aware, not environment-aware

The extension uses `zsh -f` only where actual shell execution is worth the host-dependent cost: diagnostics (`zsh -n`) and tokenization used to enrich completions. Semi-static language knowledge comes from bundled `zsh-core` data, not from the host shell. It does **not** probe the user's environment.

- **Static zsh knowledge** (builtins, options, shell-managed parameters, parameter expansion flags, grammar) is preferred for editor features — it is intrinsic to zsh, stable enough to bundle, and more consistent than asking the host shell at activation time
- **Environment-dependent data** (`$commands`, `$aliases`, `$functions_source`, `$fpath` beyond system defaults) is *not* used for core features — it varies by machine, launch method, editor, and target execution environment
- `-f` (NO_RCS) skips user rc files, but note that `/etc/zshenv` still runs. Spawned zsh processes receive only an explicit allowlist of env vars (`HOME`, `PATH`, locale vars, etc.) — see `ZSH_ENV_KEEP` in the extension source. Even this filtered set varies by VS Code launch method (Dock vs terminal, bash vs zsh, Cursor vs VS Code, etc.).
- The configured zsh binary path is intentionally **machine-scoped only** and explicit paths must be absolute. `""` means PATH lookup for `zsh`; `"off"` disables runtime zsh execution; relative paths are rejected at the settings parse boundary rather than normalized later.
- The file being edited may run on a completely different machine (CI, container, remote); exposing local environment data can actively mislead
- Mental model: "if we could bundle a zsh binary and run it in an isolated container, we would." We use system zsh only where execution is intrinsic, and otherwise prefer bundled/static knowledge for consistency, startup latency, and smaller security surface.
- Environment-dependent introspection may later be offered through agent-facing tools (Language Model Tools API) where agents explicitly opt in, with clear caveats about side effects and env-specificity

### External input boundaries

- **Parse, don't validate** — at boundaries with external APIs (VS Code settings, filesystem, process env), parse raw values into domain types at the point of entry. Everything downstream operates on parsed domain types, never on raw values.
- **Contain boundaries structurally** — the module that reads an external API is the sole reader. The module boundary *is* the policy. A `settings` module that is the only importer of `vscode.workspace.getConfiguration` is more durable than a comment saying "don't read settings elsewhere."
- **Minimize the dangerous path** — the path from raw external input to the first strongly typed representation should be as short and contained as possible. Smart constructors at parse boundaries; no function should accept raw external values unless parsing is its explicit job.

### Surface invariants in code

- State variables in scanning loops: document with a brief declaration comment (e.g. `// expectCmd: true when next token is in command position`)
- "Obviously correct islands" — pure, strongly-typed, narrow-scope helpers that are correct by construction — are the preferred unit of non-trivial logic
- Prefer structural enforcement of invariants over advisory comments (branded types, `ReadonlySet`, smart constructors) — structural constraints are self-enforcing; comments are advisory
- Evaluate zsh-core's public API surface from a **general-consumer perspective**, not just from what the extension uses — exported types and fields that appear unused by the extension may still be part of the public contract

### Yodl files can be considered fixed and static

- In general, we do not need to cover for the Yodl docs being re-vendored, e.g. for a zsh upgrade. This is estimated to be a practical concern every 10-20 years -> can be disregarded.
- What can happen is extending the functionality by vendoring in more Yodl files. That is considered a static change to zsh-core, and is _expected_ to warrant changes to its static types, including those in its API.

In other words:
**Properties of the vendored .yo files can for practical matters be considered domain invariants.**

### Hover docs

- Prefer hover docs that explain actual zsh usage, not raw upstream doc notation
- For option hovers: show executable `zsh` forms first; keep category at the bottom; prioritize the default in plain zsh over other emulation defaults
- When adjusting Yodl parsing for rendered reference markdown, preserve visible prose/reference text unless there is a strong reason not to; use the reference dump script to inspect regressions in generated markdown

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
- **Do not add inner `readonly` by reflex** — add it when the container type itself must be non-mutable across call boundaries or aliases. If immutability is already enforced by the containing field/signature and the value is constructed once rather than mutated in place, extra inner `readonly` is usually redundant noise rather than a stronger invariant.
- Module-level constants that are `Set`/`Map` and must never be mutated should carry `ReadonlySet<T>`/`ReadonlyMap<K,V>` type annotations — structural enforcement over advisory comments.

### Other tools

- `@carlwr/typescript-extra`
  - a dev dep
  - a small package with some convenience utilities, including a NonEmpty type and utilities for that type
  - available to use if anything from it brings value
  - do not remove as a dev dep even if at some point it becomes unused
  - for overview, read the `.d.ts` file:

    ```sh
    cat $(gfind . -wholename '*/typescript-extra/dist/index.d.ts' | head -n1)
    # approx. 150 lines
    ```

## Testing

- **Reproducibility is important: any randomness must use a fixed, checked-in seed.**
- Property-based tests are encouraged where appropriate (e.g. pure parsers)

### ONLY if you edited code: _validation before returning to user_

- Before presenting results, run: `pnpm check && pnpm test && pnpm test:smoke && pnpm vsix && pnpm test:integration &>/dev/null`
- If any step fails, attempt to fix and re-run — don't return with known failures
- Any build script whose name includes "INTERACTIVE" are **excluded** from this loop — only run when user explicitly requests it

**If you have only answered questions, or written only documentation/non-code files, _do not run any tests_** (unless the user explicitly asks for it).

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
- Pure logic (parsing, filtering, text analysis) should always have unit tests independent of external dependencies (zsh, VS Code APIs)
- Integration tests that depend on external tools (e.g., zsh on PATH) must skip gracefully when the tool is absent
- The VS Code Electron test harness intentionally runs ALL tests (unit + integration) — unit tests re-running there serve as meta-tests under a richer harness
- Functions that are "obviously correct" (general/simple enough) do not need tests

### Rules - test conciseness and abstractions

**Test conciseness is a standing repo concern, not optional polish.**

**Hard overarching rule:** _If you touch tests, actively try to make the touched tests smaller unless that would hide intent._

Rules and guidelines:
- Tests must be well-abstracted and concise — every test should carry its weight
- Any edit that touches tests should include a conciseness/refactoring pass: remove non-paying repetition, collapse repeated arrange/act/assert shapes into tables/helpers when that reduces code, and shorten file-local identifiers where this stays readable
- Prefer case data that encodes the assertion directly. Keep `desc`/label/title fields only when they carry non-obvious intent or "why"; if they only restate the code/sample/suite context, remove them
- Prefer deriving test titles from the code sample or a tiny discriminator. Avoid verbose prose prefixes that repeat the suite name, implementation name, or obvious "works/handles/returns" wording
- Test fixtures should be only as realistic as the assertion needs. If a string/object field is not semantically relevant to the behavior under test, use `""` or a minimal distinct value rather than descriptive filler
- When multiple tests need the same test-only fixture shape, prefer a shared helper in test code over repeating near-identical local stubs
- When many cases share the same arrange/act/assert shape, prefer Vitest's `test.each` / `describe.each` (table-driven tests). Not a universal rule: one-off scenarios, tests with heavy per-case setup, or cases where a standalone `test("…")` reads more clearly are fine without `.each`

### Container-only integration tests

- `testINTERACTIVE:electron-zsh-path` (zsh-path-matrix) runs in CI/Docker only. On macOS, VS Code's shell environment resolution replaces test-injected PATH before the extension host activates, defeating environment isolation. With pure logic surfaced in unit-testable functions, container integration tests are a bonus layer over local coverage.

### Testing tools

Test runners:
- Vitest
- Mocha for Electron tests

Property tests: `fast-check`
- through `@fast-check/vitest`
- fast-check version note: `fc.char()` and `fc.stringOf()` are **possibly not** available in the version used — if not available, use `fc.mapToConstant(...)` + `fc.array(...)` for character-level arbitraries
- dep `@carlwr/fastcheck-utils`
  - provides: a few convenience generators with better shrinking and types
  - -> if writing fast-check tests, check if it offers something useful
  - do not remove as a dev dep even if at some point it becomes unused
  - for overview, read the `.d.ts` file:

    ```sh
    cat $(gfind . -wholename '*/fastcheck-utils/dist/index.d.ts' | head -n1)`
    # approx. 100 lines
    ```

## Packaging (vsce)

- All `vsce` commands must use `--no-dependencies` — the extension is bundled by tsup, so there are no runtime node_modules; and `vsce` internally runs `npm list` which is incompatible with pnpm's symlinked layout

## Contributor guidance

### Agent tool agnostic

This repo is worked on from multiple agent tools (Cursor, Claude CLI, Codex CLI, etc.). All guidance in this file, in `SKILL.md`, and in any contributor docs must be tool-agnostic — avoid assuming any particular IDE, agent framework, or tool API.

### Keeping docs fresh

- Avoid duplicating information that lives in source (e.g. package.json scripts, file names, directory layout) — it becomes stale
- Express constraints and intent rather than enumerating specifics
- Prefer patterns ("unit tests live in `src/test/`, grouped into subdirs mirroring source structure") over exact paths
- If `SECURITY.md` needs updates, **inform the user** and suggest what to change.
  - **Agentic tools are not allowed to edit `SECURITY.md`**.
  - `SECURITY.md` may need updates if any of the following areas are changed (if none of them are, SECURITY.md should not be read):
    - the extension invoking `zsh` on the host machine
    - the extension resolving `source`/`.` links on the host machine
    - extension settings

### Recording design decisions

When suitable, record design decisions, answer "why questions" etc.:
- Rationale: let future work on the code know why choices were made, possibly what was tried
- Keep short and concise
- Possible ways to record: in-source code comments, in AGENTS.md, or in a dedicated file (discuss with user)

### Work that changes the code / adds features should include a "refactoring opportunities pass"

Meaning: from a broader view, see if the code changes done makes any refactoring, simplification, abstractions or favourable change to the types possible. (Both implementation code and test code.)

- **DO** include such a pass when: given general tasks on refactoring or changing the code
  - in these cases, always perform such a pass before returning to the user
- **DO NOT** include such a pass when: the instruction was very precise about what to do
  - by judgement, the potential for such refactors could still be analyzed and the user explicitly asked about whether to make the edits or not

After introducing parametric types or shared infrastructure, revisit consumer call sites **once** — untapped leverage at call sites is the real ROI indicator. A parametric type only earns its keep when consumers exploit it; a per-consumer composition helper over the orthogonal API primitives is often the missing link (e.g. a `hoverFor<K>(category, id)` wrapping `resolve + renderDoc` on the consumer side — consumer-side composition helpers are fine; they belong in the consumer, not in zsh-core's public API, per the orthogonality principle in the grand plan's Appendix A).

### Research-agent proposals are hypotheses, not decisions

When an agent (Explore, survey subagent, etc.) returns a ranked list of proposed edits, treat each item as a hypothesis to verify, not a decision to execute. Confirm by reading the file before editing. Reject proposals whose only justification is LOC reduction, that drift from the established architecture, or that duplicate work the preceding refactor deliberately left in place (check the grand-plan / handoff notes). For conciseness passes specifically: expect to reject a meaningful fraction of what an agent proposes — that is the mode functioning correctly.

### Keeping the orientation skill fresh

A project skill lives at `$REPO_ROOT/skills/orient/`. Physical, source-of-truth files and dirs lives only under this dir. For tool discovery, a system with symlinks is used. This is elaborated on further in $REPO_ROOT/skills/orient/SKILL.md. **Hence, be careful before managing or changing the skill.**

The skill provides:
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
