import type { ReservedWordDoc } from "../types/zsh-data.ts"
import { extractSection } from "./parse.ts"

const CMD_DESC =
  "Recognized as a reserved word when used as the first word of a command unless quoted or disabled with `disable -r`."

const ANY_DESC =
  "Recognized in any position if neither `IGNORE_BRACES` nor `IGNORE_CLOSE_BRACES` is set."

export function parseReservedWords(yo: string): ReservedWordDoc[] {
  const sec = extractSection(yo, "Reserved Words")
  const words = sec.match(/tt\((do done esac[\s\S]*?typeset)\)/)?.[1]
  if (!words) return []

  return [
    ...words
      .split(/\s+/)
      .filter((name) => name && name !== "}")
      .map(
        (name) =>
          ({
            name,
            pos: "command",
            sig: name,
            desc: CMD_DESC,
            section: "Reserved Words",
          }) satisfies ReservedWordDoc,
      ),
    {
      name: "}",
      pos: "any",
      sig: "}",
      desc: ANY_DESC,
      section: "Reserved Words",
    },
  ]
}
