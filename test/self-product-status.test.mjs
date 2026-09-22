import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

function documentedCommands(readme) {
  const section = readme.split('## CLI\n')[1]?.split('\n## ')[0] ?? ''
  return section.split('\n').filter((line) => line.startsWith('|')).flatMap((line) =>
    [...line.matchAll(/`([a-z][a-z-]*)`/g)].map((match) => match[1])).sort()
}

function registeredCommands(source) {
  const declaration = source.match(/^const COMMANDS = \{(.+)\}$/m)?.[1] ?? ''
  return [...declaration.matchAll(/(?:^|,)\s*(?:'([^']+)'|([a-z][a-z-]*)):\s*cmd[A-Za-z]+/g)]
    .map((match) => match[1] ?? match[2]).sort()
}

test('this product documents every executable command exactly once', () => {
  const listed = spawnSync(process.execPath, [resolve(ROOT, 'bin/harness.mjs'), '--list-commands'], { encoding: 'utf8' })
  assert.equal(listed.status, 0)
  const actual = JSON.parse(listed.stdout)
  const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8')
  assert.deepEqual(documentedCommands(readme), actual)
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'harness.manifest.json'), 'utf8'))
  const releasedSource = execFileSync('git', ['show', manifest.tool.commit + ':bin/harness.mjs'], { cwd: ROOT, encoding: 'utf8' })
  const released = registeredCommands(releasedSource)
  const workingOnly = actual.filter((command) => !released.includes(command))
  const declaredWorking = readme.match(/Working-only commands:\s*([^\n]+(?:\n`[^\n]+)?)/)?.[1] ?? ''
  assert.deepEqual([...declaredWorking.matchAll(/`([a-z][a-z-]*)`/g)].map((match) => match[1]).sort(), workingOnly)
  const withoutLast = readme.replace('`' + actual.at(-1) + '`', '')
  assert.notDeepEqual(documentedCommands(withoutLast), actual, 'the inventory check must detect a missing command')
})

test('direction and roadmap route current status to the governed inventory', () => {
  const direction = readFileSync(resolve(ROOT, 'docs/direction.md'), 'utf8')
  const roadmap = readFileSync(resolve(ROOT, 'docs/roadmap.md'), 'utf8')
  assert.match(direction, /README\.md#status/)
  assert.match(roadmap, /README\.md#status/)
  assert.doesNotMatch(direction, /\*\*Packs\*\* — next/)
  assert.doesNotMatch(roadmap, /Survey and adopt one real repository/)
})
