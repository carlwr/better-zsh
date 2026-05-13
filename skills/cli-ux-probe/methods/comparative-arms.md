# Comparative arms

Cross-cut for comparing the target CLI against an established alternative reference and a knowledge-only baseline on identical tasks. Orthogonal to the modes in SKILL.md — arms specify the tool surface; modes specify what the AUT is being probed for.

## When to use

- target CLI exists alongside an established alternative (a dedicated docs CLI vs `man`; a project CLI vs upstream; a new tool vs the built-in)
- need to separate "tool helped" from "model already knew"
- want comparative token-efficiency or completion-rate numbers

## The arms

Same task, three configurations:

- **arm-1 knowledge-only** — no tools; AUT answers from prior model knowledge
- **arm-2 target** — only the target CLI is on PATH
- **arm-3 alternative** — only the alternative reference is on PATH

Per-arm scratch setup:

- arm-1 — refuse stubs for both target and alternative; no shell-exec capability (see Pure-prediction below)
- arm-2 — target's shim + alternative's refuse stub
- arm-3 — alternative's shim + target's refuse stub

A **refuse stub** is a tiny script printing `ERROR: '<name>' is not available in this experimental arm.` to stderr and exiting 127. It is not a shim — no invocation is logged. SKILL.md's first-record schema validation does not apply.

`zsh` refuse-stub caveat: do **not** put a `zsh` refuse stub on PATH when the shim's shebang is `#!/usr/bin/env zsh` — `env` resolves `zsh` via PATH and would hit the stub. If the goal is "AUT cannot execute via `zsh`", use a different shebang for the shim or rely on post-hoc cheat detection.

## Pure-prediction discipline (arm-1)

Arm-1 must have **no shell-execution tool**. Failure mode: an AUT given a generic `bash` tool will execute the task to compute the answer rather than predict from priors. Collapses "knowledge" into "knowledge + execution" and erases the comparative signal.

Per-runner enforcement:

- direct API runners — register no tools (e.g. `aut-deepseek --no-tools`)
- claude-process — `--tools ""`
- codex / opencode — no equivalent flag; forbid in prompt and detect post-hoc

Belt-and-braces cheat detection in the grader:

- inspect transcript / event-stream for `tool_calls` containing substrings of the task expression
- flag matching runs separately (e.g. `PASS_CHEAT`); do not count toward arm-1 success

For synthesis tasks (write a one-liner), testing-by-execution is part of the task workflow — not cheating. Pure-prediction applies to prediction-style tasks (e.g. "what does this print?") only.

## The knowledge-ceiling problem

Current strong-prior LLMs solve most curated tasks from memory. Arm-1 pass rate of 90-100% means the 3-arm comparison has no correctness signal.

Calibrate before the full matrix:

- 1-2 reps per candidate task on arm-1; one workhorse model; low-effort reasoning
- 10-15 candidate tasks across difficulty
- tasks where arm-1 always passes are "ceiling-hit"

If most tasks ceiling-hit, three options:

1. **add genuinely obscure tasks** — risks artificiality; hard to find
2. **use weaker models** — easier; smaller / older / non-coding-focused models have weaker priors
3. **pivot to token-efficiency** — even when knowledge passes, tool arms still reveal per-arm cost

Option 3 is the practical default — run the full matrix, report bucket-K with a token-cost panel, and surface use_rate as a separate signal.

## Token-efficiency comparison

`cache_miss` is the cost metric. Cache hits are near-free across providers; total prompt tokens overstate real cost when the system prompt is heavy and reused.

Subtract the same-model knowledge baseline before comparing arms:

- `Δ_target = arm-target cache_miss − arm-1 cache_miss`
- `Δ_alt    = arm-alt    cache_miss − arm-1 cache_miss`
- ratio = `Δ_alt / Δ_target` — the headline

Why subtract: agent-CLI runners (claude / codex / opencode) emit a heavy system prompt that lands as cache_create-then-read per run; that overhead is per-model not per-arm. Without subtraction, baseline dominates and the inter-arm difference looks small.

Two-axis report:

- median Δ across runs per (model, arm) — the headline ratio
- per-task Δ when the headline ratio varies a lot — usually one or two tasks dominate

## Tool use_rate

Distinct from "did the tool help": did the AUT actually use it?

- **use_rate** — % of arm-X runs with ≥1 tool invocation (read from the trace)
- **conditional cost** — `cache_miss` median across runs that DID invoke

Stronger-prior models often skip an unfamiliar tool — `use_rate=45%` on the target arm vs `73%` on the alternative arm is a finding in itself (target CLI discoverability / credibility is weaker). The headline ratio depends on use_rate; report both.

## Bucket taxonomy

Per-(model, task), aggregating reps:

- **K** — knowledge passes → tool comparison has no signal
- **T** — target-only solves (knowledge fails, alternative fails)
- **A** — alternative-only solves
- **B** — both tool arms pass (knowledge fails) — only bucket with apples-to-apples token-cost signal
- **X** — all arms fail

When knowledge-ceiling dominates, most cells are K. Bucket-B is load-bearing for "tool helped equally on correctness; costs differ".

Per-rep buckets may differ from per-(model, task) aggregates under high within-rep variance — report both when it matters.

## Round-budget exhaustion as a failure mode

Reference tools with verbose output (full man-page-style dumps, large JSON) can drain the AUT's round budget before producing an answer. AUT spends rounds reading paginated output, never reaches the final-answer marker. Real failure mode of that arm — not a runner bug.

Detection:

- `final.txt` empty or missing the expected ANSWER marker
- usage shows the round cap hit
- trace shows the tool was invoked heavily

Treat as signal: a verbose-output reference is operationally harder to use within a budget than a precise-output one, even when both contain the answer.

## Matrix sequencing — search before run

Cheap exploration first, full factorial second:

- **Phase S (search)** — one workhorse model; ~30-50 runs. Goal: identify which (task, cap) cells produce useful arm-discrimination.
- **Phase R (runs)** — replicate interesting cells across the model fleet with 2-3 reps each.

Skip Phase S when calibration shows ceiling-hit on every task — pivot directly to token-efficiency on the full matrix.

## Grader hygiene

JSONL emission from shell graders has subtle traps:

- **zsh `echo "$json"`** interprets backslash escapes — embedded `\n` in JSON strings become real line breaks. Use `print -r --`, or write directly via `>>` from a `jq` pipeline.
- **JSON-via-shell-string-interpolation** (composing the JSON via `"{...$(jq ...)...}"`) is fragile across quoting layers. Prefer `jq -n --arg k "$v" '{...}'` and let `jq` do the escaping.
- **Per-runner usage.json shapes differ** — some emit a single JSON object per run; others emit JSONL (one record per turn / step_finish). The aggregator must parse each shape correctly. Smoke each runner before scaling the matrix.
- **Null records** — a run that fails before grading completes may emit `{"run":..., "error":...}` with no `runner` / `arm` field. Downstream aggregators must filter (`jq 'select(.runner != null)'`).
