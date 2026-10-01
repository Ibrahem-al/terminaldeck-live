/**
 * Every fs_* command the renderer invokes (bridge/quarterdeck.ts `fs`), with
 * the return shapes and error texts of src-tauri/src/cmds.rs + fsx/mod.rs.
 *
 * Void commands resolve `null`, exactly as Tauri serializes `Ok(())` — so,
 * as in the installed app, the tree catches up through the `fs:changed` the
 * watcher emits rather than through `fsAction` (mock-commands.md §9.1).
 */
import type { ImportResult } from '@shared/types'
import type { Backend, CommandModule, InvokeContext, Vfs } from '../contracts'
import type { PathOps } from './paths'
import type { WatchRegistry } from './watch'

interface Deps {
  backend: Backend
  vfs: Vfs
  paths: PathOps
  watches: WatchRegistry
}

/** Largest dropped file the demo keeps (it lives in sessionStorage). */
const MAX_BLOB_BYTES = 1_000_000

/** Spell a child of `dir` from the caller's spelling, like `Path::join`. */
const childOf = (dir: string, name: string): string => `${dir.replace(/[\\/]+$/, '')}\\${name}`

export function createFsCommands({ backend, vfs, paths: p, watches }: Deps): CommandModule {
  /** The in-page stand-in for the OS clipboard's file list (CF_HDROP). */
  let osClipboard: string[] = []

  /** unique_dest: `name`, then `<stem> copy<ext>`, then `<stem> copy 2<ext>`… */
  const uniqueDest = (destDir: string, name: string): string => {
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 ? name.slice(dot) : ''
    const stem = ext ? name.slice(0, -ext.length) : name
    for (let i = 0; ; i++) {
      const candidate = childOf(destDir, i === 0 ? name : i === 1 ? `${stem} copy${ext}` : `${stem} copy ${i}${ext}`)
      if (!vfs.exists(candidate)) return candidate
    }
  }

  const copyInto = (src: string, destDir: string): string => {
    if (p.isInside(src, destDir)) throw 'Cannot copy a folder into itself'
    const dest = uniqueDest(destDir, p.basename(src))
    vfs.copy(src, dest)
    return dest
  }

  const importInto = (destDir: string, srcPaths: string[]): ImportResult => {
    const result: ImportResult = { created: [], errors: [] }
    for (const src of srcPaths) {
      try {
        if (!vfs.exists(src)) throw `ENOENT: no such file or directory, lstat '${src}'`
        result.created.push(copyInto(src, destDir))
      } catch (err) {
        result.errors.push(`${p.basename(src)}: ${message(err)}`)
      }
    }
    return result
  }

  /** The system folder dialog, as the host desktop draws it; it opens where the window's tree is rooted. */
  const pickRoot = async (defaultPath: string | null, label: string): Promise<string | null> => {
    const start = defaultPath ?? watches.rootOf(label) ?? backend.scenario.machine.projectsDir
    const pick = await backend.host.pickFolder(start, 'Select a folder')
    return pick ? (vfs.stat(pick)?.path ?? pick) : null
  }

  const commands: CommandModule = {
    fs_pick_root: ({ defaultPath }: { defaultPath?: string | null }, ctx: InvokeContext) =>
      pickRoot(defaultPath ?? null, ctx.label),

    fs_read_dir: ({ dir }: { dir: string }) => vfs.readDir(dir),

    fs_read_file: ({ path }: { path: string }) => vfs.readFile(path),

    fs_write_file: ({ path, content }: { path: string; content: string }) => {
      vfs.writeFile(path, String(content ?? ''))
      return null
    },

    fs_create_file: ({ path }: { path: string }) => {
      if (vfs.exists(path)) throw `EEXIST: file already exists, open '${path}'`
      vfs.writeFile(path, '')
      return null
    },

    fs_create_dir: ({ path }: { path: string }) => {
      vfs.mkdir(path)
      return null
    },

    fs_rename: ({ oldPath, newPath }: { oldPath: string; newPath: string }) => {
      if (vfs.exists(newPath)) throw 'A file with that name already exists'
      vfs.rename(oldPath, newPath)
      return null
    },

    fs_copy: ({ src, destDir }: { src: string; destDir: string }) => copyInto(src, destDir),

    fs_move: ({ src, destDir }: { src: string; destDir: string }) => {
      if (p.key(p.dirname(src)) === p.key(destDir)) return src
      if (p.isInside(src, destDir)) throw 'Cannot move a folder into itself'
      const dest = uniqueDest(destDir, p.basename(src))
      vfs.rename(src, dest)
      return dest
    },

    fs_delete: ({ path }: { path: string }) => {
      vfs.remove(path, { recursive: true })
      return null
    },

    fs_search: ({ root, query, showHidden }: { root: string; query: string; showHidden?: boolean }) => {
      try {
        return vfs.search(root, String(query ?? ''), { showHidden: !!showHidden })
      } catch {
        return []
      }
    },

    fs_reveal: ({ path }: { path: string }) => {
      backend.host.appToast('info', `Reveal ${p.basename(path)}`, 'No File Explorer in the web demo.')
      return null
    },

    fs_watch: ({ root }: { root: string }, ctx: InvokeContext) => {
      watches.watchRoot(ctx.label, root)
      return null
    },
    fs_unwatch: (_args: unknown, ctx: InvokeContext) => {
      watches.unwatchRoot(ctx.label)
      return null
    },
    fs_watch_dir: ({ path }: { path: string }, ctx: InvokeContext) => {
      watches.watchDir(ctx.label, path)
      return null
    },
    fs_unwatch_dir: ({ path }: { path: string }, ctx: InvokeContext) => {
      watches.unwatchDir(ctx.label, path)
      return null
    },
    fs_watch_file: ({ path }: { path: string }, ctx: InvokeContext) => {
      watches.watchFile(ctx.label, path)
      return null
    },
    fs_unwatch_file: ({ path }: { path: string }, ctx: InvokeContext) => {
      watches.unwatchFile(ctx.label, path)
      return null
    },

    fs_import_paths: ({ destDir, srcPaths }: { destDir: string; srcPaths: string[] }) =>
      importInto(destDir, Array.isArray(srcPaths) ? srcPaths : []),

    fs_write_blob: (args: BlobArgs | Uint8Array) => writeBlob(vfs, args, uniqueDest),

    fs_download_url: ({ url }: { destDir: string; url: string }) => ({
      created: [],
      errors: [`${url}: downloading from the web is turned off in the demo — nothing leaves your browser.`]
    }),

    fs_copy_to_clipboard: ({ paths }: { paths: string[] }) => {
      osClipboard = (Array.isArray(paths) ? paths : []).filter((x) => typeof x === 'string' && x !== '')
      return null
    },

    fs_paste_clipboard: ({ destDir }: { destDir: string }) =>
      importInto(destDir, osClipboard.filter((x) => vfs.exists(x)))
  }
  return commands
}

