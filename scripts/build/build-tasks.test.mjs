// The TS/Rust parity suite skips itself when the release binary is stale, so
// the qa chain must build one before the leg that runs vitest. Swapping the two
// disarms the gate silently: the suite still reports green, having compared
// nothing. A drift guard rather than a comment because the failure is invisible.

import assert from "node:assert/strict"
import { test } from "node:test"

import { buildTasks } from "./build-tasks.mjs"

const qaLegs = buildTasks.qa.split("&&").map(leg => leg.trim())

test("qa builds the release CLI before the unit-test leg", () => {
  const cli = qaLegs.indexOf("pnpm cli")
  const unit = qaLegs.indexOf("pnpm test:unit")
  assert.notEqual(cli, -1, "qa no longer builds the release CLI")
  assert.notEqual(unit, -1, "qa no longer runs the unit-test leg")
  assert.ok(cli < unit, "qa runs unit tests before building the release CLI")
})
