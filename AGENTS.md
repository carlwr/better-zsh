## Overview

A small monorepo with three packages:
- **zsh-core** — standalone package of structured zsh knowledge (not just a support lib for the extension). Expected to have exposed functionality not used by the extension. Exports its API surface in machine-readable forms (e.g. API Extractor, llms.txt) for AI-friendly consumption.
- **@carlwr/zshref-mcp** — a Model Context Protocol server projecting the `zsh-core` reference as agent tools (`zsh_classify`, `zsh_lookup_option`). Pure Node, no `vscode` dep; shipped to npm/JSR and also consumed by the extension. See `DESIGN.md` "MCP as a consumer" for why it is a separate package.
- **vscode-better-zsh** — a VS Code extension; consumer of both `zsh-core` and `@carlwr/zshref-mcp`. Registers the MCP tool set as VS Code Language Model tools via `vscode.lm.registerTool`.

Nothing is released yet — APIs can move freely.

## See also

- **[`DESIGN.md`](./DESIGN.md)** — design intent, principles, rationale ("why").
- **`packages/zsh-core/dist/types/*.d.ts`** — rolled-up public API with JSDoc ("what").
- **Orientation skill** at `skills/orient/` — discovery scripts and reading paths.

## DRY across documentation layers

Four layers carry documentation. Keep them non-redundant; audience dictates content.

- **JSDoc** — end-user facing; what consumers see on hover. Terse. Covers *what* and *how to use*; not *why*. No rationale, no implementation-history, no cross-file narrative, no "this wraps X" internals. If you're writing more than a couple of sentences, ask whether the extra content belongs as a code comment or in DESIGN.md instead. JSDoc on exported zsh-core identifiers is optional — add it only if it adds value beyond the identifier name + type signature.
- **Code comments (non-JSDoc)** — maintainer facing; read by someone editing the file. Good home for *local* rationale, invariants, workarounds, "why not the obvious alternative". Stays out of the API surface.
- **DESIGN.md** — design rationale spanning files; *why* the overall shape. Refers to identifiers by name; avoids signatures, paths, counts, and other drift-prone specifics.
- **AGENTS.md** — contributor conventions; style, testing, tooling. Does not duplicate design rationale from DESIGN.md or API semantics from JSDoc.

When editing one layer, check whether the same point already lives in another. Prefer a cross-reference. If a passage is truly local (applies to one file/function), prefer a code comment over `.md`.

## Short architecture summary

Three orthogonal domains (details in `DESIGN.md`):

- **A — Parsed Documentation** (`src/docs/`): static vendored zsh knowledge; closed taxonomy of 13 `DocCategory` values; each has a doc-record type and a `Documented<K>`-keyed `DocCorpus` map.
- **B — Fact Extraction** (`src/analysis/`): coarse annotations about user code. Facts may carry `Observed<K>` values — never `Documented<K>`.
- **C — Markdown Rendering** (`src/render/`): transforms doc records into markdown; depends on A; orthogonal to B.

Consumers plumb A+B→C procedurally, not via zsh-core internals. "Consumer" here means anything that wraps zsh-core into a feature surface — today that's the VS Code extension and the `@carlwr/zshref-mcp` MCP/LM tool package; any future consumer follows the same contract.

Brand boundary crossing is exactly one public API: `resolve(corpus, cat, raw)` dispatches through a per-category resolver table in `docs/corpus.ts`. `renderDoc(corpus, pieceId)` produces markdown; no combined convenience function. See `DESIGN.md` for the rationale.

### Yodl parsing layout

- `src/docs/yodl/core/` — shared machinery only: macro-node parsing, section/list/entry structure, text rendering/token extraction
- `src/docs/yodl/extractors/` — vendored-corpus extractors that map the shared Yodl representation to zsh doc records

Keep low-level parsing rules in the core layer. Keep corpus-specific interpretation in the extractors layer.

### Analysis layout

`src/analysis/facts.ts` is the public fact-model surface. Shared document/span helpers, line scanning, and context/setopt detection live in sibling analysis modules. Keep the public fact vocabulary centralized there; keep scanner mechanics and context heuristics out of it.

