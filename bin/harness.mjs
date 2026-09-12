#!/usr/bin/env node
/**
 * Zero-dependency CLI for the coding harness.
 *
 * Commands compose a repository's harness from a pinned base plus a local
 * delta, and detect drift between the two.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadManifest, validateManifest } from '../src/manifest.mjs'
import { composeText, sha256 } from '../src/compose.mjs'

const USAGE = `usage: harness <command> [options]

commands:
  validate   --manifest <path>           validate manifest structure
  sync       --manifest <path>           compose outputs and rewrite the lock
  check      --manifest <path>           fail when a composed output drifted
  init       --dir <path>                scaffold a repository delta and manifest
  upgrade    --manifest <path> --to <v>  pin a new base version and re-sync`

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

function composedOutputs(root, manifest) {
  return manifest.compositions.map((composition) => {
    const text = composeText(root, composition.sources)
    return { output: composition.output, path: resolve(root, composition.output), text, hash: sha256(text) }
  })
}

function cmdValidate(options) {
  readValidManifest(resolve(requireOption(options, 'manifest')))
  console.log('manifest: ok')
}

function cmdSync(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const manifest = readValidManifest(path)
  const outputs = {}
  for (const item of composedOutputs(dirname(path), manifest)) {
    mkdirSync(dirname(item.path), { recursive: true })
    writeFileSync(item.path, item.text)
    outputs[item.output] = item.hash
    console.log(`synced ${item.output}`)
  }
  manifest.lock = { version: manifest.version, outputs }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`lock: ${manifest.version}`)
}

function cmdCheck(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const manifest = readValidManifest(path)
  const failures = []
  for (const item of composedOutputs(dirname(path), manifest)) {
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
  mkdirSync(dir, { recursive: true })
  const delta = resolve(dir, 'AGENTS.delta.md')
  if (!existsSync(delta)) {
    writeFileSync(delta, '# Repository delta\n\nAdd repository-specific conventions here. The shared base composes above this file.\n')
  }
  const manifestPath = resolve(dir, 'harness.manifest.json')
  if (!existsSync(manifestPath)) {
    const manifest = {
      version: '0.1.0',
      compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.base.md', 'AGENTS.delta.md'] }],
      skills: [],
      gates: [{
        id: 'harness-drift',
        command: 'harness check --manifest harness.manifest.json',
        protects: 'composed files match the pinned base',
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
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
  cmdSync(options)
}

const COMMANDS = { validate: cmdValidate, sync: cmdSync, check: cmdCheck, init: cmdInit, upgrade: cmdUpgrade }

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
