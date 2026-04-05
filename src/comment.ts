/** Find the start index of a `#` comment on a line, respecting quotes. */
export function commentStart(line: string): number | undefined {
  let sq = false
  let dq = false
  let bq = false
  let esc = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (esc) {
      esc = false
      continue
    }
    if (sq) {
      if (ch === "'") sq = false
      continue
    }
    if (dq) {
      if (ch === "\\") {
        esc = true
        continue
      }
      if (ch === '"') dq = false
      continue
    }
    if (bq) {
      if (ch === "\\") {
        esc = true
        continue
      }
      if (ch === "`") bq = false
      continue
    }
    if (ch === "\\") {
      esc = true
      continue
    }
    if (ch === "'") {
      sq = true
      continue
    }
    if (ch === '"') {
      dq = true
      continue
    }
    if (ch === "`") {
      bq = true
      continue
    }
    if (ch === "#") return i
  }
}
