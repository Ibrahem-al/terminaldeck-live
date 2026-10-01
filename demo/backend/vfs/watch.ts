/**
 * The fs_watch* registry and the live-update emitter — a port of
 * src-tauri/src/fsx/watch.rs as the renderer experiences it:
 *
 *  - Directory events are per window: the root (non-recursive) plus every
 *    folder the tree has expanded (`fs_watch_dir`, ref-counted). A change
 *    invalidates its PARENT's listing, and a directory's own listing when the
 *    directory itself was created; a file's content changing re-lists nothing.
 *    Bursts are debounced (300 ms trailing, 1 s cap) into one `fs:changed`.
 *  - Open editor files (`fs_watch_file`) get one `fs:file-changed` per burst
 *    (150 ms), under every spelling the window registered — the editor looks
 *    its models up by the exact string it opened.
 */
import type { Clock, EventBus, Timers, VfsChange, WindowLabel } from '../contracts'
import type { PathOps } from './paths'

const DIR_DEBOUNCE = 300
const DIR_DEBOUNCE_MAX = 1000
const FILE_DEBOUNCE = 150

interface Registered {
  /** spelling → reference count */
  spellings: Map<string, number>
}

interface WindowWatches {
  root: { key: string; spelling: string } | null
  dirs: Map<string, Registered>
  files: Map<string, Registered>
  pendingDirs: Set<string>
  dirFirst: number
  dirLast: number
  dirArmed: boolean
  pendingFiles: Set<string>
  fileArmed: boolean
}

export interface WatchRegistry {
  watchRoot(label: WindowLabel, root: string): void
  unwatchRoot(label: WindowLabel): void
  watchDir(label: WindowLabel, path: string): void
  unwatchDir(label: WindowLabel, path: string): void
  watchFile(label: WindowLabel, path: string): void
  unwatchFile(label: WindowLabel, path: string): void
  /** The root this window's tree has open (what `fs_pick_root` avoids offering again). */
  rootOf(label: WindowLabel): string | null
  dropWindow(label: WindowLabel): void
  /** Feed one batch of Vfs changes. */
  changed(changes: VfsChange[]): void
}

export function createWatchRegistry(p: PathOps, events: () => EventBus, clock: () => Clock): WatchRegistry {
  const windows = new Map<WindowLabel, WindowWatches>()
  let timers: Timers | null = null
  const t = (): Timers => (timers ??= clock().group())

  const win = (label: WindowLabel): WindowWatches => {
    let w = windows.get(label)
    if (!w) {
      w = {
        root: null,
        dirs: new Map(),
        files: new Map(),
        pendingDirs: new Set(),
        dirFirst: 0,
        dirLast: 0,
        dirArmed: false,
        pendingFiles: new Set(),
        fileArmed: false
      }
      windows.set(label, w)
    }
    return w
  }

  const ref = (map: Map<string, Registered>, path: string): void => {
    const k = p.key(path)
    let r = map.get(k)
    if (!r) map.set(k, (r = { spellings: new Map() }))
    r.spellings.set(path, (r.spellings.get(path) ?? 0) + 1)
  }
  const unref = (map: Map<string, Registered>, path: string): void => {
    const k = p.key(path)
    const r = map.get(k)
    if (!r) return
    const n = (r.spellings.get(path) ?? 0) - 1
    if (n > 0) r.spellings.set(path, n)
    else r.spellings.delete(path)
    if (r.spellings.size === 0) map.delete(k)
  }

  const flushDirs = (label: WindowLabel, w: WindowWatches): void => {
    const now = Date.now()
    const quiet = now - w.dirLast >= DIR_DEBOUNCE
    if (!quiet && now - w.dirFirst < DIR_DEBOUNCE_MAX) {
      t().setTimeout(() => flushDirs(label, w), Math.min(DIR_DEBOUNCE, DIR_DEBOUNCE_MAX - (now - w.dirFirst)))
      return
    }
    w.dirArmed = false
    const dirs = [...w.pendingDirs]
    w.pendingDirs.clear()
    if (dirs.length && windows.get(label) === w) events().emitTo(label, 'fs:changed', dirs)
  }

  const flushFiles = (label: WindowLabel, w: WindowWatches): void => {
    w.fileArmed = false
    const files = [...w.pendingFiles]
    w.pendingFiles.clear()
    if (windows.get(label) !== w) return
    for (const f of files) events().emitTo(label, 'fs:file-changed', f)
  }

  /** The directory listings a change invalidates (tree_dirs_for). */
  const dirsFor = (c: VfsChange): string[] => {
    if (c.kind === 'write') return c.isDir ? [c.path] : []
    const out = [p.dirname(c.path)]
    if (c.kind === 'rename' && c.oldPath) out.push(p.dirname(c.oldPath))
    if (c.kind !== 'delete' && c.isDir) out.push(c.path)
    return out
  }

  return {
    watchRoot(label, root) {
      win(label).root = { key: p.key(root), spelling: root }
    },
    unwatchRoot(label) {
      const w = windows.get(label)
      if (w) w.root = null
    },
    watchDir: (label, path) => ref(win(label).dirs, path),
    unwatchDir: (label, path) => unref(win(label).dirs, path),
    watchFile: (label, path) => ref(win(label).files, path),
    unwatchFile: (label, path) => unref(win(label).files, path),
    rootOf: (label) => windows.get(label)?.root?.spelling ?? null,
    dropWindow(label) {
      windows.delete(label)
    },
    changed(changes) {
      if (changes.length === 0 || windows.size === 0) return
      const dirKeys = new Set<string>()
      const touched: string[] = []
      for (const c of changes) {
        for (const d of dirsFor(c)) dirKeys.add(p.key(d))
        touched.push(p.key(c.path))
        if (c.oldPath) touched.push(p.key(c.oldPath))
      }
      const now = Date.now()
      for (const [label, w] of windows) {
        let dirHit = false
        for (const k of dirKeys) {
          if (w.root?.key === k) {
            w.pendingDirs.add(w.root.spelling)
            dirHit = true
          }
          const r = w.dirs.get(k)
          if (r) {
            for (const s of r.spellings.keys()) w.pendingDirs.add(s)
            dirHit = true
          }
        }
        if (dirHit) {
          w.dirLast = now
          if (!w.dirArmed) {
            w.dirArmed = true
            w.dirFirst = now
            t().setTimeout(() => flushDirs(label, w), DIR_DEBOUNCE)
          }
        }
        let fileHit = false
        for (const [fk, r] of w.files) {
          // A removed or renamed folder takes its open files with it.
          if (!touched.some((k) => fk === k || fk.startsWith(`${k}\\`))) continue
          for (const s of r.spellings.keys()) w.pendingFiles.add(s)
          fileHit = true
        }
        if (fileHit && !w.fileArmed) {
          w.fileArmed = true
          t().setTimeout(() => flushFiles(label, w), FILE_DEBOUNCE)
        }
      }
    }
  }
}
