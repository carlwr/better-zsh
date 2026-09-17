import type * as vscode from "vscode"

interface Entry<T> {
  version: number
  data: T
}

interface Store {
  evict(key: string): void
}

const stores = new Set<Store>()

function keyOf(doc: Pick<vscode.TextDocument, "uri">) {
  return doc.uri.toString()
}

export function evictDocCaches(doc: Pick<vscode.TextDocument, "uri">) {
  const key = keyOf(doc)
  for (const store of stores) store.evict(key)
}

export function docCache<T>(compute: (doc: vscode.TextDocument) => T) {
  const cache = new Map<string, Entry<T>>()
  stores.add({ evict: key => cache.delete(key) })
  return (doc: vscode.TextDocument): T => {
    const key = keyOf(doc)
    const entry = cache.get(key)
    if (entry && entry.version === doc.version) return entry.data
    const data = compute(doc)
    cache.set(key, { version: doc.version, data })
    return data
  }
}
