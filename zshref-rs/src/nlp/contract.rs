// WEB-MIRRORED-IN: zshref-web/tests/lookup-contract.test.ts
//
// Auto-generated contract corpus for the canonical-identifier lookup path.
//
// One entry per (record, surface-form-kind, phrasing-kind) — each carries
// a query string, an `expectedSet` derived from corpus iteration, and a
// predicate that says how the search system must satisfy the contract for
// that query. The contract is the SoT for "what canonical queries must
// work"; the ranker/map combination is the implementation.
//
// Two phrasing layers:
//
// - **Bare**: the surface form alone (`AUTO_CD`, `setopt`). Always
//   resolves via the lookup-map hard-promote bypass — no ranker needed.
//   Fast contract check.
// - **Decorated**: category-label/id pre- or suffixed (`option AUTO_CD`,
//   `setopt builtin`). No lookup-map entry — surfacing the record needs the
//   full embed+rank pipeline. This module only *generates* these; the sentence
//   eval consumes them.
//
// Family-selector entries (sig/template categories) deferred — the
// expected-set derivation for `>`, `<<`, `${` etc. needs a different
// predicate (`top-K-equals-set`) than the current `top-1-in-set`.

use crate::corpus::Corpus;
use crate::nlp::lookup_map::LookupIndex;
use crate::nlp::search::resolver_key;
use crate::tools::record_fields::{record_display, record_id, Rec};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const LOOKUP_CONTRACT_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize, Eq, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractEntry {
    pub query: String,
    pub record: Identity,
    pub surface_form_kind: SurfaceFormKind,
    pub phrasing_kind: PhrasingKind,
    pub predicate: Predicate,
    pub expected_set: Vec<Identity>,
}

