// WEB-MIRRORED-IN: zshref-web/src/lib/ranker/lookup-map.ts
//
// Static lookup map from canonical surface forms to (category, id). Built
// once from corpus + resolver, shipped as JSON alongside index.json. Consumed
// by both the Rust CLI (`search.rs`) and the SPA as a hard-promote bypass
// over the ranker for canonical-identifier queries.
//
// Scope is strict resolver-equivalent: a surface form lands in the map only
// if the resolver canonicalizes it to exactly one (category, id). Close-
// variant fuzziness (extra spaces, dashes, double underscores, mixed case
// outside the enumerated forms) is *not* in the map; the ranker handles it.
// Collisions on the same raw key drop the offending entries — the map is
// one-to-one by construction.

use crate::corpus::Corpus;
use crate::nlp::search::resolver_key;
use crate::tools::record_fields::{record_display, record_id, Rec};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};

pub const LOOKUP_MAP_VERSION: u32 = 1;

#[derive(Debug, Deserialize, Serialize)]
pub struct LookupMap {
    pub version: u32,
    pub entries: Vec<LookupEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LookupEntry {
    pub raw: String,
    pub category: String,
    pub id: String,
}

/// O(1) lookup wrapper over `LookupMap`. Built once per binary lifetime; the
/// JSON form on disk is canonical and grep-friendly, the in-memory form is
/// hash-indexed.
pub struct LookupIndex {
    by_raw: HashMap<String, (String, String)>,
}

impl LookupIndex {
    pub fn from_map(map: LookupMap) -> Self {
        let by_raw = map
            .entries
            .into_iter()
            .map(|e| (e.raw, (e.category, e.id)))
            .collect();
        Self { by_raw }
    }

