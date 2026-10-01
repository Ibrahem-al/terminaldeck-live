/**
 * A stand-in GitRepo for the scenario repos, used only while the vfs module
 * doesn't provide `vfs.git()` yet. HEAD is snapshotted from the VFS the first
 * time a repo is touched (seeded "dirty" files get a slightly older HEAD text),
 * so `git status` / `diff` / `commit` stay consistent with every later edit.
 */
import type { Backend, GitCommit, GitFileDiff, GitFileStatus, GitRepo, SeedRepo } from '../contracts'
import { seededRandom } from '../util/text'

const SKIP = new Set(['node_modules', '.git', 'dist'])

function hashFor(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  const rnd = seededRandom(h >>> 0)
  let s = ''
  for (let i = 0; i < 40; i++) s += Math.floor(rnd() * 16).toString(16)
  return s
}

/** An older version of a text for a seeded dirty file: its last few lines didn't exist yet. */
function olderText(text: string): string {
  const lines = text.split('\n')
  let cut = 0
  for (let i = lines.length - 1; i > 0 && cut < 3; i--) {
    if (lines[i].trim() !== '') cut++
    if (cut === 3) return lines.slice(0, i).join('\n') + '\n'
  }
  return lines.slice(0, Math.max(1, lines.length - 1)).join('\n') + '\n'
}

class FallbackRepo implements GitRepo {
  readonly root: string
  private branch: string
  private readonly branchSet: Set<string>
  private head = new Map<string, string>()
  private index = new Map<string, string>()
  private readonly commits: GitCommit[] = []
  private remote: SeedRepo['remote'] | undefined
  private ahead: number

  constructor(
    private readonly backend: Backend,
    seed: SeedRepo
  ) {
    const vfs = backend.vfs
    this.root = vfs.normalize(seed.root)
    this.branch = seed.branch
    this.branchSet = new Set([seed.branch])
    this.remote = seed.remote
    this.ahead = seed.remote?.ahead ?? 0
    const now = backend.clock.now()
    for (const c of seed.commits) {
      const date = now - c.daysAgo * 86_400_000 - Math.floor(hashFor(c.message).charCodeAt(3) * 60_000)
      const hash = hashFor(`${seed.root}:${c.message}`)
      this.commits.unshift({ hash, short: hash.slice(0, 7), author: c.author, email: c.email, date, message: c.message, files: c.files })
    }
    const dirty = new Set((seed.dirty ?? []).map((p) => p.toLowerCase()))
    for (const [rel, text] of this.work()) {
      const base = dirty.has(rel.toLowerCase()) ? olderText(text) : text
      this.head.set(rel, base)
      this.index.set(rel, base)
    }
  }

  /** Every working-copy file as repo-relative forward-slash path → text. */
  private work(): Map<string, string> {
    const vfs = this.backend.vfs
    const out = new Map<string, string>()
    const walk = (dir: string): void => {
      let entries
      try {
        entries = vfs.readDir(dir, { showHidden: true })
      } catch {
        return
      }
      for (const e of entries) {
        if (SKIP.has(e.name)) continue
        if (e.isDir) walk(e.path)
        else {
          try {
            out.set(vfs.relative(this.root, e.path).replace(/\\/g, '/'), vfs.readFile(e.path))
          } catch {
            /* unreadable: skip */
          }
        }
      }
    }
    walk(this.root)
    return out
  }

  currentBranch(): string {
    return this.branch
  }

  branches(): string[] {
    return [...this.branchSet].sort()
  }

  checkout(branch: string, create = false): void {
    if (create) {
      if (this.branchSet.has(branch)) throw new Error(`a branch named '${branch}' already exists`)
      this.branchSet.add(branch)
    } else if (!this.branchSet.has(branch)) {
      throw new Error(`pathspec '${branch}' did not match any file(s) known to git`)
    }
    this.branch = branch
  }