#[derive(Clone, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
pub struct Identity {
    pub category: String,
    pub id: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum SurfaceFormKind {
    Id,
    Display,
    LowerDisplay,
    NoPrefixDisplay,
    NoPrefixId,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PhrasingKind {
    Bare,
    LabelPrefix,
    LabelSuffix,
    IdPrefix,
    IdSuffix,
}

impl PhrasingKind {
    pub fn is_decorated(self) -> bool {
        !matches!(self, PhrasingKind::Bare)
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Predicate {
    Top1InSet,
    // Future extension for sig/template family-selectors:
    // TopKEqualsSet
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LookupContract {
    pub version: u32,
    pub entries: Vec<ContractEntry>,
}

/// Build the contract by enumerating per-record surface forms + phrasings,
/// computing the expected set from the *bare* surface form (decorated
/// phrasings inherit it), and pairing each with its `top-1-in-set`
/// predicate.
pub fn build(corpus: &Corpus) -> LookupContract {
    let mut entries: Vec<ContractEntry> = Vec::new();
    for cat in &corpus.categories {
        let cat_label = corpus
            .index
            .doc_category_labels
            .get(cat.name)
            .map(String::as_str)
            .unwrap_or(cat.name);
        for rec in &cat.records {
            let id = record_id(cat.name, rec);
            if id.is_empty() {
                continue;
            }
            for (form, kind) in surface_forms_for(cat.name, rec) {
                if form.is_empty() {
                    continue;
                }
                let expected = expected_set(corpus, &form);
                if expected.is_empty() {
                    continue;
                }
                let mut seen: BTreeSet<String> = BTreeSet::new();
                for (query, phrasing) in phrasings_for(&form, cat.name, cat_label) {
                    if !seen.insert(query.clone()) {
                        continue;
                    }
                    entries.push(ContractEntry {
                        query,
                        record: Identity {
                            category: cat.name.to_string(),
                            id: id.clone(),
                        },
                        surface_form_kind: kind,
                        phrasing_kind: phrasing,
                        predicate: Predicate::Top1InSet,
                        expected_set: expected.clone(),
                    });
                }
            }
        }
    }
    entries.sort();
    LookupContract {
        version: LOOKUP_CONTRACT_VERSION,
        entries,
    }
}

/// Phrasings emitted per (record, surface form). Decorated forms collapse
/// to bare-form duplicates when category id == category label (e.g.
/// `option`, `builtin`); the caller dedupes on the query string, keeping
/// the earliest `PhrasingKind` in this list. Order: Bare → Label* → Id*.
fn phrasings_for(form: &str, cat_id: &str, cat_label: &str) -> Vec<(String, PhrasingKind)> {
    vec![
        (form.to_string(), PhrasingKind::Bare),
        (format!("{cat_label} {form}"), PhrasingKind::LabelPrefix),
        (format!("{form} {cat_label}"), PhrasingKind::LabelSuffix),
        (format!("{cat_id} {form}"), PhrasingKind::IdPrefix),
        (format!("{form} {cat_id}"), PhrasingKind::IdSuffix),
    ]
}

/// expectedSet derivation: any record reachable as a canonical answer for
/// the query — id/display equality or the resolver's verdict. The set is
/// generally small (1) for canonical-identifier queries; if larger, the
/// `top1-in-set` predicate accepts any member at slot 0.
fn expected_set(corpus: &Corpus, query: &str) -> Vec<Identity> {
    let mut s: BTreeSet<Identity> = BTreeSet::new();
    if let Some((c, i)) = resolver_key(query, None, corpus) {
        s.insert(Identity { category: c, id: i });
    }
    for cat in &corpus.categories {
        for rec in &cat.records {
            let id = record_id(cat.name, rec);
            let display = record_display(cat.name, rec);
            if id == query || display == query {
                s.insert(Identity {
                    category: cat.name.to_string(),
                    id,
                });
            }
        }
    }
    s.into_iter().collect()
}

/// Surface-form enumeration per category, mirroring `lookup_map::surface_forms_for`
/// but tagged with `SurfaceFormKind` for failure reporting.
fn surface_forms_for(cat: &str, rec: &Rec) -> Vec<(String, SurfaceFormKind)> {
    let id = record_id(cat, rec);
    let display = record_display(cat, rec);
    match cat {
        "option" => {
            let mut out = vec![
                (id.clone(), SurfaceFormKind::Id),
                (display.clone(), SurfaceFormKind::Display),
                (display.to_ascii_lowercase(), SurfaceFormKind::LowerDisplay),
                (format!("NO_{display}"), SurfaceFormKind::NoPrefixDisplay),
                (format!("no_{id}"), SurfaceFormKind::NoPrefixId),
            ];
            out.retain(|(s, _)| !s.is_empty());
            out
        }
        "builtin" | "precmd_modifier" | "complex_command" | "reserved_word" | "keymap"
        | "zle_widget" | "mathfunc" | "comp_utility" | "special_function" | "special_param" => {
            if id.is_empty() {
                vec![]
            } else {
                vec![(id, SurfaceFormKind::Id)]
            }
        }
        _ => vec![],
    }
}

// --- Shared evaluation cores (used by the contract tests in `mod tests`
// below and by the tuning dashboard in `tune.rs`). The whole `contract`
// module is `#[cfg(test)]`, so these are test-build-only. ---

fn matches_expected(entry: &ContractEntry, top: &Identity) -> bool {
    match entry.predicate {
        Predicate::Top1InSet => entry.expected_set.iter().any(|e| e == top),
    }
}

/// Bare-layer predicate: lookup-map hard-promote subsumes the canonical-
/// form path, so a hit there is the test. No ranker invocation.
fn bare_predicate_holds(entry: &ContractEntry, idx: &LookupIndex) -> bool {
    let hit = match idx.lookup(&entry.query) {
        Some(h) => h,
        None => return false,
    };
    let top = Identity {
        category: hit.0.clone(),
        id: hit.1.clone(),
    };
    matches_expected(entry, &top)
}

fn format_failure(entry: &ContractEntry) -> String {
    format!(
        "  query={:?} record={}/{} surface={:?} phrasing={:?} expected={:?}",
        entry.query,
        entry.record.category,
        entry.record.id,
        entry.surface_form_kind,
        entry.phrasing_kind,
        entry.expected_set
    )
}

pub(crate) struct BareEval {
    pub bare_total: usize,
    pub skipped_decorated: usize,
    pub failures: Vec<String>,
}

/// Bare-layer contract evaluation: every bare entry must resolve via the
/// lookup map (hard-promote bypass). Pure on corpus + resolver — no
/// embedder/index. Shared by `lookup_contract_holds` and the dashboard
/// fast tier.
pub(crate) fn eval_bare(contract: &LookupContract, idx: &LookupIndex) -> BareEval {
    let mut failures: Vec<String> = Vec::new();
    let mut bare_total = 0;
    let mut skipped_decorated = 0;
    for entry in &contract.entries {
        if entry.phrasing_kind.is_decorated() {
            skipped_decorated += 1;
            continue;
        }
        bare_total += 1;
        if !bare_predicate_holds(entry, idx) {
            failures.push(format_failure(entry));
        }
    }
    BareEval {
        bare_total,
        skipped_decorated,
        failures,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::corpus::load_corpus;
    use crate::nlp::lookup_map::{self, LookupIndex};
    use crate::nlp::test_support::assert_committed_json;
    use std::path::PathBuf;

    fn committed_path() -> PathBuf {
        [
            env!("CARGO_MANIFEST_DIR"),
            "tests",
            "nlp-qa",
            "lookup-contract.json",
        ]
        .iter()
        .collect()
    }

    /// Drift check: regenerate from corpus, assert equality with the
    /// committed JSON or rewrite when `UPDATE_LOOKUP_CONTRACT=1`. Pure on
    /// corpus + resolver — no model/index assets required.
    #[test]
    fn lookup_contract_matches_committed() {
        let corpus = load_corpus().expect("load_corpus");
        let contract = build(&corpus);
        let generated = serde_json::to_string_pretty(&contract).expect("serialize") + "\n";
        assert_committed_json(&committed_path(), &generated, "UPDATE_LOOKUP_CONTRACT");
    }

    /// Bare-layer contract gate: every bare entry must resolve via the
    /// lookup map. Fast (~ms) — runs unconditionally so drift in the
    /// surface-form table or resolver canonicalization shows up without the
    /// embedder + index assets.
    #[test]
    fn lookup_contract_holds() {
        let corpus = load_corpus().expect("load_corpus");
        let contract = build(&corpus);
        let idx = LookupIndex::from_map(lookup_map::build(&corpus));
        let e = eval_bare(&contract, &idx);
        eprintln!(
            "[contract bare] {} entries, {} failures (skipped {} decorated)",
            e.bare_total,
            e.failures.len(),
            e.skipped_decorated
        );
        if !e.failures.is_empty() {
            panic!(
                "lookup-contract (bare layer) has {} failures:\n{}",
                e.failures.len(),
                e.failures.join("\n")
            );
        }
    }
}
