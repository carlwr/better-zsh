# Runner: deepseek-api

Direct calls to Deepseek's chat-completions API (`https://api.deepseek.com/v1`) via the stdlib-only wrapper at `scripts/aut-deepseek`. Bypasses opencode (which truncates `--format json` for Deepseek) to get accurate token data + `reasoning_content`.

Use when:
- token accuracy matters (e.g. measuring token-efficiency between conditions)
- you need to inspect reasoning traces
- you want a cheap workhorse: v4-flash and v4-pro are well below Haiku per token, and rate limits on the API are generous (vs. opencode-Zen-free which can hit silent caps)

## Invocation (one-shot)

```sh
ln -sf "$SHIM" "$scratch/$cli_name"   # standard shim setup
printf "%s" "$prompt" > "$run_dir/prompt.txt"

PATH="$scratch:$PATH" \
CLI_UX_PROBE_REAL_BIN="$real_bin" \
CLI_UX_PROBE_TRACE_FILE="$trace" \
CLI_UX_PROBE_MAX_INVOCATIONS="$cap" \
DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
"$SKILL_DIR/scripts/aut-deepseek" \
  --model deepseek-v4-flash \
  --reasoning-effort low \
  --prompt-file "$run_dir/prompt.txt" \
  --out-dir "$run_dir" \
  --scratch-dir "$scratch" \
  > "$run_dir/stdout.txt" 2> "$run_dir/stderr.txt"
```

Defaults / knobs:

- `--model` — `deepseek-v4-flash` or `deepseek-v4-pro` (per `/v1/models`)
- `--reasoning-effort` — `low | medium | high | max | xhigh` (omit for the model's default)
- `--max-rounds` — caps assistant↔tool turns (default 20)
- `--timeout-per-call` — per HTTP request (default 180s; raise for v4-pro at high effort)
- `--retries` — exp-backoff on transient errors (default 2)
- `--no-tools` — register no tools (omits the `bash` tool entirely). For pure-prediction setups where the AUT must answer from priors — see `methods/comparative-arms.md`. Without this flag, AUTs given prediction tasks will often execute the expression via `bash` to compute the answer.

## Auth

`DEEPSEEK_API_KEY` env. Direct HTTP — no auth.json, no keychain. The OpenAI Python SDK is *not* required (script uses `urllib`).

## Model selection

`deepseek-v4-flash` and `deepseek-v4-pro` are the only model ids the API actually accepts. The names `deepseek-chat` and `deepseek-reasoner` are aliases that route to v4-flash with default reasoning off / on respectively — they work with this script too, but prefer the canonical ids.

- **v4-flash**: cheaper; reasoning off by default; turn on via `--reasoning-effort` if needed
- **v4-pro**: always reasons; tune depth via `--reasoning-effort` (rejects `false`)

## System-prompt control

None applied. Direct API → no baked-in system prompt. All instruction lives in the user-prompt file. This is a deliberate trade vs. claude-process / codex / opencode, which all inject their own system prompts that confound cross-runner comparison.

## Output collection

- `final.txt` — last assistant `content` (the AUT's final answer)
- `transcript.json` — list of rounds: content, `reasoning_content`, tool_calls, finish_reason, per-round usage
- `usage.json` — **single JSON object** (one-pass `json.load`-able; contrast `codex` and `opencode` which emit JSONL). Totals: `prompt_tokens`, `completion_tokens`, **`reasoning_tokens`**, `cache_hit_tokens`, `cache_miss_tokens`, `rounds`, `shim_invocations`
- trace JSONL — written by the shim as usual; primary CLI-usage evidence

## Token usage

Reported per-call by the API; the script sums across rounds:

```
prompt_tokens         input tokens this round (incl. cache-hit ones)
completion_tokens     output tokens (incl. reasoning_tokens)
reasoning_tokens      subset of completion_tokens, billed but not in visible content
prompt_cache_hit_tokens / prompt_cache_miss_tokens
                      Deepseek's cache split — important for cost accounting
```

For cost comparison: bill `completion_tokens` at the model's output rate; bill `(prompt_tokens - cache_hit_tokens)` at standard input rate and `cache_hit_tokens` at the cache rate.

## Exam mode (2-phase)

The script is one-shot; for exam mode you can wrap two invocations and pass the post-phase-1 transcript back as conversation history into a phase-2 prompt. The shim's symlink can be removed between phases as the rug-pull (same mechanism as codex/opencode).

If the eval matrix doesn't need it, skip — exam mode wasn't planned for round 3.

## Caveats

- **Reasoning models require `reasoning_content` echoed back on subsequent turns.** Forgetting this yields HTTP 400 *"The `reasoning_content` in the thinking mode must be passed back to the API."* The script handles this; if you fork it, preserve that behavior.
- **No baked-in system prompt** means model behavior differs vs. agent CLIs that inject framing. Don't compare absolute invocation counts across runner families; comparisons are valid *within* the deepseek runner family or across model variants on this runner.
- **macOS Seatbelt does not sandbox the subprocess** (we use `subprocess.run` directly). The shim's `parent_cmd`/`ppid` will reflect the Python process — `argv` is authoritative for analysis as always.
- **`reasoning_effort` accepts max/xhigh** but for the workloads in this probe-set, `low` or `medium` are sufficient. xhigh can produce minute-long stalls on hard tasks.
- **No streaming.** Each round is one synchronous HTTP request. For long thinking traces with strict per-call timeouts, prefer v4-flash + medium effort over v4-pro + max effort.

## Rate-limit posture

API key, not free tier. Generous in practice (no observed throttling at ~1 req/sec sustained). The user reports much higher tolerance than opencode-Zen-free models. Suitable for large-scale matrices (3× round-2 volume).
