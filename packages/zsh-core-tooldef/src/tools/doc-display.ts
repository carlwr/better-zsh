import {
  type DocCategory,
  type DocRecordMap,
  docDisplay,
} from "@carlwr/zsh-core"

export const display = (
  cat: DocCategory,
  rec: DocRecordMap[DocCategory],
): string => docDisplay(cat, rec as never)
