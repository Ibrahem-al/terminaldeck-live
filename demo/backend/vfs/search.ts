/**
 * Name search (fs_search / Quick Open / the sidebar) and content search
 * (agents, `Select-String`, `grep`). Name search is the Rust BFS in
 * fsx/mod.rs `search_for`: breadth-first, case-insensitive substring on names,
 * directories included, dot-names skipped unless showHidden, build/dependency
 * folders never descended, capped at 300 results.
 */
import type { PathOps } from './paths'
import type { Tree, VNode } from './tree'
import { collate } from './collate'

const SEARCH_IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', '.next', '.cache', '__pycache__', '.venv', 'out', '.vite'])
const SEARCH_MAX_RESULTS = 300
const SEARCH_MAX_VISITED = 30_000

/** NTFS hands directory entries back in name order, which is what the BFS walks. */
const ntfsOrder = (a: VNode, b: VNode): number => collate(a.name, b.name)

export function searchNames(
  tree: Tree,
  p: PathOps,
  root: string,
  query: string,
  opts: { showHidden?: boolean; limit?: number } = {}
): string[] {
  const needle = query.toLowerCase()
  if (!needle) return []
  const limit = Math.min(opts.limit ?? SEARCH_MAX_RESULTS, SEARCH_MAX_RESULTS)
  const rootNode = tree.get(root)
  if (!rootNode?.isDir) return []
  // Results are spelled from the root as the caller gave it: the sidebar renders `path.slice(root.length + 1)`.
  const rootSpelling = root.replace(/[\\/]+$/, '') || root
  const results: string[] = []
  let visited = 0
  const queue: Array<{ key: string; spelled: string }> = [{ key: p.key(rootNode.path), spelled: rootSpelling }]
  while (queue.length) {
    const { key, spelled } = queue.shift()!
    for (const entry of tree.children(key).sort(ntfsOrder)) {
      if (++visited > SEARCH_MAX_VISITED) return results
      if (!opts.showHidden && entry.name.startsWith('.')) continue
      const full = `${spelled}\\${entry.name}`
      if (entry.name.toLowerCase().includes(needle)) {
        results.push(full)
        if (results.length >= limit) return results
      }
      if (entry.isDir && !SEARCH_IGNORED_DIRS.has(entry.name)) queue.push({ key: p.key(entry.path), spelled: full })
    }
  }
  return results
}

/**
 * A small glob: `*`, `?`, `**`, `{a,b}`. A pattern without a separator matches
 * the base name (`*.ts`), one with a separator matches the path relative to
 * the search root (`src/**\/*.tsx`).
 */
export function globToRegExp(glob: string): RegExp {
  let re = ''
  let i = 0
  const g = glob.replace(/\\/g, '/')
  while (i < g.length) {
    const c = g[i]
    if (c === '*') {
      if (g[i + 1] === '*') {
        re += g[i + 2] === '/' ? '(?:.*/)?' : '.*'
        i += g[i + 2] === '/' ? 3 : 2
        continue
      }
      re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else if (c === '{') {
      const end = g.indexOf('}', i)
      if (end > i) {
        re += `(?:${g.slice(i + 1, end).split(',').map(escape).join('|')})`
        i = end + 1
        continue
      }
      re += '\\{'
    } else re += escape(c)
    i++
  }
  return new RegExp(`^${re}$`, 'i')
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

export function grepTree(
  tree: Tree,
  p: PathOps,
  root: string,
  pattern: string | RegExp,
  opts: { glob?: string; limit?: number; ignoreCase?: boolean } = {}
): Array<{ path: string; line: number; text: string }> {
  const rootNode = tree.get(root)
  if (!rootNode) return []
  const limit = opts.limit ?? 500
  let re: RegExp
  if (pattern instanceof RegExp) {
    re = new RegExp(pattern.source, opts.ignoreCase && !pattern.flags.includes('i') ? `${pattern.flags}i` : pattern.flags.replace('g', ''))
  } else {
    // Select-String and grep both take a regex; a typo'd one searches literally rather than failing.
    try {
      re = new RegExp(pattern, opts.ignoreCase ? 'i' : '')
    } catch {
      re = new RegExp(escape(pattern), opts.ignoreCase ? 'i' : '')
    }
  }
  const glob = opts.glob ? globToRegExp(opts.glob) : null
  const globOnPath = !!opts.glob && /[\\/]/.test(opts.glob)
  const files = rootNode.isDir
    ? tree
        .descendants(p.key(rootNode.path))
        .filter((n) => !n.isDir && !p.relative(rootNode.path, n.path).split('\\').some((seg) => SEARCH_IGNORED_DIRS.has(seg)))
        .sort((a, b) => collate(a.path, b.path))
    : [rootNode]
  const out: Array<{ path: string; line: number; text: string }> = []
  for (const file of files) {
    if (glob) {
      const subject = globOnPath ? p.relative(rootNode.path, file.path).replace(/\\/g, '/') : file.name
      if (!glob.test(subject)) continue
    }
    const lines = file.content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue
      out.push({ path: file.path, line: i + 1, text: lines[i] })
      if (out.length >= limit) return out
    }
  }
  return out
}
