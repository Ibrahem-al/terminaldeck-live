/**
 * The in-memory node store behind the Vfs: one map from comparison key to
 * node, plus a child index per directory. No events, no validation beyond
 * structure — the service layer (index.ts) checks errors and notifies.
 */
import type { VfsError, VfsErrorCode } from '../contracts'
import type { PathOps } from './paths'

export interface VNode {
  /** Absolute, in its stored case. */
  path: string
  name: string
  isDir: boolean
  /** Files only. */
  content: string
  /** UTF-8 bytes of `content`. */
  size: number
  mtime: number
}

const DESCRIPTIONS: Record<VfsErrorCode, string> = {
  ENOENT: 'no such file or directory',
  EEXIST: 'file already exists',
  ENOTDIR: 'not a directory',
  EISDIR: 'illegal operation on a directory',
  ENOTEMPTY: 'directory not empty',
  EINVAL: 'invalid argument',
  EACCES: 'permission denied'
}

/** Node-style error text, as the app's fs commands word theirs: `ENOENT: no such file or directory, open 'C:\x'`. */
export function vfsError(code: VfsErrorCode, path: string, syscall: string): VfsError {
  return Object.assign(new Error(`${code}: ${DESCRIPTIONS[code]}, ${syscall} '${path}'`), { code, path })
}

const encoder = new TextEncoder()
export const utf8Length = (text: string): number => encoder.encode(text).length

export class Tree {
  private readonly nodes = new Map<string, VNode>()
  private readonly kids = new Map<string, Set<string>>()

  constructor(private readonly p: PathOps) {}

  get(path: string): VNode | undefined {
    return this.nodes.get(this.p.key(path))
  }

  byKey(key: string): VNode | undefined {
    return this.nodes.get(key)
  }

  /**
   * The path with every existing ancestor in its stored case and the rest as
   * typed — so `c:\users\DEV\new.ts` is created as `C:\Users\dev\new.ts`.
   */
  canonical(path: string): string {
    const n = this.p.abs(path)
    const parts = n.slice(3).split('\\').filter(Boolean)
    let out = n.slice(0, 3)
    let live = true
    for (const part of parts) {
      const next = out.endsWith('\\') ? out + part : `${out}\\${part}`
      if (live) {
        const node = this.nodes.get(this.p.key(next))
        if (node) {
          out = node.path
          continue
        }
        live = false
      }
      out = next
    }
    return out
  }

  children(dirKey: string): VNode[] {
    const set = this.kids.get(dirKey)
    if (!set) return []
    const out: VNode[] = []
    for (const k of set) {
      const node = this.nodes.get(k)
      if (node) out.push(node)
    }
    return out
  }

  /** Every node strictly below `dirKey`, depth-first. */
  descendants(dirKey: string): VNode[] {
    const out: VNode[] = []
    const walk = (k: string): void => {
      for (const child of this.children(k)) {
        out.push(child)
        if (child.isDir) walk(this.p.key(child.path))
      }
    }
    walk(dirKey)
    return out
  }

  /** Creates the directory and any missing ancestors; returns the ones it created (outermost first). */
  ensureDir(path: string, mtime: number): VNode[] {
    const target = this.canonical(path)
    const created: VNode[] = []
    const chain: string[] = []
    for (let cur = target; ; cur = this.p.dirname(cur)) {
      chain.unshift(cur)
      if (this.p.dirname(cur) === cur) break
    }
    for (const dir of chain) {
      const k = this.p.key(dir)
      const existing = this.nodes.get(k)
      if (existing) continue
      const node: VNode = { path: dir, name: this.p.basename(dir) || dir, isDir: true, content: '', size: 0, mtime }
      this.insert(k, node)
      created.push(node)
    }
    return created
  }

  /** Writes a file whose parent exists. Returns the node and whether it was new. */
  putFile(path: string, content: string, mtime: number): { node: VNode; created: boolean } {
    const k = this.p.key(path)
    const existing = this.nodes.get(k)
    if (existing) {
      existing.content = content
      existing.size = utf8Length(content)
      existing.mtime = mtime
      return { node: existing, created: false }
    }
    const full = this.canonical(path)
    const node: VNode = { path: full, name: this.p.basename(full), isDir: false, content, size: utf8Length(content), mtime }
    this.insert(k, node)
    return { node, created: true }
  }

  /** Removes a node and everything under it. */
  delete(key: string): void {
    const node = this.nodes.get(key)
    if (!node) return
    if (node.isDir) for (const d of this.descendants(key)) this.drop(this.p.key(d.path))
    this.drop(key)
  }

  /** Moves a node (and its subtree) to `to`, whose parent exists. */
  move(fromKey: string, to: string, mtime: number): VNode {
    const node = this.nodes.get(fromKey)
    if (!node) throw new Error('move of a missing node')
    const parent = this.nodes.get(this.p.key(this.p.dirname(to)))
    const dest = parent ? `${parent.path.replace(/\\$/, '')}\\${this.p.basename(to)}` : this.p.abs(to)
    const subtree = node.isDir ? this.descendants(fromKey) : []
    const oldRoot = node.path
    this.drop(fromKey)
    for (const d of subtree) this.drop(this.p.key(d.path))
    node.path = dest
    node.name = this.p.basename(dest)
    node.mtime = mtime
    this.insert(this.p.key(dest), node)
    for (const d of subtree) {
      d.path = dest + d.path.slice(oldRoot.length)
      this.insert(this.p.key(d.path), d)
    }
    return node
  }

  touchDir(path: string, mtime: number): void {
    const node = this.nodes.get(this.p.key(path))
    if (node?.isDir) node.mtime = mtime
  }

  all(): IterableIterator<VNode> {
    return this.nodes.values()
  }

  private insert(k: string, node: VNode): void {
    this.nodes.set(k, node)
    const parentPath = this.p.dirname(node.path)
    if (parentPath === node.path) return
    const pk = this.p.key(parentPath)
    let set = this.kids.get(pk)
    if (!set) this.kids.set(pk, (set = new Set()))
    set.add(k)
  }

  private drop(k: string): void {
    const node = this.nodes.get(k)
    if (!node) return
    this.nodes.delete(k)
    this.kids.delete(k)
    const parentPath = this.p.dirname(node.path)
    if (parentPath !== node.path) this.kids.get(this.p.key(parentPath))?.delete(k)
  }
}
