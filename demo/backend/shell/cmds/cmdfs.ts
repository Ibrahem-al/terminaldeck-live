/** cmd.exe's built-in file commands, with cmd's own terse messages. */
import { CRLF } from '../../util/ansi'
import type { CommandFn, Ctx } from './context'
import { cmdDate, pace, withCommas } from './context'
import { attempt, expand, list, readText, resolve, stat, textLines } from './paths'

const switches = (ctx: Ctx): Set<string> => new Set(ctx.argv.filter((a) => a.startsWith('/')).map((a) => a.slice(1).toLowerCase()))
const operands = (ctx: Ctx): string[] => ctx.argv.filter((a) => !a.startsWith('/'))

const dir: CommandFn = async (ctx) => {
  const sw = switches(ctx)
  const target = operands(ctx)[0] ?? '.'
  const paths = expand(ctx, target)
  const s = paths[0] ? stat(ctx, paths[0]) : null
  if (!s) {
    ctx.print(' Volume in drive C has no label.', ' Volume Serial Number is 6C3A-91F2', '', ` Directory of ${ctx.backend.vfs.dirname(resolve(ctx, target))}`, '', 'File Not Found')
    return 1
  }
  const folder = s.isDir && paths.length === 1 ? s.path : ctx.backend.vfs.dirname(s.path)
  const entries = s.isDir && paths.length === 1 ? list(ctx, s.path) : paths.map((p) => ({ name: ctx.backend.vfs.basename(p), path: p, isDir: stat(ctx, p)?.isDir ?? false }))
  const sorted = [...entries]
    .filter((e) => sw.has('a') || sw.has('ah') || e.name.toLowerCase() !== '.git')
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  if (sw.has('b')) {
    await pace(ctx, sorted.map((e) => e.name).join(CRLF) + CRLF)
    return 0
  }
  const lines = [' Volume in drive C has no label.', ' Volume Serial Number is 6C3A-91F2', '', ` Directory of ${folder}`, '']
  const mtime = stat(ctx, folder)?.mtime ?? Date.now()
  if (s.isDir) lines.push(`${cmdDate(mtime)}    <DIR>          .`, `${cmdDate(mtime)}    <DIR>          ..`)
  let files = 0
  let dirs = s.isDir ? 2 : 0
  let bytes = 0
  for (const e of sorted) {
    const st = stat(ctx, e.path)
    const when = cmdDate(st?.mtime ?? Date.now())
    if (e.isDir) {
      dirs++
      lines.push(`${when}    <DIR>          ${e.name}`)
    } else {
      files++
      bytes += st?.size ?? 0
      lines.push(`${when}${withCommas(st?.size ?? 0).padStart(18)} ${e.name}`)
    }
  }
  lines.push(
    `${String(files).padStart(16)} File(s)${withCommas(bytes).padStart(15)} bytes`,
    `${String(dirs).padStart(16)} Dir(s)  412,803,145,728 bytes free`
  )
  await pace(ctx, lines.join(CRLF) + CRLF)
  return 0
}

const cd: CommandFn = (ctx) => {
  const target = operands(ctx).join(' ')
  if (!target) {
    ctx.print(ctx.sh.cwd)
    return 0
  }
  const path = resolve(ctx, target)
  const s = stat(ctx, path)
  if (!s || !s.isDir) {
    ctx.print(s ? 'The directory name is invalid.' : 'The system cannot find the path specified.')
    return 1
  }
  ctx.sh.setCwd(s.path)
  return 0
}

const type: CommandFn = async (ctx) => {
  const targets = operands(ctx)
  if (targets.length === 0) {
    ctx.print('The syntax of the command is incorrect.')
    return 1
  }
  for (const t of targets) {
    const path = resolve(ctx, t)
    const s = stat(ctx, path)
    if (!s) {
      ctx.print('The system cannot find the file specified.')
      return 1
    }
    if (s.isDir) {
      ctx.print('Access is denied.')
      return 1
    }
    if (targets.length > 1) ctx.print('', t, '', '')
    await pace(ctx, textLines(readText(ctx, path) ?? '').join(CRLF) + CRLF)
  }
  return 0
}

const mkdir: CommandFn = (ctx) => {
  for (const t of operands(ctx)) {
    const path = resolve(ctx, t)
    if (ctx.backend.vfs.exists(path)) {
      ctx.print(`A subdirectory or file ${t} already exists.`)
      return 1
    }
    attempt(() => ctx.backend.vfs.mkdir(path, { recursive: true }))
  }
  return 0
}

const del: CommandFn = (ctx) => {
  for (const t of operands(ctx)) {
    const paths = expand(ctx, t)
    if (paths.length === 0 || !ctx.backend.vfs.exists(paths[0])) {
      ctx.print(`Could not find ${paths[0] ?? resolve(ctx, t)}`)
      continue
    }
    for (const p of paths) {
      if (stat(ctx, p)?.isDir) {
        for (const e of list(ctx, p)) if (!e.isDir) attempt(() => ctx.backend.vfs.remove(e.path))
      } else attempt(() => ctx.backend.vfs.remove(p))
    }
  }
  return 0
}

const rmdir: CommandFn = (ctx) => {
  const sw = switches(ctx)
  for (const t of operands(ctx)) {
    const path = resolve(ctx, t)
    const s = stat(ctx, path)
    if (!s) {
      ctx.print('The system cannot find the file specified.')
      return 2
    }
    if (!s.isDir) {
      ctx.print('The directory name is invalid.')
      return 267
    }
    if (!sw.has('s') && list(ctx, path).length > 0) {
      ctx.print('The directory is not empty.')
      return 145
    }
    attempt(() => ctx.backend.vfs.remove(path, { recursive: true }))
  }
  return 0
}

const moveOrCopy =
  (verb: 'moved' | 'copied'): CommandFn =>
  (ctx) => {
    const [src, dest] = operands(ctx)
    if (!src) {
      ctx.print('The syntax of the command is incorrect.')
      return 1
    }
    const vfs = ctx.backend.vfs
    const sources = expand(ctx, src)
    if (sources.length === 0 || !vfs.exists(sources[0])) {
      ctx.print('The system cannot find the file specified.')
      return 1
    }
    const destPath = resolve(ctx, dest ?? '.')
    const destIsDir = vfs.stat(destPath)?.isDir === true
    let n = 0
    for (const s of sources) {
      const to = destIsDir ? vfs.join(destPath, vfs.basename(s)) : destPath
      if (!attempt(() => (verb === 'moved' ? vfs.rename(s, to) : vfs.copy(s, to)))) n++
    }
    ctx.print(`${String(n).padStart(9)} file(s) ${verb}.`)
    return 0
  }

const ren: CommandFn = (ctx) => {
  const [from, to] = operands(ctx)
  const vfs = ctx.backend.vfs
  if (!from || !to) {
    ctx.print('The syntax of the command is incorrect.')
    return 1
  }
  const path = resolve(ctx, from)
  if (!vfs.exists(path)) {
    ctx.print('The system cannot find the file specified.')
    return 1
  }
  if (attempt(() => vfs.rename(path, vfs.join(vfs.dirname(path), to)))) {
    ctx.print('A duplicate file name exists, or the file cannot be found.')
    return 1
  }
  return 0
}

export const cmdFsCommands: Record<string, CommandFn> = {
  dir,
  cd,
  chdir: cd,
  type,
  md: mkdir,
  mkdir,
  del,
  erase: del,
  rd: rmdir,
  rmdir,
  move: moveOrCopy('moved'),
  copy: moveOrCopy('copied'),
  ren,
  rename: ren
}
