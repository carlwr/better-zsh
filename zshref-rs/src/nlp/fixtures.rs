//! Cfg-gated tests that emit + drift-check NLP fixtures consumed by the TS
//! mirror in zshref-web. Curated query sets; `UPDATE_*_FIXTURE=1` rewrites
//! the committed JSON.
//!
//! Two distinct fixtures:
//!
//! - `parity-fixture.json` — a closed arithmetic contract: it ships the
//!   miniature index it was ranked against alongside the pre-computed
//!   `queryVec` + `resolverHit` per query, so the TS ranker reproduces
//!   byte-equal scores with neither an embedder nor the full index. Pins
//!   ranker math (curated for branch coverage: resolver hit, exact-word +
//!   category boost, short-body weighting, lexical overlap). Carrying its own
//!   index is recorded as a provisional decision in the web package's
//!   contributor doc.
//!
//! - `sanity-fixture.json` — hand-curated "clear winner" queries. The Rust
//!   side enforces invariants (top score above floor; comfortable margin
//!   over runner-up). The TS side runs the full pipeline (transformers.js
//!   embedder + ranker mirror) and asserts the top-1 identity. Pins
//!   full-stack behaviour at a coarser resolution than parity-fixture.
//!
//! Asset-dependent tests here skip quietly when the local NLP assets are
//! missing (`data-nlp/model/`, `data-nlp/index.json`);
//! `BZ_REQUIRE_NLP_ASSETS=1` flips skip → fail. The parity fixture is not
//! among them — it is self-contained (see `PARITY_INDEX_RECORDS`).

use crate::corpus::{load_corpus, Corpus};
use crate::nlp::index::{self, normalize, IndexedRecord, VectorIndex, ViewVectors};
use crate::nlp::model::Embedder;
use crate::nlp::rank;
use crate::nlp::retrieval_text::corpus_texts;
use crate::nlp::rules::{tuning, Tuning};
use crate::nlp::search::resolver_key;
use crate::nlp::test_support::assert_committed_json;
use anyhow::{Context, Result};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::OnceLock;

/// Parity-fixture curation: branch coverage in `rank.rs`. Order is
/// load-bearing — the fixture is positional. Queries are neutral
/// branch-exercisers, deliberately NOT drawn from any eval set (see NLP.md):
/// the fixture only snapshots ranker math for TS↔Rust parity, never a
/// "correct answer", so no holdout query belongs here.
const PARITY_QUERIES: &[&str] = &[
    // resolver_hit branch — option resolver normalizes "AUTO_CD" → (option, autocd).
    "AUTO_CD",
    // exact-word (id) match + category-name boost.
    "setopt builtin",
    // multi-word lexical overlap, no exact id match.
    "redirect output to a file",
    // short query — exercises short-body weighting in the top results.
    "glob qualifier flags",
];

const PARITY_LIMIT: usize = 5;
const PARITY_VERSION: u32 = 3;

/// Corpus records the fixture's miniature index is built from, by
/// `(category, id)`. Real records, so resolver hits and lexical overlap stay
/// meaningful; curated for the branches `PARITY_QUERIES` aims at. Category
/// sizes are deliberately unequal, which pins the rarity penalty the moment
/// its weight stops being zero. Order is load-bearing — the fixture is
/// positional.
const PARITY_INDEX_RECORDS: &[(&str, &str)] = &[
    // resolver-hit target of the "AUTO_CD" query; two more keep this the
    // largest category, i.e. the rarity baseline.
    ("option", "autocd"),
    ("option", "extendedglob"),
    ("option", "globdots"),
    // exact-word id match + category-name boost.
    ("builtin", "setopt"),
    ("builtin", "unsetopt"),
    // multi-word lexical overlap, no exact id match.
    ("redirection", ">_word"),
    ("redirection", ">>_word"),
    // short vs. long body inside one category — both ends of the short-body
    // weight ramp.
    ("glob_qualifier", "."),
    ("glob_qualifier", "f"),
];

/// Provenance of the fixture's index, in place of a model id and a corpus
/// hash: its vectors are generated rather than embedded, and neither field
/// would be true.
const PARITY_INDEX_TAG: &str = "synthetic:parity-fixture";

