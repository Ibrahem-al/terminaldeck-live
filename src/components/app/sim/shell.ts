import { A, L, s, type Line } from '../Terminal'
import { FS, FILES, out, claudeSession } from './fixtures'
import type { Badge, PaneKind } from './types'

/** One unit of streamed terminal activity produced by the interpreter. */
export type RunStep =
  | { t: 'out'; lines: Line[] }
  | { t: 'exit'; code: number; took?: string }
  | { t: 'wait'; ms: number }
  | { t: 'clear' }
  | { t: 'cd'; cwd: string }
  | { t: 'theme'; id: string }
  | { t: 'kind'; kind: PaneKind; title: string; badge?: Badge }

export interface ShellCtx {
  /** The project root in display form, e.g. `~\dev\my-app`. */
  root: string
  /** The pane's current cwd in display form. */
  cwd: string
  /** Available themes for `theme` / `theme list`. */
  themes: { id: string; name: string }[]
}

/** Strip the project root → a forward-slashed relative path used to index FS. */
function rel(ctx: ShellCtx): string {
  const { root, cwd } = ctx
  if (cwd === root) return ''
  if (cwd.startsWith(root + '\\')) return cwd.slice(root.length + 1).replace(/\\/g, '/')
  return ''
}

function listing(relPath: string): Line[] {
  const entries = FS[relPath]
  if (!entries) return [L(s('(empty)', A(8)))]
  // Two-ish columns of names, dirs first and tinted.
  const dirs = entries.filter((e) => e.dir)
  const files = entries.filter((e) => !e.dir)
  const lines: Line[] = []
  for (const d of dirs) lines.push(L(s(d.name + '/', A(4))))
  // pack files a few per line for a terminal feel
  let row: ReturnType<typeof s>[] = []
  files.forEach((f, i) => {
    row.push(s(f.name.padEnd(18), A(7)))
    if ((i + 1) % 3 === 0) {
      lines.push(L(...row))
      row = []
    }
  })
  if (row.length) lines.push(L(...row))
  return lines
}

const TOOK = (n: number): string => `${n.toFixed(1)}s`

/**
 * Pure command interpreter. Returns the streamed steps for a typed command.
 * Side effects (theme switch, cwd change, pane-kind change) ride along as steps
 * the runner applies in order.
 */
export function interpret(raw: string, ctx: ShellCtx): RunStep[] {
  const input = raw.trim()
  if (!input) return []
  const [cmd, ...rest] = input.split(/\s+/)
  const arg = rest.join(' ')
  const lower = cmd.toLowerCase()

  switch (lower) {
    case 'help':
    case '?':
      return [{ t: 'out', lines: [...out.helpHeader(), ...out.help()] }]

    case 'clear':
    case 'cls':
      return [{ t: 'clear' }]

    case 'ls':
    case 'dir':
    case 'gci':
      return [{ t: 'out', lines: listing(rel(ctx)) }]

    case 'pwd':
      return [{ t: 'out', lines: [L(s(ctx.cwd, A(7)))] }]

    case 'whoami':
      return [{ t: 'out', lines: out.whoami() }]

    case 'echo':
      return [{ t: 'out', lines: [L(s(stripQuotes(arg), A(7)))] }]

    case 'cat':
    case 'type': {
      const key = arg.split(/[\\/]/).pop()?.toLowerCase() ?? ''
      const file = FILES[key]
      if (!file) {
        return [{ t: 'out', lines: [L(s(`cat: ${arg || '?'}: no such file`, A(1)))] }]
      }
      return [{ t: 'out', lines: file }]
    }

    case 'cd':
      return cd(arg, ctx)

    case 'npm':
    case 'pnpm':
    case 'yarn':
      return npm(rest, ctx)

    case 'git':
      return git(rest)

    case 'gh':
      return gh(rest)

    case 'claude':
      return claude(arg)

    case 'theme':
      return theme(arg, ctx)

    case 'netstat':
    case 'ports':
      return [{ t: 'out', lines: out.ports() }, { t: 'exit', code: 0 }]

    default:
      return [{ t: 'out', lines: out.notFound(cmd) }]
  }
}

