//! `zsh_docs` — zsh key → per-category resolved matches.
//!
//! Without `category`, walks `CLASSIFY_ORDER` and returns one match per
//! resolving category. Feedback (e.g. `NO_`-stripping → `input-negated`)
//! is forwarded from the per-category resolver.

use crate::corpus::{Corpus, CLASSIFY_ORDER};
use crate::resolver::{resolve_in, ResolvedHit};
use crate::tools::envelope::mk_envelope;
use crate::tools::schema::{output_schema, MatchShape, Shape};
use crate::tools::{category_input, prose, Field, Tool, ToolName};
use anyhow::Result;
use serde_json::{json, Map, Value};

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

pub fn run(input: &Value, corpus: &Corpus) -> Result<Value> {
    let key = input.get("key").and_then(Value::as_str).unwrap_or("");
    let category = category_input(input)?;

    let matches_vec: Vec<Value> = if key.trim().is_empty() {
        Vec::new()
    } else {
        match category {
            Some(cat) => resolve_in(corpus, cat, key)
                .map(|h| hit_to_match(&h))
                .into_iter()
                .collect(),
            None => CLASSIFY_ORDER
                .iter()
                .filter_map(|&cat| {
                    let h = resolve_in(corpus, cat, key)?;
                    if h.category.as_str() == "history_expn"
                        && h.rec.sub_kind() != Some("event-designator")
                    {
                        return None;
                    }
                    Some(hit_to_match(&h))
                })
                .collect(),
        }
    };

    let n = matches_vec.len();
    Ok(mk_envelope(matches_vec, n))
}

fn hit_to_match(h: &ResolvedHit<'_>) -> Value {
    let mut m = Map::new();
    m.insert("category".into(), h.category.as_str().into());
    m.insert("id".into(), h.id.into());
    m.insert("display".into(), h.display.into());
    m.insert("title".into(), h.rec.title().into());
    m.insert("mdBody".into(), h.rec.md_body().into());
    if let Some(sk) = h.rec.sub_kind() {
        m.insert("subKind".into(), sk.into());
    }
    if let Some(fb) = &h.feedback {
        m.insert("feedback".into(), json!(fb));
    }
    Value::Object(m)
}