/// Sanity-fixture curation: queries that fire exact-word + category boosts
/// on a rare record name → predictable top-1 with comfortable margin.
/// Invariants are enforced by `sanity_invariants_hold`; if any query fails
/// them after a deliberate ranker change, re-curate (drop or replace the
/// query) rather than relaxing the invariants.
const SANITY_QUERIES: &[SanityQuery] = &[
    SanityQuery {
        query: "kshoptionprint option",
        expected_top: ("option", "kshoptionprint"),
    },
    SanityQuery {
        query: "autopushd option",
        expected_top: ("option", "autopushd"),
    },
    SanityQuery {
        query: "zmodload builtin",
        expected_top: ("builtin", "zmodload"),
    },
    SanityQuery {
        query: "rcexpandparam option",
        expected_top: ("option", "rcexpandparam"),
    },
    SanityQuery {
        query: "promptbang option",
        expected_top: ("option", "promptbang"),
    },
];

const SANITY_VERSION: u32 = 1;
const SANITY_ABSOLUTE_FLOOR: f32 = 0.70;
const SANITY_MIN_MARGIN: f32 = 0.03;

struct SanityQuery {
    query: &'static str,
    expected_top: (&'static str, &'static str),
}

#[derive(Serialize)]
struct ParityFixture<'a> {
    version: u32,
    limit: usize,
    index: VectorIndex,
    entries: Vec<ParityEntry<'a>>,
}

#[derive(Serialize)]
struct ParityEntry<'a> {
    query: &'a str,
    /// f32 values serialized via JSON's f64 (lossless). TS side reads into a
    /// Float32Array (or wraps arithmetic in Math.fround) so ranker math
    /// reproduces Rust's f32 results bit-for-bit. Synthetic, like the index
    /// vectors — see `synthetic_vec`.
    #[serde(rename = "queryVec")]
    query_vec: Vec<f32>,
    #[serde(rename = "resolverHit", skip_serializing_if = "Option::is_none")]
    resolver_hit: Option<Identity>,
    expected: Vec<Scored>,
}

#[derive(Serialize)]
struct SanityFixture<'a> {
    version: u32,
    invariants: SanityInvariants,
    entries: Vec<SanityEntry<'a>>,
}

#[derive(Serialize)]
struct SanityInvariants {
    #[serde(rename = "absoluteFloor")]
    absolute_floor: f32,
    #[serde(rename = "minMargin")]
    min_margin: f32,
}

#[derive(Serialize)]
struct SanityEntry<'a> {
    query: &'a str,
    #[serde(rename = "topMatch")]
    top_match: Scored,
    #[serde(rename = "runnerUp", skip_serializing_if = "Option::is_none")]
    runner_up: Option<Scored>,
}

#[derive(Clone, Serialize)]
struct Identity {
    category: String,
    id: String,
}

/// f32, serialized via f64 (lossless round-trip).
#[derive(Clone, Serialize)]
struct Scored {
    category: String,
    id: String,
    score: f32,
}

fn assets_dir() -> PathBuf {
    [env!("CARGO_MANIFEST_DIR"), "data-nlp"].iter().collect()
}

fn parity_path() -> PathBuf {
    [
        env!("CARGO_MANIFEST_DIR"),
        "tests",
        "nlp-qa",
        "parity-fixture.json",
    ]
    .iter()
    .collect()
}

fn sanity_path() -> PathBuf {
    [
        env!("CARGO_MANIFEST_DIR"),
        "tests",
        "nlp-qa",
        "sanity-fixture.json",
    ]
    .iter()
    .collect()
}

/// Env var that flips every asset-gated skip into a failure. One var for
/// all of them: they gate the identical predicate, so per-test names only
/// made a pipeline that stages assets easy to under-arm.
const REQUIRE_ASSETS_ENV: &str = "BZ_REQUIRE_NLP_ASSETS";

pub(crate) fn skip_if_assets_missing(label: &str) -> bool {
    let assets = assets_dir();
    let model = assets.join("model");
    let index = assets.join("index.json");
    if model.exists() && index.exists() {
        return false;
    }
    let msg = format!(
        "[skip] {label}: missing {} or {}",
        model.display(),
        index.display()
    );
    if std::env::var_os(REQUIRE_ASSETS_ENV).is_some() {
        panic!("{msg} ({REQUIRE_ASSETS_ENV}=1)");
    }
    eprintln!("{msg}");
    true
}

/// Single-shot loader cached for the test process (model + index are
/// expensive; cargo test runs all `#[test]`s in the same binary).
pub(crate) struct Assets {
    pub(crate) corpus: Corpus,
    pub(crate) index: VectorIndex,
    pub(crate) embedder: std::sync::Mutex<Embedder>,
}

