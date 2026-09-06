// Tuning dashboard: one command surfaces every rank-time signal the manual
// tuning loop watches — sentence train/holdout, sanity invariants, the bare
// contract (fast tier), and the mechanical sentence component + combined total
// + the held-out QA harness (full tier). The eval cores it aggregates are the
// same impls the contract / fixtures / sentence-fixture / mechanical tests
// use, so the dashboard's numbers can't drift from those tests'.

use crate::nlp::eval_diff::{self, Churn};
use crate::nlp::index::DIMS;
use crate::nlp::lookup_map::{self, LookupIndex};
use crate::nlp::rules::Tuning;
use crate::nlp::sentence_fixture::SentenceEval;
use crate::nlp::{contract, fixtures, mechanical, sentence_fixture};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::PathBuf;
use std::process::Command;

pub(crate) struct Dashboard {
    sentence: SentenceEval,
    /// Curated `train` total — one half of the combined blend.
    curated_train: f32,
    sanity: fixtures::SanityEval,
    bare: contract::BareEval,
    /// `None` in the fast tier; the mechanical layer is full-tier only.
    mechanical: Option<mechanical::MechanicalEval>,
    /// `None` unless the full tier ran *and* `ZSHREF_NLP_BIN` was set.
    qa: Option<QaSummary>,
    /// Embedder-vs-boosts ablation of the live tuning (see [`Components`]).
    components: Components,
    /// Gross churn of the candidate (`BZ_TUNE_BASE` overrides) vs the committed
    /// tuning: `None` when no candidate is set, else `(curated_train,
    /// mechanical)` — mechanical only in the full tier. The discrete signal a
    /// sub-0.01 score Δ can't carry; see [`render`].
    churn: Option<(Churn, Option<Churn>)>,
}

/// Component decomposition of a metric into `[full, embedder-off, boosts-off]`,
/// each holding the other channel fixed. The lookup-map promote stays ON in all
/// three, so the spread isolates how much the embedder vs. the lexical boosts
/// contribute *this iteration* — the signal for "is the model pulling its
/// weight, or is the score mostly keyword boosts?".
struct Components {
    train: [f32; 3],
    holdout: [f32; 3],
    /// `None` in the fast tier (mechanical is full-tier only).
    mech: Option<[f32; 3]>,
}

impl Components {
    fn render(&self) -> String {
        let row = |name: &str, v: &[f32; 3]| {
            format!("  {name:<11}{:>8.3}{:>8.3}{:>8.3}\n", v[0], v[1], v[2])
        };
        let mut s = String::from(
            "\ncomponent decomposition (lookup-map ON in all rows):\n  \
             −embed = embedder off (boosts only); −boost = boosts off (embedder only)\n",
        );
        s.push_str(&format!(
            "  {:<11}{:>8}{:>8}{:>8}\n",
            "", "full", "−embed", "−boost"
        ));
        s.push_str(&row("cur.train", &self.train));
        s.push_str(&row("cur.hold", &self.holdout));
        match &self.mech {
            Some(m) => s.push_str(&row("mechanical", m)),
            None => s.push_str("  mechanical  skipped (debug build)\n"),
        }
        s
    }
}

/// All-zero replacement for an embedded query cache (same keys, zero vectors).
/// With normalized record vectors `dot(0, v) = 0`, so every semantic view
/// scores 0 and ranking falls to boosts + lookup-map promote alone.
fn zeroed(cache: &HashMap<String, Vec<f32>>) -> HashMap<String, Vec<f32>> {
    cache
        .keys()
        .map(|k| (k.clone(), vec![0.0f32; DIMS]))
        .collect()
}

/// Tuning with every lexical-boost term and the rarity penalty zeroed, leaving
/// only the semantic channel (+ lookup-map promote) active.
fn zero_boosts(mut t: Tuning) -> Tuning {
    t.boosts.category = 0.0;
    t.boosts.exact_word_increment = 0.0;
    t.boosts.resolver_increment = 0.0;
    t.boosts.word_overlap.scale = 0.0;
    t.penalties.category_rarity_max = 0.0;
    t
}

