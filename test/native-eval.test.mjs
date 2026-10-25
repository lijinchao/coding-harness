import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessRun, traceEvidence } from '../scripts/native-agent-eval.mjs'

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