pub(crate) fn assets() -> Result<&'static Assets> {
    static CACHE: OnceLock<Assets> = OnceLock::new();
    if let Some(a) = CACHE.get() {
        return Ok(a);
    }
    let corpus = load_corpus()?;
    let dir = assets_dir();
    let mut embedder = Embedder::from_dir(&dir.join("model")).context("load embedder")?;
    let index = if dir.join("index.json").exists() {
        index::load(&dir.join("index.json"), &corpus)?
    } else {
        index::build_with_embedder(&mut embedder, &corpus)?
    };
    let _ = CACHE.set(Assets {
        corpus,
        index,
        embedder: std::sync::Mutex::new(embedder),
    });
    Ok(CACHE.get().expect("just set"))
}

pub(crate) fn embed_query(query: &str) -> Result<Vec<f32>> {
    let assets = assets()?;
    let mut e = assets.embedder.lock().expect("mutex");
    // Same embedding-only expansion as production search (see `query_expand`).
    let embed_text = crate::nlp::query_expand::expanded_query(query);
    let mut v = e.embed(&[format!("query: {embed_text}")])?.remove(0);
    normalize(&mut v);
    Ok(v)
}

/// Batch variant — embeds a slice in one model call, returns normalized
/// vectors in input order. Amortizes model overhead across many queries.
pub(crate) fn embed_queries(queries: &[String]) -> Result<Vec<Vec<f32>>> {
    let assets = assets()?;
    let mut e = assets.embedder.lock().expect("mutex");
    let prefixed: Vec<String> = queries
        .iter()
        .map(|q| format!("query: {}", crate::nlp::query_expand::expanded_query(q)))
        .collect();
    let mut vecs = e.embed(&prefixed)?;
    for v in &mut vecs {
        normalize(v);
    }
    Ok(vecs)
}

/// Dedup `queries`, batch-embed the unique set once, and return an owned
/// query→vector map. For callers that rank many entries sharing query
/// strings (sentence-fixture + mechanical evals): embed once, look up
/// per entry.
pub(crate) fn embed_unique(
    queries: &[String],
) -> Result<std::collections::HashMap<String, Vec<f32>>> {
    let mut unique: Vec<String> = Vec::new();
    let mut seen: std::collections::BTreeSet<&str> = std::collections::BTreeSet::new();
    for q in queries {
        if seen.insert(q.as_str()) {
            unique.push(q.clone());
        }
    }
    let vecs = embed_queries(&unique)?;
    Ok(unique.into_iter().zip(vecs).collect())
}

/// Embed `query`, resolve via the corpus, and rank against the cached index.
/// Shared by every fixture/invariant call site so the chain stays in sync.
fn embed_resolve_rank<'a>(
    query: &str,
    assets: &'a Assets,
    tuning: &Tuning,
) -> (
    Vec<f32>,
    Option<rank::ResolverHit>,
    Vec<rank::RankedMatch<'a>>,
) {
    let query_vec = embed_query(query).expect("embed");
    let resolver_hit = resolver_key(query, None, &assets.corpus);
    let ranked = rank::rank(
        query,
        &query_vec,
        resolver_hit.as_ref(),
        None,
        &assets.index,
        tuning,
    );
    (query_vec, resolver_hit, ranked)
}

/// Unconditional — no asset gate. The fixture carries its own index and every
/// vector in it is generated, so emitting and checking it need only the
/// corpus already embedded in this binary.
#[test]
fn parity_fixture_matches_committed() {
    let corpus = load_corpus().expect("load corpus");
    let index = parity_index(&corpus);
    let entries: Vec<ParityEntry<'_>> = PARITY_QUERIES
        .iter()
        .map(|q| build_parity_entry(q, &index, &corpus, tuning()))
        .collect();
    let fixture = ParityFixture {
        version: PARITY_VERSION,
        limit: PARITY_LIMIT,
        index,
        entries,
    };
    let generated = serde_json::to_string_pretty(&fixture).expect("serialize") + "\n";
    assert_committed_json(&parity_path(), &generated, "UPDATE_PARITY_FIXTURE");
}

fn parity_index(corpus: &Corpus) -> VectorIndex {
    let texts = corpus_texts(corpus);
    let records = PARITY_INDEX_RECORDS
        .iter()
        .map(|(cat, id)| IndexedRecord {
            text: texts
                .iter()
                .find(|t| t.category == *cat && t.id == *id)
                .unwrap_or_else(|| panic!("parity index record {cat}/{id} is not in the corpus"))
                .clone(),
            vectors: ViewVectors {
                structured: synthetic_vec(&[cat, id, "structured"]),
                body: synthetic_vec(&[cat, id, "body"]),
                expanded: synthetic_vec(&[cat, id, "expanded"]),
            },
        })
        .collect();
    VectorIndex {
        version: index::INDEX_VERSION,
        model: PARITY_INDEX_TAG.to_string(),
        dims: index::DIMS,
        normalized: true,
        corpus_hash: PARITY_INDEX_TAG.to_string(),
        records,
    }
}

