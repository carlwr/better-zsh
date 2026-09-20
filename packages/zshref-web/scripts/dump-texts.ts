// Print every record's retrieval texts — what the index embeds — as JSON on
// stdout, for diffing across changes: any difference here re-embeds. Model-free.

import { loadCorpus } from "@carlwr/zsh-core"

import { prettyJson } from "../nlp/node/io"
import { corpusTexts } from "../nlp/node/retrieval-text"
import { loadRulesYaml } from "../nlp/node/rules-load"
import { scriptFlags } from "./_args"

const usage = `\
pnpm --filter zshref-web dump:texts

  the retrieval texts of every record, in index order, as pretty JSON on
  stdout; pnpm's own banner precedes it — for a clean file:
  pnpm --filter zshref-web run --silent dump:texts > OUT.json\
`
scriptFlags("dump-texts", usage, [])

const rules = await loadRulesYaml()
process.stdout.write(
  `${prettyJson(corpusTexts(loadCorpus(), rules.synonyms.index_groups))}\n`,
)
