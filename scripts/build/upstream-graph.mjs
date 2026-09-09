// The workspace build graph, read from the manifests that declare it.

import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
)

const members = (root = repoRoot) =>
  readdirSync(join(root, "packages"), { withFileTypes: true })
    .filter(ent => ent.isDirectory())
    .map(ent => join(root, "packages", ent.name))
    .map(dir => ({
      dir,
      pkg: JSON.parse(readFileSync(join(dir, "package.json"), "utf8")),
    }))

/** Workspace member to its `workspace:`-protocol dependencies. */
export function workspaceGraph(root = repoRoot) {
  const graph = new Map()
  for (const { pkg } of members(root)) {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    graph.set(
      pkg.name,
      Object.entries(deps)
        .filter(([, spec]) => String(spec).startsWith("workspace:"))
        .map(([name]) => name),
    )
  }
  return graph
}

/** Workspace member name to its directory. */
export function packageDirs(root = repoRoot) {
  return new Map(members(root).map(({ dir, pkg }) => [pkg.name, dir]))
}

/** Post-order walk from `roots`, keeping the nodes `keep` accepts. */
function depsFirst(graph, roots, keep) {
  const order = []
  const seen = new Set()
  const visit = name => {
    if (seen.has(name)) return
    seen.add(name)
    for (const dep of graph.get(name) ?? []) visit(dep)
    if (keep(name)) order.push(name)
  }
  for (const root of roots) visit(root)
  return order
}

/** Transitive dependencies of `pkgName`, dependencies-first (build order). */
export const upstreamOf = (pkgName, graph = workspaceGraph()) =>
  depsFirst(graph, [pkgName], name => name !== pkgName)

/** Packages some other member depends on, in build order. */
export function allUpstream(graph = workspaceGraph()) {
  const isUpstream = new Set([...graph.values()].flat())
  return depsFirst(graph, [...graph.keys()].sort(), name =>
    isUpstream.has(name),
  )
}

export const upstreamPkgs = allUpstream()
