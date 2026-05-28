use crate::corpus::Corpus;
use crate::nlp::model::Embedder;
use crate::nlp::retrieval_text::{corpus_texts, text_for_role, RecordText};
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

pub const MODEL_ID: &str = "BAAI/bge-small-en-v1.5";
pub const DIMS: usize = 384;
pub const VIEWS: &[&str] = &["structured", "body", "expanded"];
pub const INDEX_VERSION: u32 = 2;
const INDEX_EMBED_CHUNK: usize = 32;

#[derive(Debug, Deserialize, Serialize)]
pub struct VectorIndex {
    pub version: u32,
    pub model: String,
    pub dims: usize,
    pub normalized: bool,
    pub corpus_hash: String,
    pub records: Vec<IndexedRecord>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct IndexedRecord {
    pub text: RecordText,
    pub vectors: ViewVectors,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ViewVectors {
    pub structured: Vec<f32>,
    pub body: Vec<f32>,
    pub expanded: Vec<f32>,
}

pub fn write(path: &Path, index: &VectorIndex) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("create {}", parent.display()))?;
    }
    let bytes = serde_json::to_vec(index)?;
    fs::write(path, bytes).with_context(|| format!("write {}", path.display()))
}

pub fn load(path: &Path, corpus: &Corpus) -> Result<VectorIndex> {
    let bytes = fs::read(path).with_context(|| format!("read {}", path.display()))?;
    let index: VectorIndex =
        serde_json::from_slice(&bytes).with_context(|| format!("parse {}", path.display()))?;
    validate(&index, corpus).with_context(|| format!("validate {}", path.display()))?;
    Ok(index)
}

pub fn build_with_embedder(embedder: &mut Embedder, corpus: &Corpus) -> Result<VectorIndex> {
    let texts = corpus_texts(corpus);
    let view_texts: Vec<String> = texts
        .iter()
        .flat_map(|rec| {
            VIEWS
                .iter()
                .map(move |view| format!("passage: {}", text_for_role(rec, view)))
        })
        .collect();
    let mut vectors = Vec::with_capacity(view_texts.len());
    for chunk in view_texts.chunks(INDEX_EMBED_CHUNK) {
        vectors.extend(embedder.embed(chunk)?);
    }
    let expected = texts.len() * VIEWS.len();
    if vectors.len() != expected {
        return Err(anyhow!(
            "model returned {} vectors for {expected} retrieval views",
            vectors.len()
        ));
    }
    for v in &mut vectors {
        normalize(v);
    }

    // `vectors` is flat in VIEWS order per record; the positional field
    // assignment below must match it (structured, body, expanded).
    let mut records = Vec::with_capacity(texts.len());
    let mut vectors = vectors.into_iter();
    for rec in texts {
        records.push(IndexedRecord {
            text: rec,
            vectors: ViewVectors {
                structured: vectors.next().expect("vector count checked"),
                body: vectors.next().expect("vector count checked"),
                expanded: vectors.next().expect("vector count checked"),
            },
        });
    }

    let index = VectorIndex {
        version: INDEX_VERSION,
        model: MODEL_ID.to_string(),
        dims: DIMS,
        normalized: true,
        corpus_hash: corpus_hash(corpus)?,
        records,
    };
    validate(&index, corpus)?;
    Ok(index)
}

pub fn validate(index: &VectorIndex, corpus: &Corpus) -> Result<()> {
    if index.version != INDEX_VERSION {
        return Err(anyhow!("unsupported nlp index version {}", index.version));
    }
    if index.model != MODEL_ID {
        return Err(anyhow!(
            "nlp index model is {}, expected {MODEL_ID}",
            index.model
        ));
    }
    if index.dims != DIMS {
        return Err(anyhow!("nlp index dims is {}, expected {DIMS}", index.dims));
    }
    if index.corpus_hash != corpus_hash(corpus)? {
        return Err(anyhow!(
            "nlp index corpus hash does not match this binary; rerun with --rebuild-index"
        ));
    }
    if !index.normalized {
        return Err(anyhow!("nlp index vectors are not marked normalized"));
    }
    let expected = corpus_texts(corpus);
    if index.records.len() != expected.len() {
        return Err(anyhow!(
            "nlp index has {} records, expected {}; rerun with --rebuild-index",
            index.records.len(),
            expected.len()
        ));
    }
    for (i, rec) in index.records.iter().enumerate() {
        let want = &expected[i];
        if rec.text != *want {
            return Err(anyhow!(
                "nlp index record {i} is {}/{}, expected {}/{}; rerun with --rebuild-index",
                rec.text.category,
                rec.text.id,
                want.category,
                want.id,
            ));
        }
        for (view, vec) in [
            ("structured", &rec.vectors.structured),
            ("body", &rec.vectors.body),
            ("expanded", &rec.vectors.expanded),
        ] {
            if vec.len() != DIMS {
                return Err(anyhow!(
                    "record {i} view {view} has {} dims, expected {DIMS}",
                    vec.len()
                ));
            }
        }
    }
    Ok(())
}

fn corpus_hash(corpus: &Corpus) -> Result<String> {
    let mut h = Sha256::new();
    h.update(corpus.index.package_version.as_bytes());
    h.update([0]);
    h.update(corpus.index.zsh_upstream.tag.as_bytes());
    h.update([0]);
    for cat in &corpus.categories {
        h.update(cat.name.as_bytes());
        h.update([0]);
        for rec in &cat.records {
            let bytes = serde_json::to_vec(rec)?;
            h.update(bytes.len().to_string().as_bytes());
            h.update([0]);
            h.update(bytes);
            h.update([0]);
        }
    }
    Ok(format!("{:x}", h.finalize()))
}

pub fn normalize(v: &mut [f32]) {
    let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in v {
            *x /= norm;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_makes_unit_vector() {
        let mut v = vec![3.0, 4.0];
        normalize(&mut v);
        assert!((v[0] - 0.6).abs() < 0.0001);
        assert!((v[1] - 0.8).abs() < 0.0001);
    }
}
