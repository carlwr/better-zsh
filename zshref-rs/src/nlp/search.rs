use crate::corpus::Corpus;
use crate::nlp::index::{self, normalize};
use crate::nlp::lookup_map::{self, LookupIndex};
use crate::nlp::model::Embedder;
use crate::nlp::rank;
use crate::nlp::rules::tuning;
use crate::resolver::resolve_in;
use anyhow::{anyhow, Result};
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

// Experiment-local asset defaults.  Relative values resolve from the Cargo
// manifest directory so `zshref-rs/data-nlp/` works from any current directory.
pub const DEFAULT_MODEL_DIR: &str = "data-nlp/model";
pub const DEFAULT_INDEX_PATH: &str = "data-nlp/index.json";

pub struct Input {
    pub query: String,
    pub limit: usize,
    pub category: Option<String>,
    pub debug: bool,
    pub model_dir: PathBuf,
    pub index_path: PathBuf,
    pub rebuild_index: bool,
}

#[derive(Clone, PartialEq)]
struct Assets {
    model_dir: PathBuf,
    index_path: PathBuf,
}

struct Loaded {
    assets: Assets,
    index: index::VectorIndex,
    embedder: Embedder,
    lookup_map: LookupIndex,
}

pub struct Searcher<'a> {
    corpus: &'a Corpus,
    loaded: Option<Loaded>,
}

impl<'a> Searcher<'a> {
    pub fn new(corpus: &'a Corpus) -> Self {
        Self {
            corpus,
            loaded: None,
        }
    }

    pub fn run(&mut self, input: Input) -> Result<Value> {
        run_with_searcher(input, self)
    }

    fn loaded(&mut self, input: &Input) -> Result<&mut Loaded> {
        let assets = Assets {
            model_dir: input.model_dir.clone(),
            index_path: input.index_path.clone(),
        };
        let reload = input.rebuild_index
            || self
                .loaded
                .as_ref()
                .is_none_or(|loaded| loaded.assets != assets);
        if reload {
            self.loaded = Some(load_assets(assets, input.rebuild_index, self.corpus)?);
        }
        Ok(self.loaded.as_mut().expect("loaded is initialized"))
    }
}

pub fn run(input: Input, corpus: &Corpus) -> Result<Value> {
    let mut searcher = Searcher::new(corpus);
    searcher.run(input)
}

fn run_with_searcher(input: Input, searcher: &mut Searcher<'_>) -> Result<Value> {
    let query = input.query.trim();
    if query.is_empty() {
        return Ok(json!({
            "query": input.query,
            "matches": [],
            "matchesReturned": 0,
            "matchesTotal": 0
        }));
    }

    let corpus = searcher.corpus;
    let category = input.category.as_deref();
    let loaded = searcher.loaded(&input)?;
    // Embedding-only synonym expansion: `query` (raw) still drives lexical
    // boosts in `rank`; only the embedded text is expanded.
    let embed_text = crate::nlp::query_expand::expanded_query(query);
    let mut query_vec = loaded
        .embedder
        .embed(&[format!("query: {embed_text}")])?
        .remove(0);
    normalize(&mut query_vec);
    let resolver_hit = resolver_key(query, category, corpus);
    let map_hit = loaded
        .lookup_map
        .lookup(query)
        .filter(|(c, _)| category.is_none_or(|cat| cat == c.as_str()))
        .cloned();
    let mut ranked = rank::rank(
        query,
        &query_vec,
        resolver_hit.as_ref(),
        category,
        &loaded.index,
        tuning(),
    );
    if let Some((hit_cat, hit_id)) = &map_hit {
        promote_to_top(&mut ranked, hit_cat, hit_id);
    }
    let total = ranked.len();
    let matches: Vec<Value> = ranked
        .into_iter()
        .take(input.limit)
        .map(|m| match_json(&m, input.debug))
        .collect();

    Ok(json!({
        "query": input.query,
        "matches": matches,
        "matchesReturned": matches.len(),
        "matchesTotal": total
    }))
}

/// Hard-promote the lookup-map's claimed record to slot 0 of `ranked`, if
/// present. The resolver's claim is categorical, not probabilistic, so it
/// bypasses ranker math for the top slot; slots 1..N keep ranker order.
/// Shared by production search and the test-only contract / sentence-fixture
/// evals so the promote can't drift across copies.
pub(crate) fn promote_to_top<'a>(ranked: &mut Vec<rank::RankedMatch<'a>>, cat: &str, id: &str) {
    if let Some(pos) = ranked
        .iter()
        .position(|m| m.rec.category.as_str() == cat && m.rec.id.as_str() == id)
    {
        if pos != 0 {
            let hit = ranked.remove(pos);
            ranked.insert(0, hit);
        }
    }
}

