// Runs the bundled native binary for this platform: argv, stdio, environment,
// exit status and termination signals pass straight through. Every `bin/`
// stub calls this with its binary's name.

const { spawn } = require("node:child_process")
const { existsSync, readdirSync } = require("node:fs")
const { join } = require("node:path")

const native = join(__dirname, "native")
const key = `${process.platform}-${process.arch}`
const ext = process.platform === "win32" ? ".exe" : ""

module.exports = bin => {
  const exe = join(native, key, bin + ext)
  if (!existsSync(exe)) {
    process.stderr.write(
      `${bin}: no prebuilt binary for ${key} (shipped: ${readdirSync(native).join(", ")})\n` +
        `${bin}: build from source instead: cargo install zshref --features mcp\n`,
    )
    process.exit(1)
  }
  // Asynchronous, not spawnSync: MCP clients terminate the launcher pid, not
  // the process group — a blocked Node would run no handler and the server
  // would outlive it until stdin EOF.
  const child = spawn(exe, process.argv.slice(2), {
    stdio: "inherit",
    windowsHide: true,
  })
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"]
  for (const sig of signals) process.on(sig, () => child.kill(sig))
  child.on("error", err => {
    process.stderr.write(`${bin}: ${err.message}\n`)
    process.exit(1)
  })
  child.on("exit", (code, signal) => {
    if (signal === null) process.exit(code)
    if (process.platform === "win32") process.exit(1)
    // re-raise, so the parent sees the same signal status
    for (const sig of signals) process.removeAllListeners(sig)
    process.kill(process.pid, signal)
  })
}
