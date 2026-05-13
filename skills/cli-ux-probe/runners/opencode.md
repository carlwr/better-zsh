# Runner: opencode

External `opencode` CLI. Less isolated than other process runners — no `--bare` / `--ignore-user-config` analogue.

## Invocation (one-shot)

```sh
HOME="$iso_home" \
PATH="$scratch:$PATH" \
CLI_UX_PROBE_REAL_BIN="$real_bin" \
CLI_UX_PROBE_TRACE_FILE="$trace" \
timeout 180 opencode run \
  --pure \
  --model openai/gpt-5.4-mini \
  --dangerously-skip-permissions \
  --format json \
  --dir "$scratch" \
  "$prompt" </dev/null \
  > "$run_dir/opencode_stream.jsonl" \
  2> "$run_dir/opencode_stderr.txt"
```

- env vars must be on the `opencode run` line; assignment prefix scopes to one command
- `</dev/null` + `timeout N` — see SKILL.md "Defensive invocation"
- `run` — non-interactive
- `--pure` — disables external plugins
- `--dangerously-skip-permissions` — auto-approve tool calls
- `--format json` — raw event stream
- `--dir "$scratch"` — working dir
- `--model provider/model` (or `-m`) — see Model selection

## Auth

Reads `~/.local/share/opencode/auth.json`. To isolate while keeping auth:

- create `$iso_home/.local/share/opencode/`
- symlink host's `auth.json` into it

Don't pre-create `$iso_home/.config/opencode/`. opencode **auto-creates** it; a plugin install (large `node_modules/`) may happen on first run or a later run. Expected.

## Isolation

Partial:

- `HOME=$iso_home` excludes user agents, plugins, MCP configs
- `--pure` defeats external plugins
- `--dir "$scratch"` excludes project tree
- on-disk `opencode.db` is per-`HOME`; isolated `HOME` also isolates session history

Caveats:

- auto-discovers project `AGENTS.md` walking up from `--dir`; `/tmp/...` has no parent — safe
- no way to suppress baked-in system prompt
- per-`HOME` disk footprint: opencode.db + plugin `node_modules` (tens of MB) — clean up scratch when done

## Model selection

`-m <provider>/<id>` (e.g. cheap OpenAI fleet). Anthropic typically not in default catalog — prefer `claude-process` for Anthropic. List with `opencode models`. Catalog is host/auth-specific; available ids may differ from canonical provider naming and shift across versions.

## System-prompt control

No CLI flag. Custom agents carry their own prompt but require editing `~/.config/opencode/agent.jsonc` — which we don't want to leak. Treat as fixed; record `opencode --version` + model.

## Output collection

- `$run_dir/opencode_stream.jsonl` — `--format json` event stream
- `$run_dir/opencode_stderr.txt` — stderr notices/errors, if any
- **final assistant message:** last `text` event before the terminating step-finish event. Some versions tag it via a `final_answer` phase in event metadata (with intermediate text events carrying a `commentary`-style phase to filter out); other versions leave the phase field unset on all text events. Pin filters against the live stream — fall back to "last text event" when phase tagging is missing
- trace JSONL — primary CLI-usage evidence

## Token usage

`--format json` emits one `step_finish` per LLM step (not per run) — **sum across steps** for run totals:

```sh
HOME=$iso_home opencode run --format json -m openai/<id> "ping" 2>/dev/null \
  | jq -c 'select(.type=="step_finish") | .part'
```

Pin the jq selector once; document `opencode --version` — schema shifts across minor releases. Typical surfaces on recent versions:

- a `tokens` sub-object (input/output/reasoning + cache read/write where surfaced)
- a `cost` field (often `0` or `null` for openai-provider rows)
- a termination/reason field (e.g. stop vs tool-calls) — useful to distinguish normal stop from tool-call continuation

If usage isn't surfaced, record as runner limitation rather than fabricating.

## Exam mode (2-phase)

Phase 1: `opencode run`; capture `sessionID` from any stream event (it appears throughout). Between phases the orchestrator removes the shim symlink and runs phase 2 with the shim env vars **unset**.

```sh
# phase 1 — same as above
... opencode run ... > "$run_dir/p1_stream.jsonl"
session=$(jq -r '.sessionID // empty' < "$run_dir/p1_stream.jsonl" | head -1)

# rug-pull
rm "$scratch/<cli-name>"

# phase 2 — resume with new prompt; no shim env exported
HOME="$iso_home" PATH="$scratch:$PATH" \
  opencode run --pure --session "$session" \
  --model ... --dangerously-skip-permissions \
  --format json --dir "$scratch" \
  "$p2_prompt" </dev/null \
  > "$run_dir/p2_stream.jsonl" 2>&1
```

## Caveats

- OAuth token at `~/.local/share/opencode/auth.json` expires; on refresh failure (401) the user must re-auth via `opencode auth login <provider>` interactively — orchestrator can't refresh non-interactively
- `--dangerously-skip-permissions` removes guardrails; isolate via scratch `HOME` + `--dir`
- decorative banner / preamble may land on stderr — ignore when parsing `--format json`
- first run with fresh `HOME` may print a one-time database-migration notice on stderr — cosmetic
- `--format json` text fields may contain raw control chars; pipe through `jq -R 'gsub("[\\x00-\\x1f]"; "?")' | jq -c .` or capture to file first (see SKILL.md "Orchestrator script hygiene")
- opencode injects task/todo-style tools from its baked-in system prompt; not suppressible without a custom agent definition (specific names vary by version)
- model availability shifts; re-run `opencode models` if id stops resolving
- bad model id (not in catalog): emits a single JSON error event on stdout (parseable) with exit 0; stack trace lands on stderr. No agent turns follow. Check `opencode models` first.
