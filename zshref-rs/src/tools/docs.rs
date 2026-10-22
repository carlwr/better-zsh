//! `zsh_docs` — zsh key → per-category resolved matches.
//!
//! Without `category`, the resolver walk answers: one match per admitting
//! category, in its order. Feedback (e.g. `NO_`-stripping →
//! `input-negated`) is forwarded from the per-category resolver.

use crate::lexicon::{DocCategory, Lexicon};
use crate::resolver::{ResolvedHit, ResolverFeedback, resolve_all, resolve_in};
use crate::tools::envelope::Envelope;
use crate::tools::schema::{MatchShape, Shape, non_null, output_schema};
use crate::tools::{Field, Tool, ToolName, prose};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub fn tool(lexicon: &Lexicon) -> Tool {
    Tool::new(
        ToolName::Docs,
        prose::docs(lexicon.index),
        vec![
            Field::required("key", prose::key(), Shape::Text),
            Field::optional(
                "category",
                prose::docs_category(lexicon.index),
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
            lexicon,
        ),
        run,
    )
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    key: String,
    #[serde(default, deserialize_with = "non_null")]
    category: Option<DocCategory>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Match<'lex> {
    category: DocCategory,
    id: &'lex str,
    display: &'lex str,
    title: &'lex str,
    md_body: &'lex str,
    #[serde(skip_serializing_if = "Option::is_none")]
    sub_kind: Option<&'lex str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    feedback: Option<ResolverFeedback>,
}

impl<'lex> From<ResolvedHit<'lex>> for Match<'lex> {
    fn from(h: ResolvedHit<'lex>) -> Self {
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

fn run(input: Input, lexicon: &Lexicon) -> Result<Value> {
    let key = input.key.as_str();
    let matches: Vec<Match> = if key.trim().is_empty() {
        Vec::new()
    } else {
        match input.category {
            Some(cat) => resolve_in(lexicon, cat, key)
                .map(Match::from)
                .into_iter()
                .collect(),
            None => resolve_all(lexicon, key)
                .into_iter()
                .map(Match::from)
                .collect(),
        }
    };
    let n = matches.len();
    Envelope::new(matches, n).to_value()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexicon::load_lexicon;
    use serde_json::json;

    #[test]
    fn walk_skips_history_modifiers_but_scoping_finds_them() {
        let lexicon = load_lexicon().expect("load_lexicon");
        let docs = tool(&lexicon);
        let categories = |input: Value| -> Vec<Value> {
            let out = docs.call(&input, &lexicon).expect("docs");
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
