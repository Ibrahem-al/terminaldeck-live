/**
 * Git Bash (MSYS2 coreutils) file commands. Git for Windows aliases
 * `ls='ls -F --color=auto --show-control-chars'`, so directories come out
 * blue with a trailing slash.
 */
import type { FsEntry } from '@shared/types'
import { CRLF } from '../../util/ansi'
import type { CommandFn, Ctx } from './context'
import { columns, pace, unixDate } from './context'
import { attempt, expand, list, readText, resolve, stat, textLines } from './paths'

const DIR = '\x1b[01;34m'
const EXE = '\x1b[01;32m'
const RESET = '\x1b[0m'

interface Opts {
  flags: Set<string>
  operands: string[]
  values: Record<string, string>
}

/** `-la` → l, a; `--all` → all; `-n 5` when `withValue` includes n. */
function opts(ctx: Ctx, withValue: string[] = []): Opts {
  const flags = new Set<string>()
  const operands: string[] = []
  const values: Record<string, string> = {}
  const args = ctx.argv
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--') {
      operands.push(...args.slice(i + 1))
      break
    }
    if (a.startsWith('--')) flags.add(a.slice(2))
    else if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
      for (let j = 1; j < a.length; j++) {
        const f = a[j]
        if (withValue.includes(f)) {
          values[f] = a.slice(j + 1) || args[++i] || ''
          break
        }
        flags.add(f)
      }
    } else if (/^-\d+$/.test(a) && withValue.includes('n')) values.n = a.slice(1)
    else operands.push(a)
  }
  return { flags, operands, values }
}

const isExe = (name: string): boolean => /\.(exe|sh|bat|cmd|com)$/i.test(name)

function lsName(e: FsEntry, classify = true): { text: string; width: number } {
  if (e.isDir) return { text: `${DIR}${e.name}${RESET}${classify ? '/' : ''}`, width: e.name.length + (classify ? 1 : 0) }
  if (isExe(e.name)) return { text: `${EXE}${e.name}${RESET}${classify ? '*' : ''}`, width: e.name.length + (classify ? 1 : 0) }
  return { text: e.name, width: e.name.length }
}

