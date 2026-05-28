//! Drift guard for the held-out QA corpus.
//!
//! `tests/nlp-qa/nlp-corpus.yaml` declares `$schema: ./schema.json` but its
//! only runtime consumer (`tests/nlp-qa/run-qa.mjs`) parses the YAML without
//! enforcing that schema. This keeps the data ⟷ schema contract honest as part
//! of the ordinary `cargo test --features nlp` run, so drift is caught even
//! when the (manual) QA harness isn't exercised.

#[cfg(test)]
mod tests {
    use jsonschema::{Draft, JSONSchema};
    use serde_json::Value;
    use std::path::PathBuf;

    fn nlp_qa_path(name: &str) -> PathBuf {
        [env!("CARGO_MANIFEST_DIR"), "tests", "nlp-qa", name]
            .iter()
            .collect()
    }

    #[test]
    fn nlp_corpus_matches_schema() {
        let mut schema: Value = serde_json::from_slice(
            &std::fs::read(nlp_qa_path("schema.json")).expect("read schema.json"),
        )
        .expect("parse schema.json");
        // The committed `$id` ("nlp-qa-corpus") is a bare relative URI, which
        // the validator rejects as a base URL. All `$ref`s are document-local
        // (`#/$defs/...`), so dropping `$id` does not change resolution.
        if let Some(obj) = schema.as_object_mut() {
            obj.remove("$id");
        }
        let corpus: Value = serde_yaml_ng::from_str(
            &std::fs::read_to_string(nlp_qa_path("nlp-corpus.yaml")).expect("read nlp-corpus.yaml"),
        )
        .expect("parse nlp-corpus.yaml");
        let validator = JSONSchema::options()
            .with_draft(Draft::Draft202012)
            .compile(&schema)
            .expect("compile schema.json");
        // Collect into owned strings in one statement so the borrowing error
        // iterator is dropped before `validator`/`corpus` go out of scope.
        let errors: Vec<String> = validator
            .validate(&corpus)
            .err()
            .map(|errs| {
                errs.map(|e| format!("  - {e} (path: {})", e.instance_path))
                    .collect()
            })
            .unwrap_or_default();
        assert!(
            errors.is_empty(),
            "nlp-corpus.yaml violates its declared schema.json:\n{}",
            errors.join("\n"),
        );
    }
}
