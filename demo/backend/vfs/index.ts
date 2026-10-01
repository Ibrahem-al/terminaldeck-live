/**
 * The virtual Windows file system (the `Vfs` seam) and the scenario's git
 * repositories. Seeded from `scenario.trees` / `scenario.repos`, synchronous
 * and in memory, persisted to DemoStorage as a diff against the seed. Every
 * mutation notifies `onChange` subscribers and feeds the fs_* watch registry,
 * which is what makes an agent's edit appear live in the sidebar and in an
 * open editor tab.
 */
import type { FsEntry } from '@shared/types'
import type { Backend, GitRepo, ModuleInstance, Vfs, VfsChange, VfsStat, WindowLabel } from '../contracts'
import { compareEntries } from './collate'
import { createFsCommands, installBlobBridge } from './commands'
import { createRepo, type GitFsPort, type RepoHandle, type SavedRepo } from './git'
import { createPathOps } from './paths'
import { createPersistence } from './persist'
import { grepTree, searchNames } from './search'
import { Tree, vfsError, type VNode } from './tree'
import { createWatchRegistry } from './watch'

const DAY = 86_400_000
const GIT_KEY = 'git'

/** What the vfs module offers beyond the `Vfs` contract (QA, the tour). */
export interface VfsInternals {
  /** Write every pending save now. */
  flush(): void
  /** Root of the explorer tree a window has open (from its `fs_watch`). */
  rootOf(label: WindowLabel): string | null
}

