import { describe, expect, test } from "vitest"
import { parseCondOps } from "../../docs/yodl/extractors/cond-ops"
import { mkDocumented_ } from "../id-fns"
import { by, expectDocCorpus, only, readVendoredYo } from "./test-util"

const COND_YO = readVendoredYo("cond.yo")
const cond = mkDocumented_("conditional_op")

describe("parseCondOps", () => {
  test("parses unary operator", () => {
    const yo = `item(tt(-a) var(file))(
true if file exists.
)`
    const op = only(parseCondOps(yo))
    expect(op.op).toBe(cond("-a"))
    expect(op.arity).toBe("unary")
    expect(op.operands).toEqual(["file"])
    expect(op.desc).toContain("file exists")
  })

  test("parses binary operator", () => {
    const yo = `item(var(file1) tt(-nt) var(file2))(
true if file1 is newer than file2.
)`
    const op = only(parseCondOps(yo))
    expect(op.op).toBe(cond("-nt"))
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
    expect(ops[0]?.op).toBe(cond("=="))
    expect(ops[1]?.op).toBe(cond("="))
  })

  describe("vendored cond.yo", () => {
    const ops = parseCondOps(COND_YO)
    const byOp = by(ops, o => o.op)

    test("corpus parses", () =>
      expectDocCorpus({
        docs: ops,
        minCount: 20,
        keyOf: o => o.op,
        descOf: o => o.desc,
        known: [cond("-a"), cond("-f"), cond("-nt"), cond("=~")],
      }))

    test.each([
      ["-a", "unary"],
      ["-f", "unary"],
      ["-z", "unary"],
      ["-nt", "binary"],
      ["-eq", "binary"],
      ["=~", "binary"],
    ])("%s → %s", (op, arity) => {
      expect(byOp.get(cond(op))?.arity).toBe(arity)
    })
  })
})