### MCP package layout

`packages/zshref-mcp/`:
- `index.ts` — public package surface: pure tool impls (`classify`, `lookupOption`), tool metadata (`toolDefs`, per-tool `*ToolDef`), and the server factory (`buildServer`).
- `server.ts` — the stdio MCP server binary (package `bin` entry).
- `src/tools/` — one file per tool. Pure functions of `(DocCorpus, input) → output`. No IO, no process env, no `vscode` import. Enforced by the scope-fence test (`src/test/scope.test.ts`).
- `src/tool-defs.ts` — aggregate `toolDefs` list + per-tool metadata (name, description, JSON-Schema input). Adapters walk this list.
- `src/server/build-server.ts` — constructs an MCP SDK `Server` with tools registered; transport-agnostic.

Principle: "MCP is another consumer of zsh-core." No new query APIs in zsh-core to support the MCP. See `DESIGN.md` "MCP as a consumer".

**Before proposing new MCP tools, reshaping the tool surface, or loosening the scope fence, read all three:**

- `packages/zshref-mcp/README.md` — user-facing pitch; the "Out of scope features" list is load-bearing.
- `DESIGN.md` §"MCP as a consumer" — rationale for the static, read-only posture and the scope fence.
- `packages/zshref-mcp/DEVELOPMENT.md` — architectural invariants, adding-a-tool checklist, scope-fence details.

The static, read-only, no-execution posture is a **product feature**, not incidental. Bringing host-dependent capabilities (listing live `setopt` state, `$commands`, process env, filesystem, shell invocation) into this package is antithetical to its pitch — `analyze/` and similar dynamic surfaces stay out. Extending the MCP with **more static knowledge** from the vendored reference is always on the table; extending it with runtime introspection is not.

### Providers

VS Code provider classes wire zsh-core analysis and doc records to language features (hover, completions, semantic tokens). Reusable parsing/rendering logic should live in pure functions; some provider-local dispatch/lookup logic remains in provider modules.

## Code style

- Minimal comments — prefer naming over comments.
- Functional style; pure functions where possible.
- **No classes** except where VS Code API demands (provider interfaces implementing `vscode.*Provider`). Providers are thin shells calling pure functions.
- Avoid mutable state; when unavoidable, handle with care and isolate.
- Extract pure, testable functions — even single-use if they clarify intent or enable testing.
- At call sites, a self-explanatory function name is cheaper cognitive load than inline code.
- Do not hard-code things that should be global constants (e.g. the languageId string, extension name).
- Keep files focused — one concern per module.
- Prefer directory structure richness — aids agentic discoverability (trade off vs. import ceremony).
- When a concept or term is established (e.g. "facts"), use it consistently.
- Prefer expressing intent through code shape (module boundaries, types, signatures) over comments.
- Strengthen documentation primarily through identifier names, structure, and abstraction; secondarily with JSDoc. Avoid separate documentation files.
- See "DRY across documentation layers" above for JSDoc vs. code comment vs. `.md` scope. Default to no comments; escalate only when a reader couldn't reconstruct the *why* from the code.

### Conciseness

Conciseness is a standing repo concern.

- Prefer short identifier names.
- Abstract repeated patterns into shared utilities.
- Consider how clarity changes when chasing conciseness — a conciseness win at clarity's expense may still be worth it; just consider it.
- For conciseness-only changes, compare `wc -w` / `wc -c` before and after; at minimum verify it didn't worsen. `wc -l` can hide or underestimate wins, but a reduced line count is usually signal.

### Types

- **Branded types** for domain strings (option names, operators, etc.) — nominal-ish typing with zero runtime cost via phantom `__brand` field.
- **Smart constructors** (`mkObserved`, `mkDocumented`, `mkOptFlag`, …) are the only trusted cast points for brands.
- Prefer **named type aliases** for literal unions: `type CondArity = "unary" | "binary"` — not inline.
- Short field names: `desc` not `description`, `op` not `operator`.
- If a value has a reason to be passed around, give it its own type.
- `enum` is not used — literal unions + type aliases preferred.
- **Discriminated unions for state spaces** — prefer a single tagged union over scattered booleans/flags.
- **Deferred computation over mutable tracking** — prefer `memoized`/`cached` (from `@carlwr/typescript-extra`) over boolean flags.
- **Do not add inner `readonly` by reflex** — add it when the type itself must be non-mutable across call boundaries. If immutability is already enforced by the containing signature and the value is constructed once, extra inner `readonly` is redundant noise.
- Module-level `Set`/`Map` constants that must not be mutated carry `ReadonlySet<T>`/`ReadonlyMap<K,V>` annotations.

