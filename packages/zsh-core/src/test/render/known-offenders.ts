/**
 * @module
 * Frozen, hand-curated list of records each render-quality heuristic is
 * expected to match in the vendored corpus.
 *
 * Contract: the actual offender set must match the listed set *exactly*.
 * Both directions matter — a listed offender that no longer matches is
 * itself a drift error.
 *
 * To accept a new offender: add it here and explain why. To remove one:
 * fix the renderer and the list shrinks automatically; the test then fails
 * for *positive* drift, prompting the maintainer to update this file.
 */

import { mkDocumented } from "../../docs/brands.ts"
import {
  type DocCategory,
  type DocPieceId,
  mkPieceId,
} from "../../docs/taxonomy.ts"
import type { HeuristicName } from "./heuristics.ts"

const pid = <K extends DocCategory>(cat: K, raw: string): DocPieceId =>
  mkPieceId(cat, mkDocumented(cat, raw))

export const knownOffenders: Readonly<
  Record<HeuristicName, readonly DocPieceId[]>
> = {
  // --- zero-tolerance: bug-shaped detectors with empty lists ---------------

  "empty-ref": [],
  "dangling-continuation": [],
  "raw-yodl-marker": [],
  "unbalanced-backticks": [],
  "stray-plus-macro": [],
  "double-comma": [],

  "empty-fence-info": [],

  // --- calibrated: known imperfect rendering accepted for now --------------

  // Records documenting enumerated key/option sets as flat
  // "<key> <Description sentence>" lines. Remaining offenders are
  // deeper-nested lists not yet captured by the depth-1 nested-list pass:
  //
  // - `builtin:compadd` — its `-o order` flag has a depth-2 nested value
  //   list (`match`, `nosort`, `numeric`, `reverse`) that flattens inside
  //   the `-o` flag's `desc`. Depth-2 capture is deferred.
  "lc-keyed-deftext": [pid("builtin", "compadd")],

  // Flag-style "<-x> <Description sentence>" residuals after the depth-1
  // capture. Remaining hits:
  //
  // - `builtin:zcompile` — documents its flag set as flat prose, no
  //   upstream `startitem()` block.
  // - `complex_command:function` — parsed by a different extractor with
  //   no nested-list capture.
  // - `comp_utility:_arguments` — depth-2 nested forms within several of
  //   its sibling top-level lists (e.g. `*optspec`, `-optname`,
  //   `-optname-`, `-optname=` documented inside the `optspec optspec:...`
  //   desc). Depth-2 capture is deferred.
  "flag-keyed-deftext": [
    pid("builtin", "zcompile"),
    pid("complex_command", "function"),
    pid("comp_utility", "_arguments"),
  ],

  // Standalone short paragraphs that look like headings. After single-em()
  // fake-headings are promoted to real markdown headings, remaining hits
  // are real false positives, not bugs:
  //
  // - `builtin:functions` — upstream uses a multi-em chain
  //   `em(The )tt(-M)em( and )tt(+M)em( flags)` as a fake heading. The
  //   chained shape skips the standalone-em promotion path (em is not
  //   blank-line bounded). Acceptable.
  // - `builtin:sysread` — "The possible return statuses are" introduces a
  //   nested return-code item list; the sentence renders as a standalone
  //   paragraph before the list. Acceptable rendering of upstream structure.
  // - `builtin:zstyle` — an `example()` fragment generates a standalone
  //   snippet that looks like a heading. Acceptable.
  // - `param_expn_flag:I` — "Hence with the string" is a real sentence
  //   that intros a code example; not a heading.
  "title-shape-para": [
    pid("builtin", "functions"),
    pid("builtin", "sysread"),
    pid("builtin", "zstyle"),
    pid("param_expn_flag", "I"),
  ],

  // Bare `$param` references in prose (outside fenced/inline code).
  // Currently empty across the vendored corpus — every upstream parameter
  // ref is wrapped in `tt(...)`, which renders as backticks. Kept as a
  // drift catcher.
  "param-not-coded": [],

  // Bare `zsh/<modname>` references in prose — records mentioning a known
  // module without the upstream `tt(...)` wrap. Backticking is a future
  // renderer concern; the check captures them today.
  //
  // - `builtin:sched` — desc contains "in the zsh/datetime module" from an
  //   `ifzman()` conditional that renders as plain prose.
  // - `builtin:zpty` — desc contains "The zsh/system Module" from an
  //   `ifzman()` conditional rendered as plain prose.
  "module-not-coded": [
    pid("builtin", "sched"),
    pid("builtin", "zpty"),
    pid("comp_utility", "_widgets"),
    pid("special_param", "ZBEEP"),
    pid("special_param", "zsh_scheduled_events"),
  ],

  // Paragraph begins with an orphaned terminal-punctuation char (`. ` /
  // `, ` / `; ` / `: ` / `! ` / `? `) followed by a capitalized sentence.
  // Almost always a rendering bug where surrounding markup ate the
  // previous word and stranded its trailing punctuation.
  "orphan-leading-punct": [],

  // Paragraph contains only short backticked tokens. Catches `xitem`/
  // `sxitem` alias headers that escaped their structured-list context and
  // rendered standalone. Should stay empty: any new offender means a
  // nested-list parse miss.
  "stranded-backtick-tokens": [],
}