fn load_assets(assets: Assets, rebuild_index: bool, corpus: &Corpus) -> Result<Loaded> {
    let lookup_map = LookupIndex::from_map(lookup_map::build(corpus));
    if rebuild_index {
        // Only `--rebuild-index` writes to disk; a plain search never does.
        let mut embedder = Embedder::from_dir(&assets.model_dir)?;
        let index = index::build_with_embedder(&mut embedder, corpus)?;
        index::write(&assets.index_path, &index)?;
        return Ok(Loaded {
            assets,
            index,
            embedder,
            lookup_map,
        });
    }
    if !assets.index_path.exists() {
        return Err(anyhow!(
            "nlp index not found at {}; generate it with --rebuild-index",
            assets.index_path.display()
        ));
    }
    Ok(Loaded {
        index: index::load(&assets.index_path, corpus)?,
        embedder: Embedder::from_dir(&assets.model_dir)?,
        assets,
        lookup_map,
    })
}

pub fn input_from_json(input: &Value) -> Result<Input> {
    let obj = input
        .as_object()
        .ok_or_else(|| anyhow!("`input` must be a JSON object"))?;
    let query = obj
        .get("query")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow!("missing required field: `query`"))?
        .to_string();
    let limit = obj.get("limit").and_then(Value::as_u64).unwrap_or(10) as usize;
    let category = obj
        .get("category")
        .and_then(Value::as_str)
        .map(str::to_string);
    let debug = obj.get("debug").and_then(Value::as_bool).unwrap_or(false);
    let model_dir = path_field(obj.get("modelDir"), DEFAULT_MODEL_DIR)?;
    let index_path = path_field(obj.get("index"), DEFAULT_INDEX_PATH)?;
    let rebuild_index = obj
        .get("rebuildIndex")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Ok(Input {
        query,
        limit,
        category,
        debug,
        model_dir,
        index_path,
        rebuild_index,
    })
}

fn path_field(value: Option<&Value>, default: &str) -> Result<PathBuf> {
    match value {
        Some(Value::String(path)) => Ok(resolve_path(path, default)),
        Some(_) => Err(anyhow!("path fields must be strings")),
        None => Ok(default_asset_path(default)),
    }
}

pub fn resolve_path(raw: &str, default: &str) -> PathBuf {
    if raw == default {
        return default_asset_path(default);
    }
    raw.into()
}

pub fn default_asset_path(relative: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join(relative)
}

/// Direct-or-resolver corpus lookup for a query, used as the `resolver_hit`
/// boost input to `rank::rank`. zshref-web has no resolver and always passes
/// `None`; the parity-fixture ships this value pre-computed.
pub(crate) fn resolver_key(
    query: &str,
    category: Option<&str>,
    corpus: &Corpus,
) -> Option<rank::ResolverHit> {
    let cats: Vec<&str> = match category {
        Some(cat) => vec![cat],
        None => crate::corpus::CLASSIFY_ORDER.to_vec(),
    };
    cats.iter()
        .find_map(|cat| resolve_in(corpus, cat, query))
        .map(|h| (h.category.to_string(), h.id))
}

fn match_json(m: &rank::RankedMatch<'_>, debug: bool) -> Value {
    let mut obj = Map::new();
    obj.insert(
        "title".into(),
        Value::String(format!("{}: {}", m.rec.category_label, m.rec.display)),
    );
    obj.insert(
        "category".into(),
        json!({ "id": m.rec.category, "label": m.rec.category_label }),
    );
    obj.insert("id".into(), Value::String(m.rec.id.clone()));
    obj.insert("display".into(), Value::String(m.rec.display.clone()));
    if let Some(sk) = &m.rec.sub_kind {
        obj.insert("subKind".into(), Value::String(sk.clone()));
    }
    obj.insert("score".into(), json!(rounded(m.score)));
    obj.insert("mdBody".into(), Value::String(m.rec.md_body.clone()));

    if debug {
        obj.insert(
            "debug".into(),
            json!({
                "semantic": {
                    "structured": rounded(m.debug.semantic.structured),
                    "body": rounded(m.debug.semantic.body),
                    "expanded": rounded(m.debug.semantic.expanded)
                },
                "boosts": {
                    "category": rounded(m.debug.boosts.category),
                    "resolver": rounded(m.debug.boosts.resolver),
                    "lexical": rounded(m.debug.boosts.lexical)
                },
                "retrievalText": {
                    "structured": m.rec.structured,
                    "body": m.rec.body,
                    "expanded": m.rec.expanded
                }
            }),
        );
    }
    Value::Object(obj)
}

fn rounded(v: f32) -> f64 {
    (f64::from(v) * 1_000_000.0).round() / 1_000_000.0
}
