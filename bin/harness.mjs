#!/usr/bin/env node
/**
 * Zero-dependency CLI for the coding harness.
 *
 * Commands release the shared base as a versioned, hashed artifact, compose a
 * repository's harness from the pinned base plus a local delta, and detect drift
 * between the two.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadManifest, validateManifest } from '../src/manifest.mjs'
import { composeText } from '../src/compose.mjs'
import { createRelease, declaredVersion } from '../src/release.mjs'
import { toolCommit, toolVersion } from '../src/tool.mjs'
import { SHIM } from '../src/shim.mjs'
import { artifactProblems } from '../src/artifacts.mjs'
import { scan } from '../src/scan.mjs'
import { proveGate } from '../src/prove.mjs'
import { runGates } from '../src/gates.mjs'
import { applySync, inspect, resolveBase, writeAtomic } from '../src/state.mjs'
import { doctorProblems } from '../src/doctor.mjs'
import { loadRequirements } from '../src/adopt.mjs'

const USAGE = `usage: harness <command> [options]

commands:
  validate   --manifest <path>           validate manifest structure
  sync       --manifest <path>           compose outputs from the pinned base and rewrite the lock
  check      --manifest <path>           fail when an output or the fetched base drifted
  doctor     --manifest <path>           fail when declared governance facts drift
  init       --dir <path> [--base-source <dir>] [--version <v>]
                                         scaffold a delta, manifest, and bootstrap
  upgrade    --manifest <path> --to <v>  pin a new base version and re-sync
  release    --base <dir> --out <dir> [--version <v>] [--force]
                                         build a versioned, hashed base release
  gates      --manifest <path> [--gate <id>] [--jobs <n>] [--timeout <s>] [--report <file>]
                                         run every declared gate (one list for local and CI)
  diff       --manifest <path> --to <v> preview what a base upgrade changes
  metrics    --log <file>                first-pass rate from gate reports
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

const WORKFLOW = "name: harness\n\non:\n  push:\n    branches: [main]\n  pull_request:\n\njobs:\n  harness:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v5\n      - uses: actions/setup-node@v5\n        with:\n          node-version: '22'\n      - name: Run every declared gate\n        run: ./harness gates --manifest harness.manifest.json\n      - name: Prove every gate still fires\n        run: ./harness prove --manifest harness.manifest.json\n"

function cmdInit(options) {
  const dir = resolve(requireOption(options, 'dir'))
  const version = options.version ?? toolVersion()
  const source = options['base-source'] ?? 'git:https://github.com/lijinchao/coding-harness.git'
  const toolSource = options['tool-source'] ?? source
  mkdirSync(dir, { recursive: true })

  const delta = resolve(dir, 'AGENTS.delta.md')
  if (!existsSync(delta)) {
    writeFileSync(delta, '# Repository delta\n\nEverything above this file comes from the shared base. This file holds only what is true for this repository.\n\n## Commands\n\n- Test: `<your test command>`\n- Lint: `<your lint command>`\n\nRun them before reporting any task complete, and paste the output.\n')
  }

  const shim = resolve(dir, 'harness')
  if (!existsSync(shim)) writeFileSync(shim, SHIM, { mode: 0o755 })

  const manifestPath = resolve(dir, 'harness.manifest.json')
  if (!existsSync(manifestPath)) {
    const manifest = {
      version,
      tool: { version: toolVersion(), source: toolSource },
      base: { source, registry: 'dist', cache: '.harness' },
      governance: { owners: ['@owner'] },
      compositions: [
        { output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] },
        { output: 'REVIEW.md', sources: ['base:REVIEW.base.md'] },
      ],
      skills: [
        { id: 'test-driven-development', path: 'base:skills/test-driven-development/SKILL.md', trigger: 'before writing implementation code', owner: '@owner' },
        { id: 'writing-a-gate', path: 'base:skills/writing-a-gate/SKILL.md', trigger: 'before adding a gate', owner: '@owner' },
      ],
      gates: [
        { id: 'harness-drift', command: './harness check --manifest harness.manifest.json', protects: `composed files match base@${version} plus this delta`, prove_fires: 'hand-edit AGENTS.md, then run ./harness check; expect exit 1', prove_fires_command: "printf '<!-- prove -->' >> AGENTS.md", revert_command: './harness sync --manifest harness.manifest.json', severity: 'blocking' },
        { id: 'validate', command: './harness validate --manifest harness.manifest.json', protects: 'declared skills and gates carry their required sections', prove_fires: 'corrupt the manifest, then run ./harness validate; expect exit 1', prove_fires_command: "printf '{' >> harness.manifest.json", revert_command: 'git checkout -- harness.manifest.json', severity: 'blocking' },
        { id: 'doctor', command: './harness doctor --manifest harness.manifest.json', protects: 'declared governance facts stay consistent', prove_fires: 'empty CODEOWNERS, then run ./harness doctor; expect exit 1', prove_fires_command: "printf '' > .github/CODEOWNERS", revert_command: 'git checkout -- .github/CODEOWNERS', severity: 'blocking' },
      ],
    }
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  }

  const gitignore = resolve(dir, '.gitignore')
  if (existsSync(gitignore)) {
    const text = readFileSync(gitignore, 'utf8')
    if (!text.split('\n').includes('.harness/')) writeFileSync(gitignore, text + (text.endsWith('\n') ? '' : '\n') + '.harness/\n')
  } else {
    writeFileSync(gitignore, '.harness/\n')
  }

  const workflowPath = resolve(dir, '.github/workflows/harness.yml')
  if (!existsSync(workflowPath)) {
    mkdirSync(dirname(workflowPath), { recursive: true })
    writeFileSync(workflowPath, WORKFLOW)
  }

  const codeowners = resolve(dir, '.github/CODEOWNERS')
  if (!existsSync(codeowners)) {
    mkdirSync(dirname(codeowners), { recursive: true })
    writeFileSync(codeowners, '# Base owner: base changes are reviewed here.\n* @owner\n')
  }

  try {
    const manifest = readValidManifest(manifestPath)
    const outputs = applySync(dir, manifestPath, manifest)
    for (const item of outputs) console.log(`synced ${item.output}`)
    console.log(`initialized ${dir} (green)`)
  } catch (error) {
    console.log(`initialized ${dir}`)
    console.log(`note: ${error.message}`)
    console.log('run ./harness sync once the base source is reachable')
  }
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

async function cmdGates(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const manifest = readValidManifest(path)
  const root = dirname(path)
  const only = options.gate
  const gates = manifest.gates.filter((gate) => only === undefined || gate.id === only)
  const results = await runGates(root, gates, { timeoutMs: options.timeout === undefined ? 0 : Number(options.timeout) * 1000, jobs: options.jobs === undefined ? 1 : Number(options.jobs) })
  let blocking = 0
  for (const result of results) {
    const status = result.ok ? 'ok' : result.severity === 'advisory' ? 'warn' : 'fail'
    if (!result.ok && result.severity !== 'advisory') blocking += 1
    if (result.output.trim() !== '') process.stdout.write(result.output.endsWith('\n') ? result.output : result.output + '\n')
    console.log(`${status}\t${result.id}${result.timedOut ? '\t(timeout)' : ''}`)
  }
  if (typeof options.report === 'string') {
    const entry = { at: new Date().toISOString(), version: manifest.version, tool: toolVersion(), results: results.map((result) => ({ id: result.id, ok: result.ok })) }
    appendFileSync(resolve(options.report), `${JSON.stringify(entry)}\n`)
  }
  if (blocking > 0) process.exit(1)
}

function cmdDiff(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const manifest = readValidManifest(path)
  const root = dirname(path)
  const to = requireOption(options, 'to')
  const fromBase = resolveBase(root, manifest)
  const toBase = resolveBase(root, { ...manifest, version: to })
  const from = fromBase === null ? {} : fromBase.release.files
  const target = toBase === null ? {} : toBase.release.files
  console.log(`base ${manifest.version} -> ${to}`)
  for (const rel of Object.keys(target)) if (!(rel in from)) console.log(`  + ${rel}`)
  for (const rel of Object.keys(from)) if (!(rel in target)) console.log(`  - ${rel}`)
  for (const rel of Object.keys(target)) if (rel in from && from[rel] !== target[rel]) console.log(`  ~ ${rel}`)
  for (const composition of manifest.compositions) {
    const before = composeText(root, composition.sources, fromBase === null ? undefined : fromBase.dir)
    const after = composeText(root, composition.sources, toBase === null ? undefined : toBase.dir)
    console.log(`  ${before === after ? '=' : '!'} ${composition.output}`)
  }
  const fromReq = fromBase === null ? undefined : loadRequirements(fromBase.dir)
  const toReq = toBase === null ? undefined : loadRequirements(toBase.dir)
  for (const id of toReq?.requiredGates ?? []) if (!(fromReq?.requiredGates ?? []).includes(id)) console.log(`  + required gate: ${id}`)
  for (const id of fromReq?.requiredGates ?? []) if (!(toReq?.requiredGates ?? []).includes(id)) console.log(`  - required gate: ${id}`)
  for (const key of toReq?.requiredGovernance ?? []) if (!(fromReq?.requiredGovernance ?? []).includes(key)) console.log(`  + required governance: ${key}`)
}

function cmdMetrics(options) {
  const log = resolve(requireOption(options, 'log'))
  const runs = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const green = runs.filter((run) => run.results.every((result) => result.ok)).length
  console.log(`runs: ${runs.length}`)
  console.log(`green: ${green}`)
  console.log(`first-pass rate: ${runs.length === 0 ? 'n/a' : (green / runs.length).toFixed(2)}`)
  const failures = {}
  for (const run of runs) for (const result of run.results) if (!result.ok) failures[result.id] = (failures[result.id] ?? 0) + 1
  for (const [id, count] of Object.entries(failures)) console.log(`failures ${id}: ${count}`)
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

function cmdDoctor(options) {
  const path = resolve(requireOption(options, 'manifest'))
  const manifest = readValidManifest(path)
  const root = dirname(path)
  const base = manifest.base === undefined ? null : resolveBase(root, manifest)
  const requirements = base === null ? undefined : loadRequirements(base.dir)
  const problems = doctorProblems(root, manifest, requirements)
  if (problems.length > 0) {
    for (const problem of problems) console.error(`doctor: ${problem}`)
    process.exit(1)
  }
  console.log('doctor: ok')
}

const COMMANDS = { validate: cmdValidate, doctor: cmdDoctor, diff: cmdDiff, metrics: cmdMetrics, sync: cmdSync, check: cmdCheck, init: cmdInit, upgrade: cmdUpgrade, release: cmdRelease, scan: cmdScan, prove: cmdProve, gates: cmdGates }

try {
  const [command, ...rest] = process.argv.slice(2)
  if (command === undefined || command === '--help' || command === '-h') {
    console.log(USAGE)
    process.exit(command === undefined ? 1 : 0)
  }
  const handler = COMMANDS[command]
  if (handler === undefined) throw new Error(`unknown command: ${command}`)
  await handler(parseOptions(rest))
} catch (error) {
  console.error(`harness: ${error.message}`)
  process.exit(1)
}