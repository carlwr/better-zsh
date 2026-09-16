# The crates.io `.crate` is self-contained (vendored data), so the formula
# needs no monorepo-vs-extracted handling.
# Tap via: brew tap carlwr/zshref https://github.com/carlwr/zshref.git

class Zshref < Formula
  desc "Query a bundled static zsh reference from the command line"
  homepage "https://github.com/carlwr/better-zsh"
  url "https://static.crates.io/crates/zshref/zshref-0.1.0-alpha.2.crate"
  sha256 "522419b9c0b854bef43ced596982fbc6f0bf2fb6b08a4dac213a35a8bc402137"
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

    docs = shell_output("#{bin}/zshref docs --raw AUTO_CD")
    assert_match(/"category"\s*:\s*"option"/, docs)
  end
end
