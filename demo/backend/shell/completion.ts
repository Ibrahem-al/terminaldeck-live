/**
 * Tab completion from the VFS and the command tables. PowerShell and cmd
 * cycle through candidates in place (`.\api\` style for PowerShell); Git
 * Bash completes the common prefix and lists the choices on a second Tab,
 * including git's subcommands and branches (git-completion.bash is loaded in
 * Git for Windows).
 */
import type { Backend } from '../contracts'
import { commandNames } from './cmds'
import type { Family } from './parse'

export interface CompletionRequest {
  backend: Backend
  family: Family
  ps7: boolean
  cwd: string
  line: string
  cursor: number
  /** Branches of the repo at cwd (bash `git checkout <Tab>`). */
  branches: () => string[]
}

export interface Completion {
  /** Replace `[start, end)` of the line. */
  start: number
  end: number
  /** Full replacement texts, in cycling order. */
  candidates: string[]
  /** Candidates as bash lists them (names only). */
  display: string[]
}

const GIT_SUBCOMMANDS = ['add', 'bisect', 'branch', 'checkout', 'cherry', 'cherry-pick', 'clone', 'commit', 'diff', 'fetch', 'grep', 'init', 'log', 'merge', 'mv', 'pull', 'push', 'rebase', 'remote', 'reset', 'restore', 'revert', 'rm', 'show', 'stash', 'status', 'switch', 'tag']

/** Where the word under the cursor starts (quotes respected). */
function wordStart(line: string, cursor: number): number {
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < cursor; i++) {
    const c = line[i]
    if (quote) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === ' ' || c === ';' || c === '|' || c === '&') start = i + 1
  }
  return start
}

export function complete(req: CompletionRequest): Completion | null {
  const { line, cursor, family } = req
  const start = wordStart(line, cursor)
  const raw = line.slice(start, cursor)
  const word = raw.replace(/^['"]|['"]$/g, '')
  const before = line.slice(0, start).trim()
  const commandPos = before === '' || /[;|&]$/.test(before)
  const words = before.split(/\s+/).filter(Boolean)

  if (family === 'bash' && words[0] === 'git' && !commandPos) {
    if (words.length === 1) return listOf(start, cursor, GIT_SUBCOMMANDS.filter((s) => s.startsWith(word)).map((s) => s + ' '))
    if (['checkout', 'switch', 'merge', 'rebase'].includes(words[1]) && !word.includes('/')) {
      const b = req.branches().filter((x) => x.startsWith(word))
      if (b.length) return listOf(start, cursor, b.map((x) => x + ' '))
    }
  }
  if (word.startsWith('-')) return null

  const paths = pathCandidates(req, word, commandPos)
  if (commandPos && !/[\\/]/.test(word)) {
    const names = commandNames(family, req.ps7)
    const programs = req.backend.programs.list().map((p) => p.name)
    const lower = word.toLowerCase()
    const cmds = [...new Set([...names, ...programs])]
      .filter((n) => n.toLowerCase().startsWith(lower))
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map((n) => (family === 'bash' ? n + ' ' : n))
    return listOf(start, cursor, [...cmds, ...paths.candidates], [...cmds.map((c) => c.trim()), ...paths.display])
  }
  return listOf(start, cursor, paths.candidates, paths.display)
}

function listOf(start: number, end: number, candidates: string[], display = candidates.map((c) => c.trim())): Completion | null {
  return candidates.length ? { start, end, candidates, display } : null
}

function pathCandidates(req: CompletionRequest, word: string, commandPos: boolean): { candidates: string[]; display: string[] } {
  const vfs = req.backend.vfs
  const { family } = req
  const cut = Math.max(word.lastIndexOf('\\'), word.lastIndexOf('/'))
  const dirPart = cut >= 0 ? word.slice(0, cut + 1) : ''
  const base = word.slice(cut + 1)
  const dir = dirPart ? vfs.resolve(req.cwd, dirPart) : req.cwd
  let entries
  try {
    entries = vfs.readDir(dir, { showHidden: true })
  } catch {
    return { candidates: [], display: [] }
  }
  const lower = base.toLowerCase()
  const matches = entries.filter(
    (e) => e.name.toLowerCase().startsWith(lower) && (family !== 'bash' || base.startsWith('.') || !e.name.startsWith('.'))
  )
  // Every shell offers directories and files together, alphabetically.
  matches.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  const candidates: string[] = []
  const display: string[] = []
  for (const e of matches) {
    display.push(e.name + (e.isDir ? '/' : ''))
    if (family === 'bash') {
      const text = dirPart + e.name.replace(/ /g, '\\ ') + (e.isDir ? '/' : ' ')
      candidates.push(text)
    } else if (family === 'cmd') {
      const text = dirPart + e.name
      candidates.push(/\s/.test(text) ? `"${text}"` : text)
    } else {
      let prefix = dirPart.replace(/\//g, '\\')
      if (!/^(\.{1,2}\\|~|[A-Za-z]:|\\)/.test(prefix)) prefix = '.\\' + prefix
      // In command position PowerShell only offers what can run; everything else is still a path.
      if (commandPos && !e.isDir && !/\.(ps1|exe|cmd|bat|com)$/i.test(e.name)) continue
      const text = prefix + e.name + (e.isDir ? '\\' : '')
      candidates.push(/\s/.test(text) ? `'${text}'` : text)
    }
  }
  return { candidates, display }
}

/** Longest common prefix (case-insensitive compare, keeps the first candidate's case). */
export function commonPrefix(items: string[]): string {
  if (items.length === 0) return ''
  let p = items[0]
  for (const s of items.slice(1)) {
    let i = 0
    while (i < p.length && i < s.length && p[i].toLowerCase() === s[i].toLowerCase()) i++
    p = p.slice(0, i)
  }
  return p
}
