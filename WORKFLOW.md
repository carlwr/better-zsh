---
audience: maintainer
read-when: renames, refactors, design decisions, research-agent rules, shell discipline
---

# WORKFLOW.md

## Shell commands and `cd`

- **MUST** use absolute paths in `Bash` invocations.
- **MUST NOT** use bare `cd <dir>`: it permanently changes the shell's working directory for every subsequent command in the session, and a single forgotten `cd` silently invalidates later relative paths.
- For a transient directory change, use a subshell: `(cd <dir> && <cmd>)`.
- Never prepend `cd <repo-root>` to a `git` command — `git` already operates on the working tree, and the compound triggers a permission prompt.
- Broad searches/rewrites should skip symlink paths unless checking links; symlinks can duplicate hits or be replaced by regular files.
- Broad searches should avoid ignored/generated trees first; raw `rg` can waste context on build outputs and tool targets.

## Pull data from elsewhere

For lists, enumerations, or current-state claims in docs, prefer pulling from where data lives (an `rg` query, a script call) over hand-maintaining prose. Drift becomes impossible on the data being pulled. Reach for this lever often.

## Keeping docs fresh

- Worked on from multiple agent tools — contributor docs and skills stay tool-agnostic.
- Prefer constraints and intent over enumerating volatile specifics; prefer patterns over exact filenames when source or scripts already supply the list.
- Operational-notes scope stays local — package-local in package, repo-wide policy in root docs.
- Public repo. Treat as public:
  - checked-in docs
  - skills
  - handoffs
  - workflow comments

  Forbidden:
  - secrets
  - tokens
  - recovery codes
  - session material

  OK when operationally necessary: secret names, high-level auth posture.
- Snapshot/handoff docs declare their staleness posture near the top and stay short. Orientation notes, not specs or runbooks, unless written as one.
- If a detail is cheaply derivable, point there and summarize the invariant rather than copying. Sources:
  - manifests
  - workflows
  - scripts
  - tests

  When a copy is needed, add a drift guard. Renaming or deleting a symbol or file counts as "a copy" — see Renames below.

## Research-agent proposals

Treat explore/survey proposals as hypotheses. Verify by reading the file before editing. Reject suggestions justified only by LOC reduction, architectural drift, or deletion of deliberate duplication. In conciseness passes, rejecting a meaningful fraction is normal.

## Refactoring-opportunities pass

For ordinary code-change tasks, do one broad pass before returning, covering:

- simplification
- refactoring opportunities
- type cleanup

Skip for precisely-scoped tasks unless clearly worth raising.

After introducing shared infrastructure or parametric types, revisit consumer call sites once — ROI often appears there. Consumer-side composition helpers belong in the consumer, not in the shared library's public API.

## Renames, removals, and behavior changes

When **renaming or removing** any of the following — or **changing behavior** in a way callers could notice — run a deliberate full-repo `rg` on the old and new strings, including prose:

- function
- type
- variable
- file
- tool
- setting key
- JSON/schema field

Typecheck and type-only checks are not enough: identifiers also live in:

- markdown, JSDoc, comments
- manifests, JSON Schema
- copy-pasted examples
- test titles, string literals

Missed prose references become silent drift.

## Recording design decisions

Record "why" when it helps future work. Prefer the narrowest discoverable home:

- source comments for local rationale
- subsystem rationale doc for subsystem-level intent
- principles doc for cross-cutting tradeoffs
- contributor conventions doc for workflow and conventions
- a dedicated doc only when the topic genuinely needs one

Close-call local decisions where neither option was strongly preferred: pin as a short source comment ("considered X; picked Y because …"). Reserve for genuinely local calls — wide-context decisions rot as surrounding code moves.

## New feature ideation

Judge ideas on:

- implementation cost
- value
- robustness
- future-proofness
- testability

When shaping a new entity that fits an existing taxonomy or doc category, compare against existing precedents in the codebase. Follow patterns when they model the domain.

## Executable scripts should be extension-less

Files with executable permissions and a shebang:

- YES: `a`, `b`, etc.
- no: `a.sh`, `b.zsh`, etc.

Files WITHOUT executable permissions and a shebang, but that still contain shell-script code (e.g. shell-script source for tests, files intended to be `source`-ed) may still have extensions such as `.sh` or `.zsh`.
