/**
 * Command output the agents fall back to when the demo's shell can't run a
 * command for them (still a stub, or the command isn't simulated). Built from
 * the Vfs so it agrees with what the visitor sees in the file tree.
 */
import { sgr } from '../util/ansi'
import { diffStat, unifiedDiff } from '../util/diff'
import type { RunResult, World } from './world'

const KNOWN_TESTS: Record<string, number> = { health: 2, rates: 5, shipments: 4, ratelimit: 4 }

function hashNum(s: string, lo: number, hi: number): number {
  let h = 7
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return lo + (h % (hi - lo + 1))
}

/** `npm test -w api` → Vitest's run output over the test files that exist. */
export function vitestRun(world: World, workspace = 'api'): RunResult {
  const files = world
    .list(`${workspace}/tests`)
    .filter((e) => !e.isDir && /\.test\.tsx?$/.test(e.name))
    .map((e) => e.name)
    .sort()
  const list = files.length > 0 ? files : ['health.test.ts', 'rates.test.ts', 'shipments.test.ts']
  const root = `${world.root.replace(/\\/g, '/')}/${workspace}`
  let total = 0
  const rows = list.map((name) => {
    const stem = name.replace(/\.test\.tsx?$/, '').toLowerCase()
    const n = KNOWN_TESTS[stem] ?? hashNum(stem, 2, 6)
    total += n
    const ms = hashNum(name, 3, 24)
    return ` ${sgr.green}✓${sgr.reset} tests/${name} ${sgr.gray}(${n} tests)${sgr.reset} ${sgr.gray}${ms}ms${sgr.reset}`
  })
  const now = new Date()
  const hh = [now.getHours(), now.getMinutes(), now.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':')
  const output = [
    '',
    `> ${workspace}@0.1.0 test`,
    '> vitest run',
    '',
    '',
    ` ${sgr.inverse}${sgr.cyan} RUN ${sgr.reset} ${sgr.cyan}v3.2.4 ${sgr.reset}${sgr.gray}${root}${sgr.reset}`,
    '',
    ...rows,
    '',
    ` ${sgr.gray}Test Files${sgr.reset}  ${sgr.bold}${sgr.green}${list.length} passed${sgr.reset} ${sgr.gray}(${list.length})${sgr.reset}`,
    `      ${sgr.gray}Tests${sgr.reset}  ${sgr.bold}${sgr.green}${total} passed${sgr.reset} ${sgr.gray}(${total})${sgr.reset}`,
    `   ${sgr.gray}Start at${sgr.reset}  ${hh}`,
    `   ${sgr.gray}Duration${sgr.reset}  ${612 + total * 9}ms ${sgr.gray}(transform 96ms, setup 0ms, collect 188ms, tests ${total * 3}ms, environment 1ms, prepare 318ms)${sgr.reset}`,
    ''
  ].join('\n')
  return { command: `npm test -w ${workspace}`, output, code: 0 }
}

/** Parse "Tests  14 passed (14)" out of a Vitest run (ours or the shell's). */
export function testSummary(output: string): { passed: number; failed: number; files: number } | null {
  // eslint-disable-next-line no-control-regex
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '')
  // `npm test` at the root runs every workspace: add their summaries up.
  const tests = [...plain.matchAll(/ Tests\s+(?:(\d+) failed)?(?:\s*\|\s*)?(?:(\d+) passed)?\s*\((\d+)\)/g)]
  const files = [...plain.matchAll(/Test Files\s+[^(\n]*\((\d+)\)/g)]
  if (!tests.length) return null
  const sum = (ms: RegExpMatchArray[], i: number): number => ms.reduce((a, m) => a + Number(m[i] ?? 0), 0)
  return { failed: sum(tests, 1), passed: sum(tests, 2), files: sum(files, 1) }
}

export function gitStatus(world: World): RunResult {
  const repo = safeRepo(world)
  if (!repo) return { command: 'git status --short', output: 'fatal: not a git repository (or any of the parent directories): .git', code: 128 }
  const lines = repo.status().map((s) => {
    const x = s.index === '?' ? '?' : s.index
    const y = s.worktree === '?' ? '?' : s.worktree
    const colour = s.index === '?' ? sgr.red : s.index !== ' ' ? sgr.green : sgr.red
    return `${colour}${x}${sgr.reset}${colour}${y}${sgr.reset} ${s.path}`
  })
  return { command: 'git status --short', output: lines.join('\n'), code: 0 }
}

export function gitDiffStat(world: World): RunResult {
  const repo = safeRepo(world)
  if (!repo) return { command: 'git diff --stat', output: '', code: 0 }
  const rows = repo.diff().map((d) => {
    const s = diffStat(d.oldText ?? '', d.newText ?? '')
    return { path: d.path, ...s }
  })
  const width = Math.max(0, ...rows.map((r) => r.path.length))
  const out = rows.map((r) => {
    const bar = `${sgr.green}${'+'.repeat(Math.min(r.added, 30))}${sgr.red}${'-'.repeat(Math.min(r.removed, 30))}${sgr.reset}`
    return ` ${r.path.padEnd(width)} | ${String(r.added + r.removed).padStart(3)} ${bar}`
  })
  const add = rows.reduce((a, r) => a + r.added, 0)
  const del = rows.reduce((a, r) => a + r.removed, 0)
  out.push(
    ` ${rows.length} file${rows.length === 1 ? '' : 's'} changed, ${add} insertion${add === 1 ? '' : 's'}(+), ${del} deletion${del === 1 ? '' : 's'}(-)`
  )
  return { command: 'git diff --stat', output: rows.length ? out.join('\n') : '', code: 0 }
}

export function gitDiffText(world: World): string {
  const repo = safeRepo(world)
  if (!repo) return ''
  return repo
    .diff()
    .map((d) => unifiedDiff(d.path, d.oldText, d.newText, 2))
    .join('\n')
}

export function gitAdd(world: World, paths: string[] = ['-A']): RunResult {
  const repo = safeRepo(world)
  repo?.add(paths)
  return { command: `git add ${paths.join(' ')}`, output: '', code: 0 }
}

export function gitCommit(world: World, message: string): RunResult {
  const repo = safeRepo(world)
  if (!repo) return { command: `git commit -m "${message}"`, output: 'fatal: not a git repository', code: 128 }
  try {
    const staged = repo.diff({ staged: true })
    const commit = repo.commit(message)
    let add = 0
    let del = 0
    for (const d of staged) {
      const s = diffStat(d.oldText ?? '', d.newText ?? '')
      add += s.added
      del += s.removed
    }
    const created = staged.filter((d) => d.oldText === null).map((d) => ` create mode 100644 ${d.path}`)
    return {
      command: `git commit -m "${message}"`,
      output: [
        `[${repo.currentBranch()} ${commit.short}] ${message.split('\n')[0]}`,
        ` ${staged.length} file${staged.length === 1 ? '' : 's'} changed, ${add} insertions(+), ${del} deletions(-)`,
        ...created
      ].join('\n'),
      code: 0
    }
  } catch (err) {
    return {
      command: `git commit -m "${message}"`,
      output: err instanceof Error ? err.message : 'nothing to commit, working tree clean',
      code: 1
    }
  }
}

export function safeRepo(world: World): ReturnType<World['backend']['vfs']['git']> {
  try {
    return world.backend.vfs.git(world.root)
  } catch {
    return null
  }
}
