// Unicode box tables for the reports.

/** A column: its header, and whether its cells align right (numbers) or left (labels). */
export interface Column {
  head: string
  right: boolean
}
export const label = (head: string): Column => ({ head, right: false })
export const num = (head: string): Column => ({ head, right: true })

const charCount = (s: string): number => [...s].length

/** `s` padded to `width` code points (`padStart`/`padEnd` count UTF-16 units). */
const padded = (s: string, width: number, right: boolean): string => {
  const fill = " ".repeat(Math.max(width - charCount(s), 0))
  return right ? fill + s : s + fill
}

/**
 * A Unicode box table; widths fit the widest cell of each column (in
 * characters, not bytes), one space of padding each side. A row shorter
 * than the columns is padded with empty cells.
 */
export function boxTable(
  cols: readonly Column[],
  rows: readonly (readonly string[])[],
): string {
  const w = cols.map((c, i) =>
    Math.max(charCount(c.head), ...rows.map(r => charCount(r[i] ?? ""))),
  )
  const rule = (l: string, mid: string, r: string): string =>
    `${l}${w.map(wi => "─".repeat(wi + 2)).join(mid)}${r}`
  const row = (cells: readonly string[]): string =>
    `│${cols.map((c, i) => ` ${padded(cells[i] ?? "", w[i] ?? 0, c.right)} │`).join("")}`
  return `${[rule("┌", "┬", "┐"), row(cols.map(c => c.head)), rule("├", "┼", "┤"), ...rows.map(row), rule("└", "┴", "┘")].join("\n")}\n`
}
