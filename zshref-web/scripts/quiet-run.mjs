#!/usr/bin/env node
//
// Quiet runner: captures output, prints `<label>: OK (Xs)` on success,
// on failure dumps the last BZ_QUIET_RUN_LINES (default 120) lines. Stays
// self-contained — extracts with zshref-web to its own repo.
//
// Usage: node scripts/quiet-run.mjs [--verbose] <label> <cmd> [args...]
// Verbose: --verbose flag or BZ_QUIET_RUN_VERBOSE=1.

import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const argv = process.argv.slice(2);
const verboseFlagIdx = argv.indexOf('--verbose');
const verbose = verboseFlagIdx !== -1 || process.env.BZ_QUIET_RUN_VERBOSE === '1';
if (verboseFlagIdx !== -1) argv.splice(verboseFlagIdx, 1);

if (argv.length < 2) {
  console.error('usage: node scripts/quiet-run.mjs [--verbose] <label> <cmd> [args...]');
  process.exit(2);
}
const [label, cmd, ...cmdArgs] = argv;

const maxFailLinesRaw = Number.parseInt(process.env.BZ_QUIET_RUN_LINES ?? '120', 10);
const maxFailLines =
  Number.isFinite(maxFailLinesRaw) && maxFailLinesRaw > 0 ? maxFailLinesRaw : 120;

const started = performance.now();
const chunks = [];
const stdio = verbose ? 'inherit' : ['inherit', 'pipe', 'pipe'];
const env = verbose ? { ...process.env, BZ_QUIET_RUN_VERBOSE: '1' } : process.env;

const child = spawn(cmd, cmdArgs, { cwd: process.cwd(), env, stdio });

if (!verbose) {
  child.stdout.on('data', (chunk) => chunks.push(chunk));
  child.stderr.on('data', (chunk) => chunks.push(chunk));
}

child.on('error', (err) => {
  console.error(`${label}: failed to start: ${err.message}`);
  process.exit(1);
});

child.on('close', (code, signal) => {
  const secs = ((performance.now() - started) / 1000).toFixed(1);
  if (code === 0) {
    console.log(`${label}: OK (${secs}s)`);
    return;
  }
  writeFailureOutput();
  const reason = signal ?? `exit ${code ?? 1}`;
  console.error(`${label}: failed (${reason}, ${secs}s)`);
  console.error(`${label}: full output: BZ_QUIET_RUN_VERBOSE=1 ${cmd} ${cmdArgs.join(' ')}`.trimEnd());
  process.exit(code ?? 1);
});

function writeFailureOutput() {
  if (verbose) return;
  const output = Buffer.concat(chunks).toString();
  if (!output) return;
  const lines = output.replace(/\n$/, '').split(/\r?\n/);
  if (lines.length <= maxFailLines) {
    process.stderr.write(output);
    if (!output.endsWith('\n')) process.stderr.write('\n');
    return;
  }
  console.error(`${label}: showing last ${maxFailLines} of ${lines.length} lines`);
  process.stderr.write(`${lines.slice(-maxFailLines).join('\n')}\n`);
}