/// Assemble every dashboard signal for `tuning`. `full` adds the mechanical
/// sentence layer + the QA harness (both expensive); the fast path is just the
/// curated sentence fixture + sanity + bare contract. Curated (and, in the full
/// tier, mechanical) queries are embedded once and re-ranked for the live
/// tuning plus the two ablation variants — the embed cost is paid once.
pub(crate) fn build(assets: &fixtures::Assets, tuning: &Tuning, full: bool) -> Dashboard {
    let contract_data = contract::build(&assets.corpus);
    let map_idx = LookupIndex::from_map(lookup_map::build(&assets.corpus));
    let no_boosts = zero_boosts(tuning.clone());

    let fixture = sentence_fixture::load().expect("load sentence fixture");
    let cur_q: Vec<String> = fixture.entries.iter().map(|e| e.query.clone()).collect();
    let cur_cache = fixtures::embed_unique(&cur_q).expect("embed curated");
    let cur_zero = zeroed(&cur_cache);
    let sentence = sentence_fixture::eval_cached(&fixture, &cur_cache, assets, tuning);
    let cur_ne = sentence_fixture::eval_cached(&fixture, &cur_zero, assets, tuning);
    let cur_nb = sentence_fixture::eval_cached(&fixture, &cur_cache, assets, &no_boosts);
    let curated_train = sentence.train.total;

    // Churn of the candidate (`tuning`, = committed + BZ_TUNE_BASE overrides) vs
    // the committed tuning. Computed only when a candidate is actually set, so
    // the no-override dashboard pays nothing and shows no empty block. Curated
    // is Train-only; the mechanical half (if any) is filled in the full tier.
    let committed = crate::nlp::rules::tuning();
    let has_candidate = std::env::var("BZ_TUNE_BASE")
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let curated_churn = has_candidate.then(|| {
        let base = eval_diff::per_item(&fixture.entries, &cur_cache, assets, committed);
        let cand = eval_diff::per_item(&fixture.entries, &cur_cache, assets, tuning);
        eval_diff::churn(&base, &cand, true)
    });

    let sanity = fixtures::eval_sanity(assets, tuning);
    let bare = contract::eval_bare(&contract_data, &map_idx);

    let (mechanical, mech_comp, mech_churn, qa) = if full {
        let entries = mechanical::build(assets);
        let mq: Vec<String> = entries.iter().map(|e| e.query.clone()).collect();
        let mcache = fixtures::embed_unique(&mq).expect("embed mechanical");
        let mzero = zeroed(&mcache);
        let mech = mechanical::eval_cached(&entries, &mcache, assets, tuning);
        let m_ne = mechanical::eval_cached(&entries, &mzero, assets, tuning);
        let m_nb = mechanical::eval_cached(&entries, &mcache, assets, &no_boosts);
        let comp = [
            mech.component.total,
            m_ne.component.total,
            m_nb.component.total,
        ];
        let churn = has_candidate.then(|| {
            let base = eval_diff::per_item(&entries, &mcache, assets, committed);
            let cand = eval_diff::per_item(&entries, &mcache, assets, tuning);
            eval_diff::churn(&base, &cand, false)
        });
        (Some(mech), Some(comp), churn, run_qa())
    } else {
        (None, None, None, None)
    };

    let churn = curated_churn.map(|c| (c, mech_churn));

    let components = Components {
        train: [sentence.train.total, cur_ne.train.total, cur_nb.train.total],
        holdout: [
            sentence.holdout.total,
            cur_ne.holdout.total,
            cur_nb.holdout.total,
        ],
        mech: mech_comp,
    };

    Dashboard {
        sentence,
        curated_train,
        sanity,
        bare,
        mechanical,
        qa,
        components,
        churn,
    }
}

