use crate::nlp::index::DIMS;
use anyhow::{anyhow, Context, Result};
use fastembed::{
    InitOptionsUserDefined, Pooling, QuantizationMode, TextEmbedding, TokenizerFiles,
    UserDefinedEmbeddingModel,
};
use std::fs;
use std::path::{Path, PathBuf};

pub struct Embedder {
    inner: TextEmbedding,
}

impl Embedder {
    pub fn from_dir(dir: &Path) -> Result<Self> {
        let model = UserDefinedEmbeddingModel::new(
            read_model_file(dir)?,
            TokenizerFiles {
                tokenizer_file: read_required(dir, "tokenizer.json")?,
                config_file: read_required(dir, "config.json")?,
                special_tokens_map_file: read_required(dir, "special_tokens_map.json")?,
                tokenizer_config_file: read_required(dir, "tokenizer_config.json")?,
            },
        )
        .with_pooling(Pooling::Cls)
        .with_quantization(QuantizationMode::None);
        let options = InitOptionsUserDefined::new().with_max_length(512);
        let inner = TextEmbedding::try_new_from_user_defined(model, options)
            .with_context(|| format!("load local model from {}", dir.display()))?;
        Ok(Self { inner })
    }

    pub fn embed(&mut self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        let out = self.inner.embed(texts, None)?;
        for (i, v) in out.iter().enumerate() {
            if v.len() != DIMS {
                return Err(anyhow!(
                    "embedding {i} has {} dims, expected {DIMS}",
                    v.len()
                ));
            }
        }
        Ok(out)
    }
}

fn read_model_file(dir: &Path) -> Result<Vec<u8>> {
    let candidates = [dir.join("model.onnx"), dir.join("onnx/model.onnx")];
    for path in &candidates {
        if path.exists() {
            return fs::read(path).with_context(|| format!("read {}", path.display()));
        }
    }
    Err(anyhow!(
        "missing local model file; expected {} or {}",
        candidates[0].display(),
        candidates[1].display()
    ))
}

fn read_required(dir: &Path, file: &str) -> Result<Vec<u8>> {
    let path: PathBuf = dir.join(file);
    fs::read(&path).with_context(|| format!("read {}", path.display()))
}