  status(): GitFileStatus[] {
    const work = this.work()
    const paths = new Set([...this.head.keys(), ...this.index.keys(), ...work.keys()])
    const out: GitFileStatus[] = []
    for (const p of [...paths].sort()) {
      const h = this.head.get(p)
      const i = this.index.get(p)
      const w = work.get(p)
      if (h === undefined && i === undefined) {
        if (w !== undefined) out.push({ path: p, index: '?', worktree: '?' })
        continue
      }
      const x: GitFileStatus['index'] = h === i ? ' ' : h === undefined ? 'A' : i === undefined ? 'D' : 'M'
      const y: GitFileStatus['worktree'] = i === w ? ' ' : w === undefined ? 'D' : i === undefined ? ' ' : 'M'
      if (x !== ' ' || y !== ' ') out.push({ path: p, index: x, worktree: y })
    }
    return out
  }

  diff(opts: { staged?: boolean; paths?: string[] } = {}): GitFileDiff[] {
    const work = this.work()
    const [from, to] = opts.staged ? [this.head, this.index] : [this.index, work]
    const paths = new Set([...from.keys(), ...(opts.staged ? to.keys() : [...to.keys()].filter((k) => from.has(k)))])
    const want = opts.paths?.map((p) => p.replace(/\\/g, '/').toLowerCase())
    const out: GitFileDiff[] = []
    for (const p of [...paths].sort()) {
      if (want && !want.some((w) => p.toLowerCase().startsWith(w))) continue
      const a = from.get(p) ?? null
      const b = to.get(p) ?? null
      if (a !== b) out.push({ path: p, oldText: a, newText: b })
    }
    return out
  }

  log(limit?: number): GitCommit[] {
    return limit === undefined ? [...this.commits] : this.commits.slice(0, limit)
  }

  add(paths: string[]): void {
    const work = this.work()
    const all = paths.some((p) => p === '.' || p === '-A' || p === '--all' || p === '*')
    const want = paths.map((p) => p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase())
    const match = (p: string): boolean => all || want.some((w) => p.toLowerCase() === w || p.toLowerCase().startsWith(w + '/'))
    for (const [p, text] of work) if (match(p)) this.index.set(p, text)
    for (const p of [...this.index.keys()]) if (!work.has(p) && match(p)) this.index.delete(p)
  }

  commit(message: string): GitCommit {
    const changed = this.diff({ staged: true }).map((d) => d.path)
    if (changed.length === 0) throw new Error('nothing to commit, working tree clean')
    this.head = new Map(this.index)
    const hash = hashFor(`${this.root}:${message}:${this.commits.length}:${this.backend.clock.now()}`)
    const commit: GitCommit = {
      hash,
      short: hash.slice(0, 7),
      author: 'Dev',
      email: 'dev@harbor.test',
      date: this.backend.clock.now(),
      message,
      files: changed
    }
    this.commits.unshift(commit)
    this.ahead++
    return commit
  }

  upstream(): { name: string; url: string; ahead: number; behind: number } | null {
    if (!this.remote) return null
    return { name: `${this.remote.name}/${this.branch}`, url: this.remote.url, ahead: this.ahead, behind: this.remote.behind }
  }

  push(): number {
    const n = this.ahead
    this.ahead = 0
    return n
  }
}

/** Resolves repos for the shell: the vfs model first, then this fallback. */
export function createGitResolver(backend: Backend): (path: string) => GitRepo | null {
  const fallbacks = new Map<string, FallbackRepo>()
  return (path) => {
    const real = backend.vfs.git(path)
    if (real) return real
    const key = backend.vfs.key(path)
    const seed = backend.scenario.repos.find((r) => {
      const root = backend.vfs.key(r.root)
      return key === root || key.startsWith(root + '\\')
    })
    if (!seed) return null
    let repo = fallbacks.get(seed.root)
    if (!repo) {
      repo = new FallbackRepo(backend, seed)
      fallbacks.set(seed.root, repo)
    }
    return repo
  }
}
