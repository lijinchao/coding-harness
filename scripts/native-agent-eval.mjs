import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCommand } from '../src/process.mjs'
import { inside } from '../src/context.mjs'

const repository = resolve(import.meta.dirname, '..')
const checkCommand = command => /(?:node\s+--test|npm\s+test)/.test(command)
const passed = output => /# fail 0\b/.test(output) && /# pass [1-9]\d*/.test(output)

export function traceEvidence(agent, events) {
  const result = { passed_checks: [], skill_uses: [], catalog: [], model: null, usage: null, final: '', completed: false, required_checks: { suite: false, example: false } }
  const observe = (command, output, ok) => {
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
        if (/\.agents\/skills\//.test(item.command ?? '')) result.skill_uses.push(item.command)
      }
      if (item?.type === 'agent_message') result.final = item.text ?? ''
      if (event.type === 'turn.completed') { result.usage = event.usage; result.completed = true }
      if (event.type === 'turn.failed') result.completed = false
    } else if (agent === 'dsh') {
      if (event.type === 'tool_call') {
        calls.set(event.callId, event)
        if (/skill/.test(event.tool) || /\.agents\/skills\//.test(JSON.stringify(event.input))) result.skill_uses.push({ tool: event.tool, input: event.input })
      }
      if (event.type === 'tool_result') {
        const call = calls.get(event.callId)
        const command = call?.input?.command ?? call?.input?.code ?? ''
        observe(command, event.result ?? '', event.status === 'completed')
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
          if (part.name === 'Skill' || /\.(?:agents|claude)\/skills\//.test(part.input?.file_path ?? part.input?.command ?? '')) result.skill_uses.push(part.input)
        }
        if (part.type === 'tool_result') {
          const call = calls.get(part.tool_use_id)
          const output = typeof part.content === 'string' ? part.content : JSON.stringify(part.content)
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

async function main() {
  const options = {}
  for (let i = 2; i < process.argv.length; i += 2) options[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]
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