### Casts (`as`) — principled vs smell

Every `as` is a trust assertion. Classify before writing one.

**Principled — keep, co-located with the invariant:**
- **Brand mint** inside smart constructors. One per brand family.
- **Central dispatcher** inside a parametric function whose job *is* to bridge a type-level correlation TS can't propagate (`renderDoc`, `resolve`, resolvers, `buildCategoryMap`, `loadCategoryDocs`). The function's signature is the invariant.
- **Correlated-union constructor** (`mkPieceId`). Concentrates the one unavoidable cast per discriminated-union shape.
- **Literal-union narrowing** — e.g. `d.name as Documented<"precmd">` inside the `docId` entry for `precmd`. Limit to the single table entry needing it.
- **Brand → string peeling** for display or string-native ops. Trivial; not a crossing.

**Smell — reject, restructure:**
- Cross-brand cast outside the sanctioned crossing. Route the probe through `resolve(corpus, cat, raw)`.
- Ad-hoc assembly of a discriminated-union member at a call site — use `mkPieceId`.
- Scaffolding cast masking a design issue (`as unknown as T` in business logic; cast to satisfy a wrong-keyed Map; cast to avoid threading a corpus argument).

**Rules of thumb:**
- A new cast is a claim that needs a comment. If you can't articulate the invariant, it's a smell.
- Centralize before tolerating — same cast at ≥2 call sites → extract a typed constructor.
- The sanctioned brand crossing is `resolve()`. Everything else is either mint (smart constructor) or symptom.

### Surface invariants in code

- Scanning-loop state variables: a brief declaration comment (`// expectCmd: true when next token is in command position`).
- "Obviously correct islands" — pure, strongly-typed, narrow-scope helpers that are correct by construction — are the preferred unit of non-trivial logic.
- Prefer structural enforcement over advisory comments (branded types, `ReadonlySet`, smart constructors).
- Evaluate zsh-core's public API surface from a **general-consumer perspective**, not just from what the extension uses.

### Never enumerate `DocCategory` in prose or strings

Drift in hand-written category enumerations has bitten us. Rules:

- **JSDoc, code comments, `.md`**: 1–3 categories as examples are fine; never purport to list the full set.
- **Runtime strings** (tool descriptions, log/UI copy): interpolate from the zsh-core category exports (branded strings, human labels, ordering). Never hand-type.
- **Category-indexed tables**: use `Record<DocCategory, T>` or `satisfies { [K in DocCategory]: T }` so the compiler enforces completeness. Such tables belong in zsh-core; consumers import.

Rationale in `DESIGN.md`.

### Hover docs

- Prefer hover docs that explain actual zsh usage, not raw upstream doc notation.
- For option hovers: show executable `zsh` forms first; category at the bottom; prioritize default in plain zsh over other emulations.
- When adjusting Yodl parsing for rendered markdown, preserve visible prose/reference text unless there's a strong reason not to; use the reference dump script to inspect regressions.

### Other tools

- `@carlwr/typescript-extra`
  - A dev dep at the **workspace root** (`/package.json`). Small package of convenience utilities including a `NonEmpty` type.
  - Available to any package in the workspace if anything brings value.
  - Do not remove the workspace-root devDependency even if unused at some point. This rule is workspace-scoped: individual packages may freely add or drop it based on actual use. (Currently used as a runtime dep by `zsh-core`.)
  - Overview:
    ```sh
    cat $(gfind . -wholename '*/typescript-extra/dist/index.d.ts' | head -n1)
    # approx. 150 lines
    ```

## Testing

- **Reproducibility matters: any randomness uses a fixed, checked-in seed.**
- Property-based tests encouraged where appropriate (e.g. pure parsers).

