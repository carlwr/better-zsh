// Index-time: this module builds the per-record retrieval text views
// (structured, body, expanded) that get embedded. Changes here invalidate
// the corpus vectors; re-embed required.

use crate::corpus::Corpus;
use crate::nlp::rules::synonyms;
use crate::tools::record_fields::{
    record_display, record_id, record_sub_kind, record_title, str_field, Rec,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct RecordText {
    pub category: String,
    pub category_label: String,
    pub id: String,
    pub display: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sub_kind: Option<String>,
    pub title: String,
    pub md_body: String,
    pub structured: String,
    pub body: String,
    pub expanded: String,
}

pub fn corpus_texts(corpus: &Corpus) -> Vec<RecordText> {
    corpus
        .categories
        .iter()
        .flat_map(|cat| {
            cat.records
                .iter()
                .map(move |rec| record_text(cat.name, rec))
        })
        .collect()
}

pub fn record_text(cat: &str, rec: &Rec) -> RecordText {
    let id = record_id(cat, rec);
    let display = record_display(cat, rec);
    let sub_kind = record_sub_kind(cat, rec);
    let title = record_title(cat, rec);
    let md_body = str_field(rec, "mdBody").to_string();
    // `mdBody` is now title-less; recombine `title + body` to reproduce the
    // historical rendered markdown so the `body` (and `expanded`) embedding
    // views — and thus every vector — stay byte-identical to before the split.
    let full_md = format!("{title}\n\n{md_body}");
    let body = body_text(rec, &full_md);
    let category_label = category_label(cat);
    let structured = structured_text(
        cat,
        &category_label,
        &id,
        &display,
        sub_kind.as_deref(),
        rec,
    );
    let expanded = expanded_text(
        cat,
        &category_label,
        &id,
        &display,
        sub_kind.as_deref(),
        &body,
    );

    RecordText {
        category: cat.to_string(),
        category_label,
        id,
        display,
        sub_kind,
        title,
        md_body,
        structured,
        body,
        expanded,
    }
}

pub fn text_for_role(rec: &RecordText, role: &str) -> String {
    match role {
        "structured" => rec.structured.clone(),
        "body" => rec.body.clone(),
        "expanded" => rec.expanded.clone(),
        _ => String::new(),
    }
}

fn structured_text(
    cat: &str,
    label: &str,
    id: &str,
    display: &str,
    sub_kind: Option<&str>,
    rec: &Rec,
) -> String {
    let mut lines = vec![
        format!("category: {label}"),
        format!("category id: {cat}"),
        format!("id: {id}"),
        format!("display: {display}"),
    ];
    if let Some(sk) = sub_kind {
        lines.push(format!("subKind: {sk}"));
    }
    for (key, value) in rec {
        if key.starts_with('_') || matches!(key.as_str(), "mdBody" | "desc") {
            continue;
        }
        if let Some(s) = compact_value(value) {
            lines.push(format!("{}: {s}", key_words(key)));
        }
    }
    lines.join("\n")
}

fn body_text(rec: &Rec, md_body: &str) -> String {
    let desc = str_field(rec, "desc");
    if !desc.is_empty() {
        return normalize_ws(desc);
    }
    normalize_ws(&strip_markdown(md_body))
}

fn expanded_text(
    cat: &str,
    label: &str,
    id: &str,
    display: &str,
    sub_kind: Option<&str>,
    body: &str,
) -> String {
    let hay = format!(
        "{} {} {} {} {} {}",
        cat,
        label,
        id,
        display,
        sub_kind.unwrap_or(""),
        body
    )
    .to_ascii_lowercase();
    let mut hints = Vec::new();
    add(&mut hints, label);
    add(&mut hints, &key_words(cat));
    add(&mut hints, &key_words(id));
    add(&mut hints, &key_words(display));

    // Symmetric index-time synonym groups live in `rules/synonyms.yaml`. When
    // any member matches the record (whole word / phrase), the group's other
    // members are appended so queries phrased with a synonym embed closer.
    // Matching is whole-word, avoiding false positives from unanchored
    // substrings ("reading" matching "read", "HISTSIZE" matching "size").
    // Currently empty (see synonyms.yaml) — this loop is a no-op.
    for group in &synonyms().index_groups {
        if group.iter().any(|m| hay_has_word(&hay, m)) {
            for m in group {
                if !hay_has_word(&hay, m) {
                    add(&mut hints, m);
                }
            }
        }
    }

    hints.join("\n")
}

/// Whole-word match (or phrase match for needles containing spaces).
/// Single non-alphanumeric character needles (e.g. "%") use substring match.
fn hay_has_word(hay: &str, needle: &str) -> bool {
    if needle.contains(' ') {
        return hay.contains(needle);
    }
    if let Some(first) = needle.chars().next() {
        if needle.len() == 1 && !first.is_ascii_alphanumeric() {
            return hay.contains(needle);
        }
    }
    hay.split(|c: char| !c.is_ascii_alphanumeric())
        .any(|w| w.eq_ignore_ascii_case(needle))
}

fn compact_value(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => nonempty(normalize_ws(s)),
        Value::Bool(b) => Some(b.to_string()),
        Value::Number(n) => Some(n.to_string()),
        Value::Array(arr) => {
            let parts: Vec<String> = arr
                .iter()
                .filter_map(compact_value)
                .filter(|s| !s.is_empty())
                .collect();
            nonempty(parts.join(" "))
        }
        Value::Object(obj) => {
            let parts: Vec<String> = obj
                .iter()
                .filter_map(|(k, v)| compact_value(v).map(|s| format!("{} {s}", key_words(k))))
                .collect();
            nonempty(parts.join(" "))
        }
        Value::Null => None,
    }
}

