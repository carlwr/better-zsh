---
name: audit-md
description: Audit and fix maintainer-audience markdown files against the project's markdown style rules; report per-file findings with quoted lint exit codes.
---

# audit-md

Audit and fix maintainer-audience `.md` files against the project's markdown style rules.

## META: about this skill

> Source of truth lives under `$REPO_ROOT/skills/audit-md/`. For discoverability from different agent tools, symlinks point into this directory from tool-specific roots:
>
> ```
> $REPO_ROOT/.agents/skills/audit-md
> $REPO_ROOT/.claude/skills/audit-md
> $REPO_ROOT/.cursor/rules/audit-md.mdc
> $REPO_ROOT/.opencode/skills/audit-md
> ```
>
> <!-- Enumerating these concrete paths is deliberate: they are not easily inferrable. -->
>
> **When editing:** always write to the physical files under `$REPO_ROOT/skills/audit-md/`, even if the path you see came via a symlink.
>
> **Procedural-only:** this skill must remain purely procedural — no depending on content owned by other docs. Policy and rationale: `STYLE-MD.md`.

## Procedure

1. **Enumerate target files.** Capture the union of:
   - maintainer-audience docs — run `scripts/list-maintainer-docs`
   - all `AGENTS.md` files in the repo
   - all `.md` files under `skills/`

   Every file in the union is in scope: **no file is skipped**, including:
   - fixtures
   - scratch notes
   - the markdown-style file itself

   Auditing the rule source against its own rules is not circular.

2. **Read style rules.** Locate the markdown-style file — any maintainer-audience `.md` whose `read-when:` references markdown editing — typically `STYLE-MD.md`. Read it in full at the start of each pass. From this point on, the audit relies on those rules; this skill does not restate or summarise them.

3. **Rule audit.** For every file from step 1, in order:
   - read the file in full
   - walk the style rules **sequentially** — for each rule in the style file, scan the entire file before moving to the next rule; do not audit holistically
   - violations cluster: after spotting one, re-scan its line and adjacent lines for related issues before moving on
   - apply fixes in place per the style rules

4. **Quality pass.** An audit is not only rule-compliance. Walk the style file's editorial-improvement guidance the same way you walked the rules: for each opportunity type, re-scan each file. Apply per-file wins. These are not rule violations; they are improvements worth landing because files grow organically and want periodic re-shaping. Honour the style file's false-positive guard — when in doubt, leave it.

5. **Run any repo lints over markdown.** Identify which linting scripts (if any) the project provides whose logic may involve the files that were edited. Run and confirm no script prints a warning/error _or_ exits non-0.

6. Check/read the diff of the edits, if any, you have made so far. Reason explicitly (in reasoning steps - not in a message back to the user) about _each of them separately_, regarding if the edit should be kept or not.

7. **Final gate.** Run the project's standard pre-return validation (consult contributor entry-point docs for the canonical command). Must pass cleanly.

8. **Report.** Structure the report so the user can verify completeness:
   - one entry per file from step 1; explicitly call out "no findings" for clean files — do not omit silently
   - per file:
     - violations found
     - fixes applied
     - anything left and why
   - quote the lint exit codes from step 5 — do not assert "passes" without grounding