export function createVfs(backend: Backend): ModuleInstance<Vfs> {
  const { machine } = backend.scenario
  const p = createPathOps(machine.home)
  const tree = new Tree(p)
  const listeners = new Set<(changes: VfsChange[]) => void>()
  const watches = createWatchRegistry(p, () => backend.events, () => backend.clock)
  const repos: Array<{ key: string; handle: RepoHandle }> = []

  const saveGit = (): void => {
    const all: Record<string, SavedRepo> = {}
    for (const r of repos) all[r.key] = r.handle.save()
    backend.storage.set(GIT_KEY, all)
  }
  const persistence = createPersistence(tree, p, () => backend.storage, saveGit)

  const bootNow = Date.now()

  /* ── seeding ── */

  for (const seedTree of backend.scenario.trees) {
    const root = p.abs(seedTree.root)
    tree.ensureDir(root, bootNow - 60 * DAY)
    for (const d of seedTree.dirs ?? []) tree.ensureDir(p.join(root, d), bootNow - 40 * DAY)
    for (const f of seedTree.files) {
      const full = p.join(root, f.path)
      tree.ensureDir(p.dirname(full), bootNow - 40 * DAY)
      tree.putFile(full, f.content ?? placeholder(p.basename(full)), f.mtime ?? bootNow - 30 * DAY)
    }
  }
  for (const r of backend.scenario.repos) {
    const root = p.abs(r.root)
    tree.ensureDir(p.join(root, '.git'), bootNow - 60 * DAY)
    tree.putFile(p.join(root, '.git', 'HEAD'), `ref: refs/heads/${r.branch}\n`, bootNow - DAY)
    const remote = r.remote
      ? `[remote "${r.remote.name}"]\n\turl = ${r.remote.url}\n\tfetch = +refs/heads/*:refs/remotes/${r.remote.name}/*\n[branch "${r.branch}"]\n\tremote = ${r.remote.name}\n\tmerge = refs/heads/${r.branch}\n`
      : ''
    tree.putFile(
      p.join(root, '.git', 'config'),
      `[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = false\n\tlogallrefupdates = true\n\tsymlinks = false\n\tignorecase = true\n${remote}`,
      bootNow - 60 * DAY
    )
  }

  const gitFs: GitFsPort = {
    files(root) {
      const rootNode = tree.get(root)
      if (!rootNode) return []
      const out: Array<{ rel: string; content: string }> = []
      const walk = (key: string, prefix: string): void => {
        for (const n of tree.children(key)) {
          if (n.isDir) {
            if (prefix === '' && n.name.toLowerCase() === '.git') continue
            walk(p.key(n.path), `${prefix}${n.name}/`)
          } else out.push({ rel: `${prefix}${n.name}`, content: n.content })
        }
      }
      walk(p.key(rootNode.path), '')
      return out
    },
    read(root, rel) {
      const n = tree.get(p.join(root, rel))
      return n && !n.isDir ? n.content : null
    },
    write: (root, rel, content) => service.writeFile(p.join(root, rel), content, { createDirs: true }),
    remove(root, rel) {
      const path = p.join(root, rel)
      if (tree.get(path)) service.remove(path, { recursive: true })
    }
  }

  const identity = (): { name: string; email: string } | null => {
    const cfg = tree.get(p.join(machine.home, '.gitconfig'))?.content ?? ''
    const name = /^\s*name\s*=\s*(.+)$/m.exec(cfg)?.[1]?.trim()
    const email = /^\s*email\s*=\s*(.+)$/m.exec(cfg)?.[1]?.trim()
    return name && email ? { name, email } : null
  }

  for (const seedRepo of backend.scenario.repos) {
    const root = tree.get(seedRepo.root)?.path ?? p.abs(seedRepo.root)
    const handle = createRepo({
      seed: seedRepo,
      root,
      fs: gitFs,
      now: bootNow,
      changed: () => persistence.touched([]),
      identity
    })
    repos.push({ key: p.key(root), handle })
    // Last-modified times that agree with the history: a file was last written by the newest commit touching it.
    const commits = handle.repo.log()
    for (const f of gitFs.files(root)) {
      const node = tree.get(p.join(root, f.rel))
      if (!node) continue
      const c = commits.find((cm) => cm.files.some((x) => x.toLowerCase() === f.rel.toLowerCase()))
      node.mtime = c ? c.date : (commits.at(-1)?.date ?? node.mtime)
    }
    for (const rel of seedRepo.dirty ?? []) {
      const node = tree.get(p.join(root, rel))
      if (node) node.mtime = bootNow - 25 * 60_000
    }
  }
  repos.sort((a, b) => b.key.length - a.key.length)

  persistence.snapshotSeed()
  if (persistence.restore()) {
    const saved = backend.storage.get<Record<string, SavedRepo>>(GIT_KEY) ?? {}
    for (const r of repos) if (saved[r.key]) r.handle.load(saved[r.key])
  }

  /* ── the service ── */

  const notify = (changes: VfsChange[], keys: string[]): void => {
    if (changes.length === 0) return
    persistence.touched(keys)
    watches.changed(changes)
    for (const cb of listeners) {
      try {
        cb(changes)
      } catch (err) {
        console.error('[demo] vfs onChange listener failed', err)
      }
    }
  }

  const statOf = (n: VNode): VfsStat => ({
    path: n.path,
    name: n.name,
    isDir: n.isDir,
    size: n.isDir ? 0 : n.size,
    mtime: n.mtime,
    hidden: n.name.startsWith('.')
  })

  const requireParentDir = (path: string, syscall: string): VNode => {
    const parent = tree.get(p.dirname(path))
    if (!parent) throw vfsError('ENOENT', path, syscall)
    if (!parent.isDir) throw vfsError('ENOTDIR', path, syscall)
    return parent
  }

  const createdDirChanges = (nodes: VNode[]): VfsChange[] =>
    nodes.map((n) => ({ kind: 'create', path: n.path, isDir: true }))

  const service: Vfs = {
    normalize: p.normalize,
    join: p.join,
    dirname: p.dirname,
    basename: p.basename,
    extname: p.extname,
    isAbsolute: p.isAbsolute,
    resolve: p.resolve,
    relative: p.relative,
    toPosix: p.toPosix,
    key: p.key,

    exists: (path) => !!tree.get(p.abs(path)),
    stat: (path) => {
      const n = tree.get(p.abs(path))
      return n ? statOf(n) : null
    },
    readDir(dir, opts) {
      const abs = p.abs(dir)
      const n = tree.get(abs)
      if (!n) throw vfsError('ENOENT', dir, 'scandir')
      if (!n.isDir) throw vfsError('ENOTDIR', dir, 'scandir')
      // Entry paths are built from the directory as the caller spelled it, like read_dir's —
      // unless that spelling needed resolving (relative, `/`, `..`), then from the stored path.
      const trimmed = dir.length > 3 ? dir.replace(/\\+$/, '') : dir
      const base = p.normalize(trimmed) === trimmed ? trimmed : n.path
      const sep = base.endsWith('\\') ? '' : '\\'
      return tree
        .children(p.key(n.path))
        .filter((c) => opts?.showHidden !== false || !c.name.startsWith('.'))
        .map<FsEntry>((c) => ({ name: c.name, path: `${base}${sep}${c.name}`, isDir: c.isDir }))
        .sort(compareEntries)
    },
    readFile(path) {
      const n = tree.get(p.abs(path))
      if (!n) throw vfsError('ENOENT', path, 'open')
      if (n.isDir) throw vfsError('EISDIR', path, 'read')
      return n.content
    },

    writeFile(path, content, opts) {
      const abs = p.abs(path)
      const existing = tree.get(abs)
      if (existing?.isDir) throw vfsError('EISDIR', path, 'open')
      const now = Date.now()
      const changes: VfsChange[] = []
      const keys: string[] = []
      if (!existing) {
        const parent = tree.get(p.dirname(abs))
        if (!parent && opts?.createDirs) {
          const made = tree.ensureDir(p.dirname(abs), now)
          changes.push(...createdDirChanges(made))
          keys.push(...made.map((m) => p.key(m.path)))
        } else requireParentDir(abs, 'open')
      }
      const { node, created } = tree.putFile(abs, content, now)
      if (created) tree.touchDir(p.dirname(node.path), now)
      changes.push({ kind: created ? 'create' : 'write', path: node.path, isDir: false })
      keys.push(p.key(node.path))
      notify(changes, keys)
    },

    mkdir(path, opts) {
      const abs = p.abs(path)
      const existing = tree.get(abs)
      if (existing) {
        if (opts?.recursive && existing.isDir) return
        throw vfsError('EEXIST', path, 'mkdir')
      }
      if (!opts?.recursive) requireParentDir(abs, 'mkdir')
      const now = Date.now()
      const made = tree.ensureDir(abs, now)
      if (made[0]) tree.touchDir(p.dirname(made[0].path), now)
      notify(createdDirChanges(made), made.map((m) => p.key(m.path)))
    },

    remove(path, opts) {
      const abs = p.abs(path)
      const n = tree.get(abs)
      if (!n) throw vfsError('ENOENT', path, 'unlink')
      if (p.dirname(n.path) === n.path) throw vfsError('EACCES', path, 'rmdir')
      const k = p.key(n.path)
      if (n.isDir && !opts?.recursive && tree.children(k).length) throw vfsError('ENOTEMPTY', path, 'rmdir')
      const keys = [k, ...(n.isDir ? tree.descendants(k).map((d) => p.key(d.path)) : [])]
      tree.delete(k)
      tree.touchDir(p.dirname(n.path), Date.now())
      notify([{ kind: 'delete', path: n.path, isDir: n.isDir }], keys)
    },

    rename(from, to) {
      const src = tree.get(p.abs(from))
      if (!src) throw vfsError('ENOENT', from, 'rename')
      const dest = p.abs(to)
      const srcKey = p.key(src.path)
      const destKey = p.key(dest)
      if (destKey !== srcKey) {
        if (tree.get(dest)) throw vfsError('EEXIST', to, 'rename')
        if (src.isDir && p.isInside(src.path, dest)) throw vfsError('EINVAL', to, 'rename')
      }
      requireParentDir(dest, 'rename')
      const oldPath = src.path
      const keys = [srcKey, ...(src.isDir ? tree.descendants(srcKey).map((d) => p.key(d.path)) : [])]
      const now = Date.now()
      const node = tree.move(srcKey, dest, src.mtime)
      tree.touchDir(p.dirname(oldPath), now)
      tree.touchDir(p.dirname(node.path), now)
      keys.push(p.key(node.path), ...(node.isDir ? tree.descendants(p.key(node.path)).map((d) => p.key(d.path)) : []))
      notify([{ kind: 'rename', path: node.path, oldPath, isDir: node.isDir }], keys)
    },

    copy(src, dest) {
      const s = tree.get(p.abs(src))
      if (!s) throw vfsError('ENOENT', src, 'copyfile')
      const destAbs = p.abs(dest)
      if (tree.get(destAbs)) throw vfsError('EEXIST', dest, 'copyfile')
      if (s.isDir && p.isInside(s.path, destAbs)) throw vfsError('EINVAL', dest, 'copyfile')
      requireParentDir(destAbs, 'copyfile')
      const now = Date.now()
      const keys: string[] = []
      if (s.isDir) {
        const subtree = tree.descendants(p.key(s.path))
        const made = tree.ensureDir(destAbs, now)
        keys.push(...made.map((m) => p.key(m.path)))
        const destRoot = made[made.length - 1]?.path ?? destAbs
        for (const d of subtree) {
          const target = destRoot + d.path.slice(s.path.length)
          if (d.isDir) tree.ensureDir(target, now)
          else tree.putFile(target, d.content, now)
          keys.push(p.key(target))
        }
        tree.touchDir(p.dirname(destRoot), now)
        notify([{ kind: 'create', path: destRoot, isDir: true }], keys)
      } else {
        const { node } = tree.putFile(destAbs, s.content, now)
        tree.touchDir(p.dirname(node.path), now)
        notify([{ kind: 'create', path: node.path, isDir: false }], [p.key(node.path)])
      }
    },

    search: (root, query, opts) => searchNames(tree, p, root, query, opts),
    grep: (root, pattern, opts) => grepTree(tree, p, p.abs(root), pattern, opts),

    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },

    git(path): GitRepo | null {
      const abs = p.abs(path)
      return repos.find((r) => p.isInside(r.key, abs))?.handle.repo ?? null
    }
  }

  const internals: VfsInternals = {
    flush: () => persistence.flush(),
    rootOf: (label) => watches.rootOf(label)
  }
  Object.defineProperty(service, 'internals', { value: internals, enumerable: false })

  const flushOnHide = (): void => persistence.flush()

  return {
    service,
    commands: createFsCommands({ backend, vfs: service, paths: p, watches }),
    start() {
      try {
        window.addEventListener('pagehide', flushOnHide)
      } catch {
        /* no window (tests) */
      }
    },
    frameAttached(label) {
      const win = backend.frame(label)
      if (win && label !== 'notch') installBlobBridge(win)
    },
    frameDetached(label) {
      watches.dropWindow(label)
    }
  }
}

/** Text for a seed file the manifest lists without content. */
function placeholder(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  switch (ext) {
    case 'json':
      return '{}\n'
    case 'md':
      return `# ${name.replace(/\.md$/i, '')}\n`
    case 'ts':
    case 'tsx':
    case 'js':
      return 'export {}\n'
    default:
      return ''
  }
}
