/** Path helpers shared by the file commands of every shell. */
import type { FsEntry } from '@shared/types'
import { isVfsError, type VfsStat } from '../../contracts'
import type { Ctx } from './context'

export const resolve = (ctx: Ctx, input: string): string => ctx.backend.vfs.resolve(ctx.sh.cwd, input)

export const hasWildcard = (s: string): boolean => /[*?]/.test(s)

function globRe(pattern: string): RegExp {
  const body = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${body}$`, 'i')
}

/**
 * Expand a wildcard argument (`*.ts`, `src\*.tsx`) to existing paths; a
 * plain argument resolves to itself whether or not it exists.
 */
export function expand(ctx: Ctx, input: string): string[] {
  const vfs = ctx.backend.vfs
  if (!hasWildcard(input)) return [resolve(ctx, input)]
  const full = resolve(ctx, input)
  const dir = vfs.dirname(full)
  const re = globRe(vfs.basename(full))
  try {
    return vfs
      .readDir(dir, { showHidden: true })
      .filter((e) => re.test(e.name))
      .map((e) => e.path)
  } catch {
    return []
  }
}

/** readDir with dot-files (Windows shows them; only bash hides them). */
export function list(ctx: Ctx, dir: string): FsEntry[] {
  return ctx.backend.vfs.readDir(dir, { showHidden: true })
}

export function stat(ctx: Ctx, path: string): VfsStat | null {
  return ctx.backend.vfs.stat(path)
}

/** Size in bytes of a file, 0 for dirs. */
export function sizeOf(ctx: Ctx, path: string): number {
  return ctx.backend.vfs.stat(path)?.size ?? 0
}

/** Run a VFS mutation; returns the VfsError code on failure instead of throwing. */
export function attempt(fn: () => void): string | null {
  try {
    fn()
    return null
  } catch (e) {
    if (isVfsError(e)) return e.code
    return 'EINVAL'
  }
}

/** Text read, or null when missing/a directory. */
export function readText(ctx: Ctx, path: string): string | null {
  try {
    return ctx.backend.vfs.readFile(path)
  } catch {
    return null
  }
}

/** Lines of a file text, without the trailing empty line. */
export function textLines(text: string): string[] {
  const lines = text.split(/\r?\n/)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}