impl Dashboard {
    pub(crate) fn render(&self) -> String {
        let mut s = String::from("\n=== nlp tuning dashboard ===\n");

        // Compact headline: the totals you watch every iteration.
        let snt = &self.sentence;
        s.push_str(&format!(
            "[sentence]  all={:.3}  train={:.3}  holdout={:.3}  ({} entries)\n",
            snt.all.total, snt.train.total, snt.holdout.total, snt.n_entries,
        ));
        s.push_str(&self.sanity.render());
        s.push_str(&format!(
            "[contract] {} bare entries, {} failures\n",
            self.bare.bare_total,
            self.bare.failures.len(),
        ));
        match &self.mechanical {
            Some(m) => {
                let combined = mechanical::combined_total(self.curated_train, m.component.total);
                s.push_str(&format!(
                    "[mechanical] {:.3}  ({} entries)\n\
                     [combined]  λ·train + (1−λ)·mech = {:.3}·{:.3} + {:.3}·{:.3} = {:.3}\n",
                    m.component.total,
                    m.n_entries,
                    mechanical::LAMBDA,
                    self.curated_train,
                    1.0 - mechanical::LAMBDA,
                    m.component.total,
                    combined,
                ));
            }
            None => {
                s.push_str("[mechanical] skipped (debug build; run `make cli-tune-dashboard`)\n")
            }
        }
        s.push_str("  holdout = overfit watch; never tune on it.\n");

        s.push_str(&self.churn_block());
        s.push_str(&self.components.render());

        s.push_str("\nper category — curated split vs mechanical:\n");
        s.push_str("  mech=mechanical  fix=cur.train  hold=cur.holdout  all=cur.both\n");
        s.push_str(&self.per_category_table());

        match &self.mechanical {
            Some(m) => {
                s.push_str("\nhard slices (mechanical; fail = expected record not #1):\n");
                s.push_str("  cross-cutting & overlapping (a 1-char punct id is in both)\n");
                s.push_str(&slice_table(&m.slices));
            }
            None => s.push_str("\nhard slices: skipped (debug build)\n"),
        }

        match (&self.qa, &self.mechanical) {
            (Some(q), _) => s.push_str(&q.render()),
            (None, Some(_)) => s.push_str(
                "[qa] skipped (set ZSHREF_NLP_BIN to a --release --features nlp binary)\n",
            ),
            (None, None) => {
                s.push_str("[qa] skipped (debug build; run `make cli-tune-dashboard`)\n")
            }
        }
        s
    }

    /// Gross churn of the candidate vs the committed tuning: how many items
    /// changed rank and how many crossed the pass bar each way. This is the
    /// signal the headline scores can't carry — a candidate that flips 100
    /// sentences but nets +0.005 is churning, not improving, and only the gross
    /// counts reveal it. Shown only when `BZ_TUNE_BASE` names a candidate.
    fn churn_block(&self) -> String {
        let Some((cur, mech)) = &self.churn else {
            return String::from(
                "\nchurn vs committed baseline: no candidate \
                 (set BZ_TUNE_BASE=<overrides> to diff)\n",
            );
        };
        let row = |name: &str, c: &Churn| {
            format!(
                "  {name:<13}{:>4} moved │ {:>3} fail→pass {:>3} pass→fail │ Σgain Δ {:+.3} (net)\n",
                c.moved, c.up, c.down, c.net_gain,
            )
        };
        let mut s = String::from(
            "\nchurn vs committed baseline (gross counts — a small score Δ hides large churn):\n",
        );
        s.push_str(&row("curated train", cur));
        match mech {
            Some(m) => s.push_str(&row("mechanical", m)),
            None => s.push_str("  mechanical   skipped (debug build)\n"),
        }
        s
    }

