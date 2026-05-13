# Runner: codex

External `codex` CLI subprocess; isolated from orchestrator.

## Invocation (one-shot)

```sh
PATH="$scratch:$PATH" CODEX_HOME="$scratch/codex_home" \
CLI_UX_PROBE_REAL_BIN="$real_bin" \
CLI_UX_PROBE_TRACE_FILE="$trace" \
timeout 120 codex exec \
  --model gpt-5.4-mini \
  --cd "$scratch" \
  --skip-git-repo-check \
  --ephemeral \
  --ignore-user-config \
  --ignore-rules \
  --sandbox workspace-write \
  --json \
  --output-last-message "$run_dir/codex_last_message.txt" \
  "$prompt" </dev/null \
  > "$run_dir/codex_stream.jsonl" \
  2> "$run_dir/codex_stderr.txt"
```

Required:

- `</dev/null` — `codex exec` reads stdin even with prompt arg; without redirect it prints `Reading additional input from stdin...` and **blocks forever**. With redirect the message still prints (informational) but does not block
- `timeout N` — belt-and-suspenders

`PATH="$scratch:$PATH"` puts scratch ahead of the caller's PATH. Recent `codex` versions inject one or more of their own dirs (e.g. arg0 + vendor binary path) ahead of yours — scratch may not land at index 0. Fine as long as nothing on the resulting PATH shadows the shim. Verify with PATH probe + `which <target>`.

Flags:

- `exec` — non-interactive
- `--cd "$scratch"` — agent root
- `--skip-git-repo-check` — `/tmp/...` isn't a git repo
- `--ephemeral` — no persisted session
- `--ignore-user-config` — skip `$CODEX_HOME/config.toml`
- `--ignore-rules` — skip `.rules` execpolicy files
- `--sandbox workspace-write` — AUT may write in workdir
- `--json` — JSONL event stream on stdout
- `--output-last-message` — clean final-message capture

## Auth

`--ignore-user-config` skips `config.toml`; auth still reads `$CODEX_HOME/auth.json`:

- point `CODEX_HOME` at fresh dir; symlink/copy `auth.json` from host `~/.codex/`
- or export `OPENAI_API_KEY` + minimal `config.toml` selecting OpenAI provider (heavier)

## Isolation

- `CODEX_HOME` + `--ignore-user-config` + `--ignore-rules` excludes host config + rules
- `--cd` + `/tmp/cli-ux-probe-*` excludes project files
- `--sandbox` controls AUT writes
- AUT shell inherits orchestrator PATH (we want this; shim must resolve)

## Model selection

Cheap-fleet model ids depend on the host's auth (ChatGPT-account auth and API-key auth resolve different catalogs; rejected ids surface as a `400 invalid_request_error`). Verify per host via probe.

`--json` event stream may not carry an explicit model field. Pin CLI-chosen id as ground truth; AUT self-report is a cross-check. Some versions write resolved model + workdir to stderr — informational, don't rely on as structured signal.

## System-prompt control

`codex exec` has **no** flag to suppress the baked-in system prompt. `--ignore-rules` does not touch `AGENTS.md` / `$CODEX_HOME/instructions.md`. Mitigations:

- no `AGENTS.md` in `$scratch` (guaranteed by `/tmp/...`)
- isolation = fresh `CODEX_HOME` (no host `instructions.md` / `AGENTS.md`), not `--ignore-rules`
- mention system-prompt opacity in cross-runner comparisons

**CODEX_HOME auto-materialization (recent versions):** codex may write built-in skills into `$CODEX_HOME/skills/.system/<name>/SKILL.md` plus a marker file, and create an empty `$CODEX_HOME/memories/` directory. Set of skills, marker filename, and adjacent dirs vary by version. Expected in leakage probe — not a leak. The empty `memories/` shape matches SKILL.md's `*/memory/*` exclusion trigger; check it's empty before treating as a memory-leak signal.

## Output collection

- `$run_dir/codex_last_message.txt` — cleanest final-message signal
- `$run_dir/codex_stream.jsonl` — full `--json` event history
- `$run_dir/codex_stderr.txt` — stderr notices/errors, if any
- trace JSONL — primary CLI-usage evidence

## Token usage

`--json` emits per-turn completion events carrying a `usage` block (input/output/cached/reasoning tokens). Shape and event name vary by version — pin with `jq` against the live stream:

```sh
jq -c 'select(.type=="turn.completed") | .usage' < "$run_dir/codex_stream.jsonl"
```

No dollar cost emitted; derive from per-model pricing if needed. The cached-input field counts **toward** total input tokens (it is the cached portion, not additional) — contrast claude's separate cache-read field.

## Exam mode (2-phase)

Phase 1: `codex exec` (drop `--ephemeral` — session must persist). Capture `thread_id` from the `.type=="thread.started"` event. Between phases the orchestrator removes the shim symlink and runs phase 2 with the shim env vars **unset** — the AUT may have remembered the env value but the shim refuses without it, and there is no shim on PATH.

`codex exec resume` accepts a **strict subset** of `codex exec`'s flags — notably **not** `--cd` or `--sandbox` (working dir + sandbox carry from the original session). Passing them errors with `unexpected argument`. Verified flags on phase 2: `--model`, `--skip-git-repo-check`, `--ignore-user-config`, `--ignore-rules`, `--json`, `--output-last-message`, `--ephemeral`, `--dangerously-bypass-approvals-and-sandbox`, `-c <key=value>`. Re-check with `codex exec resume --help` per version.

```sh
# phase 1 — same as above MINUS --ephemeral
... codex exec ... > "$run_dir/p1_stream.jsonl"
thread=$(jq -r 'select(.type=="thread.started") | .thread_id' < "$run_dir/p1_stream.jsonl")

# rug-pull
rm "$scratch/<cli-name>"

# phase 2 — resume with new prompt; no shim env exported, no --cd/--sandbox
PATH="$scratch:$PATH" CODEX_HOME="$scratch/codex_home" \
  codex exec resume "$thread" --model ... \
  --skip-git-repo-check --ignore-user-config --ignore-rules --json \
  --output-last-message "$run_dir/p2_last.txt" \
  "$p2_prompt" </dev/null \
  > "$run_dir/p2_stream.jsonl" 2>&1
```

## Caveats

- codex system prompt biases AUT toward writing files / patches; **pure-CLI probes need explicit suppression** in the prompt: `Do not write any files. Do not propose code patches. Run shell commands only and report findings.` (effective; soft framing alone fails)
- `--sandbox workspace-write` is real; binaries needing network or paths outside the workspace may fail
- macOS Seatbelt sandbox blocks `ps` inside spawned shim — shim's `parent_cmd` field stays empty and `ppid` is 0 for codex-driven records; `argv` is still authoritative
- `codex exec` writes informational/preamble messages to stderr (content varies by version); ignore for structured signal extraction
- codex parallelizes Bash tool calls — the shim's invocation budget catches this race-free, but be aware that invocation order in the trace is interleaved
