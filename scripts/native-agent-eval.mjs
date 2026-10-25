import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCommand } from '../src/process.mjs'
import { inside } from '../src/context.mjs'

const repository = resolve(import.meta.dirname, '..')
const checkCommand = command => /(?:node\s+--test|npm\s+test)/.test(command)
const passed = output => /# fail 0\b/.test(output) && /# pass [1-9]\d*/.test(output)

export function traceEvidence(agent, events) {
  const result = { passed_checks: [], skill_uses: [], catalog: [], model: null, usage: null, final: '', completed: false, evidence_incomplete: false, required_checks: { suite: false, example: false }, attempted_checks: { suite: false, example: false } }
  const observe = (command, output, ok, truncated = false) => {
    if (/npm\s+test/.test(command)) result.attempted_checks.suite = true
    if (/harness\s+check.*examples\/consumer\/harness\.manifest\.json/.test(command)) result.attempted_checks.example = true
    if (truncated && checkCommand(command)) { result.evidence_incomplete = true; return }
    if (!ok) return
    if (checkCommand(command) && passed(output)) result.passed_checks.push(command)
    if (/npm\s+test/.test(command) && passed(output)) result.required_checks.suite = true
    if (/harness\s+check.*examples\/consumer\/harness\.manifest\.json/.test(command) && /check: \d+ composition\(s\) match/.test(output)) result.required_checks.example = true
  }
  const calls = new Map()
  for (const event of events) {
    if (agent === 'codex') {
      const item = event.item
      if (event.type === 'item.completed' && item?.type === 'command_execution') {
        observe(item.command, item.aggregated_output ?? '', item.exit_code === 0)
        if (item.exit_code === 0 && /\.agents\/skills\//.test(item.command ?? '')) result.skill_uses.push(item.command)
      }
      if (item?.type === 'agent_message') result.final = item.text ?? ''
      if (event.type === 'turn.completed') { result.usage = event.usage; result.completed = true }
      if (event.type === 'turn.failed') result.completed = false
    } else if (agent === 'dsh') {
      if (event.type === 'tool_call') {
        calls.set(event.callId, event)
      }
      if (event.type === 'tool_result') {
        const call = calls.get(event.callId)
        const command = call?.input?.command ?? call?.input?.code ?? ''
        if (event.status === 'completed' && call && (/skill/.test(call.tool) || /\.agents\/skills\//.test(JSON.stringify(call.input)))) result.skill_uses.push({ tool: call.tool, input: call.input })
        observe(command, event.result ?? '', event.status === 'completed', event.truncated === true)
      }
      if (event.type === 'status' && event.phase === 'step_end' && event.usage) {
        result.usage ??= { steps: [] }
        result.usage.steps.push(event.usage)
      }
      if (event.type === 'final') { result.final = event.text ?? ''; result.completed = true }
    } else {
      if (event.type === 'system' && event.subtype === 'init') {
        result.model = event.model ?? null
        result.catalog = event.skills ?? event.slash_commands ?? []
      }
      for (const part of event.message?.content ?? []) {
        if (part.type === 'tool_use') {
          calls.set(part.id, part)
        }
        if (part.type === 'tool_result') {
          const call = calls.get(part.tool_use_id)
          const output = typeof part.content === 'string' ? part.content : JSON.stringify(part.content)
          if (!part.is_error && call && (call.name === 'Skill' || /\.(?:agents|claude)\/skills\//.test(call.input?.file_path ?? call.input?.command ?? ''))) result.skill_uses.push(call.input)
          if (call?.name === 'Bash') observe(call.input?.command ?? '', output, !part.is_error)
        }
      }
      if (event.type === 'result') {
        result.final = event.result ?? ''
        result.usage = event.usage ?? null
        result.cost_usd = event.total_cost_usd ?? null
        result.provider_error = event.is_error === true
        result.completed = event.is_error !== true
      }
    }
  }
  return result
}

export function assessRun({ code, timedOut, clean, independentCheck, evidence }) {
  const qualified = code === 0 && !timedOut && clean && independentCheck === 0 && evidence.completed === true && evidence.final.trim().length > 0 && !evidence.provider_error && evidence.passed_checks.length > 0
  return {
    execution_qualified: qualified,
    repository_dod_qualified: qualified && evidence.required_checks?.suite === true && evidence.required_checks?.example === true,
    human_acceptance: 'pending',
  }
}

const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'"
const tasks = {
  review: 'Review this repository\'s proof failure/recovery behavior for actionable Bugs, Security and Compliance findings. Choose and run focused existing regression checks supporting your conclusions. Report concrete evidence, verification tier and limitations; do not approve the author.',
  context: 'Assess which guarantees of this repository\'s context map are mechanically enforced and which remain agent responsibilities. Choose and run a focused existing regression supporting your answer. Report evidence, verification tier and any supported operational gap.',
}

function summarize(options) {
  const root = resolve(options.summarize)
  if (!options.out) throw new Error('summary requires --out')
  const records = []
  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name)
    if (!existsSync(join(dir, 'report.json'))) continue
    const run = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'))
    const trace = readFileSync(join(dir, 'trace.jsonl'), 'utf8')
    const events = trace.split('\n').flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
    const evidence = traceEvidence(run.agent, events)
    const grade = assessRun({ code: run.exit_code, timedOut: run.timed_out, clean: run.source_changes === '', independentCheck: run.independent_check, evidence })
    let independentDelivery = false
    const receiptFile = join(dir, 'independent-delivery.json')
    if (existsSync(receiptFile)) {
      const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'))
      independentDelivery = receipt.fixture_revision === (run.fixture_revision ?? run.revision) && receipt.clean === true
        && ['suite', 'example'].every(id => receipt[id]?.exit_code === 0 && existsSync(join(dir, receipt[id].log))
          && createHash('sha256').update(readFileSync(join(dir, receipt[id].log))).digest('hex') === receipt[id].sha256)
    }
    const stepEvents = events.filter(event => event.type === 'status' && event.phase === 'step_end')
    let usage = evidence.usage
    if (run.agent === 'dsh') {
      usage = null
      if (stepEvents.length && stepEvents.every(event => event.usage)) {
        usage = {}
        for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens']) {
          if (stepEvents.every(event => typeof event.usage[key] === 'number')) usage[key] = stepEvents.reduce((total, event) => total + event.usage[key], 0)
        }
      }
    }
    const subject = JSON.parse(execFileSync('git', ['-C', repository, 'show', run.revision + ':harness.manifest.json'], { encoding: 'utf8' }))
    const status = run.timed_out ? 'timeout' : evidence.provider_error ? 'provider-error' : run.exit_code !== 0 ? 'execution-error' : independentDelivery && grade.execution_qualified ? 'independently-verified' : evidence.evidence_incomplete ? 'evidence-incomplete' : !grade.execution_qualified ? 'unqualified' : !grade.repository_dod_qualified ? 'missing-required-checks' : 'repository-dod-qualified'
    records.push({ case_id: name, at: run.at, agent: run.agent, runtime: run.version, task: run.task, variant: run.variant, revision: run.revision,
      fixture_revision: run.fixture_revision ?? run.revision, scorer_hidden: run.scorer_hidden ?? false, kernel_version: subject.version, tool_commit: subject.tool.commit,
      agent_elapsed_ms: run.elapsed_ms, exit_code: run.exit_code, timed_out: run.timed_out, source_clean: run.source_changes === '', independent_check_exit: run.independent_check,
      status, ...grade, independent_delivery_qualified: independentDelivery, projected_evidence_incomplete: evidence.evidence_incomplete, native_catalog: evidence.catalog.filter(id => ['test-driven-development', 'verification-tiers', 'writing-a-gate'].includes(id)),
      observed_skill_uses: evidence.skill_uses, observed_passed_checks: evidence.passed_checks, required_checks: evidence.required_checks, attempted_checks: evidence.attempted_checks, model: evidence.model, usage,
      trace: relative(repository, join(dir, 'trace.jsonl')), trace_sha256: createHash('sha256').update(trace).digest('hex'),
    })
  }
  const result = { schema_version: 'coding-harness.native-pilot-summary/v1', generated_at: new Date().toISOString(), scorer_sha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'), records,
    limits: ['Small sample; conditions and revisions differ; no causal or cross-provider performance claim.', 'Task execution and mandatory repository checks are distinct; human acceptance is pending.', 'Usage keeps provider fields; missing usage is null; elapsed time is CLI time, not end-to-end time-to-green.'] }
  writeFileSync(resolve(options.out), JSON.stringify(result, null, 2) + '\n')
  if (options.metrics) {
    const file = resolve(options.metrics)
    const prior = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : []
    const ids = new Set(prior.map(row => row.pilot_case_id).filter(Boolean))
    for (const row of records) {
      if (ids.has(row.case_id)) continue
      const entry = { at: row.at, kind: 'delivery-outcome', version: row.kernel_version, tool: row.kernel_version, tool_commit: row.tool_commit, pilot_case_id: row.case_id,
        agent: row.agent, task: row.task, variant: row.variant, status: row.status, revision: row.revision, usage: row.usage,
        results: [{ id: 'native-' + row.agent + '-' + row.task, ok: row.execution_qualified && (row.repository_dod_qualified || row.independent_delivery_qualified), skipped: false, timedOut: row.timed_out, ms: row.agent_elapsed_ms }] }
      appendFileSync(file, JSON.stringify(entry) + '\n')
    }
  }
  console.log('summarized ' + records.length + ' native runs')
}

async function main() {
  const options = {}
  for (let i = 2; i < process.argv.length; i += 2) options[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]
  if (options['verify-delivery']) {
    const dir = resolve(options['verify-delivery'])
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'))
    const revision = execFileSync('git', ['-C', report.workspace, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const dirty = () => execFileSync('git', ['-C', report.workspace, 'status', '--porcelain'], { encoding: 'utf8' })
    if (revision !== (report.fixture_revision ?? report.revision) || dirty()) throw new Error('independent delivery requires the exact clean task snapshot')
    const receipt = { schema_version: 'coding-harness.native-independent/v1', at: new Date().toISOString(), fixture_revision: revision }
    for (const [id, command, args] of [['suite', 'npm', ['test']], ['example', './harness', ['check', '--manifest', 'examples/consumer/harness.manifest.json']]]) {
      const result = spawnSync(command, args, { cwd: report.workspace, encoding: 'utf8', timeout: 120000 })
      const output = (result.stdout ?? '') + (result.stderr ?? '')
      const log = 'verified-' + id + '.txt'
      writeFileSync(join(dir, log), output)
      receipt[id] = { exit_code: result.status, log, sha256: createHash('sha256').update(output).digest('hex') }
    }
    receipt.clean = dirty() === ''
    writeFileSync(join(dir, 'independent-delivery.json'), JSON.stringify(receipt, null, 2) + '\n')
    console.log(JSON.stringify(receipt))
    if (!receipt.clean || receipt.suite.exit_code !== 0 || receipt.example.exit_code !== 0) process.exitCode = 1
    return
  }
  if (options.summarize) { summarize(options); return }
  if (options.execute !== 'yes') throw new Error('External model use requires --execute yes')
  if (!['codex', 'claude', 'dsh'].includes(options.agent) || !tasks[options.task]) throw new Error('expected --agent codex|claude|dsh and --task review|context')
  if (!/^[a-f0-9]{40}$/.test(options.revision ?? '')) throw new Error('--revision must be a full local commit')
  if (!isAbsolute(options.out ?? '') || inside(repository, options.out)) throw new Error('--out must be an absolute directory outside the repository')
  if (existsSync(options.out)) throw new Error('refusing to overwrite evidence directory')
  const timeout = Number(options.timeout ?? 180)
  if (!Number.isFinite(timeout) || timeout < 10 || timeout > 600) throw new Error('timeout must be 10..600 seconds')
  mkdirSync(options.out, { recursive: true })
  const workspace = join(mkdtempSync(join(tmpdir(), 'harness-native-task-')), 'repo')
  execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', repository, workspace], { stdio: 'pipe' })
  execFileSync('git', ['-C', workspace, 'checkout', '--quiet', '--detach', options.revision], { stdio: 'pipe' })
  // The task does not need its scorer. Remove it in the private fixture only,
  // retaining the selected source revision and the actual fixture commit.
  execFileSync('git', ['-C', workspace, 'rm', '--quiet', '--ignore-unmatch', '--', 'scripts/native-agent-eval.mjs', 'test/native-eval.test.mjs'], { stdio: 'pipe' })
  execFileSync('git', ['-C', workspace, '-c', 'user.name=Harness evaluator', '-c', 'user.email=harness@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'Prepare task fixture without its external scorer'], { stdio: 'pipe' })
  const fixtureRevision = execFileSync('git', ['-C', workspace, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const manifest = JSON.parse(readFileSync(join(workspace, 'harness.manifest.json'), 'utf8'))
  // Private copies of the already verified dependency cache; no shared log state.
  const key = createHash('sha256').update(manifest.base.source + '@' + manifest.version).digest('hex').slice(0, 16)
  for (const rel of ['.harness/tool/v' + manifest.tool.version, '.harness/' + key]) {
    if (existsSync(join(repository, rel))) { mkdirSync(dirname(join(workspace, rel)), { recursive: true }); cpSync(join(repository, rel), join(workspace, rel), { recursive: true }) }
  }
  const prompt = tasks[options.task] + '\nWork only in this checkout. Read-only task: do not edit, commit, push, use network tools, or inspect credentials. Follow applicable repository instructions. Use existing tests; do not create tests. Keep your final report concise.'
  let args = options.agent === 'codex'
    ? ['codex', 'exec', '--ephemeral', '--sandbox', 'workspace-write', '--color', 'never', '--json', '-C', workspace, prompt]
    : ['npm', 'exec', '--yes', '--package', '@anthropic-ai/claude-code@2.1.310', '--', 'claude', '-p', prompt,
      '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--max-budget-usd', '2',
      '--setting-sources', 'project', '--settings', JSON.stringify({ pluginConfigs: { 'cc-plugin-agents-md@builtin': { options: { instructionFiles: 'claude-md-and-agents-md' } } } }),
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', 'Read,Grep,Glob,Bash,Skill',
      '--permission-mode', 'dontAsk', '--allowedTools', 'Read', 'Grep', 'Glob', 'Skill', 'Bash(node *)', 'Bash(npm test*)', 'Bash(rg *)', 'Bash(git diff*)', 'Bash(git status*)', 'Bash(pwd)', 'Bash(ls *)']
  const versionArgs = options.agent === 'codex' ? ['codex', '--version'] : ['npm', 'exec', '--yes', '--package', '@anthropic-ai/claude-code@2.1.310', '--', 'claude', '--version']
  let version, prefix = ''
  if (options.agent === 'dsh') {
    const root = resolve(options['dsh-root'] ?? '')
    if (!isAbsolute(options['dsh-root'] ?? '') || !existsSync(join(root, 'apps/cli/src/bin.ts'))) throw new Error('--dsh-root must name the existing source runtime')
    const loader = createRequire(join(root, 'package.json')).resolve('tsx/esm')
    args = [process.execPath, '--import', loader, join(root, 'apps/cli/src/bin.ts'), '--profile', 'headless', '--json', prompt]
    version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version + '@' + execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    prefix = 'DSH_HOME=' + quote(join(options.out, 'dsh-home')) + ' TSX_TSCONFIG_PATH=' + quote(join(root, 'tsconfig.json')) + ' '
  } else version = execFileSync(versionArgs[0], versionArgs.slice(1), { encoding: 'utf8' }).trim()
  const run = await runCommand(workspace, prefix + args.map(quote).join(' '), timeout * 1000)
  writeFileSync(join(options.out, 'trace.jsonl'), run.stdout)
  writeFileSync(join(options.out, 'stderr.txt'), run.stderr)
  const events = run.stdout.split('\n').flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  const evidence = traceEvidence(options.agent, events)
  const status = execFileSync('git', ['-C', workspace, 'status', '--porcelain'], { encoding: 'utf8' })
  const independent = spawnSync(process.execPath, ['--test', 'test/proof-failure-boundary.test.mjs', 'test/context-map.test.mjs'], { cwd: workspace, encoding: 'utf8', timeout: 30000 })
  writeFileSync(join(options.out, 'independent-check.txt'), independent.stdout + independent.stderr)
  const report = { schema_version: 'coding-harness.native-pilot/v1', at: new Date().toISOString(), agent: options.agent, version, task: options.task, revision: options.revision, fixture_revision: fixtureRevision, scorer_hidden: true, workspace,
    variant: options.variant ?? 'unspecified', timeout_seconds: timeout, elapsed_ms: run.ms, exit_code: run.code, timed_out: run.timedOut, source_changes: status,
    independent_check: independent.status, evidence, ...assessRun({ code: run.code, timedOut: run.timedOut, clean: status === '', independentCheck: independent.status, evidence }) }
  writeFileSync(join(options.out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ agent: report.agent, task: report.task, variant: report.variant, elapsed_ms: report.elapsed_ms, qualified: report.execution_qualified, checks: evidence.passed_checks.length, skill_uses: evidence.skill_uses.length, exit_code: run.code, timed_out: run.timedOut, report: join(options.out, 'report.json') }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
