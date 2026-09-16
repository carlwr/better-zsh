---
audience: maintainer
read-when: editing markdown in maintainer-audience docs
---

# STYLE-MD.md

Rules for maintainer-audience `.md` — all repo `.md` except user-facing docs (`README.md`, `DEVELOPMENT.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md` at the workspace root and at package roots). §"Content" governs code comments, JSDoc and config comments alike.

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

## Edit ritual

Every edit, however small:

- **Before** — re-read this file in full; it is short by design. Put the target file in full into context when it is under 600 lines, so repetitions are seen.
- **While** — each new sentence asks "could this be bullets?"; >=3 distinct items -> yes.
- **Before returning** — audit explicitly against the rules below. Mandatory. Compliance is the floor; files grow organically, so every audit also lands editorial wins:
  - _conciseness_ — a 10-word phrasing reducible to 7 with the same meaning
  - _structure_ — headings, levels, where information sits

## Content: code is the ground truth

Prose about code is a last resort. Code is cheap to read, exact and never stale; prose restating it pays three times — words now, rot later, a second home to keep in sync.

- Narrate only what code cannot say: when to run it, why it is shaped so, what it must not become.
- Put that beside the code as a comment before anywhere else — the narrowest discoverable home (`WORKFLOW.md` §"Recording design decisions").
- Where prose must refer to code, point: "targets: see the `Makefile`" — never a doc listing every `make <target>` with a gloss, which restates the file and rots on each rename.

The subsections apply this: one home per fact, nothing that rots, fewer words.

### DRY across documentation layers

Each rule has one home; audience decides which. When extending, search first; add a heading rather than restate elsewhere.

**Repo-wide rules are never restated in subpackage docs.** `STYLE-MD.md`, `WORKFLOW.md`, `TESTING.md`, `PACKAGING.md` own style, workflow, testing and packaging outright; a subpackage `AGENTS.md` carries package-specific concerns only. No "Markdown style for this package" section, no "Editing notes" bullet restating root style, no one-line conciseness reminder — an innocent single sentence is already a violation. Restated rules drift, blur the canonical source and grow without bound.

Narrow exception — the proximity restate (`Principle (root X, restated for proximity): …`): a repo-wide *principle* with sharp local relevance; never a style or workflow rule, which is uniform across the repo.

Per layer:

- **API surface docs** (e.g. JSDoc) — end-user facing. Terse. What/how, not why; no history or cross-file narrative.
- **Code comments** — maintainer facing:
  - local rationale
  - invariants
  - workarounds
  - "why not the obvious alternative"
  - kept local: no specific other-file paths or sibling-identifier names
- **File-header comments** — the first lines of a source/config file. Locally essential only. Never:
  - claim global state about other files or packages
  - restate what the file already expresses:
    - filename
    - location
    - structure
  - restate design decisions whose home is elsewhere

  Implementing from a plan: plan prose is intent — re-derive header text from the destination file's own purpose.
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

  Not repo-wide policy, principles or subsystem rationale.
- **Contributor conventions** (e.g. `AGENTS.md`):
  - style
  - testing
  - packaging
  - workflow
- **Skill prose** (`skills/<name>/SKILL.md`) — procedural directions for an agent:
  - HOW, not WHAT
  - reference other docs by purpose ("the markdown-style file") or pointer ("see `STYLE-MD.md`")
  - never restate, summarise or assume content owned elsewhere:
    - script names
    - lint commands
    - rule wordings
    - build chains
  - non-procedural facts belong in the doc owning that domain, not the skill

### Stale-proofing

What rots is the specific: paths, identifiers, version pins, counts, UI click-paths, claims about another file's current state.

- Prefer the least specific wording that still carries the claim — constraints and intent over enumerated specifics, patterns over exact filenames.
- Where the data already lives, pull it (an `rg` query, a script call) instead of hand-maintaining prose; what is pulled cannot drift. Reach for this lever often.
- Cheaply derivable detail: point at the source and state the invariant instead of copying. Sources:
  - manifests
  - build files
  - workflows
  - scripts
  - tests

  When a copy is unavoidable, add a drift guard.
- Stale text is a signal about the claim itself — prefer deleting or generalizing it over correcting in place.
- After substantive code changes, audit the relevant `.md` for stale or restructure-worthy mentions. Phrasing what code *truly is* needs implementer context — a doc-only pass cannot make these calls.

### Conciseness

- Steering metric: `wc -w` (or `wc -c`); never `wc -l`. Line count is a structural shape signal (too big -> split), not a content metric.
- Counter the line-count-as-conciseness bias actively in any agent-facing prose.
- Conciseness-only changes never grow `wc -w` (unless from punctuation characters, like -/* for bullets).
- Per phrase:
  - "How can I make this phrase more terse and concise?"
  - "How can I express the same information with fewer words?"
  - "State the point - do not _narrate_ the point"
  - concision can cost precision; whether that matters is a per-case judgement

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
