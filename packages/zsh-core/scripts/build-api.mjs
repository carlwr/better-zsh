import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor"

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, "..")
const distDir = join(pkgDir, "dist")
const apiDir = join(distDir, "api")
const typesDir = join(distDir, "types")
const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"))

const entries = [
  ["index", "."],
  ["render", "./render"],
  ["exec", "./exec"],
  ["assets", "./assets"],
]

rmSync(apiDir, { recursive: true, force: true })
rmSync(typesDir, { recursive: true, force: true })
mkdirSync(apiDir, { recursive: true })
mkdirSync(typesDir, { recursive: true })

let ok = true

for (const [entry, subpath] of entries) {
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
