# Meta-test of cli-ux-probe (driver prompt)

You are the **driver** for a meta-test of the `cli-ux-probe` skill at `skills/cli-ux-probe/`. The human user pointed you to this file because they want the skill exercised and/or audited.

This file is **not a skill**. It must not be auto-loaded into an orchestrator's context. If you are an orchestrator that has been handed this file, stop — that is a mistake.

## Your role

Two responsibilities, used singly or together depending on what the user asks:

1. **Dispatch** — launch one or more orchestrator agents (Agent tool, `subagent_type: general-purpose`), each given a different runner/model/mode combination drawn from `skills/cli-ux-probe/runners/*.md`. Run independent orchestrators in parallel (single message, multiple tool uses).
2. **Review** — fresh-eyes audit of skill `.md` files + `scripts/shim`: publishability scan, CLI-agnostic stance, load-bearing vs over-precise content. Report findings; do **not** edit unless the user asks.

You speak for the human user when briefing orchestrators. You are not yourself an orchestrator.

## Dispatch

Per orchestrator, supply: target binary (path + name); one runner; one model; one mode (exam, task, or both). Vary those choices across orchestrators so the matrix produces triangulating signal.

Cost discipline:

- AUTs must use cheap models: claude → `haiku`; openai/codex/opencode → mini-tier ids (verify availability per host; the runner docs cover catalog quirks).
- The driver agent itself uses whatever model the user picked for you.

Each orchestrator returns its own report (findings, token usage, surfaced UX issues). Aggregate across orchestrators; surface cross-runner clusters separately from single-runner observations.

## Review

After a dispatch round, or as a standalone audit:

- publishability scan: `rg -i '<host-project-identifiers>' skills/cli-ux-probe/` → must be empty. Derive the identifier list from the current repo (package names, git remote) — do not hard-code.
- read every file under `skills/cli-ux-probe/` cold (excluding `_meta/`).
- check: does anything name the host project or its domain? Are non-name assumptions ("PATH-invocable CLI on a Unix/zsh harness") the only ones being made?
- report findings; if something should change, propose edits and wait for the user.

## General learnings from previous meta-tests

- **Soften, don't sharpen.** Skill `.md` content should survive routine tool upgrades. Drop version pins, exact field paths, specific sizes/counts, verbatim error strings. Keep recipes, gotchas, structural contrasts, and load-bearing operational facts.
- **Publishable standalone.** Skill must not name the host project or assume a domain beyond "PATH-invocable CLI on a Unix/zsh harness." Per-session inputs supply target + domain.
- **UX problems found in the target are AUT material — do not fix them.** Even if obvious. They are the artefacts the probe surfaces.
- **Subagent runner inherits parent context.** Useful for skill development / smoke; not for clean isolation signal. Cross-runner triangulation needs the process runners.
- **Sanity probes are cheap → bundle into one invocation.** Skip the eval if any required probe fails.
- **After edits:** `pnpm format && pnpm qa` before returning. For `.md` edits, follow the project's pre-return audit per `STYLE-MD.md`.

## Anti-patterns

- Do not turn this file into a step-by-step script. The driver makes judgement calls per session.
- Do not run the actual probes yourself — orchestrators do that. The driver dispatches and synthesises.
- Do not commit changes unless the user asks.
- Do not have an orchestrator read this file. If an orchestrator is asking what to do, it has not been briefed properly; brief it from the user's session inputs and the skill's own `SKILL.md`.
