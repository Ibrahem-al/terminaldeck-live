/**
 * Helpers every plan builder shares: step constructors, how the repo is laid
 * out (the app file, the framework, ESM specifiers), file mentions in a
 * prompt, and what the working tree has changed.
 */
import type { GitFileStatus } from '../contracts'
import type { Results, Step } from './brain'
import { testSummary, vitestRun, safeRepo } from './canned'
import type { World } from './world'

export const think = (ms: number, activity?: string): Step => ({ t: 'think', ms, activity })
export const say = (text: string | ((r: Results) => string)): Step => ({ t: 'say', text: typeof text === 'string' ? () => text : text })
export const then = (next: (r: Results) => Step[]): Step => ({ t: 'then', next })

export function projectName(world: World): string {
  const parts = world.root.split(/[\\/]/)
  const name = parts[parts.length - 1] || 'project'
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export const STOP = new Set(
  'this that with from what does have into your about there their them then than when where which while would could should please some more make code file files repo project explain tell show function work works just like want need look using used into also only very okay sure the and for can you add'.split(
    ' '
  )
)

/** A file the prompt names ("server.ts", "api/src/db.ts", "the rates route"), project-relative with `/`. */
export function mentionedFile(world: World, prompt: string): string | null {
  const tokens = prompt.match(/[\w@./\\-]+\.(?:tsx?|jsx?|json|md|ya?ml|css|html|ps1|toml|sql)\b|\.env(?:\.example)?\b|\.gitignore\b/gi) ?? []
  for (const tok of tokens) {
    const rel = tok.replace(/\\/g, '/').replace(/^\.\//, '')
    if (world.exists(rel)) return rel
    const fromCwd = world.fromCwd(rel)
    if (fromCwd) return fromCwd
    const hit = world.findFiles(rel.split('/').pop() ?? rel, 5).find((f) => !/node_modules/i.test(f))
    if (hit) return world.rel(hit)
  }
  // "the rates route", "shipments", "auth middleware"
  const words = prompt.toLowerCase().match(/[a-z]{4,}/g) ?? []
  for (const w of words) {
    if (STOP.has(w)) continue
    const hit = world
      .findFiles(w, 8)
      .find((f) => /\.(tsx?|jsx?)$/.test(f) && !/node_modules|\.test\./i.test(f) && (f.split(/[\\/]/).pop() ?? '').toLowerCase().includes(w))
    if (hit) return world.rel(hit)
  }
  return null
}

export function exportsOf(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g))
    out.add(m[1])
  for (const m of text.matchAll(/export\s*\{([^}]+)\}/g))
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()
      if (name) out.add(name)
    }
  return [...out]
}

export function importsOf(text: string): string[] {
  return [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
}

export function lineCount(text: string | null): number {
  if (!text) return 0
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

export function listFiles(world: World, rel: string, re = /\.(tsx?|jsx?)$/): string[] {
  return world
    .list(rel)
    .filter((e) => !e.isDir && re.test(e.name))
    .map((e) => e.name)
}

export const joinNames = (names: string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** The file that builds the app and mounts middleware (app.ts in Harbor; server.ts in simpler repos). */
export function appFile(world: World): string {
  for (const f of ['api/src/app.ts', 'api/src/server.ts', 'api/src/index.ts']) if (/\bapp\.use\(/.test(world.read(f) ?? '')) return f
  return world.exists('api/src/app.ts') ? 'api/src/app.ts' : 'api/src/server.ts'
}

/** Whether the repo writes ESM import specifiers with `.js` (NodeNext). */
export function esmJs(world: World): boolean {
  return /from '\.{1,2}\/[^']+\.js'/.test(world.read(appFile(world)) ?? '')
}

export function framework(world: World): 'express' | 'hono' | 'fastify' | 'node' {
  const server = world.read(appFile(world)) ?? ''
  const pkg = world.read('api/package.json') ?? ''
  const both = server + pkg
  if (/['"]hono['"]|from 'hono/.test(both)) return 'hono'
  if (/fastify/.test(both)) return 'fastify'
  if (/express/.test(both)) return 'express'
  return 'express'
}

export function runTests(world: World, description = 'Run the API test suite', workspace = 'api'): Step {
  return { t: 'run', command: `npm test -w ${workspace}`, description, fallback: () => vitestRun(world, workspace), safe: true }
}

export function testLine(r: Results): string {
  const run = [...r.runs].reverse().find((x) => /test/.test(x.command))
  if (!run) return ''
  const s = testSummary(run.output)
  if (!s) return run.code === 0 ? 'the test suite passes' : 'the test run failed'
  const total = s.failed + s.passed
  if (s.failed > 0) return `${s.failed} of ${total} tests ${s.failed === 1 ? 'fails' : 'fail'}`
  return s.passed === 1 ? 'the 1 test passes' : s.passed === 2 ? 'both tests pass' : `all ${s.passed} tests pass`
}

/**
 * Files that import `file` (resolved specifiers, not a substring grep), as
 * project-relative paths.
 */
export function importersOf(world: World, file: string): string[] {
  const target = file.replace(/\.(tsx?|jsx?)$/, '').toLowerCase()
  const stem = target.split('/').pop() ?? target
  const out: string[] = []
  for (const hit of world.grep(new RegExp(`from\\s+['"][^'"]*${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.[jt]sx?)?['"]`), '.', { limit: 60 })) {
    const rel = world.rel(hit.path)
    if (rel.toLowerCase() === file.toLowerCase() || out.includes(rel)) continue
    const spec = /from\s+['"]([^'"]+)['"]/.exec(hit.text)?.[1]
    if (!spec || !spec.startsWith('.')) continue
    const dir = rel.split('/').slice(0, -1)
    for (const part of spec.replace(/\.(tsx?|jsx?)$/, '').split('/')) {
      if (part === '..') dir.pop()
      else if (part !== '.') dir.push(part)
    }
    if (dir.join('/').toLowerCase() === target) out.push(rel)
  }
  return out
}

/** What `git status` would list, untracked files included (what `git add -A` stages). */
export function workingChanges(world: World): GitFileStatus[] {
  try {
    return safeRepo(world)?.status() ?? []
  } catch {
    return []
  }
}

/** The status letter a reader expects: new / modified / deleted. */
export function changeKind(s: GitFileStatus): 'new file' | 'deleted' | 'modified' {
  if (s.index === '?' || s.index === 'A') return 'new file'
  if (s.index === 'D' || s.worktree === 'D') return 'deleted'
  return 'modified'
}

/** Upper snake case for a constant name (`limit` → `LIMIT`, `maxRetries` → `MAX_RETRIES`). */
export const constName = (s: string): string => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()
