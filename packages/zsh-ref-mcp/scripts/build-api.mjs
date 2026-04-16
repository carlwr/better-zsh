import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor"

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, "..")
const distDir = join(pkgDir, "dist")
const apiDir = join(distDir, "api")
const typesDir = join(distDir, "types")
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"))

// Only run API Extractor on entries that expose a declared TS surface.
// `server.ts` is a bin script with no exports (it has top-level side effects
// connecting stdio), so API Extractor errors on it — we still ship its .d.ts
// via tsup, but no rolled-up types bundle is produced for that entry.
const entries = [{ entry: "index", subpath: "." }]

rmSync(apiDir, { recursive: true, force: true })
rmSync(typesDir, { recursive: true, force: true })
mkdirSync(apiDir, { recursive: true })
mkdirSync(typesDir, { recursive: true })

let ok = true
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitForFile(path, timeoutMs = 5000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (existsSync(path)) return
    await sleep(50)
  }
  throw new Error(`timed out waiting for ${path}`)
}

for (const spec of entries) {
  const { entry, subpath } = spec
  await waitForFile(join(distDir, `${entry}.d.ts`))
  const name = subpath === "." ? pkg.name : `${pkg.name}/${subpath.slice(2)}`
  const config = ExtractorConfig.prepare({
    configObject: {
      mainEntryPointFilePath: `<projectFolder>/dist/${entry}.d.ts`,
      compiler: {
        tsconfigFilePath: "<projectFolder>/tsconfig.build.json",
      },
      apiReport: {
        enabled: false,
        reportFolder: `<projectFolder>/dist/api-report`,
      },
      docModel: {
        enabled: true,
        apiJsonFilePath: `<projectFolder>/dist/api/${entry}.api.json`,
        includeForgottenExports: false,
      },
      dtsRollup: {
        enabled: true,
        untrimmedFilePath: `<projectFolder>/dist/types/${entry}.d.ts`,
      },
      tsdocMetadata: {
        enabled: true,
        tsdocMetadataFilePath: `<projectFolder>/dist/api/${entry}.tsdoc-metadata.json`,
      },
      messages: {
        extractorMessageReporting: {
          default: {
            logLevel: "warning",
          },
          "ae-missing-release-tag": {
            logLevel: "none",
          },
        },
      },
      projectFolder: pkgDir,
      bundledPackages: [],
    },
    configObjectFullPath: join(pkgDir, "api-extractor.runtime.json"),
    packageJsonFullPath: join(pkgDir, "package.json"),
  })

  const result = Extractor.invoke(config, {
    localBuild: true,
    showVerboseMessages: false,
    messageCallback(message) {
      if (message.logLevel === "error") ok = false
      if (message.logLevel !== "warning" && message.logLevel !== "error") return
      process.stdout.write(
        `${entry}: ${message.formattedMessage ?? message.text ?? message.messageId}\n`,
      )
    },
  })

  if (!result.succeeded) ok = false

  const manifestPath = join(apiDir, `${entry}.manifest.json`)
  const manifest = {
    name,
    entry,
    apiJson: `${entry}.api.json`,
    tsdocMetadata: `${entry}.tsdoc-metadata.json`,
  }
  mkdirSync(dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

if (!ok) process.exit(1)