/// Stand-in for an embedding: a fixed-seed stream keyed by the vector's
/// identity, normalized like a real one. Parity asserts that two
/// implementations of the same arithmetic agree, never that retrieval is
/// good — so the numbers need to be reproducible, not meaningful, and
/// generating them is what takes the 127M model out of the contract.
fn synthetic_vec(key: &[&str]) -> Vec<f32> {
    let mut state = fnv1a(key) | 1;
    let mut v = Vec::with_capacity(index::DIMS);
    for _ in 0..index::DIMS {
        // splitmix64
        state = state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^= z >> 31;
        // Top 24 bits over 2^23: every step is exact in f32, so the spread
        // over [-1, 1) carries no rounding bias.
        v.push((z >> 40) as f32 / 8_388_608.0 - 1.0);
    }
    normalize(&mut v);
    v
}

fn fnv1a(parts: &[&str]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for p in parts {
        // Trailing 0xff separates the parts, so ("ab", "c") and ("a", "bc")
        // do not collide.
        for b in p.as_bytes().iter().chain(std::iter::once(&0xff)) {
            h ^= u64::from(*b);
            h = h.wrapping_mul(0x100_0000_01b3);
        }
    }
    h
}

fn scored(m: &rank::RankedMatch<'_>) -> Scored {
    Scored {
        category: m.rec.category.clone(),
        id: m.rec.id.clone(),
        score: m.score,
    }
}

fn build_parity_entry<'a>(
    query: &'a str,
    index: &VectorIndex,
    corpus: &Corpus,
    tuning: &Tuning,
) -> ParityEntry<'a> {
    let query_vec = synthetic_vec(&["query", query]);
    let resolver_hit = resolver_key(query, None, corpus);
    let ranked = rank::rank(
        query,
        &query_vec,
        resolver_hit.as_ref(),
        None,
        index,
        tuning,
    );
    let expected: Vec<Scored> = ranked.iter().take(PARITY_LIMIT).map(scored).collect();
    ParityEntry {
        query,
        query_vec,
        resolver_hit: resolver_hit.map(|(category, id)| Identity { category, id }),
        expected,
    }
}

#[test]
fn sanity_fixture_matches_committed() {
    if skip_if_assets_missing("sanity_fixture") {
        return;
    }
    let assets = assets().expect("load assets");
    let entries: Vec<SanityEntry<'_>> = SANITY_QUERIES
        .iter()
        .map(|q| build_sanity_entry(q, assets))
        .collect();
    let fixture = SanityFixture {
        version: SANITY_VERSION,
        invariants: SanityInvariants {
            absolute_floor: SANITY_ABSOLUTE_FLOOR,
            min_margin: SANITY_MIN_MARGIN,
        },
        entries,
    };
    let generated = serde_json::to_string_pretty(&fixture).expect("serialize") + "\n";
    assert_committed_json(&sanity_path(), &generated, "UPDATE_SANITY_FIXTURE");
}

fn build_sanity_entry<'a>(q: &'a SanityQuery, assets: &Assets) -> SanityEntry<'a> {
    let (_, _, ranked) = embed_resolve_rank(q.query, assets, tuning());
    let top = ranked.first().expect("non-empty ranking");
    let runner = ranked.get(1);
    SanityEntry {
        query: q.query,
        top_match: scored(top),
        runner_up: runner.map(scored),
    }
}

/// Per-query sanity outcome (actual top-1 + runner-up scores vs. the
/// curated expectation). Produced by [`eval_sanity`]; the invariants test
/// asserts on [`SanityEval::failures`], the dashboard renders a summary.
pub(crate) struct SanityResult {
    pub query: &'static str,
    pub top: (String, String),
    pub expected_top: (&'static str, &'static str),
    pub top_score: f32,
    pub runner_score: Option<f32>,
}

pub(crate) struct SanityEval {
    pub results: Vec<SanityResult>,
}