### ONLY if you edited code: _validation before returning to user_

- Run: `pnpm format && pnpm check && pnpm test && pnpm test:smoke && pnpm vsix && pnpm test:integration &>/dev/null`
- `pnpm format` applies safe auto-fixes — run first to avoid a wasted check/fix/re-check cycle.
- If any step fails, fix and re-run — don't return with known failures.
- Build scripts with "INTERACTIVE" in the name are **excluded** — only run when explicitly requested.

**If you only answered questions or wrote docs/non-code files, _do not run tests_** unless explicitly asked.

### Rules

- "All tests" does **not** include "INTERACTIVE" scripts.
- **NEVER run "INTERACTIVE" scripts** unless the user explicitly asks — on macOS they bring a full VS Code app into focus momentarily and cannot be safely run while the user might be working.
- `test:integration` is long-running and noisy — run with `&>/dev/null`, last, when other tests are iterated. See "Script naming axes" below for what it actually does.
- Non-INTERACTIVE scripts must not call INTERACTIVE ones.
- Unit tests are the baseline; integration tests a bonus layer. Integration may overlap with unit.
- Pure logic should always have unit tests independent of external deps (zsh, VS Code APIs).
- Integration tests depending on external tools must skip gracefully when absent.
- The Electron test harness runs ALL tests (unit + integration) — unit tests re-running there are meta-tests under a richer harness.
- Functions that are "obviously correct" don't need tests.

### Script naming axes: `:integration` and `INTERACTIVE`

Two orthogonal signals in test-script names. A script can carry both, one, or neither.

- **`*:integration`** — the script is long-running (tens of seconds to several minutes). Include in an extended-validation final step; run last; expect `&>/dev/null`-worthy output volume.
- **`testINTERACTIVE:*`** — the script takes over the user's desktop (on macOS, launches VS Code and steals focus). Agents must **never** run it without explicit user consent. CI runs INTERACTIVE scripts under `xvfb` where focus-stealing is moot.

The axes are independent: `:integration` is about time/noise, `INTERACTIVE` is about desktop side effects. The VS Code electron tests happen to carry both properties — they use the `testINTERACTIVE:*` prefix (the stronger constraint dominates the name) and are not additionally tagged `:integration`. A purely noisy, purely headless long-running check uses `*:integration` alone.

**Per-package `test:integration`**: each package picks the implementation best suited to what it tests. The VS Code extension's `test:integration` runs `act` (electron under xvfb in a container). The MCP's `test:integration` runs a native-host aggregator of its CI checks (`check`, `test`, `test:smoke`, `test:install`, `jsr:check`) — no container needed. Same name, same *meaning* (long-running CI-parity check), different *mechanism*.

The MCP additionally exposes `test:integration:act` (runs the `mcp` CI job through act, for when Docker is available and you want true CI-parity before a release). The extension does not need a `:act` suffix — its `test:integration` is already act-based, because there is no cheaper native variant worth defaulting to.

**Workspace `test:integration`** delegates via `pnpm -r --if-present`, so developers run one command regardless of which packages have scripts. Packages without integration tests are skipped silently.

### Test conciseness

**Test conciseness is a standing concern, not optional polish.**

**Hard rule:** if you touch tests, actively try to make them smaller unless that would hide intent.

- Every test should carry its weight.
- Any test edit includes a conciseness pass: remove non-paying repetition; collapse repeated arrange/act/assert into tables/helpers; shorten file-local identifiers where still readable.
- Prefer case data that encodes the assertion directly. Keep `desc`/label only when carrying non-obvious intent.
- Derive test titles from the sample or a small discriminator. Avoid verbose prose prefixes.
- Fixtures: only as realistic as the assertion needs — use `""` or a minimal distinct value over descriptive filler.
- Shared fixture shapes → shared helper, not repeated local stubs.
- Repeated arrange/act/assert → Vitest `test.each` / `describe.each`. Not universal — heavy per-case setup or standalone-reads-better scenarios stay without `.each`.

### Container-only integration tests

