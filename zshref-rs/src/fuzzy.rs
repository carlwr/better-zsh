//! ASCII-only case-insensitive subsequence matcher: "is P a subsequence of
//! H, and how clean a match" — the exact/prefix tiers are the caller's.
//! Scores are unitless and only meaningful for ranking.

/// `None` when either side is non-ASCII (never a panic on drifted input),
/// `pattern` is empty, or `pattern` is not a case-insensitive subsequence
/// of `haystack`; otherwise a positive score, higher = better, with a
/// case-insensitive exact match at `u32::MAX`.
pub fn score(pattern: &str, haystack: &str) -> Option<u32> {
    if !pattern.is_ascii() || !haystack.is_ascii() {
        return None;
    }
    let pat = pattern.as_bytes();
    let hay = haystack.as_bytes();
    if pat.is_empty() || pat.len() > hay.len() {
        return None;
    }
    if hay.eq_ignore_ascii_case(pat) {
        return Some(u32::MAX);
    }

    // Greedy left-to-right walk: ids are short and structured (`AUTO_PUSHD_MINUS`),
    // so backtracking for the best subsequence is not worth its complexity.
    let mut positions: Vec<usize> = Vec::with_capacity(pat.len());
    let mut i = 0usize;
    for (j, &h) in hay.iter().enumerate() {
        if i == pat.len() {
            break;
        }
        if h.eq_ignore_ascii_case(&pat[i]) {
            positions.push(j);
            i += 1;
        }
    }
    if i < pat.len() {
        return None;
    }

    // Base 100; +200 for a match at position 0; +15 per adjacent matched
    // pair; +10 per match on a word boundary (`_ - . /`, space, start);
    // −1 per offset of the first match; −len/8 to favour denser hits.
    // Computed in i64, clamped to ≥ 1.
    let mut s: i64 = 100;
    if positions[0] == 0 {
        s += 200;
    }
    s -= positions[0] as i64;
    for w in positions.windows(2) {
        if w[1] == w[0] + 1 {
            s += 15;
        }
    }
    for &p in &positions {
        let at_boundary = p == 0 || matches!(hay[p - 1], b'_' | b'-' | b'.' | b'/' | b' ' | b'\t');
        if at_boundary {
            s += 10;
        }
    }
    s -= (hay.len() as i64) / 8;
    Some(s.max(1) as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_pattern_is_none() {
        assert_eq!(score("", "anything"), None);
    }

    #[test]
    fn non_ascii_pattern_is_none() {
        assert_eq!(score("föö", "foo"), None);
    }

    #[test]
    fn non_ascii_haystack_is_none() {
        assert_eq!(score("foo", "föö"), None);
    }

    #[test]
    fn pattern_longer_than_haystack_is_none() {
        assert_eq!(score("foobar", "foo"), None);
    }

    #[test]
    fn exact_match_case_insensitive_is_max() {
        assert_eq!(score("auto_cd", "AUTO_CD"), Some(u32::MAX));
        assert_eq!(score("Echo", "echo"), Some(u32::MAX));
    }

    #[test]
    fn non_subsequence_is_none() {
        assert_eq!(score("abc", "cba"), None);
        assert_eq!(score("xyz", "abc"), None);
    }

    #[test]
    fn subsequence_matches() {
        assert!(score("ac", "abc").is_some());
        assert!(score("ehoi", "echoti").is_some());
    }

    #[test]
    fn prefix_outranks_mid() {
        let prefix = score("ech", "echo").unwrap();
        let mid = score("ech", "leche").unwrap();
        assert!(prefix > mid, "prefix {prefix} should outrank mid {mid}");
    }

    #[test]
    fn contiguous_outranks_scattered() {
        let contig = score("abc", "abcxx").unwrap();
        let scat = score("abc", "axbxc").unwrap();
        assert!(contig > scat, "contig {contig} should outrank scat {scat}");
    }

    #[test]
    fn word_boundary_outranks_inside_word() {
        let boundary = score("abc", "x_a_b_c").unwrap();
        let inside = score("abc", "xaxbxcx").unwrap();
        assert!(
            boundary > inside,
            "boundary {boundary} should outrank inside {inside}"
        );
    }

    #[test]
    fn case_insensitive_symmetry() {
        assert_eq!(score("ac", "abc"), score("Ac", "ABC"));
        assert_eq!(score("AUTO", "auto_cd"), score("auto", "AUTO_CD"));
    }

    #[test]
    fn shorter_haystack_wins_on_ties() {
        let short = score("abc", "abc_xx").unwrap();
        let long = score("abc", "abc_xxxxxxxxxxxxx").unwrap();
        assert!(
            short > long,
            "shorter haystack {short} should outrank longer {long}"
        );
    }

    #[test]
    fn single_char_pattern_matches() {
        assert!(score("a", "abc").is_some());
        assert!(score("a", "xyz").is_none());
    }

    #[test]
    fn score_is_positive_for_any_match() {
        for (p, h) in [
            ("a", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzza"),
            ("abc", "xxxxxxxxxxaxxxxbxxxxc"),
        ] {
            let s = score(p, h).unwrap_or(0);
            assert!(s > 0, "score({p:?}, {h:?}) = {s}, should be > 0");
        }
    }
}
