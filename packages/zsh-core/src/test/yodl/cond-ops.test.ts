import { describe, expect, test } from "vitest"
import { mkProven } from "../../docs/types"
import { parseCondOps } from "../../docs/yodl/extractors/cond-ops"
import { by, only, readVendoredYo } from "./test-util"

const COND_YO = readVendoredYo("cond.yo")

describe("parseCondOps", () => {
  test("parses unary operator", () => {
    const yo = `item(tt(-a) var(file))(
true if file exists.
)`
    const op = only(parseCondOps(yo))
    expect(op.op).toBe(mkProven("cond_op", "-a"))
    expect(op.arity).toBe("unary")
    expect(op.operands).toEqual(["file"])
    expect(op.desc).toContain("file exists")
  })

  test("parses binary operator", () => {
    const yo = `item(var(file1) tt(-nt) var(file2))(
true if file1 is newer than file2.
)`
    const op = only(parseCondOps(yo))
    expect(op.op).toBe(mkProven("cond_op", "-nt"))
    expect(op.arity).toBe("binary")
    expect(op.operands).toEqual(["file1", "file2"])
  })

  test("parses xitem + item pair (= / ==)", () => {
    const yo = `xitem(var(string) tt(=) var(pattern))
item(var(string) tt(==) var(pattern))(
true if string matches pattern.
)`
    const ops = parseCondOps(yo)
    expect(ops).toHaveLength(2)
    expect(ops[0]?.op).toBe(mkProven("cond_op", "=="))
    expect(ops[1]?.op).toBe(mkProven("cond_op", "="))
  })

  describe("vendored cond.yo", () => {
    const ops = parseCondOps(COND_YO)
    const byOp = by(ops, (o) => o.op)

    test("parses a reasonable number of operators", () => {
      expect(ops.length).toBeGreaterThan(20)
    })

    test("all ops have non-empty desc", () => {
      for (const o of ops) {
        expect(o.desc).toBeTruthy()
      }
    })

    test("contains known operators", () => {
      expect(byOp.has(mkProven("cond_op", "-a"))).toBe(true)
      expect(byOp.has(mkProven("cond_op", "-f"))).toBe(true)
      expect(byOp.has(mkProven("cond_op", "-nt"))).toBe(true)
      expect(byOp.has(mkProven("cond_op", "=~"))).toBe(true)
    })

    test.each([
      ["-a", "unary"],
      ["-f", "unary"],
      ["-z", "unary"],
      ["-nt", "binary"],
      ["-eq", "binary"],
      ["=~", "binary"],
    ])("%s → %s", (op, arity) => {
      expect(byOp.get(mkProven("cond_op", op))?.arity).toBe(arity)
    })
  })
})
