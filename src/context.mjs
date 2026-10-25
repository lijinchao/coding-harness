import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { matchGlob } from './select.mjs'
import { linkProblems } from './documents.mjs'

function inside(root, path) {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel)
}

// A bounded declaration graph, never a loader of concatenated agent prompts.
export function contextProblems(root, governance) {
  const context = governance?.context
  if (context === undefined) return []
  const problems = []
  const base = realpathSync(root)
  const paths = [context.entrypoint, ...context.sources.map(source => source.path)]
  const valid = new Map()
  for (const path of new Set(paths)) {
    const file = resolve(root, path)
    if (isAbsolute(path) || path.split('/').includes('..') || !inside(resolve(root), file)) {
      problems.push('context path must stay inside repository: ' + path); continue
    }
    if (!existsSync(file)) { problems.push('context path not found: ' + path); continue }
    if (!inside(base, realpathSync(file))) { problems.push('context real path must stay inside repository: ' + path); continue }
    if (!statSync(file).isFile()) { problems.push('context path must be a file: ' + path); continue }
    valid.set(file, path)
  }
  if (!(governance.docs ?? []).some(doc => doc.path === context.entrypoint && Number.isInteger(doc.maxBytes) && doc.maxBytes > 0)) {
    problems.push('context entrypoint must declare a governance.docs maxBytes budget')
  }
  let tracked = []
  try {
    tracked = execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', stdio: 'pipe' }).split('\0').filter(Boolean)
  } catch { problems.push('context scopes require a Git tracked-file inventory') }
  const ids = new Set(), authorities = new Set()
  for (const source of context.sources) {
    if (ids.has(source.id)) problems.push('context duplicate id: ' + source.id)
    ids.add(source.id)
    if (source.authority !== undefined) {
      if (authorities.has(source.authority)) problems.push('context duplicate authority: ' + source.authority)
      authorities.add(source.authority)
    }
    for (const pattern of source.scope) {
      if (isAbsolute(pattern) || pattern.split('/').includes('..')) problems.push('context scope must stay inside repository: ' + pattern)
      else if (!tracked.some(path => matchGlob(path, pattern))) problems.push('context scope matches no tracked file: ' + pattern)
    }
  }
  // Only declared sources form routing hops. An unrelated linked document does
  // not silently become an eagerly traversed context tree.
  const reached = new Set(), queue = [resolve(root, context.entrypoint)]
  while (queue.length) {
    const file = queue.pop()
    if (reached.has(file) || !valid.has(file)) continue
    reached.add(file)
    const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, '')
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = match[1].split('#')[0]
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue
      try {
        const destination = resolve(dirname(file), decodeURIComponent(target))
        if (!valid.has(destination)) continue
        const broken = linkProblems(root, valid.get(file), match[0])
        problems.push(...broken.map(problem => 'context ' + problem))
        if (broken.length === 0) queue.push(destination)
      } catch { /* malformed link is not a routing edge */ }
    }
  }
  for (const source of context.sources) {
    const file = resolve(root, source.path)
    if (valid.has(file) && !reached.has(file)) problems.push('context unreachable source from entrypoint: ' + source.path)
  }
  return problems
}
