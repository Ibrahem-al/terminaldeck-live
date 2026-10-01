/**
 * package.json lookup for npm: the nearest manifest walking up from a
 * directory, its scripts, and workspace resolution (`-w api`). If a manifest
 * isn't valid JSON (the vfs may still hold placeholders) the scenario's
 * layout supplies sensible defaults, so `npm run dev` always does something real.
 */
import type { Ctx } from './context'
import { readText } from './paths'

export interface Pkg {
  dir: string
  name: string
  version: string
  scripts: Record<string, string>
  workspaces: string[]
  /** Parsed manifest, or null when defaults were used. */
  json: Record<string, unknown> | null
}

const DEFAULTS: Record<string, Omit<Pkg, 'dir' | 'json'>> = {
  root: {
    name: 'harbor',
    version: '0.1.0',
    scripts: {
      dev: 'npm run dev -w web',
      build: 'npm run build -w api && npm run build -w web',
      test: 'npm test -w api',
      lint: 'npm run lint --workspaces --if-present',
      typecheck: 'tsc -b'
    },
    workspaces: ['api', 'web']
  },
  api: {
    name: '@harbor/api',
    version: '0.1.0',
    scripts: { dev: 'tsx watch src/server.ts', build: 'tsc -p tsconfig.json', start: 'node dist/server.js', test: 'vitest run', lint: 'eslint src tests' },
    workspaces: []
  },
  web: {
    name: 'web',
    version: '0.1.0',
    scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview', lint: 'eslint src' },
    workspaces: []
  }
}

function parse(text: string | null): Record<string, unknown> | null {
  if (text === null) return null
  try {
    const v: unknown = JSON.parse(text)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function defaultsFor(ctx: Ctx, dir: string): Omit<Pkg, 'dir' | 'json'> {
  const vfs = ctx.backend.vfs
  const base = vfs.basename(dir).toLowerCase()
  if (base === 'api' || base === 'web') return DEFAULTS[base]
  if (vfs.exists(vfs.join(dir, 'api')) && vfs.exists(vfs.join(dir, 'web'))) return DEFAULTS.root
  return { name: base, version: '1.0.0', scripts: { test: 'echo "Error: no test specified" && exit 1' }, workspaces: [] }
}

export function loadPkg(ctx: Ctx, dir: string): Pkg | null {
  const vfs = ctx.backend.vfs
  const file = vfs.join(dir, 'package.json')
  if (!vfs.exists(file)) return null
  const json = parse(readText(ctx, file))
  const d = defaultsFor(ctx, dir)
  if (!json) return { dir, json: null, ...d }
  const scripts = json.scripts && typeof json.scripts === 'object' ? (json.scripts as Record<string, string>) : {}
  const ws = Array.isArray(json.workspaces) ? (json.workspaces as unknown[]).filter((w): w is string => typeof w === 'string') : []
  return {
    dir,
    json,
    name: typeof json.name === 'string' ? json.name : d.name,
    version: typeof json.version === 'string' ? json.version : d.version,
    scripts,
    workspaces: ws
  }
}

/** The nearest package.json at or above `from`. */
export function findPkg(ctx: Ctx, from: string): Pkg | null {
  const vfs = ctx.backend.vfs
  let dir = from
  for (;;) {
    const p = loadPkg(ctx, dir)
    if (p) return p
    const up = vfs.dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

/** The workspace root above a package (the first manifest with `workspaces`). */
export function findRoot(ctx: Ctx, pkg: Pkg): Pkg {
  const vfs = ctx.backend.vfs
  let dir = pkg.dir
  for (;;) {
    const p = loadPkg(ctx, dir)
    if (p && p.workspaces.length > 0) return p
    const up = vfs.dirname(dir)
    if (up === dir) return pkg
    dir = up
  }
}

/** Resolve `-w <name>`: a folder (`api`) or a package name (`@harbor/api`). */
export function workspace(ctx: Ctx, root: Pkg, name: string): Pkg | null {
  const vfs = ctx.backend.vfs
  const byDir = loadPkg(ctx, vfs.join(root.dir, name.replace(/\//g, '\\')))
  if (byDir) return byDir
  for (const w of root.workspaces.length ? root.workspaces : ['api', 'web']) {
    const p = loadPkg(ctx, vfs.join(root.dir, w.replace(/\/\*$/, '')))
    if (p && p.name === name) return p
  }
  return null
}

export function workspaces(ctx: Ctx, root: Pkg): Pkg[] {
  const vfs = ctx.backend.vfs
  return (root.workspaces.length ? root.workspaces : ['api', 'web'])
    .map((w) => loadPkg(ctx, vfs.join(root.dir, w.replace(/\/\*$/, ''))))
    .filter((p): p is Pkg => p !== null)
}
