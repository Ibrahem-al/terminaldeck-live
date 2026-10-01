/**
 * The scenario's git repositories, consistent with the Vfs. Three snapshots of
 * file texts — HEAD (the current branch's tip), the index, and the working tree
 * read live from the Vfs — so an agent's edit shows up in `git status`,
 * `git add` stages it and a commit clears it. Paths are repo-relative with
 * forward slashes in their stored case; comparisons are case-insensitive.
 *
 * Deliberately small: no merges, no stash, no per-commit trees (a commit keeps
 * the list of files it touched, which is all `git log --stat`-like output needs).
 */
import type { GitCommit, GitFileDiff, GitFileStatus, GitRepo, SeedRepo } from '../contracts'

/** What a repository needs from the file system. */
export interface GitFsPort {
  /** Every file under `root` (excluding `.git`), with repo-relative forward-slash paths. */
  files(root: string): Array<{ rel: string; content: string }>
  read(root: string, rel: string): string | null
  write(root: string, rel: string, content: string): void
  remove(root: string, rel: string): void
}

type Snapshot = Map<string, { path: string; text: string }>

interface BranchState {
  commits: GitCommit[]
  head: Snapshot
  /** null = never pushed. */
  upstream: { ahead: number; behind: number } | null
  /** Commit count when the branch was created (what a first push sends). */
  forkAt: number
}

/** Persisted form: snapshots as differences from the seed HEAD. */
interface SnapDiff {
  set: Record<string, [string, string]>
  del: string[]
}
export interface SavedRepo {
  branch: string
  index: SnapDiff
  branches: Record<string, { commits: GitCommit[]; head: SnapDiff; upstream: BranchState['upstream']; forkAt: number }>
}

const DAY = 86_400_000
const lower = (s: string): string => s.toLowerCase()

/** A stable 40-hex id from text (FNV-1a lanes) — looks like a SHA-1, which is all it has to do. */
export function fakeSha(text: string): string {
  let out = ''
  for (let lane = 0; lane < 5; lane++) {
    let h = 0x811c9dc5 ^ (lane * 0x9e3779b1)
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    h ^= h >>> 13
    h = Math.imul(h, 0x5bd1e995)
    h ^= h >>> 15
    out += (h >>> 0).toString(16).padStart(8, '0')
  }
  return out
}

/* ── .gitignore ─────────────────────────────────────────────────────── */

interface IgnoreRule {
  re: RegExp
  negate: boolean
  dirOnly: boolean
  anchored: boolean
}

function parseIgnore(text: string): IgnoreRule[] {
  const rules: IgnoreRule[] = []
  for (let line of text.split(/\r?\n/)) {
    line = line.trim()
    if (!line || line.startsWith('#')) continue
    const negate = line.startsWith('!')
    if (negate) line = line.slice(1)
    const dirOnly = line.endsWith('/')
    if (dirOnly) line = line.slice(0, -1)
    const anchored = line.includes('/')
    if (line.startsWith('/')) line = line.slice(1)
    let re = ''
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '*') {
        if (line[i + 1] === '*') {
          re += '.*'
          i++
          if (line[i + 1] === '/') i++
        } else re += '[^/]*'
      } else if (c === '?') re += '[^/]'
      else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
    rules.push({ re: new RegExp(`^${re}$`, 'i'), negate, dirOnly, anchored })
  }
  return rules
}

/** Whether `rel` (a file) is ignored: a rule matching the file or any ancestor directory. */
function ignored(rules: IgnoreRule[], rel: string): boolean {
  const parts = rel.split('/')
  let result = false
  for (const rule of rules) {
    for (let i = 1; i <= parts.length; i++) {
      const isDir = i < parts.length
      if (rule.dirOnly && !isDir) continue
      const subject = rule.anchored ? parts.slice(0, i).join('/') : parts[i - 1]
      if (rule.re.test(subject)) {
        result = !rule.negate
        break
      }
    }
  }
  return result
}

/* ── the repository ─────────────────────────────────────────────────── */

