//! `zsh_docs` — zsh key → per-category resolved matches.
//!
//! Without `category`, walks `CLASSIFY_ORDER` and returns one match per
//! resolving category. Feedback (e.g. `NO_`-stripping → `input-negated`)
//! is forwarded from the per-category resolver.

use crate::corpus::{CLASSIFY_ORDER, Corpus, DocCategory};
use crate::resolver::{ResolvedHit, ResolverFeedback, resolve_in};
use crate::tools::envelope::Envelope;
use crate::tools::schema::{MatchShape, Shape, output_schema};
use crate::tools::{Field, Tool, ToolName, prose};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub fn tool(corpus: &Corpus) -> Tool {
    Tool::new(
        ToolName::Docs,
        prose::docs(corpus.index),
        vec![
            Field::required("key", prose::key(), Shape::Text),
            Field::optional(
                "category",
                prose::docs_category(corpus.index),
                Shape::Category,
            ),
        ],
        output_schema(
            &MatchShape {
                title: true,
                md_body: true,
                feedback: true,
                ..MatchShape::default()
            },
            corpus,
        ),
        run,
    )
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    key: String,
    category: Option<DocCategory>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Match<'c> {
    category: DocCategory,
    id: &'c str,
    display: &'c str,
    title: &'c str,
    md_body: &'c str,
    #[serde(skip_serializing_if = "Option::is_none")]
    sub_kind: Option<&'c str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    feedback: Option<ResolverFeedback>,
}

impl<'c> From<ResolvedHit<'c>> for Match<'c> {
    fn from(h: ResolvedHit<'c>) -> Self {
        Self {
            category: h.category,
            id: h.id,
            display: h.display,
            title: h.rec.title(),
            md_body: h.rec.md_body(),
            sub_kind: h.rec.sub_kind(),
            feedback: h.feedback,
        }
    }
}

/// In the category walk, `history_expn` counts only for event designators:
/// a bare word designator or modifier (`0`, `h`) is not a history token.
fn walk_admits(h: &ResolvedHit) -> bool {
    h.category.as_str() != "history_expn" || h.rec.sub_kind() == Some("event-designator")
}

fn run(input: Input, corpus: &Corpus) -> Result<Value> {
    let key = input.key.as_str();
    let matches: Vec<Match> = if key.trim().is_empty() {
        Vec::new()
    } else {
        match input.category {
            Some(cat) => resolve_in(corpus, cat, key)
                .map(Match::from)
                .into_iter()
                .collect(),
            None => CLASSIFY_ORDER
                .iter()
                .filter_map(|&cat| {
                    resolve_in(corpus, cat, key)
                        .filter(walk_admits)
                        .map(Match::from)
                })
                .collect(),
        }
    };
    let n = matches.len();
    Envelope::new(matches, n).to_value()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::load_corpus;
    use serde_json::json;

    #[test]
    fn walk_skips_history_modifiers_but_scoping_finds_them() {
        let corpus = load_corpus().expect("load_corpus");
        let docs = tool(&corpus);
        let categories = |input: Value| -> Vec<Value> {
            let out = docs.call(&input, &corpus).expect("docs");
            let matches = out["matches"].as_array().expect("matches");
            matches.iter().map(|m| m["category"].clone()).collect()
        };
        assert!(!categories(json!({"key": "h"})).contains(&json!("history_expn")));
        assert_eq!(
            categories(json!({"key": "h", "category": "history_expn"})),
            [json!("history_expn")]
        );
    }
}
