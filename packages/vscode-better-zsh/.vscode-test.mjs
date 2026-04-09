import { defineConfig } from "@vscode/test-cli"

const extDir = process.env.BUNDLED_EXT_DIR
const stubDir = process.env.BUNDLED_STUB_DIR
const userData = process.env.BUNDLED_USER_DATA
const testExtDir = process.env.VSCODE_TEST_EXTENSIONS_DIR
const testUserData = process.env.VSCODE_TEST_USER_DATA

const launchArgs = ({ extDir, userData }) => [
  "--disable-gpu",
  ...(extDir ? [`--extensions-dir=${extDir}`] : []),
  ...(userData ? [`--user-data-dir=${userData}`] : []),
]

const zshPathMatrixEnv = {
  BETTER_ZSH_MATRIX_CASE: process.env.BETTER_ZSH_MATRIX_CASE,
  BETTER_ZSH_MATRIX_EXPECT_RUNTIME:
    process.env.BETTER_ZSH_MATRIX_EXPECT_RUNTIME,
  BETTER_ZSH_MATRIX_LOG_SUBSTR: process.env.BETTER_ZSH_MATRIX_LOG_SUBSTR,
  PATH: process.env.BETTER_ZSH_MATRIX_PATH || process.env.PATH,
}

export default defineConfig([
  {
    label: "integration",
    files: ".vscode-test/**/test/integration/**/*.test.js",
    launchArgs: launchArgs({
      extDir: testExtDir,
      userData: testUserData,
    }),
  },
  {
    label: "zsh-path-matrix",
    files: ".vscode-test/**/test/zsh-path-matrix/**/*.test.js",
    launchArgs: launchArgs({
      extDir: testExtDir,
      userData: testUserData,
    }),
    env: zshPathMatrixEnv,
    mocha: { timeout: 30000 },
  },
  ...(extDir && stubDir && userData
    ? [
        {
          label: "bundled",
          files: ".vscode-test/**/test/bundled/**/*.test.js",
          extensionDevelopmentPath: stubDir,
          launchArgs: launchArgs({ extDir, userData }),
          mocha: { timeout: 30000 },
        },
      ]
    : []),
])
