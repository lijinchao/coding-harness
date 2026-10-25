import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { assessRun, traceEvidence } from '../scripts/native-agent-eval.mjs'
import { metricsWindow } from '../src/metrics.mjs'

test('a final model assertion cannot substitute for an observed successful check', () => {
  const evidence = traceEvidence('codex', [{ type: 'item.completed', item: { type: 'agent_message', text: 'All tests passed' } }])
  assert.equal(assessRun({ code: 0, timedOut: false, clean: true, independentCheck: 0, evidence }).execution_qualified, false)
})

test('Codex command evidence and usage are extracted from native events', () => {
  const evidence = traceEvidence('codex', [
    { type: 'item.completed', item: { type: 'command_execution', command: 'node --test test/context-map.test.mjs', exit_code: 0, aggregated_output: '# pass 8\n# fail 0' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Reviewed the context guarantees and recorded their limits.' } },
    { type: 'turn.completed', usage: { input_tokens: 300, cached_input_tokens: 100, output_tokens: 50 } },
  ])
  assert.equal(evidence.passed_checks.length, 1)
  assert.equal(evidence.usage.input_tokens, 300)
  assert.equal(assessRun({ code: 0, timedOut: false, clean: true, independentCheck: 0, evidence }).execution_qualified, true)
})

test('Claude tool results must correlate to a real Bash invocation', () => {
  const evidence = traceEvidence('claude', [
    { type: 'system', subtype: 'init', model: 'recorded-model', skills: ['verification-tiers'] },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'check-1', name: 'Bash', input: { command: 'node --test test/proof-failure-boundary.test.mjs' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'check-1', content: '# pass 3\n# fail 0', is_error: false }] } },
  ])
  assert.equal(evidence.passed_checks.length, 1)
  assert.equal(evidence.model, 'recorded-model')
  const forged = traceEvidence('claude', [{ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'unknown', content: '# fail 0' }] } }])
  assert.equal(forged.passed_checks.length, 0)
})

test('timeouts, source edits or a failed independent check prevent qualification', () => {
  const base = { code: 0, timedOut: false, clean: true, independentCheck: 0, evidence: { passed_checks: ['node --test test/context-map.test.mjs'] } }
  for (const change of [{ timedOut: true }, { clean: false }, { independentCheck: 1 }, { code: 1 }]) {
    assert.equal(assessRun({ ...base, ...change }).execution_qualified, false)
  }
})

test('DSH projected tool calls require a matching successful tool result', () => {
  const evidence = traceEvidence('dsh', [
    { type: 'tool_call', callId: 't1', tool: 'bash', input: { command: 'node --test test/context-map.test.mjs' } },
    { type: 'tool_result', callId: 't1', status: 'completed', result: '# pass 8\n# fail 0' },
    { type: 'final', text: 'Observed checks passed.' },
  ])
  assert.equal(evidence.passed_checks.length, 1)
  assert.equal(evidence.final, 'Observed checks passed.')
})

