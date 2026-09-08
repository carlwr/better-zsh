---
audience: maintainer
read-when: editing markdown in maintainer-audience docs
---

# STYLE-MD.md

Rules for editing maintainer-audience `.md` files — all repo `.md` except user-facing docs (`README.md`, `DEVELOPMENT.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md` at workspace root and at to-be-extracted package roots).

## Frontmatter

Conditional-read topic guides (those listed by `scripts/list-maintainer-docs`) start with:

```yaml
---
audience: maintainer
read-when: <one-line phrase>
---
```

- `read-when:` is a single short phrase; multi-line prose is malformed.
- `AGENTS.md` files and `.md` under `skills/` do not carry this tag.
- Additional top-level keys: only when an external consumer requires them (e.g. skill metadata fields). Re-evaluate before adding.

## Pre-edit ritual

Every edit, however small, follows these steps:

- **Before editing** — re-read this file in full. It is short by design; reading it is cheap.
- **While editing** — each new sentence asks "could this be bullets?". >=3 distinct items -> "yes".
- If the file is <600 lines, **the full file must be put into context**, so repetitions can be avoided.
- **Before returning** — **audit explicitly** against the rules below.

The before-returning audit is mandatory.

## DRY across documentation layers

Each rule has one home. When extending, search first; add a new heading rather than restating elsewhere.

Keep docs non-redundant; audience decides placement.

**Repo-wide rules have one home; subpackage docs MUST NOT duplicate them.** `STYLE-MD.md`, `WORKFLOW.md`, `TESTING.md`, `PACKAGING.md` own style, workflow, testing, and packaging rules outright. A subpackage `AGENTS.md` carries only package-specific concerns. Never add a "Markdown style for this package's docs" section, an "Editing notes" sub-bullet that restates root style, a one-line conciseness reminder, or any other restatement of a rule whose home is elsewhere — even an innocent-looking single sentence is a DRY violation. Restated rules drift, ambiguate the canonical source, and grow without bound.

The proximity-restate pattern (`Principle (root X, restated for proximity): …`) is a narrow exception for a repo-wide *principle* with sharp local relevance — never for style/workflow rules, which are uniform across the repo.

Per-doc-layer detail:

- **API surface docs** (e.g. JSDoc) — end-user facing. Terse. What/how, not why; no history or cross-file narrative.
- **Code comments** — maintainer facing:
  - local rationale
  - invariants
  - workarounds
  - "why not the obvious alternative"
  - kept local: no specific other-file paths or sibling-identifier names
- **File-header comments** — first few lines of any source/config file. Keep locally essential. Do NOT:
  - claim global state about other files or packages
  - restate what the file already expresses:
    - filename
    - location
    - structure
  - restate design decisions whose home is elsewhere

  When implementing from a plan, treat plan prose as intent — re-derive header text from the destination file's own purpose.
- **Cross-cutting principles doc** — read before designing a feature or doc category; edit when a tradeoff genuinely shifts.
- **Subsystem rationale doc** — subsystem-level "why":
  - name load-bearing types and APIs
  - prefer concrete examples
  - avoid volatile inventories; prefer:
    - directory references
    - "see API docs"
    - one representative example
  - cross-link to the principles doc instead of restating
- **Operational notes** (e.g. `DEVELOPMENT.md`) — repo- or package-local:
  - package-specific invariants
  - build/test/release mechanics
  - pointers to truth

  Don't repeat repo-wide policy, principles, or subsystem rationale.
- **Contributor conventions** (e.g. `AGENTS.md`):
  - style
  - testing
  - packaging
  - workflow
- **Skill prose** (`skills/<name>/SKILL.md`) — procedural directions for an agent:
  - HOW, not WHAT
  - reference other docs by purpose ("the markdown-style file") or pointer ("see `STYLE-MD.md`")
  - never restate, summarise, or assume content owned elsewhere:
    - script names
    - lint commands
    - rule wordings
    - build chains
  - non-procedural facts belong in the doc owning that domain, not the skill

## Conciseness

