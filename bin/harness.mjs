#!/usr/bin/env node
/**
 * Zero-dependency CLI for the coding harness.
 *
 * Commands release the shared base as a versioned, hashed artifact, compose a
 * repository's harness from the pinned base plus a local delta, and detect drift
 * between the two.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadManifest, validateManifest } from '../src/manifest.mjs'
import { composeText, sha256 } from '../src/compose.mjs'
import { createRelease, declaredVersion, loadRelease, verifyRelease } from '../src/release.mjs'
import { ensureGitCheckout, isGitSource } from '../src/fetch.mjs'
import { toolFiles, toolVersion } from '../src/tool.mjs'
import { SHIM } from '../src/shim.mjs'
import { artifactProblems } from '../src/artifacts.mjs'
import { scan } from '../src/scan.mjs'
import { proveGate } from '../src/prove.mjs'

const USAGE = `usage: harness <command> [options]

commands:
  validate   --manifest <path>           validate manifest structure
  sync       --manifest <path>           compose outputs from the pinned base and rewrite the lock
  check      --manifest <path>           fail when an output or the fetched base drifted
  init       --dir <path> [--base-source <dir>] [--version <v>]
                                         scaffold a delta, manifest, and bootstrap
  upgrade    --manifest <path> --to <v>  pin a new base version and re-sync
  release    --base <dir> --out <dir> [--version <v>]
                                         build a versioned, hashed base release
  scan       --root <dir>                list consumers whose harness is stale or diverged
  prove      --manifest <path> [--gate <id>]
                                         run the three-step proof for each gate action`

function parseOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${token}`)
    options[token.slice(2)] = value
    index += 1
  }
  return options
}

function requireOption(options, name) {
  const value = options[name]
  if (value === undefined) throw new Error(`missing required option --${name}`)
  return value
}

function readValidManifest(path) {
  const manifest = loadManifest(path)
  const errors = validateManifest(manifest)
  if (errors.length === 0) return manifest
  for (const error of errors) console.error(`manifest: ${error}`)
  process.exit(1)
}

/**
 * Resolve and verify the pinned base release, or null when the manifest pins none.
 */
function resolveBase(root, manifest) {
  if (manifest.base === undefined) return null
  const config = manifest.base
  let registry
  if (isGitSource(config.source)) {
    const cacheRoot = resolve(root, config.cache ?? '.harness')
    const repoDir = ensureGitCheckout(config.source, manifest.version, cacheRoot)
    registry = resolve(repoDir, config.registry ?? 'dist')
  } else {
    registry = resolve(root, config.source)
  }
  const { dir, release } = loadRelease(registry, manifest.version)
  const problem = verifyRelease(dir, release)
  if (problem !== null) throw new Error(problem)
  return { dir, release }
}

function checkToolPin(manifest) {
  if (manifest.tool === undefined) return
  const running = toolVersion()
  if (manifest.tool.version !== running) throw new Error(`tool version ${running} does not match pinned ${manifest.tool.version}`)
}

function verifyToolFiles(manifest) {
  if (manifest.lock?.tool?.files === undefined) return null
  const actual = toolFiles()
  for (const [rel, hash] of Object.entries(manifest.lock.tool.files)) {
    if (actual[rel] !== hash) return `tool file ${rel}: hash mismatch against the lock`
  }
  return null
}

function composedOutputs(root, manifest, baseDir) {
  return manifest.compositions.map((composition) => {
    const text = composeText(root, composition.sources, baseDir)
    return { output: composition.output, path: resolve(root, composition.output), text, hash: sha256(text) }
  })
}

function cmdValidate(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const manifest = readValidManifest(path)
  const root = dirname(path)
  const needsBase = manifest.skills.some((skill) => typeof skill?.path === 'string' && skill.path.startsWith('base:'))
  const base = needsBase && manifest.base !== undefined ? resolveBase(root, manifest) : null
  const problems = artifactProblems(root, manifest, base === null ? undefined : base.dir)
  if (problems.length > 0) {
    for (const problem of problems) console.error(`validate: ${problem}`)
    process.exit(1)
  }
  console.log('manifest: ok')
}

function cmdRelease(options) {
  const baseDir = resolve(options.base ?? 'base')
  const outDir = resolve(options.out ?? 'dist')
  const version = options.version ?? declaredVersion(baseDir)
  if (version === undefined) throw new Error('missing --version and no base/VERSION')
  const { dir, release } = createRelease(baseDir, outDir, version)
  console.log(`released base@${release.version} -> ${dir}`)
  console.log(`files: ${Object.keys(release.files).length}`)
}