- `testINTERACTIVE:electron-zsh-path` (zsh-path-matrix) runs in CI/Docker only. On macOS, VS Code's shell env resolution replaces test-injected PATH before the extension host activates, defeating env isolation. With pure logic surfaced in unit-testable functions, container tests are a bonus layer.

### Testing tools

- Vitest for unit; Mocha for Electron.
- Property tests: `fast-check` via `@fast-check/vitest`.
  - fast-check note: `fc.char()` and `fc.stringOf()` may not be available in the version used — fall back to `fc.mapToConstant(...)` + `fc.array(...)` for character-level arbitraries.
- `@carlwr/fastcheck-utils` — convenience generators with better shrinking.
  - Do not remove as a dev dep even if unused at some point.
  - Overview:
    ```sh
    cat $(gfind . -wholename '*/fastcheck-utils/dist/index.d.ts' | head -n1)
    # approx. 100 lines
    ```

## Packaging

### npm + JSR dual publish

`zsh-core` and `@carlwr/zshref-mcp` publish to both npm (build artifacts) and JSR (`.ts` sources). Consequences:

- **No runtime `package.json` reads.** JSR consumers receive `.ts` sources only — `package.json` does not exist for them. Library code must never read it (`readFileSync("package.json")` or equivalent). Dev/CI-only code (build scripts, tests) may read it, but prefer importing from `pkg-info.ts` for values already captured there — single source of truth, no reparse-site drift.
- **Package identity in a `.ts` source of truth.** Each dual-published package has a `src/pkg-info.ts` (names, version, URLs, license, bin). Runtime *and* build code imports from there. `src/test/pkg-info.test.ts` asserts the constants match `package.json` + `deno.json`; adding a new identity string means adding a constant, updating both manifests, and extending the test.
- **Shared-surface `exports` must stay in sync.** Subpaths offered to both npm and JSR consumers (e.g. `.`, `./render` for zsh-core; `.`, `./server` for MCP) must appear in *both* manifests' `exports`. `pkg-info.test.ts` asserts a canonical shared list matches both. Generated artifacts and workspace-internal entry points (`./data/*`, `./schema/*`, `./internal`, …) are npm-only by nature — keep out of `deno.json.exports`.

### vsce

- All `vsce` commands must use `--no-dependencies` — the extension is bundled by tsup (no runtime `node_modules`), and `vsce` internally runs `npm list` which is incompatible with pnpm's symlinked layout.

### `BZ_SKIP_UPSTREAM` — pre-hook gate for aggregators

Extension and MCP `pre*` hooks (`prebuild`, `pretypecheck`, `pretest`, …) build upstream workspace packages by default, so standalone `pnpm typecheck` / `pnpm test` work without ceremony. Aggregator scripts that chain several build-side commands (`vsix`, `test:smoke`, extension `*:publish*`, MCP `test:integration`) would otherwise re-trigger those pre-hooks 3–4× per run. They instead do one upfront `pnpm build` then `export BZ_SKIP_UPSTREAM=1`; subsequent pre-hooks in the chain see the variable and short-circuit. Default (unset) behavior is unchanged.

## Contributor guidance

### Agent tool agnostic

Worked on from multiple agent tools (Cursor, Claude CLI, Codex CLI, etc.). Guidance here, in the orientation skill, and in any contributor docs must be tool-agnostic.

### Keeping docs fresh

- Avoid duplicating information that lives in source (scripts, file names, directory layout) — it becomes stale.
- Express constraints and intent rather than enumerating specifics.
- Prefer patterns ("unit tests live in `src/test/`, subdirs mirroring source") over exact paths.
- If `SECURITY.md` needs updates, **inform the user** and suggest what. **Agents may not edit `SECURITY.md`.** It may need updates if any of these change:
  - the extension invoking `zsh` on the host machine
  - the extension resolving `source`/`.` links on the host machine
  - extension settings

### Recording design decisions

When suitable, record design decisions and "why" answers:
- Let future work know why choices were made.
- Keep short and concise.
- Ways to record: in-source comments, `DESIGN.md`, `AGENTS.md`, or a new dedicated file (discuss with user).
- `DESIGN.md` is the primary home for design intent and rationale spanning multiple files.

### Work that changes code / adds features → "refactoring opportunities pass"

