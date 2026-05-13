---
name: cli-ux-probe
description: Find UX problems in a CLI by having agents-under-test use it; orchestrator observes via an out-of-band trace shim. Domain-agnostic; target binary and runner specified per session.
---

# cli-ux-probe

Probe a CLI for UX problems: agents-under-test (AUTs) use it; orchestrator observes via a trace shim.

## META

> Source: `$REPO_ROOT/skills/cli-ux-probe/`. Tool-discovery symlinks:
>
> - `$REPO_ROOT/.agents/skills/cli-ux-probe`
> - `$REPO_ROOT/.claude/skills/cli-ux-probe`
> - `$REPO_ROOT/.cursor/rules/cli-ux-probe.mdc`
> - `$REPO_ROOT/.opencode/skills/cli-ux-probe`
>
> <!-- Enumerating these concrete paths is deliberate: they are not easily inferrable. -->
>
> Edit the physical files only.
>
> `_meta/` holds meta-test artifacts for exercising and auditing this skill — orchestrators must not list or read files under `_meta/` unless the human user explicitly directs them to.
>
> Design posture:
>
> - CLI-agnostic and publishable on its own.
> - Target binary, domain, and purpose are per-session inputs.
> - Docs, examples, flags, and subcommands are AUT observations.
> - Skill text, runner docs, and shim code describe probe mechanics; do not name a default target or project.

## Roles

- **orchestrator** — invokes skill; picks target + runner(s) + mode; runs probes, eval, synthesis
- **AUT** (Agent-Under-Test) — separate agent via a runner; performs the selected mode

## Per-session inputs

- target binary path + name
- runner(s) from `runners/*.md`
- model per runner (cheapest first)
- mode/modes

## Canonical session shape

1. build/verify target fresh
2. scratch `/tmp/cli-ux-probe-<id>/`: symlink `scripts/shim` as target's name; export `CLI_UX_PROBE_REAL_BIN` (abs), `CLI_UX_PROBE_TRACE_FILE` (fresh JSONL), and optionally `CLI_UX_PROBE_MAX_INVOCATIONS` (see Budget); PATH-prepend scratch
3. per invocation: create `$run_dir`; capture runner stdout/stderr/final artifacts there
4. per-runner sanity probes; abort on fail
5. eval selected mode/modes; capture token usage
6. **post-eval: `[[ -s "$TRACE" ]] || abort`** — empty trace means the AUT bypassed the shim (PATH-shadow, dropped env, etc.); the eval is unusable
7. synthesise; report

Per-runner specifics in `runners/*.md`.

## Modes

(_Meta_: ideally, specific/named modes should be mentioned only under this section; the rest of the skill refer to "the mode/modes" etc.)

modes:

- **usage** — answer CLI-usage questions ("which invocation lists X?"); free CLI access for verification
- **task** — domain task needing the CLI; signal is the journey (attempts, dead-ends, retries), not just completion
- **exam** — explore the CLI without knowing why → orchestrator rug-pulls access → AUT answers usage questions from context only; mental-model probe

AUT is **always** told the CLI's name and that it's on PATH. UX probe of a known CLI, not discovery.

Orchestrator **may** say:

- CLI name
- that it's on PATH
- one-sentence purpose
- mode framing

Orchestrator **must not** feed:

- `--help` text
- README, docs, or schema dumps
- example invocations
- flag/subcommand names
- expectations

**Question sets** (`usage`, `exam`):

- CLI-surface ("which invocation lists X?"), not domain ("what does X do?")
- 3–6 covering top-level shape + common flags
- same set across AUTs in a session — cross-runner answers triangulate
- do **not** mention a "don't know" / abstain option — neither advertise it nor forbid it; just don't bring it up. AUTs under-evaluate their own knowledge under uncertainty and over-abstain when given the out, suppressing answers that would have been correct. Let abstention emerge organically when it does

### Orchestrator phasing

Question sets must precede the CLI knowledge that would taint them. Per selected mode:

- `task` / `exam`: write the set before any `--help` / source read. Brief the user; confirm "no CLI runs yet".
- `usage`: explore the CLI first, then write the set. Always write task/exam sets *before* this exploration.

### Modes

_usage_:

- wrong/uncertain answers are the signal — mark where help text + exploration didn't surface a usable model
- no phase enforcement: AUT sees the questions up front; exploration is shaped by them
- probes what `--help` + focused exploration teach in one pass
- *not* a mental-model probe

_task_:

- signal is *what they tried* — failed attempts, retries, dead-ends
- a fumble-but-finished completion is more informative than a clean one
- completion itself is secondary
- *post-help* attempts are the strongest signal — see Analysis: "post-help invocations"

_exam_:

- two-phase probe of the mental model formed by exploration alone
- phases:
  1. AUT explores the CLI without knowing why (no questions revealed)
  2. orchestrator rug-pulls CLI access, then asks usage questions; AUT answers from context only
- per-runner rug-pull mechanism in `runners/<name>.md`
- `claude-subagent` does **not** support orchestrator-side multi-turn — exam mode is unavailable on that runner

