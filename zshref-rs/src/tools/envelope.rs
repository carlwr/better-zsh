//! Result envelope + entry shape. Struct field order is wire key order.

use crate::corpus::{Corpus, DocCategory};
use anyhow::Result;
use serde::Serialize;
use serde_json::Value;

/// The envelope's keys; the output schemas require exactly these.
pub const ENVELOPE_KEYS: [&str; 3] = ["matches", "matchesReturned", "matchesTotal"];

/// Standard `{ matches, matchesReturned, matchesTotal }` envelope.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope<M> {
    matches: Vec<M>,
    matches_returned: usize,
    matches_total: usize,
}

impl<M: Serialize> Envelope<M> {
    /// `total` is pre-truncation; for non-truncating tools (`docs`) pass `matches.len()`.
    pub fn new(matches: Vec<M>, total: usize) -> Self {
        Self {
            matches_returned: matches.len(),
            matches,
            matches_total: total,
        }
    }

    /// The wire form every tool returns.
    pub fn to_value(&self) -> Result<Value> {
        Ok(serde_json::to_value(self)?)
    }
}

/// `{category, id, display, subKind?, score?}` entry for `list`/`search`.
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry<'c> {
    pub category: DocCategory,
    pub id: &'c str,
    pub display: &'c str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_kind: Option<&'c str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
}

impl<'c> Entry<'c> {
    /// Corpus-wide identity.
    pub fn key(&self) -> (DocCategory, &'c str) {
        (self.category, self.id)
    }
}

/// Every record as a score-less `Entry`, in corpus order, optionally one
/// category only.
pub fn entries(corpus: &Corpus, category: Option<DocCategory>) -> Vec<Entry<'_>> {
    corpus
        .categories
        .iter()
        .filter(|cat| category.is_none_or(|f| cat.name == f))
        .flat_map(|cat| {
            cat.records.iter().map(move |rec| Entry {
                category: cat.name,
                id: rec.id(),
                display: rec.display(),
                sub_kind: rec.sub_kind(),
                score: None,
            })
        })
        .collect()
}