- Steering metric: `wc -w` (or `wc -c`); never `wc -l`. Line count is a structural shape signal (too big -> split), not a content metric.
- Counter the line-count-as-conciseness bias actively in any agent-facing prose.
- For conciseness-only changes: at minimum, do not grow `wc -w`.
- Prose:
  - "How can I make this phrase more terse and concise?"
  - "How can I express the same information with fewer words?"
  - "State the point - do not _narrate_ the point"
  - beware that more concise phrasings sometimes can lose some precision - whether that is problematic or not is context-dependent and requires judgement

## Quality pass

An audit isn't only rule-compliance. Every pass also looks for editorial improvements — wins worth landing because files grow organically.

- _conciseness wins_ — a 10-word phrasing reducible to 7 expressing the same meaning is an improvement even when neither form breaks a rule.
- _structural wins_ — re-organize headings, levels, where info is sorted etc. to maximize clarity

## Markdown style rules

Default forms:

- bullets
- fenced code blocks
- tables

Prose is the fallback for:

- continuous reasoning
- contrast pairs
- `;`-joined cohesive thoughts that read as one flow

### The bullet rule (most-violated)

A passage naming 3-4 distinct items is OFTEN a bullet list — if items are short, it may be preferred to leave them as prose.
A passage naming >=5 distinct items is ALWAYS a bullet list.

If >=5 distinct items, no exceptions for:

- per-item brevity
- per-item rationale moved to a pointer
- items being short names or labels
- the surrounding sentence being a pointer
- nesting context

Per-item conciseness comes from shortening each bullet, never from joining bullets into prose.

Forms that do NOT necessarily satisfy "list" (may still be better served as a list but is not automatically a list — up to judgement):

- colon- or semicolon-chains when used as a grammatical structure (not automatically a list - but may be better served as a list; that is up to judgement)
- `(a)/(b)/(c)` parentheticals
- colon-introduced inline series ("the categories: A, B, C.")
- "X, Y, and Z" series
- parenthesised item enumerations (`(X, Y, Z)`)

Two items: bullets when scanning aids comparison; inline when they read as one phrase.

### Nested bullets

- first-class
- sub-bullets may themselves nest
- no depth cap

Packed -> unpacked example:

```
- **Item** (`/path`) — what it is. Note; another note.
```

```
- **Item**
  - `/path`
  - what it is
  - _notes:_ note; another note
```

### Other rules

- one thought per bullet or sentence
- bullets do not restate adjacent code/structure
- pointers replace per-item rationale, not the bullet structure
- fenced code blocks carry command sequences; never paraphrase them in prose
- comments inside a fenced code block label variants
- a list of files or links is a list — path alone by default; rationale only when it changes the reader's next action and isn't at the target
- cross-refs default to file-level (`see DESIGN.md`); section-quoted (`§"..."`) reserved for large files where the section adds signal — drifts on heading rename
- numbered ordinals only when semantically load-bearing
- concrete enumerations (files, paths) OK when not inferrable — mark with inline HTML comment
- incomplete sentences in bullets fine
- structured form is target state even at modestly higher word count; phrase-level edits (tighten, reword) stay within existing word budget
- no markdown links to repo files: `file.md`, not `[text](file.md)`

### Hierarchy devices

- italic prefix labels (`_notes:_`, `_Subject_:`, `_term_:`) rank info within a structure
- separate lines: principle and implication don't share a sentence
- arrows (`A -> B -> C`) for composition flows

### Out-of-place callouts (anti-pattern)

Is: **content placed outside its sectional home**, typically at the top, to increase its prominence/loudness.

Why this is the anti-pattern:

- DRY violation (top + detail section both restate the rule), or section-incompleteness (the proper section lacks the rule because it lives only in the top callout)
- top inflation: each successive author finds something else "important enough"
- wrong-place edits: an agent reads the first 50 lines, finds "Important: ...", and adds new related content there instead of in the section that owns the topic

Rules:

- Don't add a callout outside the section that owns its topic.
- When you encounter one: move the substance into the owning section; let ordering and section names carry the weight.

## Code↔doc coupling

After substantive code changes, audit relevant `.md` for stale or restructure-worthy mentions of the changed code. Phrasing what code *truly is* requires implementer context — a doc-only pass cannot make these calls.
