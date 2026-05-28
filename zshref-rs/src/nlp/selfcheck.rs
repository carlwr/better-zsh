//! Hidden checks that avoid loading the embedding model.

use crate::corpus::Corpus;
use crate::nlp::{index, rules};
use anyhow::{anyhow, Context, Result};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub enum Check {
    BuildFresh,
    Index { index_path: PathBuf },
    EmitRules { out_dir: PathBuf },
}

pub fn run(check: Check, corpus: &Corpus) -> Result<Value> {
    match check {
        Check::BuildFresh => {
            let hash = check_build_fresh()?;
            Ok(json!({ "checkBuildFresh": true, "buildInputHash": hash }))
        }
        Check::Index { index_path } => {
            let index = index::load(&index_path, corpus)?;
            Ok(json!({
                "validateIndex": true,
                "index": index_path.display().to_string(),
                "model": index.model,
                "dims": index.dims,
                "records": index.records.len()
            }))
        }
        Check::EmitRules { out_dir } => {
            rules::emit_rules_json(&out_dir)?;
            Ok(json!({
                "emitRules": true,
                "outDir": out_dir.display().to_string()
            }))
        }
    }
}

fn check_build_fresh() -> Result<String> {
    let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
    let baked = env!("ZSHREF_BUILD_INPUT_HASH");
    // Installed builds may not have the source manifest; trust the baked hash.
    if !manifest.join("build-inputs.txt").exists() {
        return Ok(baked.to_string());
    }
    let source = if cfg!(data_source = "vendored") {
        "vendored"
    } else {
        "monorepo"
    };
    let collected =
        crate::data_fingerprint::collect(manifest, source).context("collect build inputs")?;
    let current = crate::data_fingerprint::hash(&collected.entries).context("hash build inputs")?;
    if current != baked {
        return Err(anyhow!(
            "zshref binary is stale w.r.t. its embedded data inputs \
             (built {}…, source now {}…); rebuild with `make cli-nlp` before staging",
            &baked[..12],
            &current[..12],
        ));
    }
    Ok(current)
}