function snapFrom(entries: Iterable<{ rel: string; content: string }>): Snapshot {
  const s: Snapshot = new Map()
  for (const e of entries) s.set(lower(e.rel), { path: e.rel, text: e.content })
  return s
}

function diffSnap(base: Snapshot, s: Snapshot): SnapDiff {
  const out: SnapDiff = { set: {}, del: [] }
  for (const [k, v] of s) {
    const b = base.get(k)
    if (!b || b.text !== v.text || b.path !== v.path) out.set[k] = [v.path, v.text]
  }
  for (const k of base.keys()) if (!s.has(k)) out.del.push(k)
  return out
}

function applySnap(base: Snapshot, d: SnapDiff): Snapshot {
  const s: Snapshot = new Map(base)
  for (const k of d.del) s.delete(k)
  for (const [k, [path, text]] of Object.entries(d.set)) s.set(k, { path, text })
  return s
}

const sameSnap = (a: Snapshot, b: Snapshot): boolean => {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k)?.text !== v.text) return false
  return true
}

export interface RepoHandle {
  repo: GitRepo
  save(): SavedRepo
  /** Restore a saved state — after the Vfs overlay was applied, never before the seed HEAD was taken. */
  load(saved: SavedRepo): void
}

export interface RepoOptions {
  seed: SeedRepo
  /** The repo root in its stored case. */
  root: string
  fs: GitFsPort
  now: number
  /** Called after every mutation (persistence). */
  changed(): void
  /** `[user] name / email` from ~/.gitconfig, read when committing. */
  identity(): { name: string; email: string } | null
}