## Budget

Cap binary invocations per session: `CLI_UX_PROBE_MAX_INVOCATIONS=<N>`. Shim refuses past N (exit 127, clear stderr). Race-free; counter file `$TRACE.invcount` — orchestrator may delete between phases to reset.

Pair with a cost cap when the runner supports one (e.g. `claude -p --max-budget-usd <N>`; per-turn check, ~3× overshoot possible). Set the cap generously enough to allow the AUT's final-answer turn — too-tight cost caps truncate output before the AUT can deliver answers (observed at $0.03 with haiku + 5-invocation exploration).

Sizing:

- few targeted probes: 10–15, room for the AUT to recover from dead-ends
- large-scale cross-runner: 4–6, mostly a rate-limit / cost cap

**Budget as signal** — tight caps force prioritization: what the AUT explores first, what it guesses. Cross-AUT divergence under tight caps surfaces what the CLI makes (un)discoverable. Vary the cap across AUTs in a session to amplify.

## Anti-leak rules

- never quote/paraphrase `--help`, docs, examples into AUT context — collapses help-legibility signal
- AUT learns surface only via `--help`, error messages, trials etc.
- process-runner AUTs should be isolated from project/user config except per-runner documented baselines
- subagent runners may not be isolatable; baseline leakage = documented variation
- AUTs may write artifact files to scratch instead of returning inline (varies by SP + task framing; not always reproduced) — when reporting, capture both final runner output and any new scratch files

### Memory files

User instructions (CLAUDE.md, AGENTS.md) are durable, predictable baseline. **Agent-memory directories are not** — prior runs may have written entries, tainting later probes silently. If the leakage probe surfaces a `*/memory/*`-shaped path (per-runner specifics in `runners/<name>.md`), exclude that runner from evaluation unless the user explicitly opts in for the session. Skill development / smoke runs in non-isolated modes remain fine.

## Sanity-check probes

Cheap, scripted. Skip eval if any fail. Bundle into one invocation.

- **reachability + model** *(required)*
  - trivial prompt; runner returns configured model id in usage block

- **PATH** *(required)*
  - AUT prints `$PATH`; verify scratch dir is **present** (some runners inject their own dirs ahead of yours — scratch-not-at-index-0 is fine as long as no competing binary shadows the shim)

- **leakage** *(usally; and is _required_ when memory autoloading cannot otherwise be ruled out)*
  - AUT lists every file path it has context from. PASS iff no host paths appear except the per-runner baseline in `runners/<name>.md`. Plain user instructions = baseline; memory directories trigger exclusion (see "Memory files" above).

- **model id self-report** *(optional)*
  - cross-check; note that AUTs may confabulate

Combined template — replace `<CLI_NAME>` before sending. **Single-quote** when assigning to a shell variable so backticks/`$PATH` don't expand at assignment time:

```sh
PROMPT='Run echo $PATH and command -v <CLI_NAME>, and report what you see.
Then list any file paths you have been given context from. Then answer:
what is the capital of France? What model are you?'
```

PATH/leakage answers land in the AUT's final message **text**, not the trace — the probe does not invoke the shim, so `trace.jsonl` stays empty.

## Trace

- JSONL, one record per shim invocation. Canonical shape: `scripts/trace.schema.json`.
- Shim validates the **first** record per session (drift check; later calls short-circuit via a `<trace>.validated` marker). Failures: `<trace>.invalid` — orchestrator gates on its presence.
- `scripts/validate-trace <trace>` re-validates post-hoc (thin wrapper over `check-jsonschema`). Run for thorough per-record QA.
- `parent_cmd` is best-effort via `ps`:
  - informative when caller is `<shell> -c '<line>'` (typical agent shell tools)
  - empty (`ppid: 0`) when the runner's sandbox blocks `ps` (per-runner docs note this)
  - **unbounded** — `bash -c '<long-pipeline>'` parents can land several KB per record; truncate in recipes
- Body fields (`stdin`/`stdout`/`stderr`) are **not truncated**:
  - protect context with `jq` filters or byte-bounded reads
  - trace file is JSON-clean: jq encodes control bytes as `\u00xx` automatically, so the trace itself is safe even when the AUT pumped binary stdin
  - `jq -r` un-escapes — raw control bytes / ANSI then reach the consumer. Strip downstream when feeding to a terminal/grep: `tr -d '\000-\010\013-\037'`, or `jq -R 'gsub("[\\x00-\\x1f]"; "?")'`
- Shim buffers I/O — good for noninteractive CLIs, not stream timing or stdout/stderr interleaving.
- Concurrent writes serialized via `zsystem flock`; validated at 50-way concurrency. Re-stress if you change the lock pattern.

### Analysis (jq)

Validate first; the schema is the contract.

Some suggested recipes:

```sh
scripts/validate-trace "$TRACE"

# trace not empty (catches PATH-routing failures, see "PATH-routing" below)
[[ -s "$TRACE" ]] || { echo "trace empty — shim never invoked"; exit 1 }

# subcommand frequency: first non-flag arg after argv[0]
# (`.argv[1] // ""` mis-buckets `--help` / `--version` as subcommands)
jq -r '(.argv[1:] | map(select(startswith("-") | not)) | first) // "(no-subcommand)"' \
  < "$TRACE" | sort | uniq -c | sort -rn

