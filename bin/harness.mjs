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
import { createRelease, declaredVersion } from '../src/release.mjs'
import { toolCommit, toolVersion } from '../src/tool.mjs'
import { SHIM } from '../src/shim.mjs'
import { artifactProblems } from '../src/artifacts.mjs'
import { scan } from '../src/scan.mjs'
import { proveGate } from '../src/prove.mjs'
import { runGates } from '../src/gates.mjs'
import { applySync, inspect, resolveBase, writeAtomic } from '../src/state.mjs'

const USAGE = `usage: harness <command> [options]

commands:
  validate   --manifest <path>           validate manifest structure
  sync       --manifest <path>           compose outputs from the pinned base and rewrite the lock
  check      --manifest <path>           fail when an output or the fetched base drifted
  init       --dir <path> [--base-source <dir>] [--version <v>]
                                         scaffold a delta, manifest, and bootstrap
  upgrade    --manifest <path> --to <v>  pin a new base version and re-sync
  release    --base <dir> --out <dir> [--version <v>] [--force]
                                         build a versioned, hashed base release
  gates      --manifest <path> [--gate <id>]
                                         run every declared gate (one list for local and CI)
  scan       --root <dir>                list consumers whose harness is stale or diverged
  prove      --manifest <path> [--gate <id>] [--record]
                                         run the three-step proof for each gate action`

const BOOLEAN_FLAGS = new Set(['force', 'record'])

function parseOptions(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`)
    const name = token.slice(2)
    if (BOOLEAN_FLAGS.has(name)) {
      options[name] = true
      continue
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${token}`)
    options[name] = value
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
  const { dir, release } = createRelease(baseDir, outDir, version, { force: options.force === true })
  console.log(`released base@${release.version} -> ${dir}`)
  console.log(`files: ${Object.keys(release.files).length}`)
}

function cmdSync(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const manifest = readValidManifest(path)
  const outputs = applySync(dirname(path), path, manifest)
  for (const item of outputs) console.log(`synced ${item.output}`)
  console.log(`lock: ${manifest.version}`)
}

function cmdCheck(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const manifest = readValidManifest(path)
  const result = inspect(dirname(path), manifest)
  if (result.status !== 'ok') {
    console.error(`check: ${result.detail}`)
    process.exit(1)
  }
  console.log(`check: ${result.detail}`)
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
        prove_fires: 'hand-edit AGENTS.md, then run ./harness check; expect exit 1',
        prove_fires_command: "printf '<!-- prove -->' >> AGENTS.md",
        revert_command: './harness sync --manifest harness.manifest.json',
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
  const newPin = `base@${to}`
  const stale = /base@\d+\.\d+\.\d+/g
  const rewrite = (value) => (typeof value === 'string' ? value.replace(stale, newPin) : value)
  manifest.version = to
  for (const gate of manifest.gates) {
    gate.protects = rewrite(gate.protects)
    gate.prove_fires = rewrite(gate.prove_fires)
  }
  delete manifest.lock
  const outputs = applySync(dirname(path), path, manifest)
  for (const item of outputs) console.log(`synced ${item.output}`)
  console.log(`lock: ${manifest.version}`)
}

function cmdGates(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const manifest = readValidManifest(path)
  const root = dirname(path)
  const only = options.gate
  const gates = manifest.gates.filter((gate) => only === undefined || gate.id === only)
  const results = runGates(root, gates)
  let blocking = 0
  for (const result of results) {
    const ok = result.ok
    const status = ok ? 'ok' : result.severity === 'advisory' ? 'warn' : 'fail'
    if (!ok && result.severity !== 'advisory') blocking += 1
    console.log(`${status}\t${result.id}`)
  }
  if (blocking > 0) process.exit(1)
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
  if (only !== undefined && !manifest.gates.some((gate) => gate.id === only)) throw new Error(`gate not found: ${only}`)
  let bad = 0
  const recorded = {}
  for (const gate of manifest.gates) {
    if (only !== undefined && gate.id !== only) continue
    const result = proveGate(root, gate)
    if (result.status === 'ok') recorded[gate.id] = `${new Date().toISOString()}@${toolCommit() ?? 'unknown'}`
    if (result.status !== 'ok' && result.status !== 'skip') bad += 1
    console.log(`${result.status}\t${gate.id}\t${result.detail}`)
  }
  if (bad > 0) process.exit(1)
  if (options.record === true) {
    manifest.lock = manifest.lock ?? { version: manifest.version, outputs: {} }
    manifest.lock.proofs = { ...(manifest.lock.proofs ?? {}), ...recorded }
    writeAtomic(path, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`proofs recorded: ${Object.keys(recorded).length}`)
  }
}

const COMMANDS = { validate: cmdValidate, sync: cmdSync, check: cmdCheck, init: cmdInit, upgrade: cmdUpgrade, release: cmdRelease, scan: cmdScan, prove: cmdProve, gates: cmdGates }

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
