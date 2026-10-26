import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import * as proof from '../src/proof.mjs'
import { validateManifest } from '../src/manifest.mjs'

const tool = 'a'.repeat(40)
const sha = data => createHash('sha256').update(data).digest('hex')
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'proof-inputs-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' })
  git('init', '-q')
  const original = "import{existsSync}from'node:fs';process.exit(existsSync('injected')?1:0)\n"
  writeFileSync(join(root, 'checker.mjs'), original)
  writeFileSync(join(root, 'source.md'), '# fixture\n')
  git('add', '.'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'fixture')
  const gate = { id: 'g', command: 'node checker.mjs', protects: 'a real checker', prove_fires: 'inject', prove_fires_command: 'touch injected', revert_command: 'rm -f injected', severity: 'blocking', proof_inputs: ['checker.mjs'] }
  const m = { version: '0.1.0', compositions: [{ output: 'AGENTS.md', sources: ['source.md'] }], skills: [], gates: [gate], governance: { proofs: { require: 'blocking', requireInputs: true } }, lock: { proofs: { g: { at: new Date().toISOString(), tool, definition: proof.definitionHash(gate), inputs: { 'checker.mjs': sha(original) } } } } }
  m.lock.version = m.version
  m.lock.outputs = {}
  return { root, git, gate, m }
}

test('hollowing a checker invalidates its proof without changing the command', t => {
  const { root, m } = fixture(t)
  assert.deepEqual(proof.proofProblems(m, tool, undefined, root), [])
  writeFileSync(join(root, 'checker.mjs'), 'console.log("ok")\n')
  assert.match(proof.proofProblems(m, tool, undefined, root).join('\n'), /input.*changed|input.*differ/)
})

test('legacy records cannot satisfy input declarations or strict input policy', t => {
  const { root, m, gate } = fixture(t)
  delete m.lock.proofs.g.inputs
  assert.match(proof.proofProblems(m, tool, undefined, root).join('\n'), /input/)
  delete gate.proof_inputs
  m.lock.proofs.g.definition = proof.definitionHash(gate)
  assert.match(proof.proofProblems(m, tool, undefined, root).join('\n'), /proof_inputs/)
})

test('input snapshots reject deletion, untracked paths, globs and escapes', t => {
  const { root, gate } = fixture(t)
  writeFileSync(join(root, 'untracked'), 'x')
  symlinkSync(tmpdir(), join(root, 'outside'))
  for (const path of ['missing', 'untracked', '../escape', resolve(root, 'checker.mjs'), 'outside/file', '*.mjs', 'checker.mjs/../checker.mjs']) {
    assert.throws(() => proof.snapshotProofInputs(root, { ...gate, proof_inputs: [path] }), /input/)
  }
  rmSync(join(root, 'checker.mjs'))
  assert.throws(() => proof.snapshotProofInputs(root, gate), /input/)
})

test('sorted snapshots bind declared file sets and exclude unrelated product changes', t => {
  const { root, gate, m } = fixture(t)
  assert.deepEqual(proof.snapshotProofInputs(root, gate), m.lock.proofs.g.inputs)
  writeFileSync(join(root, 'source.md'), '# product change\n')
  assert.deepEqual(proof.proofProblems(m, tool, undefined, root), [])
  gate.proof_inputs.push('source.md')
  assert.match(proof.proofProblems(m, tool, undefined, root).join('\n'), /changed|input/)
  assert.deepEqual(Object.keys(proof.snapshotProofInputs(root, gate)), ['checker.mjs', 'source.md'])
})

test('manifest accepts explicit inputs and rejects empty or duplicate declarations', t => {
  const { m, gate } = fixture(t)
  assert.deepEqual(validateManifest(m), [])
  for (const value of [[], ['checker.mjs', 'checker.mjs'], [3]]) {
    gate.proof_inputs = value
    assert.ok(validateManifest(m).some(error => error.includes('proof_inputs')))
  }
})

test('proof input records reject malformed digests', t => {
  const { m } = fixture(t)
  m.lock.proofs.g.inputs['checker.mjs'] = 'not-a-sha256'
  assert.ok(validateManifest(m).some(error => error.includes('inputs')))
})

test('prototype-named tracked inputs are recorded as ordinary paths', t => {
  const { root, git, gate } = fixture(t)
  writeFileSync(join(root, '__proto__'), 'checker')
  git('add', '__proto__')
  const inputs = proof.snapshotProofInputs(root, { ...gate, proof_inputs: ['__proto__'] })
  assert.equal(Object.hasOwn(inputs, '__proto__'), true)
  assert.equal(inputs.__proto__, sha('checker'))
})

test('integer-like input filenames do not make a fresh snapshot stale', t => {
  const { root, git, gate, m } = fixture(t)
  for (const path of ['2', '10']) writeFileSync(join(root, path), 'rule')
  git('add', '2', '10')
  gate.proof_inputs = ['2', '10']
  m.lock.proofs.g.definition = proof.definitionHash(gate)
  m.lock.proofs.g.inputs = proof.snapshotProofInputs(root, gate)
  assert.deepEqual(proof.proofProblems(m, tool, undefined, root), [])
})

test('CLI records checker bytes and gates rejects a hollowed checker', t => {
  const { root, git, m } = fixture(t)
  const path = join(root, 'harness.manifest.json')
  delete m.lock
  writeFileSync(path, JSON.stringify(m))
  git('add', '.'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'manifest')
  const cli = resolve(import.meta.dirname, '../bin/harness.mjs')
  const run = (...args) => spawnSync(process.execPath, [cli, ...args, '--manifest', path], { encoding: 'utf8', timeout: 15000 })
  const recorded = run('prove', '--record', '--timeout', '3')
  assert.equal(recorded.status, 0, recorded.stdout + recorded.stderr)
  assert.ok(JSON.parse(readFileSync(path)).lock.proofs.g.inputs['checker.mjs'])
  assert.equal(run('prove', '--check').status, 0)
  writeFileSync(join(root, 'checker.mjs'), 'console.log("ok")\n')
  for (const args of [['prove', '--check'], ['gates', '--gate', 'g']]) {
    const result = run(...args)
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stdout + result.stderr, /input.*changed|input.*differ/)
  }
})

test('require none does not require input declarations when recording', t => {
  const { root, git, gate, m } = fixture(t)
  m.governance.proofs.require = 'none'
  delete gate.proof_inputs
  delete m.lock
  const path = join(root, 'harness.manifest.json')
  writeFileSync(path, JSON.stringify(m))
  git('add', '.'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'policy')
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../bin/harness.mjs'), 'prove', '--manifest', path, '--record'], { encoding: 'utf8', timeout: 15000 })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})
