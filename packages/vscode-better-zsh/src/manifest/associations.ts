const startupFiles = ["zshrc", "zshenv", "zprofile", "zlogin", "zlogout"]

const chezmoiAttrs = ["private_", "readonly_", "executable_"] // body stays the dotfile; not `symlink_`, `modify_`
const chezmoiPrefixes = chezmoiAttrs.reduce(
  (prefixes, attr) => prefixes.flatMap(p => [p, p + attr]),
  [""],
)
const chezmoiDotfiles = chezmoiPrefixes.flatMap(p =>
  startupFiles.map(n => `${p}dot_${n}`),
)

const zshInstallDirs = [
  "**/share/zsh/*/functions/**", // versioned: macOS, Fedora, source builds
  "**/share/zsh/functions/**", // Debian, Arch
  "**/share/zsh/site-functions/_*", // a glob beats `.bash`; Homebrew links git-completion.bash here
]

const line1Markers = [
  /#!\s*(?:\S*\/)?(?:env\s+(?:-\S+\s+)*)?zsh(?:-?\d[\d.]*)?(?:\s|$)/, // `/bin/zsh -f`, `env -S zsh`, `zsh5`
  /#(?:compdef|autoload)(?:\s|$)/, // compinit reads line 1 too
  /\s*emulate\s+(?:-[LR]+\s+)?zsh\b/, // autoloaded-function idiom
  /#.*\bvim?:.*\b(?:ft|filetype)=zsh\b/, // vim modeline
  /#.*-\*-[^*]*\bzsh\b[^*]*-\*-/, // emacs modeline: `mode: zsh`, `sh-shell: zsh`
]

export const associations = {
  extensions: [".zsh", ".zsh-theme", ...startupFiles.map(n => `.${n}`)],
  filenames: [...startupFiles, "zshrc_Apple_Terminal", ...chezmoiDotfiles],
  filenamePatterns: zshInstallDirs,
  firstLine: `^(?:${line1Markers.map(r => r.source).join("|")})`, // consulted only when no language claimed the path
}