test('successful tests without a completed agent turn are not a completed task', () => {
  const evidence = traceEvidence('codex', [
    { type: 'item.completed', item: { type: 'command_execution', command: 'node --test test/context-map.test.mjs', exit_code: 0, aggregated_output: '# pass 8\n# fail 0' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Still investigating.' } },
    { type: 'turn.failed', error: { message: 'network failure' } },
  ])
  assert.equal(assessRun({ code: 0, timedOut: false, clean: true, independentCheck: 0, evidence }).execution_qualified, false)
})

test('focused check success does not prove the repository mandatory delivery checks', () => {
  const evidence = traceEvidence('codex', [
    { type: 'item.completed', item: { type: 'command_execution', command: 'node --test test/context-map.test.mjs', exit_code: 0, aggregated_output: '# pass 8\n# fail 0' } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'Assessment with focused evidence.' } },
    { type: 'turn.completed', usage: {} },
  ])
  const grade = assessRun({ code: 0, timedOut: false, clean: true, independentCheck: 0, evidence })
  assert.equal(grade.execution_qualified, true)
  assert.equal(grade.repository_dod_qualified, false)
})

test('truncated DSH output is incomplete evidence even when the visible text looks green', () => {
  const evidence = traceEvidence('dsh', [
    { type: 'tool_call', callId: 't', tool: 'bash', input: { command: 'npm test' } },
    { type: 'tool_result', callId: 't', status: 'completed', truncated: true, result: '# pass 253\n# fail 0' },
    { type: 'final', text: 'Done.' },
  ])
  assert.equal(evidence.passed_checks.length, 0)
  assert.equal(evidence.evidence_incomplete, true)
})

test('offline summaries append outcomes once without contaminating gate-health metrics', t => {
  const root = mkdtempSync(join(tmpdir(), 'native-summary-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = join(root, 'case')
  mkdirSync(dir)
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ agent: 'codex', version: 'test-runtime', revision, variant: 'test', task: 'context', at: '2026-10-25T00:00:00Z', exit_code: 0, timed_out: false, source_changes: '', independent_check: 0, elapsed_ms: 10 }))
  writeFileSync(join(dir, 'trace.jsonl'), JSON.stringify({ type: 'turn.completed', usage: {} }) + '\n')
  const log = join(root, 'metrics.jsonl')
  writeFileSync(log, JSON.stringify({ kind: 'gate-health', results: [{ id: 'g', ok: true }] }) + '\n')
  const args = [resolve(import.meta.dirname, '../scripts/native-agent-eval.mjs'), '--summarize', root, '--out', join(root, 'summary.json'), '--metrics', log]
  for (let i = 0; i < 2; i++) execFileSync(process.execPath, args, { stdio: 'pipe' })
  const rows = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(rows.length, 2)
  assert.equal(rows[1].kind, 'delivery-outcome')
  assert.equal(metricsWindow(rows).green, 1)
  assert.equal(metricsWindow(rows).runs, 1)
})

test('independent delivery verification binds the clean fixture and records both actual command results', t => {
  const root = mkdtempSync(join(tmpdir(), 'native-independent-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const workspace = join(root, 'repo'), evidence = join(root, 'evidence')
  mkdirSync(workspace); mkdirSync(evidence)
  writeFileSync(join(workspace, 'package.json'), JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }))
  writeFileSync(join(workspace, 'harness'), '#!/bin/sh\nprintf "check: 2 composition(s) match fixture\\n"\n', { mode: 0o755 })
  const git = (...args) => execFileSync('git', ['-C', workspace, ...args], { stdio: 'pipe' })
  git('init', '-q'); git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'fixture')
  const revision = git('rev-parse', 'HEAD').toString().trim()
  writeFileSync(join(evidence, 'report.json'), JSON.stringify({ workspace, revision, fixture_revision: revision }))
  const args = [resolve(import.meta.dirname, '../scripts/native-agent-eval.mjs'), '--verify-delivery', evidence]
  execFileSync(process.execPath, args, { stdio: 'pipe' })
  const receipt = JSON.parse(readFileSync(join(evidence, 'independent-delivery.json')))
  assert.equal(receipt.fixture_revision, revision)
  assert.equal(receipt.clean, true)
  assert.equal(receipt.suite.exit_code, 0)
  assert.equal(receipt.example.exit_code, 0)
  writeFileSync(join(workspace, 'package.json'), '{}')
  assert.throws(() => execFileSync(process.execPath, args, { stdio: 'pipe' }), /exact clean task snapshot/)
})

test('attempted but failed native skill calls are not successful skill use', () => {
  const cases = [
    ['codex', [{ type: 'item.completed', item: { type: 'command_execution', command: 'cat .agents/skills/verification-tiers/SKILL.md', exit_code: 1, aggregated_output: 'not found' } }]],
    ['dsh', [{ type: 'tool_call', callId: 's', tool: 'skill', input: { name: 'verification-tiers' } }, { type: 'tool_result', callId: 's', status: 'error', result: 'not found' }]],
    ['claude', [{ type: 'assistant', message: { content: [{ type: 'tool_use', id: 's', name: 'Skill', input: { skill: 'verification-tiers' } }] } }, { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 's', is_error: true, content: 'not found' }] } }]],
  ]
  for (const [agent, events] of cases) assert.equal(traceEvidence(agent, events).skill_uses.length, 0, agent)
})