/* ── fs_write_blob ─────────────────────────────────────────────────────
 *
 * The bridge sends the dropped bytes as the raw invoke body and the folder
 * and file name in headers; mockIPC drops `options`, so installBlobBridge
 * wraps the frame's invoke to fold the headers into the args before the mock
 * sees them.
 */

interface BlobArgs {
  __tdBlob: true
  body: unknown
  headers: Record<string, string>
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

function writeBlob(vfs: Vfs, args: BlobArgs | Uint8Array, uniqueDest: (dir: string, name: string) => string): ImportResult {
  if (!args || !(args as BlobArgs).__tdBlob) return { created: [], errors: ['missing x-name'] }
  const { body, headers } = args as BlobArgs
  let name: string
  let destDir: string
  try {
    name = decodeURIComponent(headers['x-name'] ?? '')
    destDir = decodeURIComponent(headers['x-dest-dir'] ?? '')
  } catch {
    return { created: [], errors: ['x-name is not valid UTF-8'] }
  }
  if (!name) return { created: [], errors: ['missing x-name'] }
  if (!destDir) return { created: [], errors: [`${name}: missing x-dest-dir`] }
  const bytes = toBytes(body)
  if (!bytes) return { created: [], errors: [`${name}: expected a raw body`] }
  if (bytes.byteLength > MAX_BLOB_BYTES) return { created: [], errors: [`${name}: files over 1 MB stay out of the web demo`] }
  try {
    const dest = uniqueDest(destDir, name.replace(/[\\/:*?"<>|]/g, '_'))
    vfs.writeFile(dest, new TextDecoder('utf-8').decode(bytes))
    return { created: [dest], errors: [] }
  } catch (err) {
    return { created: [], errors: [`${name}: ${message(err)}`] }
  }
}

/** The body comes from the iframe's realm, so `instanceof` can't be trusted. */
function toBytes(body: unknown): Uint8Array | null {
  if (!body || typeof body !== 'object') return null
  const tag = Object.prototype.toString.call(body)
  if (tag === '[object Uint8Array]') {
    const view = body as Uint8Array
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  }
  if (tag === '[object ArrayBuffer]') return new Uint8Array(body as ArrayBuffer)
  if (Array.isArray(body)) return Uint8Array.from(body as number[])
  return null
}

type InvokeFn = (cmd: string, args?: unknown, options?: { headers?: unknown }) => Promise<unknown>

/** Wrap a frame's `__TAURI_INTERNALS__.invoke` so fs_write_blob keeps its headers. */
export function installBlobBridge(win: Window): void {
  const internals = (win as unknown as { __TAURI_INTERNALS__?: { invoke?: InvokeFn; __tdBlob?: boolean } }).__TAURI_INTERNALS__
  if (!internals?.invoke || internals.__tdBlob) return
  const original = internals.invoke
  internals.__tdBlob = true
  internals.invoke = (cmd, args, options) => {
    if (cmd !== 'fs_write_blob') return original(cmd, args, options)
    const wrapped: BlobArgs = { __tdBlob: true, body: args, headers: readHeaders(options?.headers) }
    return original(cmd, wrapped, options)
  }
}

function readHeaders(h: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!h || typeof h !== 'object') return out
  const maybe = h as { forEach?: (cb: (v: string, k: string) => void) => void }
  if (Object.prototype.toString.call(h) === '[object Headers]' && maybe.forEach) {
    maybe.forEach((v, k) => (out[k.toLowerCase()] = v))
    return out
  }
  const entries = Array.isArray(h) ? (h as Array<[string, string]>) : Object.entries(h as Record<string, string>)
  for (const [k, v] of entries) out[String(k).toLowerCase()] = String(v)
  return out
}
