# Pre-release scaffold. Does not install anything real yet.
#
# PACKAGING NOTE — embedded JSON assets:
#   The Rust binary embeds TS-generated JSON files at compile time via
#   `include_bytes!` (see zshref-rs/src/corpus.rs). Those files live under
#   packages/zsh-core/dist/json/ and packages/zsh-core-tooldef/dist/json/ in
#   the monorepo. Any source tarball used with Path A below must include these
#   pre-generated JSONs, i.e. the tarball is produced AFTER running
#   `pnpm install && pnpm build` across the relevant packages.
#   This constraint is tracked separately and does NOT need to be solved here.
#
# PATH A (active) — build from source via cargo.
#   Requires: a GitHub Release source tarball that includes pre-built JSONs.
#   User machine needs a Rust toolchain (pulled in via `depends_on "rust" => :build`).
#   Update `url` + `sha256` when cutting the first release.
#
# PATH B (stubbed, commented out below) — pre-built binary tarball.
#   Uncomment and fill in once macOS binaries are uploaded to a GitHub Release.
#   Much faster for end-users (no Rust toolchain required).
#   See the `# TODO: PATH B` block below.

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

  # -------------------------------------------------------------------------
  # PATH A — source install via cargo (active)
  # -------------------------------------------------------------------------
  depends_on "rust" => :build

  def install
    # Build inside the zshref-rs subdirectory (monorepo layout).
    # When extracted to its own repo, change "zshref-rs" to "." below.
    Dir.chdir("zshref-rs") do
      system "cargo", "install",
             "--locked",
             "--root", prefix,
             "--path", "."
    end
  end

  # -------------------------------------------------------------------------
  # PATH B — binary tarball (post-release; uncomment + remove PATH A above)
  # -------------------------------------------------------------------------
  # TODO: uncomment once we cut github release tarballs with pre-built macOS binaries.
  #
  # On arm64 (Apple Silicon):
  # url "https://github.com/carlwr/better-zsh/releases/download/zshref-v0.1.0-alpha.0/zshref-aarch64-apple-darwin.tar.gz"
  # sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  #
  # On x86_64 (Intel Mac):
  # url "https://github.com/carlwr/better-zsh/releases/download/zshref-v0.1.0-alpha.0/zshref-x86_64-apple-darwin.tar.gz"
  # sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  #
  # def install
  #   bin.install "zshref"
  # end

  test do
    # Verify binary runs and self-identifies.
    output = shell_output("#{bin}/zshref --version")
    assert_match "zshref", output

    # Spot-check classify with jq if available.
    if Formula["jq"].any_version_installed?
      jq = Formula["jq"].opt_bin/"jq"
      system "#{bin}/zshref", "classify", "--raw", "AUTO_CD", "|", jq.to_s, "-e", ".match != null"
    end
  end
end