From a broader view, see if the code changes make any refactoring, simplification, abstractions or favourable type changes possible. (Both implementation code and tests.)

- **DO** include this pass for general refactoring / change tasks — always before returning.
- **DO NOT** include it for precisely-instructed tasks — but by judgement, you may still analyze and ask whether to edit.

After introducing parametric types or shared infrastructure, revisit consumer call sites **once** — untapped leverage at call sites is the real ROI indicator. Consumer-side composition helpers over the orthogonal API primitives are often the missing link (e.g. a `hoverFor<K>(category, raw)` wrapping `resolve + renderDoc` on the consumer side). Such helpers belong in the consumer, not in zsh-core's public API.

### Research-agent proposals are hypotheses, not decisions

When an agent (Explore, survey subagent, etc.) returns proposed edits, treat each as a hypothesis to verify, not a decision to execute. Confirm by reading the file before editing. Reject proposals justified only by LOC reduction, that drift from the established architecture, or that duplicate work deliberately left in place. For conciseness passes: expect to reject a meaningful fraction — that's the mode working correctly.

### Keeping the orientation skill fresh

A project skill at `$REPO_ROOT/skills/orient/`. Physical source-of-truth files live only under this dir; symlinks are used for tool discovery. See `$REPO_ROOT/skills/orient/SKILL.md`. **Be careful before changing the skill.**

The skill provides:
- Discovery scripts producing always-current output
- Reading paths by task type (which **directories**, not which files)
- Known gotchas

**HARD RULES for the orientation skill:**
- **NEVER add filenames** (directories only; exception: `package.json`).
- **NEVER add function/class/variable names** (exception: gotchas about that specific name).
- **NEVER add line/file counts or other volatile metrics.**
- **DO add new directory paths** when a new dir becomes a common entry point.
- **DO add new gotchas** that span multiple files or aren't obvious from reading code.
- **DO update discovery scripts** when directory structure breaks them.

Structural changes:
- New public API → no skill update; the d.ts rollup reflects it after build.
- New source directory that's a common entry point → add a reading-path entry.
- Design rationale → `DESIGN.md` or an in-source comment, **not** the skill.

### New features ideation

Judge along:
- Implementation complexity ("how low is the fruit hanging")
- Added value
- Robustness, future-proofness, testability

### Git; commits

If making commits/asked to make commits:
- pre-release, commits do not have to be atomic or tidy
- commit messages:
  - subject line max 55 chars hard limit
  - in general: subject line only; avoid adding a commit message body
    - since: hard to keep fresh, easily rots, esp. if the commit is later squashed etc.

## References & sources

### zsh

- `zsh` available on the system (macOS-shipped; zsh 5.9)
- Verify actual zsh behaviour by running test commands. For tricky cases, read the manual/man pages then verify with zsh commands.
- https://github.com/zsh-users/zsh (mirror)
- https://github.com/zsh-users/zsh/blob/master/Doc — documentation source (`.yo` / Yodl)

### Yodl markup

- Repo: https://gitlab.com/fbb-git/yodl
- Homepage: https://fbb-git.gitlab.io/yodl/
- Userguide: https://fbb-git.gitlab.io/yodl/yodl-doc/yodl.html
- The zsh repo defines custom Yodl macros.
- Yodl converts to html, latex, man, txt.

### zsh man page

- Complete zsh 5.9 manual on the system.
- `man zshall`
  - Headings only: `man zshall | col -b | grep -E '^\S'` (~172 lines)
  - Headings incl 1st sublevel: `man zshall | col -b | grep -E '^ {0,3}\S'` (~305 lines)
  - `info zsh` also available, same material.

Manuals:
```bash
# full manual:
man zshall

# subsections (covered by zshall):
man zshcompctl zshcontrib zshmodules zshroadmap zshzle zshcompsys zshexpn
man zshoptions zshtcpsys zshbuiltins zshcompwid zshmisc zshparam zshzftpsys
```

Size of full man page:
```bash
man zshall|col -b|wc -l       # 30378
man zshall|col -b|wc -w       # 204773
man zshall|col -b|tokenCount  # 314083
```
