//! Tool prose: a `Prose` per tool and per field, plus the suite preamble.
//!
//! Every paragraph renders into both targets unless it says otherwise
//! (`only`); tool references are holes (`t.tool(…)`). Neither target is
//! primary — agents read `--help` too — so: name parameters (`category`),
//! never CLI flags (`--category`) or JSON syntax; keep the tone neutral.

use super::ToolName;
use super::schema::DEFAULT_LIMIT;
use super::text::{Body, Prose, Target, body};
use crate::corpus::{CLASSIFY_ORDER, Index};
use indoc::{formatdoc, indoc};

/// The suite cheat-sheet: MCP `instructions` and the tail of `zshref
/// --help`. Kept short — terminal users scan, context windows are finite.
pub fn preamble(t: Target) -> Body {
    let [docs, search, list] =
        [ToolName::Docs, ToolName::Search, ToolName::List].map(|s| t.tool(s));
    let w = docs.len().max(search.len()).max(list.len());
    body![formatdoc! {"
        Tool → intent:
          {docs:<w$} → look up docs for a zsh key (raw token or canonical id)
          {search:<w$} → fuzzy-match on tokens/ids → returns ids
          {list:<w$} → enumerate records         → returns ids

          (search/list emit `id`; feed back to {docs} as `key` for the body)
    "}]
}

/// Closes every description on the JSON side; terminal help omits it
/// (README-like in a terminal).
const SAFETY: &str = "No shell execution, no environment access.";

const RESOLUTION: &str = indoc! {"
    Resolvers normalize input forms to canonical records (per-category, rule-based):

      INPUT:            RESOLVED:
                        category  id
      ----------        --------  --------
      ALIASES           option    aliases
      NO_ALIASES        option    aliases  (input-negated)
      %number           job_spec  %number
      %1                job_spec  %number
"};

/// `value` column in resolver order, labelled from `index.json`.
fn category_table(index: &Index) -> String {
    let width = CLASSIFY_ORDER
        .iter()
        .map(|c| c.as_str().len())
        .max()
        .unwrap_or(0);
    let rows: Vec<String> = CLASSIFY_ORDER
        .iter()
        .map(|c| {
            let label = index
                .doc_category_labels
                .get(c.as_str())
                .unwrap_or_else(|| panic!("index.json lacks a label for category {c}"));
            format!("  {c:<width$}      {label}")
        })
        .collect();
    format!("  value\n  -----\n{}", rows.join("\n"))
}

/// `docs` and `search` name the corpus' zsh tag so agents know which zsh
/// the reference is; `list` does not repeat it (enumeration only).
pub fn docs(index: &Index) -> Prose {
    let tag = &index.zsh_upstream.tag;
    Prose::new("look up bundled zsh reference docs", |t| {
        body![
            format!(
                "Render markdown for a zsh token or canonical id from the bundled static {tag} reference."
            ),
            "Omitting `category` can return multiple matches for overlapping syntax.",
            RESOLUTION,
            "Input `key` and the returned `id` may therefore differ; the returned `id` is always a valid `key` for follow-up lookups and is shell-safe (printable ASCII, no whitespace).",
            indoc! {"
                Output object properties:
                  matches[]          matched records
                  matchesReturned    returned match count
                  matchesTotal       total match count

                  Each matches[] element — always:
                    category           doc category
                    id                 canonical id
                    display            zsh-facing name
                    title              record heading (markdown; not repeated in mdBody)
                    mdBody             rendered markdown

                  — when applicable:
                    subKind            category facet (categories that have one)
                    feedback           lossy-resolution signal (`kind`, e.g. `input-negated`)
            "},
            "No matches is not an error: matches[] is empty, matchesTotal is 0.",
            t.only(Target::Json, SAFETY),
        ]
    })
}

pub fn search(index: &Index) -> Prose {
    let tag = &index.zsh_upstream.tag;
    Prose::new("fuzzy-search the zsh reference by id/display", |t| {
        body![
            format!(
                "Find candidate records in the bundled static {tag} reference by id/display heading."
            ),
            RESOLUTION,
            indoc! {"
                Ranking:
                  1. exact id/display
                  2. resolver match
                  3. prefix
                  4. fuzzy score
            "},
            indoc! {"
                Each matches[] element — always:
                  category           doc category
                  id                 canonical id
                  display            zsh-facing name
                  score              1 for exact/resolver/prefix; in (0,1) for fuzzy

                — when applicable:
                  subKind            category facet (categories that have one)
            "},
            format!(
                "No markdown body. Use {} for full docs.",
                t.tool(ToolName::Docs)
            ),
            format!(
                "To enumerate without a query, use {}.",
                t.tool(ToolName::List)
            ),
            t.only(Target::Json, SAFETY),
        ]
    })
}

pub fn list() -> Prose {
    Prose::new("enumerate corpus records (id-only; no markdown)", |t| {
        body![
            "Return id/display records from the bundled static zsh reference.",
            format!(
                "Identifiers only. Use {} for rendered markdown.",
                t.tool(ToolName::Docs)
            ),
            indoc! {"
                Order:
                  category omitted: default category order
                  category set: that category's corpus order
            "},
            indoc! {"
                Each matches[] element — always:
                  category           doc category
                  id                 canonical id
                  display            zsh-facing name

                — when applicable:
                  subKind            category facet (categories that have one)
            "},
            t.only(Target::Json, SAFETY),
        ]
    })
}

pub fn key() -> Prose {
    Prose::new("zsh token or canonical id (required)", |t| {
        body![
            "zsh token or canonical id (lookup key)",
            format!(
                "Accepts: raw zsh tokens (`AUTO_CD`, `[[`, `%1`, `<<<`, `> word`) and canonical ids from prior {} / {} (`autocd`).",
                t.tool(ToolName::Search),
                t.tool(ToolName::List)
            ),
            "`id` values returned by any tool are always valid `key` inputs.",
        ]
    })
}

pub fn query() -> Prose {
    Prose::new("fuzzy-search string (required)", |t| {
        body![
            "search string matched against ids and display headings",
            format!(
                "Empty or whitespace returns no matches; use {} to enumerate.",
                t.tool(ToolName::List)
            ),
        ]
    })
}

/// `docs` walks the resolver order the table is rendered in, one match per
/// category at most — the only tool whose help may claim that order.
pub fn docs_category(index: &Index) -> Prose {
    Prose::new("restrict to one category", |_| {
        body![
            "restrict to one doc category",
            "With a category set, at most one match is returned.",
            "If omitted, all categories are tried in the order given below, yielding at most one match per category.",
            "Valid values:",
            category_table(index),
        ]
    })
}

/// For `search` and `list`, and as their common denominator the CLI's root
/// `--category`: no order claim — `search` ranks by relevance, `list`
/// enumerates in corpus order.
pub fn filter_category(index: &Index) -> Prose {
    Prose::new("restrict to one category", |_| {
        body![
            "restrict to one doc category",
            "If omitted, all categories are included.",
            "Valid values:",
            category_table(index),
        ]
    })
}

pub fn limit() -> Prose {
    Prose::new(
        format!("max. matches to return (default: {DEFAULT_LIMIT})"),
        |_| {
            body![
                "limit the number of matches to return",
                "Use 0 for the total count only (no matches).",
                format!("Default: {DEFAULT_LIMIT}"),
            ]
        },
    )
}
