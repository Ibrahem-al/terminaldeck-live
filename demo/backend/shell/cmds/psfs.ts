/**
 * PowerShell's file-system cmdlets and their aliases, formatted like the
 * default views of Windows PowerShell 5.1 and PowerShell 7 (which colours
 * directories and table headers through $PSStyle).
 */
import type { FsEntry } from '@shared/types'
import { CRLF } from '../../util/ansi'
import { psError } from '../dialect'
import type { CommandFn, Ctx } from './context'
import { pace, psDate } from './context'
import { attempt, expand, list, readText, resolve, stat, textLines } from './paths'
import { bindPs, fqid } from './psbind'
import { psEnvTable } from './system'

const HEADER_GREEN = '\x1b[32;1m'
const DIR_STYLE = '\x1b[44;1m'
const EXE_STYLE = '\x1b[32;1m'
const RESET = '\x1b[0m'

/** Print an ItemNotFound error for `path`. */
export function psNotFound(ctx: Ctx, cmdlet: string, path: string, wordIndex = 1): number {
  const w = ctx.words[wordIndex] ?? ctx.words[0]
  ctx.write(
    psError(ctx.d.ps7, {
      source: cmdlet,
      message: `Cannot find path '${path}' because it does not exist.`,
      line: ctx.line,
      offset: w.start,
      length: w.raw.length,
      category: `ObjectNotFound: (${path}:String) [${cmdlet}], ItemNotFoundException`,
      fqid: fqid(cmdlet, 'PathNotFound')
    })
  )
  return 1
}

/* ───────────────────────────── tables ───────────────────────────── */

function modeOf(ps7: boolean, isDir: boolean): string {
  return ps7 ? (isDir ? 'd----' : '-a---') : isDir ? 'd-----' : '-a----'
}

function styledName(ctx: Ctx, e: FsEntry): string {
  if (!ctx.d.ps7) return e.name
  if (e.isDir) return `${DIR_STYLE}${e.name}${RESET}`
  if (/\.(exe|ps1|cmd|bat|com)$/i.test(e.name)) return `${EXE_STYLE}${e.name}${RESET}`
  return e.name
}

/** One `Directory: …` block of the default Get-ChildItem view. */
export function itemTable(ctx: Ctx, dir: string, entries: FsEntry[]): string[] {
  const ps7 = ctx.d.ps7
  const head = ps7 ? HEADER_GREEN : ''
  const reset = ps7 ? RESET : ''
  const rows = entries.map((e) => {
    const s = stat(ctx, e.path)
    const { date, time } = psDate(s?.mtime ?? Date.now())
    const when = `${date.padStart(10)} ${time.padStart(8)}`
    const mode = modeOf(ps7, e.isDir)
    const length = e.isDir ? '' : String(s?.size ?? 0)
    return `${mode.padEnd(ps7 ? 5 : 6)}${when.padStart(ps7 ? 29 : 28)}${length.padStart(15)} ${styledName(ctx, e)}`
  })
  const lines = ps7 ? [''] : ['', '']
  lines.push(`    Directory: ${dir}`, '')
  if (!ps7) lines.push('')
  lines.push(
    `${head}Mode                 LastWriteTime         Length Name${reset}`,
    `${head}----                 -------------         ------ ----${reset}`,
    ...rows
  )
  return lines
}

const endTable = (ctx: Ctx): string[] => (ctx.d.ps7 ? ['', ''] : ['', '', ''])

/* ──────────────────────────── cmdlets ──────────────────────────── */

