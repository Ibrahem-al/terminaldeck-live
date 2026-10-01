/**
 * Windows path arithmetic for the virtual machine — pure string work, no I/O.
 * Case-insensitive, case-preserving; `/` and `\` both accepted on input, `\`
 * always on output. Relative inputs stay relative from `normalize`; everything
 * that must be absolute goes through `resolve`.
 */

const DRIVE = /^([a-zA-Z]):/
const MSYS = /^\/([a-zA-Z])(?=\/|$)/

export interface PathOps {
  normalize(path: string): string
  join(...parts: string[]): string
  dirname(path: string): string
  basename(path: string): string
  extname(path: string): string
  isAbsolute(path: string): boolean
  resolve(cwd: string, input: string): string
  relative(from: string, to: string): string
  toPosix(path: string): string
  key(path: string): string
  /** Absolute and normalized: `resolve(home, path)`. What every I/O entry point uses. */
  abs(path: string): string
  /** Whether `path` is `dir` itself or anywhere below it (keys compared). */
  isInside(dir: string, path: string): boolean
}

export function createPathOps(home: string): PathOps {
  const normalize = (path: string): string => {
    let raw = path.replace(/\//g, '\\')
    let prefix = ''
    const drive = DRIVE.exec(raw)
    if (drive) {
      prefix = `${drive[1].toUpperCase()}:\\`
      raw = raw.slice(2)
    } else if (raw.startsWith('\\')) {
      prefix = '\\'
    }
    const parts: string[] = []
    for (const part of raw.split('\\')) {
      if (part === '' || part === '.') continue
      if (part === '..') {
        // Above a drive root is still the root, as on Windows; a relative path keeps its `..`.
        if (parts.length && parts[parts.length - 1] !== '..') parts.pop()
        else if (!prefix) parts.push('..')
        continue
      }
      parts.push(part)
    }
    const body = parts.join('\\')
    if (prefix) return prefix + body
    return body === '' ? '.' : body
  }

  const isAbsolute = (path: string): boolean => /^[a-zA-Z]:[\\/]/.test(path) || /^[a-zA-Z]:$/.test(path)

  const join = (...parts: string[]): string => normalize(parts.filter((p) => p !== '').join('\\'))

  const dirname = (path: string): string => {
    const n = normalize(path)
    const i = n.lastIndexOf('\\')
    if (i < 0) return '.'
    if (i === 2 && n[1] === ':') return n.slice(0, 3)
    if (i === 0) return '\\'
    return n.slice(0, i)
  }

  const basename = (path: string): string => {
    const n = normalize(path)
    if (/^[A-Z]:\\$/.test(n)) return ''
    return n.slice(n.lastIndexOf('\\') + 1)
  }

  const extname = (path: string): string => {
    const name = basename(path)
    const i = name.lastIndexOf('.')
    return i <= 0 ? '' : name.slice(i)
  }

  const resolve = (cwd: string, input: string): string => {
    const raw = input.trim()
    const base = isAbsolute(cwd) ? normalize(cwd) : normalize(join(home, cwd))
    if (raw === '') return base
    if (raw === '~' || raw.startsWith('~/') || raw.startsWith('~\\')) return join(home, raw.slice(1))
    if (DRIVE.test(raw)) {
      // `C:` alone and drive-relative `C:foo` both land at the root of that drive.
      const drive = raw.slice(0, 2).toUpperCase()
      return normalize(`${drive}\\${raw.slice(2)}`)
    }
    const msys = MSYS.exec(raw)
    if (msys) return normalize(`${msys[1].toUpperCase()}:\\${raw.slice(2)}`)
    if (raw.startsWith('\\') || raw.startsWith('/')) return normalize(`${base.slice(0, 2)}\\${raw}`)
    return normalize(`${base}\\${raw}`)
  }

  const key = (path: string): string => {
    const n = normalize(path).toLowerCase()
    return n.length > 3 ? n.replace(/\\+$/, '') : n
  }

  const abs = (path: string): string => resolve(home, path)

  const relative = (from: string, to: string): string => {
    const a = abs(from).split('\\').filter(Boolean)
    const b = abs(to).split('\\').filter(Boolean)
    if (a[0]?.toLowerCase() !== b[0]?.toLowerCase()) return abs(to)
    let i = 0
    while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++
    return [...a.slice(i).map(() => '..'), ...b.slice(i)].join('\\')
  }

  const toPosix = (path: string): string => {
    const n = abs(path)
    const rest = n.slice(3).replace(/\\/g, '/')
    return `/${n[0].toLowerCase()}${rest ? `/${rest}` : ''}`
  }

  const isInside = (dir: string, path: string): boolean => {
    const d = key(dir)
    const p = key(path)
    return p === d || p.startsWith(d.endsWith('\\') ? d : `${d}\\`)
  }

  return { normalize, join, dirname, basename, extname, isAbsolute, resolve, relative, toPosix, key, abs, isInside }
}
