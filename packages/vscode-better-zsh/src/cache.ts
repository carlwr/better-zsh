import type * as vscode from "vscode"

interface Entry<T> {
  version: number
  data: T
}

export function docCache<T>(compute: (doc: vscode.TextDocument) => T) {
  const cache = new Map<string, Entry<T>>()
  return (doc: vscode.TextDocument): T => {
    const key = doc.uri.toString()
    const entry = cache.get(key)
    if (entry && entry.version === doc.version) return entry.data
    const data = compute(doc)
    cache.set(key, { version: doc.version, data })
    return data
  }
}

export function asyncDocCache<T>(
  compute: (doc: vscode.TextDocument) => Promise<T>,
) {
  const cache = new Map<string, Entry<T>>()
  return async (doc: vscode.TextDocument): Promise<T> => {
    const key = doc.uri.toString()
    const entry = cache.get(key)
    if (entry && entry.version === doc.version) return entry.data
    const data = await compute(doc)
    cache.set(key, { version: doc.version, data })
    return data
  }
}
