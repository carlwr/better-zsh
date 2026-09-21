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
import type { DocCategory } from "../../docs/taxonomy.ts"
import type { HeuristicName } from "./heuristics.ts"

/** An offender: a record's `category` + `id`, the pair the drift test compares on. */
export interface OffenderId {
  readonly category: DocCategory
  readonly id: string
}

const pid = <K extends DocCategory>(cat: K, raw: string): OffenderId => ({
  category: cat,
  id: mkDocumented(cat, raw),
})

export const knownOffenders: Readonly<
  Record<HeuristicName, readonly OffenderId[]>
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

  "lc-keyed-deftext": [],

  // Real flat-prose flag rows at column 0 (extractor limitations, not
  // heuristic bugs):
  //
  // - `builtin:zcompile` — documents its flag set as flat prose, no
  //   upstream `startitem()` block.
  // - `complex_command:function` — parsed by a different extractor with
  //   no nested-list capture.
  "flag-keyed-deftext": [
    pid("builtin", "zcompile"),
    pid("complex_command", "function"),
  ],

  // Real false positives, not bugs:
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

  // Empty: every upstream parameter ref is wrapped in `tt(...)`.
  "param-not-coded": [],

  // Backticking is a future renderer concern. All five: an
  // `ifnzman(noderef(The zsh/<mod> Module))` cross-ref renders its node
  // title as plain prose, and the title carries the bare module name.
  "module-not-coded": [
    pid("builtin", "sched"),
    pid("builtin", "zpty"),
    pid("comp_utility", "_widgets"),
    pid("special_param", "ZBEEP"),
    pid("special_param", "zsh_scheduled_events"),
  ],

  "orphan-leading-punct": [],

  // A new offender means a nested-list parse miss.
  "stranded-backtick-tokens": [],
}