export function createRepo(opts: RepoOptions): RepoHandle {
  const { seed, root, fs } = opts
  const remote = seed.remote ?? null

  const ignoreRules = (): IgnoreRule[] => parseIgnore(fs.read(root, '.gitignore') ?? '')
  const working = (): Snapshot => {
    const rules = ignoreRules()
    return snapFrom(fs.files(root).filter((f) => !ignored(rules, f.rel)))
  }

  // The seed HEAD: the boot working tree minus untracked paths, with each dirty path's HEAD text.
  const untracked = new Set((seed.untracked ?? []).map(lower))
  const seedHead: Snapshot = new Map()
  for (const [k, v] of working()) if (!untracked.has(k)) seedHead.set(k, v)
  for (const [rel, text] of Object.entries(seed.headTexts ?? {})) seedHead.set(lower(rel), { path: rel, text })
  for (const rel of seed.dirty ?? []) {
    const k = lower(rel)
    const cur = seedHead.get(k)
    // A dirty path with no HEAD text: HEAD is the file without its last few lines.
    if (cur && !seed.headTexts?.[rel]) {
      const lines = cur.text.split('\n')
      seedHead.set(k, { path: cur.path, text: lines.slice(0, Math.max(1, lines.length - 4)).join('\n') + '\n' })
    }
  }

  const seedCommits = buildSeedCommits(seed, opts.now)
  const branches = new Map<string, BranchState>()
  let branch = seed.branch

  let index: Snapshot = new Map(seedHead)
  branches.set(seed.branch, {
    commits: seedCommits,
    head: seedHead,
    upstream: remote ? { ahead: remote.ahead, behind: remote.behind } : null,
    forkAt: 0
  })
  for (const other of seed.otherBranches ?? []) {
    const commits = seedCommits.slice(0, Math.max(1, seedCommits.length - other.behind))
    branches.set(other.name, { commits, head: seedHead, upstream: { ahead: 0, behind: 0 }, forkAt: commits.length })
  }

  const current = (): BranchState => branches.get(branch)!

  const relOf = (p: string): string => {
    let s = p.replace(/\\/g, '/')
    const r = root.replace(/\\/g, '/')
    if (lower(s).startsWith(lower(r) + '/')) s = s.slice(r.length + 1)
    else if (lower(s) === lower(r)) s = ''
    return s.replace(/^\.\//, '').replace(/\/+$/, '')
  }
  const matches = (specs: string[] | undefined, k: string): boolean => {
    if (!specs || specs.length === 0) return true
    return specs.some((raw) => {
      const s = lower(relOf(raw))
      return s === '' || s === '.' || s === '*' || k === s || k.startsWith(`${s}/`)
    })
  }

  const repo: GitRepo = {
    root,
    currentBranch: () => branch,
    branches: () => [...branches.keys()].sort(),

    checkout(name, create) {
      if (create) {
        if (branches.has(name)) throw new Error(`fatal: a branch named '${name}' already exists`)
        const cur = current()
        branches.set(name, { commits: [...cur.commits], head: new Map(cur.head), upstream: null, forkAt: cur.commits.length })
        branch = name
        writeHeadRef()
        opts.changed()
        return
      }
      const target = branches.get(name)
      if (!target) throw new Error(`error: pathspec '${name}' did not match any file(s) known to git`)
      if (name === branch) return
      const cur = current()
      const work = working()
      const moving: string[] = []
      const blocked: string[] = []
      for (const k of new Set([...cur.head.keys(), ...target.head.keys()])) {
        if (cur.head.get(k)?.text === target.head.get(k)?.text) continue
        const local = work.get(k)?.text !== index.get(k)?.text || index.get(k)?.text !== cur.head.get(k)?.text
        if (local) blocked.push((cur.head.get(k) ?? target.head.get(k))!.path)
        else moving.push(k)
      }
      if (blocked.length) {
        throw new Error(
          `error: Your local changes to the following files would be overwritten by checkout:\n${blocked
            .map((b) => `\t${b}`)
            .join('\n')}\nPlease commit your changes or stash them before you switch branches.\nAborting`
        )
      }
      for (const k of moving) {
        const t = target.head.get(k)
        const c = cur.head.get(k)!
        if (t) {
          fs.write(root, t.path, t.text)
          index.set(k, t)
        } else {
          fs.remove(root, c.path)
          index.delete(k)
        }
      }
      branch = name
      writeHeadRef()
      opts.changed()
    },

    status() {
      const head = current().head
      const work = working()
      const out: GitFileStatus[] = []
      for (const k of new Set([...head.keys(), ...index.keys(), ...work.keys()])) {
        const h = head.get(k)
        const i = index.get(k)
        const w = work.get(k)
        if (!i && !h && w) {
          out.push({ path: w.path, index: '?', worktree: '?' })
          continue
        }
        const x: GitFileStatus['index'] = !h && i ? 'A' : h && !i ? 'D' : h && i && h.text !== i.text ? 'M' : ' '
        const y: GitFileStatus['worktree'] = i && !w ? 'D' : i && w && i.text !== w.text ? 'M' : ' '
        if (x === ' ' && y === ' ') continue
        out.push({ path: (w ?? i ?? h)!.path, index: x, worktree: y })
      }
      return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    },

    diff(o) {
      const out: GitFileDiff[] = []
      const head = current().head
      if (o?.staged) {
        for (const k of new Set([...head.keys(), ...index.keys()])) {
          if (!matches(o.paths, k)) continue
          const h = head.get(k)
          const i = index.get(k)
          if (h?.text === i?.text) continue
          out.push({ path: (i ?? h)!.path, oldText: h?.text ?? null, newText: i?.text ?? null })
        }
      } else {
        const work = working()
        for (const [k, i] of index) {
          if (!matches(o?.paths, k)) continue
          const w = work.get(k)
          if (w?.text === i.text) continue
          out.push({ path: i.path, oldText: i.text, newText: w?.text ?? null })
        }
      }
      return out.sort((a, b) => (a.path < b.path ? -1 : 1))
    },

    log(limit) {
      const commits = [...current().commits].reverse()
      return limit === undefined ? commits : commits.slice(0, limit)
    },

    add(paths) {
      const all = paths.length === 0 || paths.some((p) => ['.', '-A', '--all', '*', ':/'].includes(p))
      const work = working()
      const candidates = new Set([...index.keys(), ...work.keys()])
      for (const spec of all ? ['.'] : paths) {
        let hit = false
        for (const k of candidates) {
          if (!matches([spec], k)) continue
          hit = true
          const w = work.get(k)
          if (w) index.set(k, w)
          else index.delete(k)
        }
        if (!hit) throw new Error(`fatal: pathspec '${spec}' did not match any files`)
      }
      opts.changed()
    },

    commit(message, o) {
      const cur = current()
      if (sameSnap(cur.head, index) && !o?.allowEmpty) {
        const dirty = repo.status().length > 0
        throw new Error(
          dirty
            ? 'no changes added to commit (use "git add" and/or "git commit -a")'
            : 'nothing to commit, working tree clean'
        )
      }
      const files: string[] = []
      for (const k of new Set([...cur.head.keys(), ...index.keys()])) {
        if (cur.head.get(k)?.text !== index.get(k)?.text) files.push((index.get(k) ?? cur.head.get(k))!.path)
      }
      files.sort()
      const who = opts.identity() ?? { name: cur.commits.at(-1)?.author ?? 'dev', email: cur.commits.at(-1)?.email ?? 'dev@localhost' }
      const parent = cur.commits.at(-1)?.hash ?? ''
      const date = Date.now()
      const hash = fakeSha(`${parent}\n${message}\n${date}\n${files.join(',')}`)
      const commit: GitCommit = { hash, short: hash.slice(0, 7), author: who.name, email: who.email, date, message, files }
      cur.commits = [...cur.commits, commit]
      cur.head = new Map(index)
      if (cur.upstream) cur.upstream.ahead++
      opts.changed()
      return commit
    },

    upstream() {
      const u = current().upstream
      if (!remote || !u) return null
      return { name: `${remote.name}/${branch}`, url: remote.url, ahead: u.ahead, behind: u.behind }
    },

    forgetUpstream() {
      current().upstream = null
      opts.changed()
    },

    tracked() {
      const out = new Set<string>()
      for (const v of current().head.values()) out.add(v.path)
      for (const v of index.values()) out.add(v.path)
      return [...out]
    },

    push() {
      const cur = current()
      let sent: number
      if (!cur.upstream) {
        sent = Math.max(0, cur.commits.length - cur.forkAt)
        cur.upstream = { ahead: 0, behind: 0 }
      } else {
        sent = cur.upstream.ahead
        cur.upstream.ahead = 0
      }
      opts.changed()
      return sent
    }
  }

  function writeHeadRef(): void {
    fs.write(root, '.git/HEAD', `ref: refs/heads/${branch}\n`)
  }

  return {
    repo,
    load(saved) {
      if (!saved?.branches?.[saved.branch]) return
      branches.clear()
      for (const [name, b] of Object.entries(saved.branches)) {
        branches.set(name, { commits: b.commits, head: applySnap(seedHead, b.head), upstream: b.upstream, forkAt: b.forkAt })
      }
      branch = saved.branch
      index = applySnap(seedHead, saved.index)
    },
    save: () => ({
      branch,
      index: diffSnap(seedHead, index),
      branches: Object.fromEntries(
        [...branches].map(([name, b]) => [
          name,
          { commits: b.commits, head: diffSnap(seedHead, b.head), upstream: b.upstream, forkAt: b.forkAt }
        ])
      )
    })
  }
}

/** Seed history: plausible working-hours timestamps, stable ids. */
function buildSeedCommits(seed: SeedRepo, now: number): GitCommit[] {
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  let parent = ''
  return seed.commits.map((c, i) => {
    const minutes = 9 * 60 + 40 + ((i * 97) % 480)
    const date = Math.min(midnight.getTime() - c.daysAgo * DAY + minutes * 60_000, now - (seed.commits.length - i) * 17 * 60_000)
    const hash = fakeSha(`${seed.root}\n${parent}\n${c.message}`)
    parent = hash
    return { hash, short: hash.slice(0, 7), author: c.author, email: c.email, date, message: c.message, files: [...c.files] }
  })
}