fn category_label(cat: &str) -> String {
    key_words(cat)
        .split_whitespace()
        .map(|word| match word {
            "expn" => "expansion",
            "subst" => "substitution",
            "op" => "operator",
            "param" => "parameter",
            other => other,
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn key_words(s: &str) -> String {
    s.replace(['_', '-'], " ")
}

fn normalize_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn strip_markdown(s: &str) -> String {
    s.replace(['`', '*', '_'], "")
}

fn nonempty(s: String) -> Option<String> {
    (!s.trim().is_empty()).then_some(s)
}

fn add(hints: &mut Vec<String>, text: &str) {
    let text = normalize_ws(text);
    if !text.is_empty() && !hints.iter().any(|h| h == &text) {
        hints.push(text);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn generic_record_text_uses_structured_fields_and_body() {
        let rec = json!({
            "op": "-nt",
            "operands": ["file1", "file2"],
            "desc": "true if file1 exists and is newer than file2.",
            "mdBody": "`-nt` *file1* `-nt` *file2*",
            "_id": "-nt",
            "_display": "-nt",
            "_subKind": "binary"
        })
        .as_object()
        .unwrap()
        .clone();
        let text = record_text("conditional_op", &rec);
        assert!(text.structured.contains("category: conditional operator"));
        assert!(text.structured.contains("operands: file1 file2"));
        assert!(text.body.contains("newer than file2"));
        // Expanded view always carries the category label for semantic anchoring.
        assert!(text.expanded.contains("conditional operator"));
    }

    #[test]
    fn category_label_rewrites_tokens_only() {
        assert_eq!(category_label("option"), "option");
        assert_eq!(category_label("conditional_op"), "conditional operator");
        assert_eq!(category_label("process_subst"), "process substitution");
    }

    /// Emits `tests/nlp-qa/categories.json` (consumed by zshref-web for
    /// dropdown + result-chip labels) from `doc_categories` + the
    /// canonical `docCategoryLabels` map in `index.json`. The local
    /// heuristic `category_label()` still feeds `RecordText.category_label`
    /// (embedded into structured text) — decoupling lets the UI show
    /// canonical labels without re-embedding the corpus. Drift check;
    /// `UPDATE_CATEGORIES_JSON=1` rewrites.
    #[test]
    fn categories_json_matches_committed_file() {
        use crate::nlp::test_support::assert_committed_json;
        use std::path::PathBuf;
        let index = crate::corpus::load_corpus().expect("load_corpus").index;
        let entries: Vec<serde_json::Value> = index
            .doc_categories
            .iter()
            .map(|id| {
                let label = index.doc_category_labels.get(id).unwrap_or_else(|| {
                    panic!("docCategoryLabels missing entry for {id} (re-build zsh-core)")
                });
                json!({ "id": id, "label": label })
            })
            .collect();
        let value = json!({ "version": 1, "categories": entries });
        let generated = serde_json::to_string_pretty(&value).expect("serialize") + "\n";
        let path: PathBuf = [
            env!("CARGO_MANIFEST_DIR"),
            "tests",
            "nlp-qa",
            "categories.json",
        ]
        .iter()
        .collect();
        assert_committed_json(&path, &generated, "UPDATE_CATEGORIES_JSON");
    }
}
