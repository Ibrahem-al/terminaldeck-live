/**
 * Tab-session persistence of the file system as a difference from the seed:
 * only nodes the visitor (or an agent) created, changed or deleted are saved,
 * so a reload keeps their work and the stored blob stays a few KB.
 */
import type { DemoStorage } from '../contracts'
import type { PathOps } from './paths'
import type { Tree } from './tree'

const KEY = 'vfs'

interface SavedFs {
  v: 1
  /** [path, isDir, content (files), mtime] */
  nodes: Array<[string, boolean, string, number]>
  /** Paths of seed nodes that are gone. */
  deleted: string[]
}

export interface Persistence {
  /** Remember the seed (call once, right after seeding). */
  snapshotSeed(): void
  /** Apply the saved overlay to the tree. Returns whether there was one. */
  restore(): boolean
  /** Nodes changed (keys); saved soon. */
  touched(keys: Iterable<string>): void
  /** Save now if anything is pending (the page is going away). */
  flush(): void
}

export function createPersistence(tree: Tree, p: PathOps, storage: () => DemoStorage, extra: () => void): Persistence {
  const seed = new Map<string, { path: string; isDir: boolean; content: string }>()
  const dirty = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined

  const save = (): void => {
    timer = undefined
    const nodes: SavedFs['nodes'] = []
    const deleted: string[] = []
    for (const k of dirty) {
      const node = tree.byKey(k)
      const s = seed.get(k)
      if (!node) {
        if (s) deleted.push(s.path)
        continue
      }
      if (s && s.isDir === node.isDir && s.path === node.path && s.content === node.content) continue
      nodes.push([node.path, node.isDir, node.isDir ? '' : node.content, node.mtime])
    }
    // Parents before children, so a restore can create them in order.
    nodes.sort((a, b) => a[0].length - b[0].length)
    storage().set(KEY, { v: 1, nodes, deleted } satisfies SavedFs)
    extra()
  }

  return {
    snapshotSeed() {
      for (const n of tree.all()) seed.set(p.key(n.path), { path: n.path, isDir: n.isDir, content: n.content })
    },
    restore() {
      const saved = storage().get<SavedFs>(KEY)
      if (!saved || saved.v !== 1) return false
      for (const path of saved.deleted) {
        const k = p.key(path)
        tree.delete(k)
        dirty.add(k)
      }
      for (const [path, isDir, content, mtime] of saved.nodes) {
        const k = p.key(path)
        dirty.add(k)
        const existing = tree.byKey(k)
        if (existing && existing.isDir !== isDir) tree.delete(k)
        if (isDir) {
          tree.ensureDir(path, mtime)
        } else {
          tree.ensureDir(p.dirname(path), mtime)
          // A case-only rename is saved under the same key: replace, don't merge.
          if (existing && existing.path !== path) tree.delete(k)
          tree.putFile(path, content, mtime)
        }
      }
      return true
    },
    touched(keys) {
      for (const k of keys) dirty.add(k)
      if (timer === undefined) timer = setTimeout(save, 400)
    },
    flush() {
      if (timer === undefined) return
      clearTimeout(timer)
      save()
    }
  }
}