    /// One row per category (union of curated + mechanical), juxtaposing the
    /// curated train/holdout/all scores with the mechanical score + counts.
    /// `—` marks a category with no votes in that source. Mechanical columns
    /// are blank in the fast tier.
    fn per_category_table(&self) -> String {
        let snt = &self.sentence;
        let mech = self.mechanical.as_ref();
        let mut cats: BTreeSet<&str> = BTreeSet::new();
        cats.extend(snt.all.per_category.keys().map(String::as_str));
        if let Some(m) = mech {
            cats.extend(m.component.per_category.keys().map(String::as_str));
        }

        let score = |m: &BTreeMap<String, f32>, c: &str| {
            m.get(c)
                .map(|v| format!("{v:.3}"))
                .unwrap_or_else(|| "—".into())
        };
        let count = |m: &BTreeMap<String, usize>, c: &str| {
            m.get(c)
                .map(|v| v.to_string())
                .unwrap_or_else(|| "—".into())
        };

        let rows: Vec<Vec<String>> = cats
            .iter()
            .map(|&c| {
                vec![
                    c.to_string(),
                    mech.map(|m| score(&m.component.per_category, c))
                        .unwrap_or_else(|| "·".into()),
                    score(&snt.train.per_category, c),
                    score(&snt.holdout.per_category, c),
                    score(&snt.all.per_category, c),
                    mech.map(|m| count(&m.per_category_n, c))
                        .unwrap_or_else(|| "·".into()),
                    count(&snt.per_category_n, c),
                ]
            })
            .collect();

        box_table(
            &["category", "mech", "fix", "hold", "all", "n:mec", "n:cur"],
            &[false, true, true, true, true, true, true],
            &rows,
        )
    }
}

/// Render the mechanical id-shape slices (cuts across categories) as a table.
fn slice_table(slices: &[mechanical::SliceStat]) -> String {
    let rows: Vec<Vec<String>> = slices
        .iter()
        .map(|s| {
            vec![
                s.label.to_string(),
                format!("{:.3}", s.mean_gain),
                format!("{}/{}", s.fails, s.n),
            ]
        })
        .collect();
    box_table(
        &["id slice", "score", "fail/total"],
        &[false, true, true],
        &rows,
    )
}

/// Render a Unicode box table. `right` selects right-alignment per column
/// (numbers right, labels left); column widths fit their widest cell. Every
/// line stays ≤75 chars for the dashboard's callers (kept narrow by design).
fn box_table(headers: &[&str], right: &[bool], rows: &[Vec<String>]) -> String {
    let n = headers.len();
    let mut w: Vec<usize> = headers.iter().map(|h| h.chars().count()).collect();
    for r in rows {
        for (i, c) in r.iter().enumerate() {
            w[i] = w[i].max(c.chars().count());
        }
    }
    let rule = |l: char, mid: char, r: char| {
        let mut s = String::new();
        s.push(l);
        for (i, &wi) in w.iter().enumerate() {
            s.extend(std::iter::repeat_n('─', wi + 2));
            s.push(if i + 1 == n { r } else { mid });
        }
        s.push('\n');
        s
    };
    let row = |cells: &[String]| {
        let mut s = String::from("│");
        for (i, cell) in cells.iter().enumerate() {
            let pad = " ".repeat(w[i] - cell.chars().count());
            if right[i] {
                s.push_str(&format!(" {pad}{cell} │"));
            } else {
                s.push_str(&format!(" {cell}{pad} │"));
            }
        }
        s.push('\n');
        s
    };
    let header: Vec<String> = headers.iter().map(|h| h.to_string()).collect();
    let mut out = rule('┌', '┬', '┐');
    out.push_str(&row(&header));
    out.push_str(&rule('├', '┼', '┤'));
    for r in rows {
        out.push_str(&row(r));
    }
    out.push_str(&rule('└', '┴', '┘'));
    out
}

struct QaSummary {
    avg_percent: Option<f32>,
    hard_percent: Option<f32>,
}

impl QaSummary {
    fn render(&self) -> String {
        let avg = self
            .avg_percent
            .map(|a| format!("{a:.1}%"))
            .unwrap_or_else(|| "?".into());
        let hard = self
            .hard_percent
            .map(|h| format!("{h:.1}%"))
            .unwrap_or_else(|| "?".into());
        format!("[qa] avg {avg}, hard-check score {hard} (held-out — never tune on this)\n")
    }
}

