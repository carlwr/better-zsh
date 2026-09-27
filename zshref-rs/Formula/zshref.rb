# The crates.io `.crate` is self-contained (vendored data), so the formula
# needs no monorepo-vs-extracted handling.
# Tap via: brew tap carlwr/zshref https://github.com/carlwr/zshref.git

class Zshref < Formula
  desc "Query a bundled static zsh reference from the command line"
  homepage "https://github.com/carlwr/better-zsh"
  url "https://static.crates.io/crates/zshref/zshref-0.1.0-alpha.3.crate"
  sha256 "e73a8d75f2def52c17512a935e771eb42024bdd3c76a052ccbaf70c5ff7e87d0"
  license "MIT"

  head "https://github.com/carlwr/better-zsh.git", branch: "main"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args

    generate_completions_from_executable(bin/"zshref", "completions")
  end

  test do
    output = shell_output("#{bin}/zshref --version")
    assert_match "zshref", output

    docs = shell_output("#{bin}/zshref docs --key AUTO_CD")
    assert_match(/"category"\s*:\s*"option"/, docs)
  end
end
