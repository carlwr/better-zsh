//! Prose types for text that renders into two targets. A `Paragraph` is
//! non-empty by construction; blank text and `Target::only` for the other
//! target yield `None`, which `body!` drops.

use super::ToolName;
use std::fmt;
use std::ops::Index;

/// Where a piece of prose renders.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Target {
    /// clap `--help`.
    Terminal,
    /// The JSON tool surface: MCP `tools/list` and `instructions`,
    /// `zshref batch`, `zshref schema`.
    Json,
}

impl Target {
    /// A tool reference as this target's reader knows it, backticked.
    pub fn tool(self, name: ToolName) -> String {
        match self {
            Target::Terminal => format!("`zshref {name}`"),
            Target::Json => format!("`{}`", name.json()),
        }
    }

    /// `p` when rendering at `on`, `None` otherwise.
    pub fn only(self, on: Target, p: impl IntoParagraph) -> Option<Paragraph> {
        if self == on { p.into_paragraph() } else { None }
    }
}

/// One value per `Target`.
#[derive(Clone, Debug)]
pub struct PerTarget<T> {
    pub terminal: T,
    pub json: T,
}

impl<T> PerTarget<T> {
    pub fn from_fn(f: impl Fn(Target) -> T) -> Self {
        Self {
            terminal: f(Target::Terminal),
            json: f(Target::Json),
        }
    }
}

impl<T> Index<Target> for PerTarget<T> {
    type Output = T;

    fn index(&self, t: Target) -> &T {
        match t {
            Target::Terminal => &self.terminal,
            Target::Json => &self.json,
        }
    }
}

/// A column-width phrase: one non-empty line, lowercase start, no
/// trailing period. Widths are the adapters' concern (see the tests).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Brief(String);

impl Brief {
    /// Panics on a phrase that breaks the rules; every brief is built at
    /// startup, so the panic is effectively a build error.
    pub fn new(s: impl Into<String>) -> Self {
        let s = s.into();
        assert!(
            !s.is_empty() && !s.contains('\n'),
            "brief must be one non-empty line: {s:?}"
        );
        assert!(
            !s.starts_with(|c: char| c.is_ascii_uppercase()),
            "brief must start lowercase: {s:?}"
        );
        assert!(!s.ends_with('.'), "brief must not end with a period: {s:?}");
        Self(s)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Brief {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// The authoring unit: non-empty, trailing whitespace trimmed.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Paragraph(String);

/// What `body!` accepts: text (blank → `None`) or an optional `Paragraph`.
pub trait IntoParagraph {
    fn into_paragraph(self) -> Option<Paragraph>;
}

impl IntoParagraph for &str {
    fn into_paragraph(self) -> Option<Paragraph> {
        let s = self.trim_end();
        (!s.is_empty()).then(|| Paragraph(s.to_string()))
    }
}

impl IntoParagraph for String {
    fn into_paragraph(self) -> Option<Paragraph> {
        self.as_str().into_paragraph()
    }
}

impl IntoParagraph for Option<Paragraph> {
    fn into_paragraph(self) -> Option<Paragraph> {
        self
    }
}

/// Paragraphs separated by a blank line.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Body(String);

impl Body {
    pub fn new(paragraphs: impl IntoIterator<Item = Paragraph>) -> Self {
        let kept: Vec<String> = paragraphs.into_iter().map(|p| p.0).collect();
        Self(kept.join("\n\n"))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Body {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// `body![a, b, …]`: a `Body` from anything `IntoParagraph`.
macro_rules! body {
    ($($p:expr),+ $(,)?) => {
        $crate::tools::text::Body::new(
            [$($crate::tools::text::IntoParagraph::into_paragraph($p)),+]
                .into_iter()
                .flatten(),
        )
    };
}
pub(crate) use body;

/// A tool's or field's help: `brief` for the CLI's column, `long` per
/// target.
#[derive(Clone, Debug)]
pub struct Prose {
    pub brief: Brief,
    pub long: PerTarget<Body>,
}

impl Prose {
    pub fn new(brief: impl Into<String>, long: impl Fn(Target) -> Body) -> Self {
        Self {
            brief: Brief::new(brief),
            long: PerTarget::from_fn(long),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blank_text_is_no_paragraph() {
        for blank in ["", " ", "\n", " \t\n"] {
            assert_eq!(blank.into_paragraph(), None, "{blank:?}");
        }
        assert_eq!(
            String::from("one \n").into_paragraph(),
            Some(Paragraph("one".into()))
        );
    }

    #[test]
    fn body_drops_absent_paragraphs_and_trims_trailing_whitespace() {
        let t = Target::Terminal;
        let b = body![
            "one\n",
            "",
            String::from("two"),
            t.only(Target::Json, "three"),
            None,
        ];
        assert_eq!(b.as_str(), "one\n\ntwo");
        assert_eq!(
            Target::Json.only(Target::Json, "three"),
            "three".into_paragraph()
        );
    }

    #[test]
    fn tool_holes_render_per_target() {
        assert_eq!(Target::Terminal.tool(ToolName::Docs), "`zshref docs`");
        assert_eq!(Target::Json.tool(ToolName::Docs), "`zsh_docs`");
    }

    #[test]
    #[should_panic(expected = "brief must not end with a period")]
    fn brief_rejects_a_trailing_period() {
        Brief::new("a phrase.");
    }
}