# errors with bounded stderr
jq -c 'select(.exit != 0) | {argv, stderr_head: (.stderr[:200])}' < "$TRACE"

# caller-shell invocation lines (truncate — see "parent_cmd is unbounded").
# Slice tail, not head: agent harnesses commonly prepend long
# sourced-snapshot/setup preludes; the user-line lands near the end.
jq -r '.parent_cmd[-300:]' < "$TRACE"

# record-size budget audit
jq -c '{argv, bytes: (.|tostring|length)}' < "$TRACE" | sort -k2 -rn | head

# help-call ratio (read-vs-experiment style across runners)
jq -r '.argv | join(" ")' < "$TRACE" \
  | awk '/(^| )(--help|-h)( |$)/ || /^[^ ]+ help( |$)/ { h++ } { n++ }
         END { printf "%d/%d help-only (%d%%)\n", h, n, h*100/n }'
```

#### post-help invocations

Why filter by first-help boundary:

- post-help calls = informed attempts — the primary signal for "what does the AUT try when given the docs?"
- pre-help calls = uninformed guesses; how soon the AUT asks for `--help` isn't controllable
- AUT never asks for help -> little post-help signal exists

Filters: `scripts/post-help-top`, `scripts/post-help-sub` — jq scripts, usage in-file.

### PATH-routing failure

If `$TRACE` is empty after a probe, the AUT invoked **a different same-named binary** instead of the shim. Step 6 of the canonical session shape catches this; to diagnose:

```sh
command -v <cli-name>            # what the AUT's PATH resolves to (run via the runner)
ls -la "$scratch/<cli-name>"     # should be the shim symlink
```

## Defensive invocation (all process runners)

External agent CLIs hang. Two precautions for **every** invocation:

- `</dev/null` — close stdin. Some runners (`codex exec`) read stdin even with a prompt arg and block forever otherwise.
- `timeout N` (coreutils / `gtimeout` on macOS). Probes: 30–60s. Evals: 120–300s.

Copy from per-runner recipes.

## Orchestrator script hygiene

Orchestrator scripts run under **zsh** (default macOS harness). Past wedges:

- `> file` runs `cat > file` (`NULLCMD=cat`) and blocks on inherited stdin — use `: > file` or `printf '' > file`
- no unredirected `cat`/`read`; `</dev/null` the whole eval block if uncertain
- `claude --tools X,Y` is **variadic** and swallows the prompt without `-- "$prompt"` separator
- `opencode --format json` may emit raw control chars in text fields; pipe `jq -R 'gsub("[\\x00-\\x1f]"; "?")' | jq -c .` or capture to file first

A wedged script ties up an orchestrator's bash slot and does not self-clean when the agent returns. Kill by PID (`ps -ef` shows stdin pointing at a unix socket).

## Token usage

Process runners expose usage through runner-specific output; subagent runners may not. Record per run + session:

- input, output, cache_{read,create} if available; dollar cost if emitted

Cheap signal for comparing CLI prompt-efficiency.

## Report

Orchestrator shapes. Surfaces:

- clusters of similar mistakes across AUTs
- naming friction; misused flags/subcommands
- token waste in `--help`
- capabilities AUT guessed at (undiscoverable)
- surface inconsistencies (X is flag here, positional there)
- per-run + total tokens + any cost

## Proposing CLI changes

A probe surfaces patterns. Proposing a CLI change from those patterns is a separate step with its own discipline.

Before proposing:

- read `--help` yourself — confirm the AUT actually saw what you think it saw
- check the change is **sound on independent merits** (UX, consistency, principle), not just "agents do better with it" — protects against modeling accidental model behaviour as a real CLI problem
- agent ergonomics is one input among many; weigh against maintainer cost, surface stability, existing CLI conventions

When A/B testing a change:

- both arms **must** use identical inputs (prompts, runner config, model, env, replicate count)
- magnitude must be non-trivial — model non-determinism can flip a single rep; require a clear shift across replicates, not a marginal swing

## Continuity

Each session self-contained. Artifact = committed CLI change, not transcript. Re-probe after a change.

## Files

- `scripts/shim` — generic zsh trace wrapper; symlinked under target's name
- `scripts/trace.schema.json` — JSON Schema for trace records (canonical spec)
- `scripts/validate-trace` — thin `check-jsonschema` invoker; non-zero exit on any malformed line
- `scripts/post-help-top`, `scripts/post-help-sub` — jq filter files: emit AUT invocations after the first top-level / per-subcommand help call
- `runners/<name>.md` — per-runner invocation, isolation, model + system-prompt control, leakage caveats

Adding a runner: write `runners/<name>.md`; no edits here.

## Security - rules

- during work, be careful not to leak bare secrets (as e.g. stored in env. variables) into your own context, or shell history entries etc.: the env. variable _names_ are not sensitive, but their _values_ are
