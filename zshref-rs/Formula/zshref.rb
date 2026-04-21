# Formula ships from a crates.io source tarball. The layout comment below
# is about where THIS FILE lives in git — the tarball itself is vendored
# by cargo and self-contained, so no monorepo-vs-extracted contortions.
#
# Pre-extraction: zshref-rs/Formula/zshref.rb
# Post-extraction: Formula/zshref.rb (Homebrew's default tap scan path).
# Tap via: brew tap carlwr/zshref https://github.com/carlwr/zshref.git

class Zshref < Formula
  desc "Query the bundled static zsh reference from the command-line"
  homepage "https://github.com/carlwr/better-zsh"
  url "https://static.crates.io/crates/zshref/zshref-0.1.0-alpha.0.crate"
  sha256 "96eb81d3ff430606eb5764244ad1020c6df88fad481c1619b231495d029cebd0"
  license "MIT"

  head "https://github.com/carlwr/better-zsh.git", branch: "main"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args

    # Man page: `zshref mangen` emits roff(1) to stdout.
    (buildpath/"zshref.1").write Utils.safe_popen_read(bin/"zshref", "mangen")
    man1.install "zshref.1"

    # Shell completions: `zshref completions <shell>` for each supported shell.
    generate_completions_from_executable(bin/"zshref", "completions")
  end

  test do
    output = shell_output("#{bin}/zshref --version")
    assert_match "zshref", output

    # End-to-end sanity: classify a known option.
    classify = shell_output("#{bin}/zshref classify --raw AUTO_CD")
    assert_match(/"category"\s*:\s*"option"/, classify)

    # Man page installed and renders.
    assert_path_exists man1/"zshref.1"
  end
end