impl SanityEval {
    /// One message per violated invariant (identity drift / floor / margin).
    /// Empty ⇒ all sanity queries hold. Same wording the test asserts on.
    pub fn failures(&self) -> Vec<String> {
        let mut out = Vec::new();
        for r in &self.results {
            let label = format!("sanity query {:?}", r.query);
            if (r.top.0.as_str(), r.top.1.as_str()) != r.expected_top {
                out.push(format!(
                    "{label}: top identity drifted from curated expected_top \
                     (got {}/{}, want {}/{})",
                    r.top.0, r.top.1, r.expected_top.0, r.expected_top.1
                ));
            }
            if r.top_score < SANITY_ABSOLUTE_FLOOR {
                out.push(format!(
                    "{label}: top score {} below absoluteFloor {}",
                    r.top_score, SANITY_ABSOLUTE_FLOOR
                ));
            }
            if let Some(rs) = r.runner_score {
                if r.top_score - rs < SANITY_MIN_MARGIN {
                    out.push(format!(
                        "{label}: margin {} below minMargin {} (top {}, runnerUp {})",
                        r.top_score - rs,
                        SANITY_MIN_MARGIN,
                        r.top_score,
                        rs
                    ));
                }
            }
        }
        out
    }

    pub fn render(&self) -> String {
        let fails = self.failures();
        let worst_floor = self
            .results
            .iter()
            .map(|r| r.top_score)
            .fold(f32::INFINITY, f32::min);
        let worst_margin = self
            .results
            .iter()
            .filter_map(|r| r.runner_score.map(|rs| r.top_score - rs))
            .fold(f32::INFINITY, f32::min);
        format!(
            "[sanity] {}/{} hold  floor≥{SANITY_ABSOLUTE_FLOOR} (worst {worst_floor:.3})  \
             margin≥{SANITY_MIN_MARGIN} (worst {worst_margin:.3}){}\n",
            self.results.len() - fails.len(),
            self.results.len(),
            if fails.is_empty() {
                String::new()
            } else {
                format!("\n  {}", fails.join("\n  "))
            }
        )
    }
}

/// Run the full pipeline (embed → rank) over the curated sanity queries and
/// capture each top-1 / runner-up. `tuning` is threaded for a future
/// in-process search; callers pass the committed `tuning()`.
pub(crate) fn eval_sanity(assets: &Assets, tuning: &Tuning) -> SanityEval {
    let results = SANITY_QUERIES
        .iter()
        .map(|q| {
            let (_, _, ranked) = embed_resolve_rank(q.query, assets, tuning);
            let top = ranked.first().expect("non-empty ranking");
            let runner = ranked.get(1);
            SanityResult {
                query: q.query,
                top: (top.rec.category.clone(), top.rec.id.clone()),
                expected_top: q.expected_top,
                top_score: top.score,
                runner_score: runner.map(|r| r.score),
            }
        })
        .collect();
    SanityEval { results }
}

/// Invariant check (no UPDATE flag). Each curated sanity query must produce
/// an unambiguous top-1: identity matches the curation, top.score >=
/// absoluteFloor, and top.score − runnerUp.score >= minMargin. Failure →
/// re-curate; do not relax invariants.
#[test]
fn sanity_invariants_hold() {
    if skip_if_assets_missing("sanity_invariants") {
        return;
    }
    let assets = assets().expect("load assets");
    let failures = eval_sanity(assets, tuning()).failures();
    assert!(
        failures.is_empty(),
        "sanity invariants violated (re-curate the query list; do not relax \
         invariants):\n{}",
        failures.join("\n")
    );
}

/// Locks `index::validate`: it must reject an index that no longer matches
/// this binary's corpus. Needs the index file but not the model (`validate`
/// never embeds); re-loads per case since `VectorIndex` isn't `Clone`.
#[test]
fn validate_rejects_tampered_index() {
    if skip_if_assets_missing("validate_index") {
        return;
    }
    let corpus = load_corpus().expect("load_corpus");
    let path = assets_dir().join("index.json");
    let load = || index::load(&path, &corpus).expect("baseline index validates");

    assert!(index::validate(&load(), &corpus).is_ok(), "baseline");

    let mut bad_hash = load();
    bad_hash.corpus_hash = "0".repeat(64);
    assert!(index::validate(&bad_hash, &corpus).is_err(), "corpus_hash");

    let mut dropped = load();
    dropped.records.pop();
    assert!(index::validate(&dropped, &corpus).is_err(), "record count");

    let mut short_vec = load();
    short_vec.records[0].vectors.body.truncate(1);
    assert!(index::validate(&short_vec, &corpus).is_err(), "view dims");
}
