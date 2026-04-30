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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitForFile(path, timeoutMs = 5000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (existsSync(path)) return
    await sleep(50)
  }
  throw new Error(`timed out waiting for ${path}`)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function packageName(pkg, subpath) {
  return subpath === "." ? pkg.name : `${pkg.name}/${subpath.slice(2)}`
}

function packageDocFromSource(sourcePath) {
  const source = readFileSync(sourcePath, "utf8")
  const withoutShebang = source.replace(/^#!.*\r?\n/, "")
  const match = withoutShebang.match(/^\/\*\*[\s\S]*?\*\//)
  if (!match?.[0].includes("@packageDocumentation")) {
    throw new Error(`${sourcePath} must start with @packageDocumentation`)
  }
  return match[0]
}

function hasPackageDoc(text) {
  return /^#!.*\r?\n/.test(text)
    ? hasPackageDoc(text.replace(/^#!.*\r?\n/, ""))
    : /^\/\*\*[\s\S]*?@packageDocumentation[\s\S]*?\*\//.test(text)
}

function prependPackageDoc(path, doc) {
  const text = readFileSync(path, "utf8")
  if (hasPackageDoc(text)) return
  writeFileSync(path, `${doc}\nexport {}\n${text}`)
}

function assertDtsHasPackageDoc(path) {
  if (!hasPackageDoc(readFileSync(path, "utf8"))) {
    throw new Error(`${path} is missing package documentation`)
  }
}

function assertApiJsonHasPackageDoc(path) {
  const apiJson = readJson(path)
  if (
    typeof apiJson.docComment !== "string" ||
    apiJson.docComment.trim() === ""
  ) {
    throw new Error(`${path} is missing package documentation`)
  }
}

function writeManifest({ apiDir, entry, name }) {
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

function prepareConfig({ entry, pkgDir }) {
  const apiDirName = "api"
  const typesDirName = "types"

  return ExtractorConfig.prepare({
    configObject: {
      mainEntryPointFilePath: `<projectFolder>/dist/${entry}.d.ts`,
      compiler: {
        tsconfigFilePath: "<projectFolder>/tsconfig.build.json",
      },
      docModel: {
        enabled: true,
        apiJsonFilePath: `<projectFolder>/dist/${apiDirName}/${entry}.api.json`,
        includeForgottenExports: false,
      },
      dtsRollup: {
        enabled: true,
        untrimmedFilePath: `<projectFolder>/dist/${typesDirName}/${entry}.d.ts`,
      },
      tsdocMetadata: {
        enabled: true,
        tsdocMetadataFilePath: `<projectFolder>/dist/${apiDirName}/${entry}.tsdoc-metadata.json`,
      },
      projectFolder: pkgDir,
      bundledPackages: [],
    },
    configObjectFullPath: join(pkgDir, "api-extractor.runtime.json"),
    packageJsonFullPath: join(pkgDir, "package.json"),
  })
}

function packageDirFromScript(url) {
  return resolve(dirname(fileURLToPath(url)), "..")
}

export async function buildApi({ entries, packageDir, packageScriptUrl }) {
  const pkgDir = resolve(packageDir ?? packageDirFromScript(packageScriptUrl))
  const distDir = join(pkgDir, "dist")
  const apiDir = join(distDir, "api")
  const typesDir = join(distDir, "types")
  const pkg = readJson(join(pkgDir, "package.json"))

  rmSync(apiDir, { recursive: true, force: true })
  rmSync(typesDir, { recursive: true, force: true })
  mkdirSync(apiDir, { recursive: true })
  mkdirSync(typesDir, { recursive: true })

  let ok = true

  for (const { entry, subpath } of entries) {
    const rawDtsPath = join(distDir, `${entry}.d.ts`)
    const sourcePath = join(pkgDir, `${entry}.ts`)
    const apiJsonPath = join(apiDir, `${entry}.api.json`)
    const rollupPath = join(typesDir, `${entry}.d.ts`)
    const packageDoc = packageDocFromSource(sourcePath)

    await waitForFile(rawDtsPath)
    prependPackageDoc(rawDtsPath, packageDoc)

    const result = Extractor.invoke(
      prepareConfig({
        entry,
        pkgDir,
        apiDir,
        typesDir,
      }),
      {
        localBuild: true,
        showVerboseMessages: false,
        messageCallback(message) {
          if (message.logLevel === "error") ok = false
          if (message.logLevel !== "warning" && message.logLevel !== "error") {
            return
          }
          process.stdout.write(
            `${entry}: ${message.formattedMessage ?? message.text ?? message.messageId}\n`,
          )
        },
      },
    )

    if (!result.succeeded) ok = false

    assertApiJsonHasPackageDoc(apiJsonPath)
    assertDtsHasPackageDoc(rollupPath)
    writeManifest({
      apiDir,
      entry,
      name: packageName(pkg, subpath),
    })
  }

  if (!ok) process.exit(1)
}
