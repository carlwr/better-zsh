#!/usr/bin/env node

import { spawn } from "node:child_process"
import { performance } from "node:perf_hooks"

import { buildTasks } from "./build-tasks.mjs"

const argv = process.argv.slice(2)
const verboseFlagIdx = argv.indexOf("--verbose")
const verbose =
  verboseFlagIdx !== -1 || process.env.BZ_QUIET_RUN_VERBOSE === "1"
if (verboseFlagIdx !== -1) argv.splice(verboseFlagIdx, 1)

const [label, ...cmd] = argv

if (!label) {
  console.error(
    "usage: node scripts/build/quiet-run.mjs [--verbose] <label> [cmd...]",
  )
  process.exit(2)
}

const taskCmd = buildTasks[label]
if (!cmd.length && !taskCmd) {
  console.error(`${label}: unknown quiet task`)
  process.exit(2)
}

const fullOutputCmd = cmd.length
  ? cmd.join(" ")
  : label === "qa"
    ? "pnpm qa:verbose"
    : `pnpm run:verbose ${label}`
const started = performance.now()
const chunks = []
const maxFailLinesRaw = Number.parseInt(
  process.env.BZ_QUIET_RUN_LINES ?? "120",
  10,
)
const maxFailLines =
  Number.isFinite(maxFailLinesRaw) && maxFailLinesRaw > 0
    ? maxFailLinesRaw
    : 120
const stdio = verbose ? "inherit" : ["inherit", "pipe", "pipe"]
const env = verbose
  ? { ...process.env, BZ_QUIET_RUN_VERBOSE: "1" }
  : process.env

function writeFailureOutput() {
  if (verbose) return

  const output = Buffer.concat(chunks).toString()
  if (!output) return

  const lines = output.replace(/\n$/, "").split(/\r?\n/)
  if (lines.length <= maxFailLines) {
    process.stderr.write(output)
    if (!output.endsWith("\n")) process.stderr.write("\n")
    return
  }

  console.error(
    `${label}: showing last ${maxFailLines} of ${lines.length} lines`,
  )
  process.stderr.write(`${lines.slice(-maxFailLines).join("\n")}\n`)
}

const child = spawn(
  cmd.length ? cmd[0] : taskCmd,
  cmd.length ? cmd.slice(1) : [],
  {
    cwd: process.cwd(),
    env,
    shell: !cmd.length,
    stdio,
  },
)

if (!verbose) {
  child.stdout.on("data", chunk => chunks.push(chunk))
  child.stderr.on("data", chunk => chunks.push(chunk))
}

child.on("error", err => {
  console.error(`${label}: failed to start: ${err.message}`)
  process.exit(1)
})

child.on("close", (code, signal) => {
  const secs = ((performance.now() - started) / 1000).toFixed(1)

  if (code === 0) {
    console.log(`${label}: OK (${secs}s)`)
    return
  }

  writeFailureOutput()

  if (signal) {
    console.error(`${label}: failed (${signal}, ${secs}s)`)
    console.error(`${label}: full output: ${fullOutputCmd}`)
    process.exit(1)
  }

  console.error(`${label}: failed (exit ${code ?? 1}, ${secs}s)`)
  console.error(`${label}: full output: ${fullOutputCmd}`)
  process.exit(code ?? 1)
})