const getChildItem: CommandFn = async (ctx) => {
  const b = bindPs(ctx, 'Get-ChildItem', {
    params: ['Path', 'Filter', 'Include', 'Exclude', 'Depth'],
    switches: ['Recurse', 'Force', 'Name', 'Directory', 'File', 'Hidden'],
    aliases: { r: 'Recurse', s: 'Recurse', fo: 'Force', ad: 'Directory', af: 'File', h: 'Hidden', n: 'Name' }
  })
  if (!b) return 1
  const target = b.values.Path ?? '.'
  const env = /^env:\\?(.*)$/i.exec(target)
  if (env) return psEnvTable(ctx, env[1])
  const paths = expand(ctx, target)
  const filter = b.values.Filter ? new RegExp(`^${b.values.Filter.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i') : null
  // .git carries the Hidden attribute on Windows: only -Force (or -Hidden) shows it.
  const hiddenOk = b.switches.has('Force') || b.switches.has('Hidden')
  const keep = (e: FsEntry): boolean =>
    (hiddenOk || e.name.toLowerCase() !== '.git') &&
    (!filter || filter.test(e.name)) && (!b.switches.has('Directory') || e.isDir) && (!b.switches.has('File') || !e.isDir)

  // A wildcard lists the matches themselves, grouped under their directory.
  const groups: Array<{ dir: string; entries: FsEntry[] }> = []
  if (paths.length === 0) return psNotFound(ctx, 'Get-ChildItem', resolve(ctx, target))
  for (const p of paths) {
    const s = stat(ctx, p)
    if (!s) return psNotFound(ctx, 'Get-ChildItem', p)
    if (!s.isDir) {
      const dir = ctx.backend.vfs.dirname(s.path)
      const g = groups.find((x) => x.dir === dir)
      const entry = { name: s.name, path: s.path, isDir: false }
      if (g) g.entries.push(entry)
      else groups.push({ dir, entries: [entry] })
      continue
    }
    const walk = (dir: string, depth: number): void => {
      const entries = list(ctx, dir)
      groups.push({ dir, entries: entries.filter(keep) })
      if (b.switches.has('Recurse') && (b.values.Depth === undefined || depth < Number(b.values.Depth))) {
        for (const e of entries) if (e.isDir && e.name !== 'node_modules') walk(e.path, depth + 1)
      }
    }
    if (hasGlobIn(target)) groups.push({ dir: s.path, entries: list(ctx, s.path).filter(keep) })
    else walk(s.path, 0)
  }
  if (b.switches.has('Name')) {
    const cwd = ctx.sh.cwd
    const names = groups.flatMap((g) =>
      g.entries.map((e) => (b.switches.has('Recurse') ? ctx.backend.vfs.relative(cwd, e.path) : e.name))
    )
    await pace(ctx, names.join(CRLF) + (names.length ? CRLF : ''))
    return 0
  }
  const lines: string[] = []
  for (const g of groups) if (g.entries.length > 0) lines.push(...itemTable(ctx, g.dir, g.entries))
  if (lines.length > 0) lines.push(...endTable(ctx))
  await pace(ctx, lines.join(CRLF))
  return 0
}

const hasGlobIn = (s: string): boolean => /[*?]/.test(s)

const setLocation: CommandFn = (ctx) => {
  const b = bindPs(ctx, 'Set-Location', { params: ['Path', 'LiteralPath'] })
  if (!b) return 1
  const raw = b.values.Path ?? b.values.LiteralPath
  if (raw === undefined) {
    // Windows PowerShell stays put; PowerShell 7 goes home.
    if (ctx.d.ps7) ctx.sh.setCwd(ctx.backend.scenario.machine.home)
    return 0
  }
  if (raw === '-' && ctx.d.ps7) {
    if (ctx.sh.prevCwd) ctx.sh.setCwd(ctx.sh.prevCwd)
    return 0
  }
  const path = resolve(ctx, raw)
  const s = stat(ctx, path)
  if (!s) return psNotFound(ctx, 'Set-Location', path)
  if (!s.isDir) {
    ctx.write(
      psError(ctx.d.ps7, {
        source: 'Set-Location',
        message: `Cannot find path '${path}' because it does not exist.`,
        line: ctx.line,
        offset: ctx.words[1]?.start ?? 0,
        length: ctx.words[1]?.raw.length ?? 1,
        category: `ObjectNotFound: (${path}:String) [Set-Location], ItemNotFoundException`,
        fqid: fqid('Set-Location', 'PathNotFound')
      })
    )
    return 1
  }
  ctx.sh.setCwd(s.path)
  return 0
}

const getLocation: CommandFn = (ctx) => {
  const head = ctx.d.ps7 ? HEADER_GREEN : ''
  const reset = ctx.d.ps7 ? RESET : ''
  const lines = ['', `${head}Path${reset}`, `${head}----${reset}`, ctx.sh.cwd, '']
  if (!ctx.d.ps7) lines.push('')
  ctx.print(...lines)
  return 0
}

const getContent: CommandFn = async (ctx) => {
  const b = bindPs(ctx, 'Get-Content', {
    params: ['Path', 'Tail', 'TotalCount', 'Head', 'First', 'Last', 'Encoding'],
    switches: ['Raw', 'Wait'],
    aliases: { tail: 'Tail', last: 'Tail', head: 'TotalCount', first: 'TotalCount' }
  })
  if (!b) return 1
  const target = b.values.Path ?? b.rest[0]
  if (!target) {
    ctx.print('', 'cmdlet Get-Content at command pipeline position 1', 'Supply values for the following parameters:')
    return 1
  }
  let code = 0
  for (const path of [...expand(ctx, target), ...b.rest.flatMap((r) => expand(ctx, r))]) {
    const s = stat(ctx, path)
    if (!s) {
      code = psNotFound(ctx, 'Get-Content', path)
      continue
    }
    if (s.isDir) {
      ctx.write(
        psError(ctx.d.ps7, {
          source: 'Get-Content',
          message: ctx.d.ps7
            ? `Unable to get content because it is a directory: '${s.path}'. Please use 'Get-ChildItem' instead.`
            : `Access to the path '${s.path}' is denied.`,
          line: ctx.line,
          offset: ctx.words[1]?.start ?? 0,
          length: ctx.words[1]?.raw.length ?? 1,
          category: ctx.d.ps7
            ? `ReadError: (${s.path}:String) [Get-Content], UnauthorizedAccessException`
            : `PermissionDenied: (${s.path}:String) [Get-Content], UnauthorizedAccessException`,
          fqid: fqid('Get-Content', ctx.d.ps7 ? 'GetContentReaderUnauthorizedAccessError' : 'GetContentReaderUnauthorizedAccessError')
        })
      )
      code = 1
      continue
    }
    let lines = textLines(readText(ctx, s.path) ?? '')
    const tail = b.values.Tail ?? b.values.Last
    const head = b.values.TotalCount ?? b.values.Head ?? b.values.First
    if (tail !== undefined) lines = lines.slice(-Number(tail))
    if (head !== undefined) lines = lines.slice(0, Number(head))
    await pace(ctx, lines.join(CRLF) + (lines.length ? CRLF : ''))
  }
  return code
}

/** `New-Item` / `ni`, and PowerShell's `mkdir` / `md` function. */
const newItem =
  (defaultType: 'File' | 'Directory', source: string): CommandFn =>
  async (ctx) => {
    const b = bindPs(ctx, 'New-Item', {
      params: ['Path', 'Name', 'ItemType', 'Value'],
      switches: ['Force'],
      aliases: { type: 'ItemType', it: 'ItemType' }
    })
    if (!b) return 1
    const vfs = ctx.backend.vfs
    const typed = (b.values.ItemType ?? defaultType).toLowerCase()
    const isDir = typed.startsWith('d')
    const targets = [b.values.Path, ...b.rest].filter((x): x is string => !!x)
    if (targets.length === 0 && b.values.Name) targets.push(b.values.Name)
    else if (b.values.Name) targets[0] = vfs.join(targets[0], b.values.Name)
    if (targets.length === 0) {
      ctx.print('', `cmdlet ${source} at command pipeline position 1`, 'Supply values for the following parameters:')
      return 1
    }
    const created: FsEntry[] = []
    let code = 0
    for (const t of targets) {
      const path = resolve(ctx, t)
      if (vfs.exists(path) && !b.switches.has('Force')) {
        ctx.write(
          psError(ctx.d.ps7, {
            source,
            message: isDir ? `An item with the specified name ${path} already exists.` : `The file '${path}' already exists.`,
            line: ctx.line,
            offset: ctx.words[1]?.start ?? 0,
            length: ctx.words[1]?.raw.length ?? 1,
            category: `ResourceExists: (${path}:String) [New-Item], IOException`,
            fqid: fqid('New-Item', isDir ? 'DirectoryExist' : 'NewItemIOError')
          })
        )
        code = 1
        continue
      }
      const err = attempt(() =>
        isDir ? vfs.mkdir(path, { recursive: true }) : vfs.writeFile(path, b.values.Value ?? '', { createDirs: true })
      )
      if (err) {
        code = psNotFound(ctx, 'New-Item', vfs.dirname(path))
        continue
      }
      created.push({ name: vfs.basename(path), path: vfs.stat(path)?.path ?? path, isDir })
    }
    if (created.length > 0) {
      const dir = vfs.dirname(created[0].path)
      await pace(ctx, [...itemTable(ctx, dir, created), ...endTable(ctx)].join(CRLF))
    }
    return code
  }

const removeItem: CommandFn = (ctx) => {
  const b = bindPs(ctx, 'Remove-Item', {
    params: ['Path', 'LiteralPath', 'Filter'],
    switches: ['Recurse', 'Force', 'WhatIf', 'Confirm'],
    aliases: { r: 'Recurse', fo: 'Force', rf: 'Recurse' }
  })
  if (!b) return 1
  const targets = [b.values.Path ?? b.values.LiteralPath, ...b.rest].filter((x): x is string => !!x)
  let code = 0
  for (const t of targets) {
    const paths = expand(ctx, t)
    if (paths.length === 0 || !ctx.backend.vfs.exists(paths[0])) {
      code = psNotFound(ctx, 'Remove-Item', paths[0] ?? resolve(ctx, t))
      continue
    }
    for (const p of paths) attempt(() => ctx.backend.vfs.remove(p, { recursive: true }))
  }
  return code
}

const moveOrCopy =
  (cmdlet: 'Move-Item' | 'Copy-Item'): CommandFn =>
  (ctx) => {
    const b = bindPs(ctx, cmdlet, {
      params: ['Path', 'Destination', 'LiteralPath'],
      positional: 2,
      switches: ['Recurse', 'Force', 'PassThru', 'Container'],
      aliases: { r: 'Recurse', fo: 'Force' }
    })
    if (!b) return 1
    const vfs = ctx.backend.vfs
    const src = b.values.Path ?? b.values.LiteralPath
    const dest = b.values.Destination
    if (!src || !dest) {
      ctx.print('', `cmdlet ${cmdlet} at command pipeline position 1`, 'Supply values for the following parameters:')
      return 1
    }
    const sources = expand(ctx, src)
    if (sources.length === 0 || !vfs.exists(sources[0])) return psNotFound(ctx, cmdlet, sources[0] ?? resolve(ctx, src))
    const destPath = resolve(ctx, dest)
    const destIsDir = vfs.stat(destPath)?.isDir === true
    for (const s of sources) {
      const to = destIsDir ? vfs.join(destPath, vfs.basename(s)) : destPath
      const err = attempt(() => (cmdlet === 'Move-Item' ? vfs.rename(s, to) : vfs.copy(s, to)))
      if (err) return psNotFound(ctx, cmdlet, vfs.dirname(to), 2)
    }
    return 0
  }

const renameItem: CommandFn = (ctx) => {
  const b = bindPs(ctx, 'Rename-Item', { params: ['Path', 'NewName'], positional: 2, switches: ['Force', 'PassThru'] })
  if (!b) return 1
  const vfs = ctx.backend.vfs
  if (!b.values.Path || !b.values.NewName) return 1
  const from = resolve(ctx, b.values.Path)
  if (!vfs.exists(from)) return psNotFound(ctx, 'Rename-Item', from)
  const err = attempt(() => vfs.rename(from, vfs.join(vfs.dirname(from), b.values.NewName)))
  return err ? 1 : 0
}

const testPath: CommandFn = (ctx) => {
  const target = ctx.argv.find((a) => !a.startsWith('-'))
  ctx.print(target && ctx.backend.vfs.exists(resolve(ctx, target)) ? 'True' : 'False')
  return 0
}

/** Select-String over files, or over piped text. */
const selectString: CommandFn = async (ctx) => {
  const b = bindPs(ctx, 'Select-String', {
    params: ['Pattern', 'Path'],
    positional: 2,
    switches: ['CaseSensitive', 'SimpleMatch', 'List', 'NotMatch', 'Quiet'],
    aliases: {}
  })
  if (!b) return 1
  const pattern = b.values.Pattern
  if (!pattern) return 1
  let re: RegExp
  try {
    re = new RegExp(b.switches.has('SimpleMatch') ? pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : pattern, b.switches.has('CaseSensitive') ? '' : 'i')
  } catch {
    re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  }
  const mark = (line: string): string => (ctx.d.ps7 ? line.replace(re, (m) => `\x1b[7m${m}\x1b[0m`) : line)
  const out: string[] = []
  if (!b.values.Path && ctx.stdin !== null) {
    for (const line of textLines(ctx.stdin)) if (re.test(line) !== b.switches.has('NotMatch')) out.push(mark(line))
    if (out.length) await pace(ctx, ['', ...out, '', ''].join(CRLF))
    return 0
  }
  const vfs = ctx.backend.vfs
  const paths = b.values.Path ? expand(ctx, b.values.Path) : []
  for (const p of paths) {
    const text = readText(ctx, p)
    if (text === null) continue
    textLines(text).forEach((line, i) => {
      if (re.test(line) !== b.switches.has('NotMatch')) out.push(`${vfs.relative(ctx.sh.cwd, p)}:${i + 1}:${mark(line)}`)
    })
  }
  if (out.length) await pace(ctx, ['', ...out, '', ''].join(CRLF))
  return 0
}

const clearHistory: CommandFn = (ctx) => {
  ctx.sh.clearHistory()
  return 0
}

const getHistory: CommandFn = (ctx) => {
  // Get-History lists what has finished; the line running it isn't in it yet.
  const h = ctx.sh.history.slice(0, -1)
  if (h.length === 0) return 0
  const head = ctx.d.ps7 ? HEADER_GREEN : ''
  const reset = ctx.d.ps7 ? RESET : ''
  const width = Math.max(2, String(h.length).length)
  const lines = ['', `${head}${'Id'.padStart(width + 2)} CommandLine${reset}`, `${head}${'--'.padStart(width + 2)} -----------${reset}`]
  h.forEach((cmd, i) => lines.push(`${String(i + 1).padStart(width + 2)} ${cmd}`))
  lines.push('', '')
  ctx.print(...lines)
  return 0
}

export const psFsCommands: Record<string, CommandFn> = {
  'get-childitem': getChildItem,
  ls: getChildItem,
  dir: getChildItem,
  gci: getChildItem,
  'set-location': setLocation,
  cd: setLocation,
  sl: setLocation,
  chdir: setLocation,
  'get-location': getLocation,
  pwd: getLocation,
  gl: getLocation,
  'get-content': getContent,
  cat: getContent,
  type: getContent,
  gc: getContent,
  'new-item': newItem('File', 'New-Item'),
  ni: newItem('File', 'New-Item'),
  mkdir: newItem('Directory', 'mkdir'),
  md: newItem('Directory', 'md'),
  'remove-item': removeItem,
  rm: removeItem,
  del: removeItem,
  erase: removeItem,
  rd: removeItem,
  rmdir: removeItem,
  ri: removeItem,
  'move-item': moveOrCopy('Move-Item'),
  mv: moveOrCopy('Move-Item'),
  move: moveOrCopy('Move-Item'),
  mi: moveOrCopy('Move-Item'),
  'copy-item': moveOrCopy('Copy-Item'),
  cp: moveOrCopy('Copy-Item'),
  copy: moveOrCopy('Copy-Item'),
  cpi: moveOrCopy('Copy-Item'),
  'rename-item': renameItem,
  ren: renameItem,
  rni: renameItem,
  'test-path': testPath,
  'select-string': selectString,
  sls: selectString,
  'get-history': getHistory,
  history: getHistory,
  h: getHistory,
  ghy: getHistory,
  'clear-history': clearHistory,
  clhy: clearHistory
}
