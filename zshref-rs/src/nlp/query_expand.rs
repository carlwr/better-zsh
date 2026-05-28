// WEB-MIRRORED-IN: zshref-web/src/lib/ranker/query-expand.ts
//
// Query-time, embedding-only synonym expansion. Maps colloquial query
// vocabulary onto the corpus's canonical term by appending the canonical word
// to the string that gets EMBEDDED — the caller keeps passing the raw query to
// the ranker, so expansion never enters the lexical-overlap bag. That split is
// the anti-swamp guard: lexical credit for a synonym would promote records that
// merely contain the literal token (see nlp-observations.md).

use crate::nlp::rules::QueryExpansion;

// A short cap: even with one canonical term per rule, several rules firing on a
// 1-2 word query would pull its embedding toward a generic centroid. Bounding
// the appended terms keeps the user's actual words dominant.
const MAX_APPENDED: usize = 2;

/// Return the query text to embed: the raw query with up to [`MAX_APPENDED`]
/// canonical terms appended for any matching directional rule. A canonical
/// term already present in the query is skipped (no self-expansion, no dupes).
pub fn expand_query_for_embedding(query: &str, rules: &[QueryExpansion]) -> String {
    let hay = query.to_ascii_lowercase();
    let mut adds: Vec<&str> = Vec::new();
    for rule in rules {
        if adds.len() >= MAX_APPENDED {
            break;
        }
        let add = rule.add.as_str();
        if word_in(&hay, add) || adds.contains(&add) {
            continue;
        }
        if rule.when.iter().any(|w| word_in(&hay, w)) {
            adds.push(add);
        }
    }
    if adds.is_empty() {
        return query.to_string();
    }
    let mut out = query.to_string();
    for add in adds {
        out.push(' ');
        out.push_str(add);
    }
    out
}

/// Glue: expand `query` against the embedded `query_expansions` rules. Every
/// embed site (search + fixtures) routes through this so the embedded text
/// stays identical across production and the parity/sanity fixtures.
pub fn expanded_query(query: &str) -> String {
    expand_query_for_embedding(query, &crate::nlp::rules::synonyms().query_expansions)
}

/// Whole-word match; multi-word needles match as a substring phrase. Mirrors
/// `retrieval_text::hay_has_word` minus the single-symbol case (triggers and
/// canonical terms are alphanumeric words).
fn word_in(hay: &str, needle: &str) -> bool {
    if needle.contains(' ') {
        return hay.contains(needle);
    }
    hay.split(|c: char| !c.is_ascii_alphanumeric())
        .any(|w| w.eq_ignore_ascii_case(needle))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(when: &[&str], add: &str) -> QueryExpansion {
        QueryExpansion {
            when: when.iter().map(|s| s.to_string()).collect(),
            add: add.to_string(),
        }
    }

    #[test]
    fn appends_canonical_on_trigger() {
        let rules = [rule(&["setting", "settings"], "option")];
        assert_eq!(
            expand_query_for_embedding("toggle a setting", &rules),
            "toggle a setting option"
        );
    }

    #[test]
    fn no_trigger_leaves_query_untouched() {
        let rules = [rule(&["setting"], "option")];
        assert_eq!(
            expand_query_for_embedding("list aliases", &rules),
            "list aliases"
        );
    }

    #[test]
    fn canonical_already_present_is_not_appended() {
        let rules = [rule(&["setting"], "option")];
        // "options" is a different word; "option" as a whole word is absent, so
        // the trigger still appends — but an exact canonical word blocks it.
        assert_eq!(
            expand_query_for_embedding("setting option", &rules),
            "setting option"
        );
    }

    #[test]
    fn whole_word_only_no_substring_trigger() {
        let rules = [rule(&["env"], "environment")];
        // "prevent" contains "env" as a substring but not as a word.
        assert_eq!(
            expand_query_for_embedding("prevent errors", &rules),
            "prevent errors"
        );
    }

    #[test]
    fn append_count_is_capped() {
        let rules = [
            rule(&["a"], "one"),
            rule(&["b"], "two"),
            rule(&["c"], "three"),
        ];
        assert_eq!(expand_query_for_embedding("a b c", &rules), "a b c one two");
    }
}
