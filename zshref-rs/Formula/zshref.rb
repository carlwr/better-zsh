# Pre-release scaffold. Does not install anything real yet.
#
# Layout: during the monorepo phase this formula lives at
# zshref-rs/Formula/zshref.rb. At extraction, the parent `zshref-rs/`
# becomes the new repo root, so this file ends up at Formula/zshref.rb —
# the default path Homebrew scans when tapped via
#   brew tap carlwr/zshref https://github.com/carlwr/zshref.git
#
# Pre-extraction tip: `Dir.chdir("zshref-rs")` below is needed because the
# source tarball currently unpacks the whole monorepo; drop it (use
# --path ".") at extraction time.

class Zshref < Formula
  desc "Query the bundled static zsh reference from the command-line"
  homepage "https://github.com/carlwr/better-zsh"
  # TODO: update url + sha256 when the first GitHub Release source tarball is cut.
  # url "https://github.com/carlwr/better-zsh/archive/refs/tags/zshref-v0.1.0-alpha.0.tar.gz"
  # sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  #
  # Placeholder so the formula is parseable during pre-release. Remove once
  # the real url + sha256 are filled in above.
  url "https://github.com/carlwr/better-zsh/archive/refs/heads/main.tar.gz"
  version "0.1.0-alpha.0"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  license "MIT"

  head "https://github.com/carlwr/better-zsh.git", branch: "main"

  # PATH A — source install via cargo (active).
  # Requires a GitHub Release source tarball that includes the pre-generated
  # TS JSONs under zshref-rs/data/ (see DATA-SYNC.md). Users need a Rust
  # toolchain at install time (pulled in via depends_on).
  depends_on "rust" => :build

  def install
    # Monorepo tip (pre-extraction): drop Dir.chdir post-extraction.
    Dir.chdir("zshref-rs") do
      system "cargo", "install",
             "--locked",
             "--root", prefix,
             "--path", "."
    end
  end

  # PATH B — binary tarball (deferred; faster, no Rust toolchain on user side).
  # Uncomment + fill in once macOS binaries are uploaded to a GitHub Release,
  # then drop the PATH A block (depends_on + install).
  #
  # on_arm do
  #   url "https://github.com/carlwr/better-zsh/releases/download/zshref-v0.1.0-alpha.0/zshref-aarch64-apple-darwin.tar.gz"
  #   sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  # end
  # on_intel do
  #   url "https://github.com/carlwr/better-zsh/releases/download/zshref-v0.1.0-alpha.0/zshref-x86_64-apple-darwin.tar.gz"
  #   sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  # end
  # def install
  #   bin.install "zshref"
  # end

  test do
    output = shell_output("#{bin}/zshref --version")
    assert_match "zshref", output

    # End-to-end sanity: classify a known option. jq is optional; fall back to
    # a string contains check if the user doesn't have it.
    classify = shell_output("#{bin}/zshref classify --raw AUTO_CD")
    assert_match(/"category"\s*:\s*"option"/, classify)
  end
end