/// Shell out to the held-out QA harness against a prebuilt
/// `--release --features nlp` binary named by `ZSHREF_NLP_BIN`; `None` when
/// the env var is unset (the caller renders a hint). nlp-corpus is the
/// overfit guard — recorded, never optimized toward.
fn run_qa() -> Option<QaSummary> {
    let bin = std::env::var("ZSHREF_NLP_BIN").ok()?;
    let script: PathBuf = [env!("CARGO_MANIFEST_DIR"), "tests", "nlp-qa", "run-qa.mjs"]
        .iter()
        .collect();
    let out = match Command::new("node")
        .arg(&script)
        .arg("--zshref")
        .arg(&bin)
        .output()
    {
        Ok(o) => o,
        Err(e) => {
            eprintln!("[qa] failed to spawn node: {e}");
            return None;
        }
    };
    let stdout = String::from_utf8_lossy(&out.stdout);
    // Parse the machine-readable `SUMMARY_JSON {…}` line run-qa.mjs emits last
    // (scan from the end); absent/unparseable fields render as "?".
    let summary = stdout.lines().rev().find_map(|l| {
        l.strip_prefix("SUMMARY_JSON ")
            .and_then(|j| serde_json::from_str::<serde_json::Value>(j).ok())
    });
    let avg_percent = summary
        .as_ref()
        .and_then(|s| s.get("avgPercent")?.as_f64())
        .map(|f| f as f32);
    let hard_percent = summary
        .as_ref()
        .and_then(|s| s.get("hardPercent")?.as_f64())
        .map(|f| f as f32);
    Some(QaSummary {
        avg_percent,
        hard_percent,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Pure unit checks for the ablation helpers, so the component-decomposition
    // path can't silently rot even when the opt-in dashboard isn't run.
    #[test]
    fn zeroed_cache_is_all_zero_same_keys() {
        let mut c = HashMap::new();
        c.insert("q".to_string(), vec![0.3f32; DIMS]);
        let z = zeroed(&c);
        assert_eq!(z.len(), 1);
        assert_eq!(z["q"].len(), DIMS);
        assert!(z["q"].iter().all(|&x| x == 0.0));
    }

    #[test]
    fn zero_boosts_zeros_every_boost_term() {
        let t = zero_boosts(crate::nlp::rules::tuning().clone());
        assert_eq!(t.boosts.category, 0.0);
        assert_eq!(t.boosts.exact_word(), 0.0);
        assert_eq!(t.boosts.resolver(), 0.0);
        assert_eq!(t.boosts.word_overlap.scale, 0.0);
        assert_eq!(t.penalties.category_rarity_max, 0.0);
    }

    /// Tuning dashboard — opt-in dev tool, not a CI gate (the individual
    /// gated tests enforce the constraints). Set `BZ_TUNE_DASHBOARD=1` (or
    /// run `make cli-tune-dashboard`); `ZSHREF_NLP_BIN` adds the QA row. The
    /// tier follows the build profile: a release build runs the full tier
    /// (mechanical layer + QA); a debug build runs the fast tier (the
    /// mechanical layer is too slow to embed in debug).
    #[test]
    fn tune_dashboard() {
        if std::env::var_os("BZ_TUNE_DASHBOARD").is_none() {
            eprintln!(
                "[skip] tune_dashboard: set BZ_TUNE_DASHBOARD=1 (or run \
                 `make cli-tune-dashboard`)"
            );
            return;
        }
        if fixtures::skip_if_assets_missing("BZ_TUNE_DASHBOARD", "tune_dashboard") {
            return;
        }
        // Full tier (mechanical + QA) iff release: the mechanical layer embeds
        // thousands of queries, too slow for a debug build. No separate opt-in —
        // the build profile already says whether you can afford it.
        let full = !cfg!(debug_assertions);
        let assets = fixtures::assets().expect("load assets");
        // Compose `BZ_TUNE_BASE` overrides over the committed baseline so a
        // candidate point shows its full per-category + slice breakdown here,
        // not just the sweep's totals.
        let base = crate::nlp::tune_sweep::composed_base();
        if let Ok(spec) = std::env::var("BZ_TUNE_BASE") {
            if !spec.trim().is_empty() {
                eprintln!("[base override] BZ_TUNE_BASE={spec:?}");
            }
        }
        let dash = build(assets, &base, full);
        eprint!("{}", dash.render());
    }
}
