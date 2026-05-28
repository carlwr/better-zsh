//! Experimental local semantic retrieval for zsh-core records.

#[cfg(test)]
pub mod contract;
#[cfg(test)]
pub mod eval_diff;
pub mod index;
pub mod lookup_map;
#[cfg(test)]
pub mod mechanical;
pub mod model;
pub mod query_expand;
pub mod rank;
pub mod retrieval_text;
pub mod rules;
pub mod search;
pub mod selfcheck;
#[cfg(test)]
pub mod sentence_fixture;
#[cfg(test)]
pub mod tune;
#[cfg(test)]
mod tune_sweep;

#[cfg(test)]
pub(crate) mod fixtures;
#[cfg(test)]
mod qa_corpus;
#[cfg(test)]
mod test_support;
