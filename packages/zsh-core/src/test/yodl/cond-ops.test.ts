import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import { mkCondOp } from "../../types/brand"
import { parseCondOps } from "../../yodl/cond-ops"

const COND_YO = readFileSync(
  resolve(__dirname, "../../data/zsh-docs/cond.yo"),
  "utf8",
)

describe("parseCondOps", () => {
  test("parses unary operator", () => {
    const yo = `item(tt(-a) var(file))(
true if file exists.
)`
    const ops = parseCondOps(yo)
    expect(ops).toHaveLength(1)
    expect(ops[0]?.op).toBe(mkCondOp("-a"))
    expect(ops[0]?.kind).toBe("unary")
    expect(ops[0]?.operands).toEqual(["file"])
    expect(ops[0]?.desc).toContain("file exists")
  })

  test("parses binary operator", () => {
    const yo = `item(var(file1) tt(-nt) var(file2))(
true if file1 is newer than file2.
)`
    const ops = parseCondOps(yo)
    expect(ops).toHaveLength(1)
    expect(ops[0]?.op).toBe(mkCondOp("-nt"))
    expect(ops[0]?.kind).toBe("binary")
    expect(ops[0]?.operands).toEqual(["file1", "file2"])
  })

  test("parses xitem + item pair (= / ==)", () => {
    const yo = `xitem(var(string) tt(=) var(pattern))
item(var(string) tt(==) var(pattern))(
true if string matches pattern.
)`
    const ops = parseCondOps(yo)
    expect(ops).toHaveLength(2)
    expect(ops[0]?.op).toBe(mkCondOp("=="))
    expect(ops[1]?.op).toBe(mkCondOp("="))
  })

  describe("vendored cond.yo", () => {
    const ops = parseCondOps(COND_YO)

    test("parses a reasonable number of operators", () => {
      expect(ops.length).toBeGreaterThan(20)
    })

    test("all ops have non-empty desc", () => {
      for (const o of ops) {
        expect(o.desc).toBeTruthy()
      }
    })

    test("contains known operators", () => {
      const byOp = new Map(ops.map((o) => [o.op as string, o]))
      expect(byOp.has("-a")).toBe(true)
      expect(byOp.has("-f")).toBe(true)
      expect(byOp.has("-nt")).toBe(true)
      expect(byOp.has("=~")).toBe(true)
    })

    test("unary operators have correct kind", () => {
      const byOp = new Map(ops.map((o) => [o.op as string, o]))
      expect(byOp.get("-a")?.kind).toBe("unary")
      expect(byOp.get("-f")?.kind).toBe("unary")
      expect(byOp.get("-z")?.kind).toBe("unary")
    })

    test("binary operators have correct kind", () => {
      const byOp = new Map(ops.map((o) => [o.op as string, o]))
      expect(byOp.get("-nt")?.kind).toBe("binary")
      expect(byOp.get("-eq")?.kind).toBe("binary")
      expect(byOp.get("=~")?.kind).toBe("binary")
    })
  })
})
