import * as fcu from "@carlwr/fastcheck-utils"
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { paramNames } from "../../document/params"
import { lineDoc } from "../test-util"

describe("paramNames", () => {
  test.each<[string, string[]]>([
    [
      "echo $foo ${bar} ${(k)map} ${#arr} ${+opt} ${~pat} $x[1]",
      ["foo", "bar", "map", "arr", "opt", "pat"],
    ],
    [
      'print "$name" ${var:-$dflt} ${${nested}}',
      ["name", "var", "dflt", "nested"],
    ],
    [
      "foo=1; arr+=(x); map[key]=v; [[ $a == b ]]; --opt=x",
      ["foo", "arr", "map"],
    ],
    [
      "local -a opts; typeset -gA cache=(); export PATH; unset tmp",
      ["opts", "cache", "PATH", "tmp"],
    ],
    [
      "for item in $list; do :; done; read -r line; select choice in a b",
      ["list", "item", "line", "choice"],
    ],
    ["for f in *; (( i++ )); echo $_ $1 $?", []],
    ["echo $real # $comment", ["real"]],
    ["usage() { print 'Usage: $0 [options]'; }", []],
  ])("%s", (text, want) => {
    expect(paramNames(lineDoc(text, text)).sort()).toEqual([...want].sort())
  })

  test("a name at any site is found alone; commented out, it is not", () => {
    const site = fcu.element([
      "echo $%",
      "echo ${%:-x}",
      "echo ${(k)%}",
      "echo ${#%}",
      "%=1",
      "%+=(x)",
      "%[k]=v",
      "local -a %",
      "typeset -gA %=()",
      "for %; do :; done",
      "read -r %",
    ])
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z_]\w{1,7}$/), site, (name, at) => {
        const line = at.replace("%", name)
        expect(paramNames(lineDoc(line))).toEqual([name])
        expect(paramNames(lineDoc(`: # ${line}`))).toEqual([])
      }),
    )
  })
})