const ls: CommandFn = async (ctx) => {
  const o = opts(ctx)
  const all = o.flags.has('a') || o.flags.has('all') || o.flags.has('A')
  const long = o.flags.has('l')
  const one = o.flags.has('1')
  const targets = o.operands.length ? o.operands : ['.']
  const out: string[] = []
  let code = 0
  const blocks: Array<{ label: string | null; entries: FsEntry[] }> = []
  const loose: FsEntry[] = []
  for (const t of targets) {
    const paths = expand(ctx, t)
    const s = paths[0] ? stat(ctx, paths[0]) : null
    if (!s) {
      out.push(`ls: cannot access '${t}': No such file or directory`)
      code = 2
      continue
    }
    for (const p of paths) {
      const st = stat(ctx, p)
      if (!st) continue
      if (st.isDir && paths.length === 1) {
        let entries = list(ctx, st.path).filter((e) => all || !e.name.startsWith('.'))
        entries = [...entries].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
        if (all && o.flags.has('a')) {
          entries = [{ name: '.', path: st.path, isDir: true }, { name: '..', path: ctx.backend.vfs.dirname(st.path), isDir: true }, ...entries]
        }
        blocks.push({ label: targets.length > 1 ? t : null, entries })
      } else loose.push({ name: paths.length === 1 ? t : ctx.backend.vfs.basename(p), path: st.path, isDir: st.isDir })
    }
  }
  const render = (entries: FsEntry[]): string[] => {
    if (long) {
      const sizes = entries.map((e) => (e.isDir ? 0 : stat(ctx, e.path)?.size ?? 0))
      const w = Math.max(1, ...sizes.map((n) => String(n).length))
      const total = sizes.reduce((a, n) => a + Math.ceil(n / 1024) * 4, 0)
      return [
        `total ${total}`,
        ...entries.map((e, i) => {
          const perm = e.isDir ? 'drwxr-xr-x' : isExe(e.name) ? '-rwxr-xr-x' : '-rw-r--r--'
          return `${perm} 1 ${ctx.backend.scenario.machine.user} 197121 ${String(sizes[i]).padStart(w)} ${unixDate(stat(ctx, e.path)?.mtime ?? Date.now())} ${lsName(e).text}`
        })
      ]
    }
    const items = entries.map((e) => lsName(e))
    return one || !ctx.tty ? items.map((i) => (ctx.tty ? i.text : i.text.replace(/\x1b\[[\d;]*m/g, ''))) : columns(items, ctx.cols)
  }
  if (loose.length) out.push(...render(loose))
  blocks.forEach((b, i) => {
    if (b.label !== null) {
      if (loose.length || i > 0) out.push('')
      out.push(`${b.label}:`)
    }
    out.push(...render(b.entries))
  })
  if (out.length) await pace(ctx, out.join(CRLF) + CRLF)
  return code
}

const cd: CommandFn = (ctx) => {
  const vfs = ctx.backend.vfs
  const target = ctx.argv[0]
  if (target === undefined) {
    ctx.sh.setCwd(ctx.backend.scenario.machine.home)
    return 0
  }
  if (target === '-') {
    const prev = ctx.sh.prevCwd ?? ctx.sh.cwd
    ctx.sh.setCwd(prev)
    ctx.print(vfs.toPosix(prev))
    return 0
  }
  const s = stat(ctx, resolve(ctx, target))
  if (!s) {
    ctx.print(`bash: cd: ${target}: No such file or directory`)
    return 1
  }
  if (!s.isDir) {
    ctx.print(`bash: cd: ${target}: Not a directory`)
    return 1
  }
  ctx.sh.setCwd(s.path)
  return 0
}

const pwd: CommandFn = (ctx) => {
  ctx.print(ctx.argv.includes('-W') ? ctx.sh.cwd : ctx.backend.vfs.toPosix(ctx.sh.cwd))
  return 0
}

const cat: CommandFn = async (ctx) => {
  const o = opts(ctx)
  if (o.operands.length === 0) {
    if (ctx.stdin !== null) ctx.write(ctx.stdin)
    return 0
  }
  let code = 0
  for (const t of o.operands) {
    for (const p of expand(ctx, t)) {
      const s = stat(ctx, p)
      if (!s) {
        ctx.print(`cat: ${t}: No such file or directory`)
        code = 1
        continue
      }
      if (s.isDir) {
        ctx.print(`cat: ${t}: Is a directory`)
        code = 1
        continue
      }
      let lines = textLines(readText(ctx, p) ?? '')
      if (o.flags.has('n')) lines = lines.map((l, i) => `${String(i + 1).padStart(6)}\t${l}`)
      await pace(ctx, lines.join(CRLF) + (lines.length ? CRLF : ''))
    }
  }
  return code
}

const mkdir: CommandFn = (ctx) => {
  const o = opts(ctx)
  let code = 0
  for (const t of o.operands) {
    const path = resolve(ctx, t)
    if (ctx.backend.vfs.exists(path)) {
      if (!o.flags.has('p')) {
        ctx.print(`mkdir: cannot create directory ‘${t}’: File exists`)
        code = 1
      }
      continue
    }
    if (!o.flags.has('p') && !ctx.backend.vfs.exists(ctx.backend.vfs.dirname(path))) {
      ctx.print(`mkdir: cannot create directory ‘${t}’: No such file or directory`)
      code = 1
      continue
    }
    attempt(() => ctx.backend.vfs.mkdir(path, { recursive: true }))
  }
  return code
}

const touch: CommandFn = (ctx) => {
  const vfs = ctx.backend.vfs
  let code = 0
  for (const t of opts(ctx).operands) {
    const path = resolve(ctx, t)
    const existing = readText(ctx, path)
    if (existing !== null) {
      attempt(() => vfs.writeFile(path, existing))
      continue
    }
    if (attempt(() => vfs.writeFile(path, ''))) {
      ctx.print(`touch: cannot touch '${t}': No such file or directory`)
      code = 1
    }
  }
  return code
}

const rm: CommandFn = (ctx) => {
  const o = opts(ctx)
  const recursive = o.flags.has('r') || o.flags.has('R') || o.flags.has('recursive')
  const force = o.flags.has('f') || o.flags.has('force')
  let code = 0
  for (const t of o.operands) {
    const paths = expand(ctx, t)
    const s = paths[0] ? stat(ctx, paths[0]) : null
    if (!s) {
      if (!force) {
        ctx.print(`rm: cannot remove '${t}': No such file or directory`)
        code = 1
      }
      continue
    }
    for (const p of paths) {
      if (stat(ctx, p)?.isDir && !recursive) {
        ctx.print(`rm: cannot remove '${t}': Is a directory`)
        code = 1
        continue
      }
      attempt(() => ctx.backend.vfs.remove(p, { recursive: true }))
    }
  }
  return code
}

const mvOrCp =
  (verb: 'mv' | 'cp'): CommandFn =>
  (ctx) => {
    const o = opts(ctx)
    const vfs = ctx.backend.vfs
    if (o.operands.length < 2) {
      ctx.print(o.operands.length === 0 ? `${verb}: missing file operand` : `${verb}: missing destination file operand after '${o.operands[0]}'`, `Try '${verb} --help' for more information.`)
      return 1
    }
    const dest = o.operands[o.operands.length - 1]
    const destPath = resolve(ctx, dest)
    const destIsDir = vfs.stat(destPath)?.isDir === true
    let code = 0
    for (const src of o.operands.slice(0, -1)) {
      for (const p of expand(ctx, src)) {
        const s = stat(ctx, p)
        if (!s) {
          ctx.print(`${verb}: cannot stat '${src}': No such file or directory`)
          code = 1
          continue
        }
        if (verb === 'cp' && s.isDir && !(o.flags.has('r') || o.flags.has('R'))) {
          ctx.print(`cp: -r not specified; omitting directory '${src}'`)
          code = 1
          continue
        }
        const to = destIsDir ? vfs.join(destPath, vfs.basename(p)) : destPath
        if (attempt(() => (verb === 'mv' ? vfs.rename(p, to) : vfs.copy(p, to)))) {
          ctx.print(`${verb}: cannot create regular file '${dest}': No such file or directory`)
          code = 1
        }
      }
    }
    return code
  }

/** head / tail over files or piped text. */
const headTail =
  (which: 'head' | 'tail'): CommandFn =>
  async (ctx) => {
    const o = opts(ctx, ['n'])
    const n = Number(o.values.n ?? 10)
    const take = (lines: string[]): string[] => (which === 'head' ? lines.slice(0, n) : lines.slice(-n))
    if (o.operands.length === 0) {
      if (ctx.stdin !== null) {
        const lines = take(textLines(ctx.stdin))
        await pace(ctx, lines.join(CRLF) + (lines.length ? CRLF : ''))
      }
      return 0
    }
    for (const t of o.operands) {
      const text = readText(ctx, resolve(ctx, t))
      if (text === null) {
        ctx.print(`${which}: cannot open '${t}' for reading: No such file or directory`)
        return 1
      }
      if (o.operands.length > 1) ctx.print(`==> ${t} <==`)
      const lines = take(textLines(text))
      await pace(ctx, lines.join(CRLF) + (lines.length ? CRLF : ''))
    }
    return 0
  }

const wc: CommandFn = (ctx) => {
  const o = opts(ctx)
  const count = (text: string): [number, number, number] => [
    (text.match(/\n/g) ?? []).length,
    text.split(/\s+/).filter(Boolean).length,
    new TextEncoder().encode(text).length
  ]
  const fmt = (c: [number, number, number], name: string): string => {
    const pick = o.flags.has('l') ? [c[0]] : o.flags.has('w') ? [c[1]] : o.flags.has('c') ? [c[2]] : c
    return pick.map((n) => String(n).padStart(pick.length > 1 ? 4 : 1)).join(' ') + (name ? ` ${name}` : '')
  }
  if (o.operands.length === 0) {
    ctx.print(fmt(count(ctx.stdin ?? ''), ''))
    return 0
  }
  for (const t of o.operands) {
    const text = readText(ctx, resolve(ctx, t))
    if (text === null) {
      ctx.print(`wc: ${t}: No such file or directory`)
      return 1
    }
    ctx.print(fmt(count(text), t))
  }
  return 0
}

/** grep over piped text, files, or (-r) the VFS. */
const grep: CommandFn = async (ctx) => {
  const o = opts(ctx, ['e'])
  const pattern = o.values.e ?? o.operands.shift()
  if (pattern === undefined) {
    ctx.print('Usage: grep [OPTION]... PATTERNS [FILE]...', "Try 'grep --help' for more information.")
    return 2
  }
  const ignoreCase = o.flags.has('i')
  let re: RegExp
  try {
    re = new RegExp(o.flags.has('F') ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern, ignoreCase ? 'i' : '')
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ignoreCase ? 'i' : '')
  }
  const invert = o.flags.has('v')
  const colour = (line: string): string => (ctx.tty ? line.replace(re, (m) => `\x1b[01;31m\x1b[K${m}\x1b[m\x1b[K`) : line)
  const out: string[] = []
  const vfs = ctx.backend.vfs
  const withNames = o.flags.has('r') || o.flags.has('R') || o.operands.length > 1
  const scan = (text: string, name: string | null): void => {
    textLines(text).forEach((line, i) => {
      if (re.test(line) === invert) return
      const prefix =
        (name !== null && withNames ? `\x1b[35m${name}\x1b[m\x1b[36m:\x1b[m` : '') +
        (o.flags.has('n') ? `\x1b[32m${i + 1}\x1b[m\x1b[36m:\x1b[m` : '')
      out.push(prefix + colour(line))
    })
  }
  if (o.operands.length === 0 && !(o.flags.has('r') || o.flags.has('R'))) scan(ctx.stdin ?? '', null)
  else if (o.flags.has('r') || o.flags.has('R')) {
    const root = resolve(ctx, o.operands[0] ?? '.')
    for (const hit of vfs.grep(root, re, { ignoreCase, limit: 500 })) {
      const name = vfs.relative(ctx.sh.cwd, hit.path).replace(/\\/g, '/')
      if (!invert) {
        out.push(
          `\x1b[35m${name}\x1b[m\x1b[36m:\x1b[m` + (o.flags.has('n') ? `\x1b[32m${hit.line}\x1b[m\x1b[36m:\x1b[m` : '') + colour(hit.text)
        )
      }
    }
  } else {
    for (const t of o.operands) {
      const text = readText(ctx, resolve(ctx, t))
      if (text === null) {
        ctx.print(`grep: ${t}: No such file or directory`)
        continue
      }
      scan(text, t)
    }
  }
  if (out.length) await pace(ctx, out.join(CRLF) + CRLF)
  return out.length ? 0 : 1
}