    /// Resolve `query` to `(category, id)` if a canonical entry exists.
    /// Tries the verbatim form first, then a lowercase fallback for keys
    /// that were enumerated in uppercase (e.g. options' `display`).
    pub fn lookup(&self, query: &str) -> Option<&(String, String)> {
        let q = query.trim();
        if q.is_empty() {
            return None;
        }
        if let Some(d) = self.by_raw.get(q) {
            return Some(d);
        }
        let lower = q.to_ascii_lowercase();
        if lower != q {
            return self.by_raw.get(&lower);
        }
        None
    }
}

/// Build the map by enumerating per-category surface forms, asking the
/// resolver to canonicalize each, and keeping only one-to-one mappings.
pub fn build(corpus: &Corpus) -> LookupMap {
    // raw -> ordered set of (cat, id). BTreeMap so collision diagnostics
    // would be stable, but a single-entry value is the only output that
    // ships.
    let mut by_raw: BTreeMap<String, BTreeMap<(String, String), ()>> = BTreeMap::new();

    for cat in &corpus.categories {
        for rec in &cat.records {
            for raw in surface_forms_for(cat.name, rec) {
                if raw.is_empty() {
                    continue;
                }
                if let Some((c, i)) = resolver_key(&raw, None, corpus) {
                    by_raw.entry(raw).or_default().insert((c, i), ());
                }
            }
        }
    }

    let mut entries: Vec<LookupEntry> = by_raw
        .into_iter()
        .filter_map(|(raw, dests)| {
            if dests.len() == 1 {
                let (cat, id) = dests.into_keys().next().expect("len 1");
                Some(LookupEntry {
                    raw,
                    category: cat,
                    id,
                })
            } else {
                None
            }
        })
        .collect();

    entries.sort_by(|a, b| {
        a.raw
            .cmp(&b.raw)
            .then_with(|| a.category.cmp(&b.category))
            .then_with(|| a.id.cmp(&b.id))
    });

    LookupMap {
        version: LOOKUP_MAP_VERSION,
        entries,
    }
}

/// Canonical surface-form enumeration per category. Sig/template categories
/// (`redirection`, `param_expn`, `history_expn`, `job_spec`, all flag cats,
/// `arith_op`, `glob_op`, `prompt_escape`, `conditional_op`, `process_subst`)
/// deliberately produce no entries — bare family-selector tokens have
/// multiple resolvable destinations and the ranker handles them via the
/// family contract.
fn surface_forms_for(cat: &str, rec: &Rec) -> Vec<String> {
    let id = record_id(cat, rec);
    let display = record_display(cat, rec);

    match cat {
        "option" => {
            // The option resolver normalizes (strip `_`, lowercase) and
            // handles `NO_`/`no_` negation, so each of these resolves
            // canonically to the same option id.
            let mut forms = vec![
                id.clone(),
                display.clone(),
                display.to_ascii_lowercase(),
                format!("NO_{display}"),
                format!("no_{id}"),
            ];
            forms.retain(|s| !s.is_empty());
            forms
        }
        "builtin" | "precmd_modifier" | "complex_command" | "reserved_word" | "keymap"
        | "zle_widget" | "mathfunc" | "comp_utility" | "special_function" | "special_param" => {
            if id.is_empty() {
                vec![]
            } else {
                vec![id]
            }
        }
        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::load_corpus;
    use crate::nlp::test_support::assert_committed_json;
    use std::path::PathBuf;

    fn committed_path() -> PathBuf {
        [
            env!("CARGO_MANIFEST_DIR"),
            "tests",
            "nlp-qa",
            "lookup-map.json",
        ]
        .iter()
        .collect()
    }

    /// Drift check: regenerate from corpus and either assert equality with
    /// the committed file or rewrite when `UPDATE_LOOKUP_MAP=1`. Pure on the
    /// corpus + resolver — no model/index assets required, so always runs.
    #[test]
    fn lookup_map_matches_committed() {
        let corpus = load_corpus().expect("load_corpus");
        let map = build(&corpus);
        let generated = serde_json::to_string_pretty(&map).expect("serialize") + "\n";
        assert_committed_json(&committed_path(), &generated, "UPDATE_LOOKUP_MAP");
    }

    /// Canonical-identifier queries each resolve to their record. Coverage
    /// over the asymmetric per-category surface-form shapes.
    #[test]
    fn known_canonical_forms_resolve() {
        let corpus = load_corpus().expect("load_corpus");
        let idx = LookupIndex::from_map(build(&corpus));
        let cases = [
            ("AUTO_CD", "option", "autocd"),
            ("auto_cd", "option", "autocd"),
            ("autocd", "option", "autocd"),
            ("NO_AUTO_CD", "option", "autocd"),
            ("no_autocd", "option", "autocd"),
            ("setopt", "builtin", "setopt"),
            ("fc", "builtin", "fc"),
            ("chdir", "builtin", "chdir"),
            ("_arguments", "comp_utility", "_arguments"),
        ];
        for (raw, want_cat, want_id) in cases {
            let got = idx.lookup(raw);
            assert!(got.is_some(), "expected map hit for {raw:?}");
            let (c, i) = got.expect("checked");
            assert_eq!(
                (c.as_str(), i.as_str()),
                (want_cat, want_id),
                "lookup {raw:?}"
            );
        }
    }

    /// Lowercase fallback path: an UPPER_CASE option surface form not
    /// directly listed (e.g. with a stray-case input) still resolves via
    /// the lowercase fallback if the lowercased form is in the map.
    #[test]
    fn lowercase_fallback_resolves() {
        let corpus = load_corpus().expect("load_corpus");
        let idx = LookupIndex::from_map(build(&corpus));
        // `SETOPT` is not enumerated as a builtin surface form (builtin
        // canonical is the lowercase id), so the lowercase fallback should
        // pick up `setopt`.
        let got = idx.lookup("SETOPT");
        assert!(got.is_some(), "lowercase fallback for SETOPT");
        let (c, i) = got.expect("checked");
        assert_eq!((c.as_str(), i.as_str()), ("builtin", "setopt"));
    }
}