function cmdSync(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const manifest = readValidManifest(path)
  const root = dirname(path)
  const base = resolveBase(root, manifest)
  checkToolPin(manifest)
  const toolProblem = verifyToolFiles(manifest)
  if (toolProblem !== null) throw new Error(`${toolProblem}; run harness upgrade`)
  if (base !== null && manifest.lock?.base !== undefined) {
    const locked = manifest.lock.base
    if (locked.version !== base.release.version) throw new Error(`base version ${base.release.version} does not match pinned lock ${locked.version}; run harness upgrade`)
    for (const [rel, hash] of Object.entries(base.release.files)) {
      if (locked.files?.[rel] !== hash) throw new Error(`base file ${rel} differs from the lock; run harness upgrade or restore base@${base.release.version}`)
    }
  }
  const outputs = {}
  for (const item of composedOutputs(root, manifest, base?.dir)) {
    mkdirSync(dirname(item.path), { recursive: true })
    writeFileSync(item.path, item.text)
    outputs[item.output] = item.hash
    console.log(`synced ${item.output}`)
  }
  manifest.lock = { version: manifest.version, tool: { version: toolVersion(), files: toolFiles() }, outputs }
  if (base !== null) manifest.lock.base = { version: base.release.version, files: base.release.files }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`lock: ${manifest.version}`)
}

function cmdCheck(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const manifest = readValidManifest(path)
  const root = dirname(path)
  const base = resolveBase(root, manifest)
  checkToolPin(manifest)
  const failures = []
  const toolProblem = verifyToolFiles(manifest)
  if (toolProblem !== null) failures.push(toolProblem)
  if (base !== null) {
    const locked = manifest.lock?.base
    if (locked === undefined) {
      failures.push(`base@${manifest.version}: lock missing; run harness sync`)
    } else {
      if (locked.version !== base.release.version) failures.push(`base version: lock ${locked.version} != pinned ${base.release.version}`)
      for (const [rel, hash] of Object.entries(base.release.files)) {
        if (locked.files?.[rel] !== hash) failures.push(`base file ${rel}: hash mismatch against the lock`)
      }
    }
  }
  for (const item of composedOutputs(root, manifest, base?.dir)) {
    if (!existsSync(item.path)) {
      failures.push(`${item.output}: missing; run harness sync`)
      continue
    }
    if (readFileSync(item.path, 'utf8') !== item.text) failures.push(`${item.output}: drift; run harness sync`)
    const locked = manifest.lock?.outputs?.[item.output]
    if (locked !== undefined && locked !== item.hash) failures.push(`${item.output}: lock hash mismatch`)
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`check: ${failure}`)
    process.exit(1)
  }
  console.log(`check: ${manifest.compositions.length} composition(s) match ${manifest.version}`)
}

function cmdInit(options) {
  const dir = resolve(requireOption(options, 'dir'))
  const version = options.version ?? '0.1.0'
  const source = options['base-source'] ?? '../coding-harness/dist'
  mkdirSync(dir, { recursive: true })
  const delta = resolve(dir, 'AGENTS.delta.md')
  if (!existsSync(delta)) {
    writeFileSync(delta, '# Repository delta\n\nAdd repository-specific conventions here. The shared base composes above this file.\n')
  }
  const shim = resolve(dir, 'harness')
  if (!existsSync(shim)) {
    writeFileSync(shim, SHIM, { mode: 0o755 })
  }
  const manifestPath = resolve(dir, 'harness.manifest.json')
  if (!existsSync(manifestPath)) {
    const manifest = {
      version,
      tool: { version: toolVersion() },
      base: { source },
      compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }],
      skills: [],
      gates: [{
        id: 'harness-drift',
        command: './harness check --manifest harness.manifest.json',
        protects: 'composed files match the pinned base release',
        prove_fires: 'hand-edit AGENTS.md, then run harness check; expect exit 1',
        severity: 'blocking',
      }],
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }
  console.log(`initialized ${dir}`)
}

function cmdUpgrade(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const to = requireOption(options, 'to')
  const manifest = readValidManifest(path)
  manifest.version = to
  delete manifest.lock
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
  cmdSync(options)
}

function cmdScan(options) {
  const root = resolve(requireOption(options, 'root'))
  const results = scan(root)
  let bad = 0
  for (const result of results) {
    if (result.status !== 'ok') bad += 1
    console.log(`${result.status}\t${result.path}\t${result.detail}`)
  }
  console.log(`scan: ${results.length} manifest(s), ${bad} not ok`)
  if (bad > 0) process.exit(1)
}

function cmdProve(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const manifest = readValidManifest(path)
  const root = dirname(path)
  const only = options.gate
  let bad = 0
  for (const gate of manifest.gates) {
    if (only !== undefined && gate.id !== only) continue
    const result = proveGate(root, gate)
    if (result.status !== 'ok' && result.status !== 'skip') bad += 1
    console.log(`${result.status}\t${gate.id}\t${result.detail}`)
  }
  if (bad > 0) process.exit(1)
}

const COMMANDS = { validate: cmdValidate, sync: cmdSync, check: cmdCheck, init: cmdInit, upgrade: cmdUpgrade, release: cmdRelease, scan: cmdScan, prove: cmdProve }

try {
  const [command, ...rest] = process.argv.slice(2)
  if (command === undefined || command === '--help' || command === '-h') {
    console.log(USAGE)
    process.exit(command === undefined ? 1 : 0)
  }
  const handler = COMMANDS[command]
  if (handler === undefined) throw new Error(`unknown command: ${command}`)
  handler(parseOptions(rest))
} catch (error) {
  console.error(`harness: ${error.message}`)
  process.exit(1)
}
