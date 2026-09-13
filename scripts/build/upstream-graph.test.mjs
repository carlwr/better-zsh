// Build order comes from the declared graph, not a hand-listed set. Asserted
// against the real manifests, so adding a workspace dep moves the expectation
// instead of silently diverging from it.

import assert from "node:assert/strict"
import { test } from "node:test"

import {
  allUpstream,
  upstreamOf,
  upstreamPkgs,
  withUpstream,
  workspaceGraph,
} from "./upstream-graph.mjs"

test("upstreamOf returns transitive deps, dependencies first", () => {
  const graph = new Map([
    ["app", ["lib", "mid"]],
    ["mid", ["lib"]],
    ["lib", []],
  ])
  assert.deepEqual(upstreamOf("app", graph), ["lib", "mid"])
  assert.deepEqual(upstreamOf("mid", graph), ["lib"])
  assert.deepEqual(upstreamOf("lib", graph), [])
})

test("withUpstream lists the named packages after their deps", () => {
  const graph = new Map([
    ["app", ["mid"]],
    ["mid", ["lib"]],
    ["leaf", ["lib"]],
    ["lib", []],
  ])
  assert.deepEqual(withUpstream(["leaf"], graph), ["lib", "leaf"])
  assert.deepEqual(withUpstream(["app", "leaf"], graph), [
    "lib",
    "mid",
    "app",
    "leaf",
  ])
})

test("allUpstream keeps only packages something depends on", () => {
  const graph = new Map([
    ["app", ["lib"]],
    ["lonely", []],
    ["lib", []],
  ])
  assert.deepEqual(allUpstream(graph), ["lib"])
})

test("upstreamPkgs is exactly what some member depends on", () => {
  const graph = workspaceGraph()
  const depended = new Set([...graph.values()].flat())
  assert.deepEqual(new Set(upstreamPkgs), depended)
})

test("upstreamPkgs is in build order", () => {
  const graph = workspaceGraph()
  for (const [i, name] of upstreamPkgs.entries()) {
    for (const dep of graph.get(name) ?? []) {
      assert.ok(
        upstreamPkgs.indexOf(dep) < i,
        `${dep} must be built before ${name}`,
      )
    }
  }
})

test("every workspace member resolves an upstream set", () => {
  const graph = workspaceGraph()
  assert.ok(graph.size > 1, "workspace graph is empty — detection has broken")
  for (const name of graph.keys()) {
    for (const dep of upstreamOf(name, graph)) {
      assert.ok(graph.has(dep), `${name} upstream ${dep} is not a member`)
    }
  }
})
