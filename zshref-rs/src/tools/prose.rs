//! Tool prose: briefs, descriptions, flag help and the suite preamble.
//!
//! Adapter-neutral: every string renders verbatim into both an LLM prompt
//! (MCP descriptions and `instructions`) and a terminal `--help`, whose
//! only rewrite is `zsh_<tool>` → `zshref <tool>`. Hence: name parameters
//! (`category`), never CLI flags (`--category`) or JSON syntax; keep the
//! tone neutral for both readers. Section order: cross-tool comparison
//! over within-tool adjacency.

use crate::corpus::{Index, CLASSIFY_ORDER};

/// `limit` when a `search` / `list` caller omits it.
pub const DEFAULT_LIMIT: u64 = 20;

/// Suite-level intent → tool cheat-sheet: MCP `instructions` at the
/// handshake and the tail of `zshref --help`. Kept short — terminal users
/// scan, context windows are finite.
pub const PREAMBLE: &str = "\
Tool → intent:
  `zsh_docs`   → look up docs for a zsh key (raw token or canonical id)
  `zsh_search` → fuzzy-match on tokens/id-s → returns ids
  `zsh_list`   → enumerate records          → returns ids

  (search/list emit `id`; feed back to `zsh_docs` as `key` for the body)
";

/// One-line flag help; `long` doubles as the schema property's `description`.
pub struct FlagProse {
    pub brief: String,
    pub long: String,
}

// --- briefs ------------------------------------------------------------------

pub const DOCS_BRIEF: &str = "look up bundled zsh reference docs";
pub const SEARCH_BRIEF: &str = "fuzzy-search the zsh reference by id/display";
pub const LIST_BRIEF: &str = "enumerate corpus records (id-only; no markdown)";

// --- shared snippets ---------------------------------------------------------

/// Closes every description. Agent-facing; the CLI help drops the line.
pub const SAFETY: &str = "No shell execution, no environment access.";

const RESOLUTION: &str = "\
Resolvers normalize input forms to canonical records (per-category, rule-based):

  INPUT:            RESOLVED:
                    category  id
  ----------        --------  --------
  ALIASES           option    aliases
  NO_ALIASES        option    aliases  (input-negated)
  %number           job_spec  %number
  %1                job_spec  %number";

/// `value` column in resolver order, labelled from `index.json`.
fn rendered_category_list(index: &Index) -> String {
    let width = CLASSIFY_ORDER.iter().map(|c| c.len()).max().unwrap_or(0);
    let rows: Vec<String> = CLASSIFY_ORDER
        .iter()
        .map(|c| {
            let label = index
                .doc_category_labels
                .get(*c)
                .unwrap_or_else(|| panic!("index.json lacks a label for category {c}"));
            format!("  {c:<width$}      {label}")
        })
        .collect();
    format!("  value\n  -----\n{}", rows.join("\n"))
}

// --- descriptions ------------------------------------------------------------

// `zsh_docs` and `zsh_search` name the corpus' zsh tag so agents know which
// zsh the reference is; `zsh_list` does not repeat it (enumeration only).

pub fn docs_long(index: &Index) -> String {
    let tag = &index.zsh_upstream.tag;
    format!(
        "\
Render markdown for a zsh token or canonical id from the bundled static {tag} reference.

Omitting `category` can return multiple matches for overlapping syntax. The list under the `category` field's description is resolver order.

{RESOLUTION}

Input `key` and the returned `id` may therefore differ; the returned `id` is always a valid `key` for follow-up lookups and is shell-safe (printable ASCII, no whitespace).

Output object properties:
  matches[]          matched records
  matchesReturned    returned match count
  matchesTotal       total match count

  Each matches[] element is an object with mandatory properties:
    category           doc category
    id                 canonical id
    display            zsh-facing name
    mdBody             rendered markdown
    subKind            optional category facet
    feedback           optional lossy-resolution signal

If no matches, returned matches[] is empty. The exit code is still 0 (success).

{SAFETY}"
    )
}

pub fn search_long(index: &Index) -> String {
    let tag = &index.zsh_upstream.tag;
    format!(
        "\
Find candidate records in the bundled static {tag} reference by id/display heading.

{RESOLUTION}

Ranking:
  1. exact id/display
  2. resolver match
  3. prefix
  4. fuzzy score

The score is 1 for exact/resolver/prefix matches. Fuzzy matches use a score in (0,1).

No markdown body. Use `zsh_docs` for full docs.

To enumerate without a query, use `zsh_list`.

{SAFETY}"
    )
}

pub fn list_long() -> String {
    format!(
        "\
Return id/display records from the bundled static zsh reference.

Identifiers only. Use `zsh_docs` for rendered markdown.

Order:
  category omitted: default category order
  category set: that category's corpus order

Each match in `matches[]`:
{{
  \"category\": \"...\",
  \"id\": \"...\",
  \"display\": \"...\",
  \"subKind\": \"...\"
}}

`subKind` is only present for categories with a meaningful sub-facet.

{SAFETY}"
    )
}

// --- flag prose --------------------------------------------------------------

pub fn flag_key() -> FlagProse {
    FlagProse {
        brief: "zsh token or canonical id (required)".into(),
        long: "\
zsh token or canonical id (lookup key)

Accepts: raw zsh tokens (`AUTO_CD`, `[[`, `%1`, `<<<`, `> word`) and canonical ids from prior `zsh_search` / `zsh_list` (`autocd`).

`id` values returned by any tool are always valid `key` inputs."
            .into(),
    }
}

pub fn flag_query() -> FlagProse {
    FlagProse {
        brief: "fuzzy-search string (required)".into(),
        long: "\
search string matched against ids and display headings

Empty or whitespace returns no matches; use `zsh_list` to enumerate."
            .into(),
    }
}

/// `docs` is the one tool whose category order is observable: it walks
/// the resolver order the value list is rendered in and returns at most
/// one match per category, so only its help may claim that order.
pub fn flag_docs_category(index: &Index) -> FlagProse {
    FlagProse {
        brief: "restrict to one category".into(),
        long: format!(
            "\
restrict to one doc category

With a category set, at most one match is returned.

If omitted, all categories are tried in the order given below, yielding at most one match per category.

Valid values:

{}",
            rendered_category_list(index)
        ),
    }
}

/// Category help for `search` and `list` — and, as the common denominator,
/// the CLI's root `--category`. Makes no order claim: `search` ranks by
/// relevance and `list` enumerates in corpus order, neither the resolver
/// order the value list is rendered in.
pub fn flag_filter_category(index: &Index) -> FlagProse {
    FlagProse {
        brief: "restrict to one category".into(),
        long: format!(
            "\
restrict to one doc category

If omitted, all categories are included.

Valid values:

{}",
            rendered_category_list(index)
        ),
    }
}

pub fn flag_limit() -> FlagProse {
    FlagProse {
        brief: format!("max. matches to return (default: {DEFAULT_LIMIT})"),
        long: format!(
            "\
limit the number of matches to return

Use 0 to return only metadata.

Default: {DEFAULT_LIMIT}"
        ),
    }
}