const find: CommandFn = async (ctx) => {
  const args = ctx.argv
  const root = args[0] && !args[0].startsWith('-') ? args[0] : '.'
  const nameIdx = args.findIndex((a) => a === '-name' || a === '-iname')
  const pattern = nameIdx >= 0 ? args[nameIdx + 1] : null
  const type = args[args.indexOf('-type') + 1]
  const re = pattern ? new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i') : null
  const start = resolve(ctx, root)
  if (!stat(ctx, start)) {
    ctx.print(`find: ‘${root}’: No such file or directory`)
    return 1
  }
  const out: string[] = []
  const walk = (dir: string, shown: string): void => {
    for (const e of list(ctx, dir)) {
      const path = `${shown}/${e.name}`
      const typeOk = args.includes('-type') ? (type === 'd' ? e.isDir : !e.isDir) : true
      if ((!re || re.test(e.name)) && typeOk) out.push(path)
      if (e.isDir && e.name !== 'node_modules' && e.name !== '.git') walk(e.path, path)
    }
  }
  if (!re && (!args.includes('-type') || type === 'd')) out.push(root)
  walk(start, root.replace(/[\\/]$/, ''))
  await pace(ctx, out.join(CRLF) + (out.length ? CRLF : ''))
  return 0
}

export const bashFsCommands: Record<string, CommandFn> = {
  ls,
  dir: ls,
  cd,
  pwd,
  cat,
  mkdir,
  touch,
  rm,
  mv: mvOrCp('mv'),
  cp: mvOrCp('cp'),
  head: headTail('head'),
  tail: headTail('tail'),
  wc,
  grep,
  find
}
