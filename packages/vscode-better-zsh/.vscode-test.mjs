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

export default defineConfig([
  {
    label: "integration",
    files: "out/**/src/test/integration/**/*.test.js",
    launchArgs: launchArgs({
      extDir: testExtDir,
      userData: testUserData,
    }),
  },
  ...(extDir && stubDir && userData
    ? [
        {
          label: "bundled",
          files: "out/**/src/test/bundled/**/*.test.js",
          extensionDevelopmentPath: stubDir,
          launchArgs: launchArgs({ extDir, userData }),
          mocha: { timeout: 30000 },
        },
      ]
    : []),
])
