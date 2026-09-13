import { test } from 'node:test'
import assert from 'node:assert/strict'
import { definitionHash, proofProblems } from '../src/proof.mjs'

const TOOL = 'a'.repeat(40)

function gate(overrides) {
  return {
    id: 'g',
    command: 'true',
    protects: 'the invariant',
    prove_fires: 'break it',
    prove_fires_command: 'false',
    revert_command: 'true',
    severity: 'blocking',
    ...overrides,
  }
}

function manifest(overrides = {}) {
  const gates = overrides.gates ?? [gate()]
  const base = { version: '0.1.0', compositions: [], skills: [], gates }
  return { ...base, ...overrides, gates }
}

function record(of, overrides) {
  return { [of.id]: { at: new Date().toISOString(), tool: TOOL, definition: definitionHash(of), ...overrides } }
}

test('without a declared policy only an unknown gate id is reported', () => {
  assert.deepEqual(proofProblems(manifest({ lock: { proofs: { ghost: 'x' } } }), TOOL), ['lock.proofs references unknown gate ghost'])
  assert.deepEqual(proofProblems(manifest(), TOOL), [])
})

test('a blocking gate without a proof is reported once the policy is declared', () => {
  const declared = manifest({ governance: { proofs: { require: 'blocking' } } })
  assert.deepEqual(proofProblems(declared, TOOL), ['gate g: no recorded proof; run harness prove --record'])
})

test('a proof bound to the gate definition and the running tool passes', () => {
  const held = gate()
  const declared = manifest({ governance: { proofs: { require: 'blocking' } }, lock: { proofs: record(held) } })
  assert.deepEqual(proofProblems(declared, TOOL), [])
})

test('editing the gate command invalidates the proof, rewording protects does not', () => {
  const held = gate()
  const declared = { governance: { proofs: { require: 'blocking' } }, lock: { proofs: record(held) } }
  assert.deepEqual(proofProblems(manifest({ ...declared, gates: [gate({ protects: 'reworded' })] }), TOOL), [])
  const changed = proofProblems(manifest({ ...declared, gates: [gate({ command: 'false' })] }), TOOL)
  assert.equal(changed.length, 1)
  assert.match(changed[0], /the gate changed since it was proved/)
})

test('a proof recorded by another tool build is reported', () => {
  const held = gate()
  const declared = manifest({ governance: { proofs: { require: 'all' } }, lock: { proofs: record(held, { tool: 'b'.repeat(40) }) } })
  const problems = proofProblems(declared, TOOL)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /proof was recorded by tool b{40}/)
})

test('a proof older than the declared window is reported', () => {
  const held = gate()
  const old = new Date(Date.now() - 40 * 86400000).toISOString()
  const declared = manifest({ governance: { proofs: { maxAgeDays: 30 } }, lock: { proofs: record(held, { at: old }) } })
  const problems = proofProblems(declared, TOOL)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /past the declared 30/)
})

test('a legacy string proof is reported as unbound', () => {
  const declared = manifest({ governance: { proofs: { require: 'blocking' } }, lock: { proofs: { g: '2026-01-01T00:00:00.000Z@cafe' } } })
  assert.deepEqual(proofProblems(declared, TOOL), ['gate g: proof is not bound to its gate definition; run harness prove --record'])
})

test('a selection demands only the gates it names', () => {
  const gates = [gate({ id: 'a' }), gate({ id: 'b' })]
  const declared = manifest({ gates, governance: { proofs: { require: 'blocking' } }, lock: { proofs: record(gates[0]) } })
  assert.deepEqual(proofProblems(declared, TOOL), ['gate b: no recorded proof; run harness prove --record'])
  assert.deepEqual(proofProblems(declared, TOOL, new Set(['a'])), [])
})

test('require none is silent and require all covers advisory gates', () => {
  const advisory = gate({ id: 'warn', severity: 'advisory' })
  const gates = [gate(), advisory]
  const none = manifest({ gates, governance: { proofs: { require: 'none' } } })
  assert.deepEqual(proofProblems(none, TOOL), [])
  const blocking = manifest({ gates, governance: { proofs: { require: 'blocking' } }, lock: { proofs: record(gate()) } })
  assert.deepEqual(proofProblems(blocking, TOOL), [])
  const all = manifest({ gates, governance: { proofs: { require: 'all' } }, lock: { proofs: record(gate()) } })
  assert.deepEqual(proofProblems(all, TOOL), ['gate warn: no recorded proof; run harness prove --record'])
  const complete = manifest({ gates, governance: { proofs: { require: 'all' } }, lock: { proofs: { ...record(gate()), ...record(advisory) } } })
  assert.deepEqual(proofProblems(complete, TOOL), [])
})