function stripQuotes(v: string): string {
  return v.replace(/^["']|["']$/g, '')
}

function cd(arg: string, ctx: ShellCtx): RunStep[] {
  const target = arg.trim()
  if (!target || target === '~' || target === '\\' || target === '/') {
    return [{ t: 'cd', cwd: ctx.root }]
  }
  if (target === '..') {
    if (ctx.cwd === ctx.root) return [{ t: 'cd', cwd: ctx.root }]
    const parts = ctx.cwd.split('\\')
    parts.pop()
    return [{ t: 'cd', cwd: parts.join('\\') || ctx.root }]
  }
  // Descend into a known child directory.
  const r = rel(ctx)
  const childRel = r ? `${r}/${target.replace(/[\\/]+$/, '')}` : target.replace(/[\\/]+$/, '')
  const entries = FS[r]
  const known = entries?.some((e) => e.dir && e.name === target.replace(/[\\/]+$/, ''))
  if (known || FS[childRel]) {
    return [{ t: 'cd', cwd: `${ctx.cwd}\\${target.replace(/[\\/]+$/, '')}` }]
  }
  return [{ t: 'out', lines: [L(s(`cd: ${target}: no such directory`, A(1)))] }]
}

function npm(rest: string[], _ctx: ShellCtx): RunStep[] {
  const sub = (rest[0] ?? '').toLowerCase()
  if (sub === 'test' || (sub === 'run' && rest[1] === 'test')) {
    return [{ t: 'out', lines: out.npmTest() }, { t: 'exit', code: 0, took: TOOK(1.2) }]
  }
  if (sub === 'run' && rest[1] === 'dev') {
    return [{ t: 'out', lines: out.npmDev() }]
  }
  if (sub === 'run' && rest[1] === 'build') {
    return [{ t: 'out', lines: out.npmBuild() }, { t: 'exit', code: 0, took: TOOK(3.4) }]
  }
  if (sub === 'install' || sub === 'i' || sub === 'add') {
    return [{ t: 'out', lines: out.npmInstall(rest[1] ?? '') }, { t: 'exit', code: 0, took: TOOK(2.0) }]
  }
  if (sub === 'run') {
    return [{ t: 'out', lines: [L(s('Scripts: ', A(8)), s('dev  build  test  preview', A(3)))] }]
  }
  return [{ t: 'out', lines: [L(s(`Usage: npm <test|run dev|run build|install>`, A(8)))] }]
}

function git(rest: string[]): RunStep[] {
  const sub = (rest[0] ?? '').toLowerCase()
  switch (sub) {
    case 'status':
    case 'st':
      return [{ t: 'out', lines: out.gitStatus() }]
    case 'log':
      return [{ t: 'out', lines: out.gitLog() }]
    case 'push':
      return [{ t: 'out', lines: out.gitPush() }, { t: 'exit', code: 0, took: TOOK(0.4) }]
    case 'commit': {
      const m = rest.join(' ').match(/-m\s+(.+)|-am\s+(.+)/)
      const msg = stripQuotes((m?.[1] || m?.[2] || 'update').trim())
      return [{ t: 'out', lines: out.gitCommit(msg) }, { t: 'exit', code: 0, took: TOOK(0.3) }]
    }
    default:
      return [{ t: 'out', lines: [L(s('git: try ', A(8)), s('status · log · commit -m "…" · push', A(3)))] }]
  }
}

function gh(rest: string[]): RunStep[] {
  if ((rest[0] ?? '').toLowerCase() === 'pr') {
    return [
      {
        t: 'out',
        lines: [
          L(s('Current branch', A(3))),
          L(s('  #218 ', A(6)), s('Encrypt project env vars at rest ', A(7)), s('[main ← env-dpapi]', A(8))),
          L(s('   ✓ 3 checks passing', A(2)))
        ]
      },
      { t: 'exit', code: 0 }
    ]
  }
  return [{ t: 'out', lines: [L(s('gh: try ', A(8)), s('pr status', A(3)))] }]
}

function claude(arg: string): RunStep[] {
  const task = stripQuotes(arg)
  const badge: Badge = { label: 'Claude Code', color: '#d8a956' }
  if (!task) {
    return [
      { t: 'kind', kind: 'agent', title: 'claude', badge },
      {
        t: 'out',
        lines: [
          L(s('✻ ', 'var(--accent)'), s('Welcome to Claude Code', A(7))),
          L(s('  /help for commands · cwd here', A(8))),
          L(),
          L(s('Hand me a task: ', A(7)), s('claude "add a rate limiter and test it"', A(3)))
        ]
      }
    ]
  }
  const blocks = claudeSession(task)
  const steps: RunStep[] = [{ t: 'kind', kind: 'agent', title: 'claude', badge }]
  blocks.forEach((b, i) => {
    steps.push({ t: 'out', lines: b })
    if (i < blocks.length - 1) steps.push({ t: 'wait', ms: 440 })
  })
  return steps
}

function theme(arg: string, ctx: ShellCtx): RunStep[] {
  const a = arg.trim().toLowerCase()
  if (!a || a === 'list' || a === 'ls') {
    const names = ctx.themes.map((t) => t.id).join('  ')
    return [
      {
        t: 'out',
        lines: [
          L(s('Available themes:', A(7))),
          L(s('  ' + names, A(3))),
          L(s('Apply one: ', A(8)), s('theme ember', A(3)))
        ]
      }
    ]
  }
  const match = ctx.themes.find((t) => t.id === a || t.name.toLowerCase() === a || t.id.startsWith(a))
  if (!match) {
    return [{ t: 'out', lines: [L(s(`theme: "${arg}" not found. Try `, A(1)), s('theme list', A(3)), s('.', A(1)))] }]
  }
  return [
    { t: 'theme', id: match.id },
    { t: 'out', lines: [L(s('✓ ', A(2)), s(`applied ${match.name} — the whole page recolors live.`, A(7)))] }
  ]
}
