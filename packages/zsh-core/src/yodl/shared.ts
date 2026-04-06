import { normalizeDoc, stripYodl, type YodlItem } from "./parse.ts"

export interface AliasDoc {
  aliases?: readonly string[]
}

export function bodyDoc(item: YodlItem): string | undefined {
  return item.body ? normalizeDoc(stripYodl(item.body)) : undefined
}

export function withAliases<T extends AliasDoc>(
  items: readonly YodlItem[],
  parse: (item: YodlItem) => T | undefined,
): T[] {
  const out: T[] = []
  let pending: string[] = []

  for (const item of items) {
    if (!item.body) {
      const alias = stripYodl(item.header).trim()
      if (alias) pending.push(alias)
      continue
    }

    const parsed = parse(item)
    if (!parsed) {
      pending = []
      continue
    }

    out.push(pending.length === 0 ? parsed : { ...parsed, aliases: pending })
    pending = []
  }

  return out
}

export function expandAliases<T extends AliasDoc>(
  docs: readonly T[],
  expand: (doc: T, alias: string) => T,
): T[] {
  return docs.flatMap((doc) => [
    doc,
    ...(doc.aliases ?? []).map((alias) => expand(doc, alias)),
  ])
}
