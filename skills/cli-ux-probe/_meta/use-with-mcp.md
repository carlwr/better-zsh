# MCP UX-probe — task brief

`skills/cli-ux-probe/` finds UX problems in a *CLI* by having throwaway agents-under-test (AUTs) use it while an orchestrator observes out-of-band. Do the equivalent for an *MCP server*.

## Task

Take inspiration from `cli-ux-probe` and run the equivalent eval against the MCP server, built fresh. Get it configured, isolated well enough, and recognized across more than one runner — excluding any runner that can't be isolated from the orchestrator's own environment (e.g. in-process subagents). This doubles as a check that the MCP's config instructions are correct and that the server loads and every tool works. Run the kinds of evals the CLI skill runs, then report whether it works plus any QA findings. Fix genuine errors in the config instructions or the implementation in the working copy.

## General guidance (runner-agnostic on purpose)

- **Shim → proxy.** The CLI shim is a PATH-interposed binary logging each invocation. An MCP server isn't on PATH — the AUT calls *tools* over the client↔server transport — so the analogue is a transparent proxy wrapping the server that logs the JSON-RPC traffic. What it *is*: out-of-band observation of real calls/results, independent of AUT self-report. What it is *not*: a PATH interposer — it sits on the transport, and needs none of the shim's binary-name machinery.

- **Discovery channel = the handshake.** A CLI exposes its surface via `--help`; an MCP exposes its via the tool list + schemas the client surfaces at connect. That is the legitimate discovery surface — tell the AUT only that the server exists and its domain; never paste tool names, arguments, or schemas into its prompt.

- **Verify each layer before trusting a result.** "Server spawned" ≠ "model sees the tools" ≠ "model called them." A handshake can succeed while the model has no callable tools, or has them but answers from prior knowledge. Before evaluating, sanity-probe with a prompt whose answer is unguessable without the tool, and confirm from the out-of-band log that a real call happened. An empty log means the AUT bypassed the server — discard the result, however plausible it reads.

- **Test the build, not the registry.** Check config *structure* against the freshly-built server by pointing the command at your local build — don't make correctness depend on published/registry state or the network.
