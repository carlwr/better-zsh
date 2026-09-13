//! Library target for the crate's binaries. No API stability: the crate
//! ships binaries, and this split exists so they share one code base.

pub mod cli;
pub mod corpus;
pub mod tools;

mod batch;
#[cfg(test)]
mod data_fingerprint;
mod fuzzy;
mod output;
mod resolver;
