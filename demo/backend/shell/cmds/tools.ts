/**
 * The dev tools npm scripts run: Vite (dev server + build), Vitest, tsc,
 * ESLint and `tsx watch`. Output mirrors Vite 7 / Vitest 3 in a TTY; the
 * test run reads the real test files from the VFS, so a test an agent adds
 * shows up in the counts. A test body containing `// demo-fail: <reason>`
 * fails with that reason (and passes again once the marker is edited away).
 */
import type { VfsChange } from '../../contracts'
import { CRLF, csi } from '../../util/ansi'
import type { Ctx } from './context'
import { clockTime, viteTime } from './context'
import type { Pkg } from './pkg'
import { readText, textLines } from './paths'
import { checkedFailure } from './testchecks'

const g = (s: string): string => `\x1b[32m${s}\x1b[39m`
const cy = (s: string): string => `\x1b[36m${s}\x1b[39m`
const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`
const bold = (s: string): string => `\x1b[1m${s}\x1b[22m`
const red = (s: string): string => `\x1b[31m${s}\x1b[39m`
const yellow = (s: string): string => `\x1b[33m${s}\x1b[39m`
const gray = (s: string): string => `\x1b[90m${s}\x1b[39m`

const VITE = 'v7.1.5'
const VITEST = 'v3.2.4'

/** Resolves when the command should end; Ctrl+C never resolves it (the shell cancels). */
const forever = (): Promise<never> => new Promise<never>(() => undefined)

/* ───────────────────────────── vite dev ───────────────────────────── */

export async function viteDev(ctx: Ctx, pkg: Pkg, mode: 'dev' | 'preview' = 'dev'): Promise<number> {
  const vfs = ctx.backend.vfs
  const t0 = performance.now()
  await ctx.sleep(260 + Math.random() * 180)
  let port = mode === 'dev' ? 5173 : 4173
  const notes: string[] = []
  while (ctx.svc.servers.has(port)) {
    notes.push(`Port ${port} is in use, trying another one...`)
    port++
  }
  const name = pkg.name
  ctx.svc.servers.set(port, { name, body: () => indexHtml(ctx, pkg) })
  ctx.defer(() => ctx.svc.servers.delete(port))
  const ready = Math.round(performance.now() - t0 + 120)
  const banner = (): string =>
    [
      '',
      `  ${g(bold('VITE'))} ${g(VITE)}  ${dim('ready in')} ${bold(String(ready))} ${dim('ms')}`,
      '',
      `  ${g('➜')}  ${bold('Local')}:   ${cy(`http://localhost:${bold(String(port))}/`)}`,
      `  ${g('➜')}  ${bold('Network')}: ${dim('use ')}${bold('--host')}${dim(' to expose')}`,
      `  ${g('➜')}  ${dim('press ')}${bold('h + enter')}${dim(' to show help')}`,
      ''
    ].join(CRLF)
  if (notes.length) ctx.print(...notes)
  ctx.write(banner())

  const stamp = (): string => dim(viteTime(Date.now()))
  const tag = `${cy(bold('[vite]'))}`
  const webRoot = vfs.key(pkg.dir)
  // Vite folds a repeat of the same message into the previous line: `… (x2)`.
  let last = { text: '', count: 0, at: 0 }
  const log = (text: string): void => {
    const now = Date.now()
    if (text === last.text && now - last.at < 5000) {
      last = { text, count: last.count + 1, at: now }
      ctx.write(`${csi('1A')}\r${csi('2K')}${stamp()} ${text} ${yellow(`(x${last.count})`)}${CRLF}`)
      return
    }
    last = { text, count: 1, at: now }
    ctx.write(`${stamp()} ${text}${CRLF}`)
  }
  const unsubscribe = vfs.onChange((changes: VfsChange[]) => {
    for (const c of changes) {
      if (c.isDir || c.kind === 'delete') continue
      const key = vfs.key(c.path)
      if (!key.startsWith(webRoot + '\\') || key.includes('\\node_modules\\') || key.includes('\\dist\\')) continue
      const rel = '/' + vfs.relative(pkg.dir, c.path).replace(/\\/g, '/')
      if (/\/vite\.config\.[jt]s$/.test(rel)) {
        log(`${tag} ${g(`${rel.slice(1)} changed, restarting server...`)}`)
        log(`${tag} ${g('server restarted.')}`)
      } else if (rel === '/index.html') {
        log(`${tag} ${g('page reload ')}${dim(rel.slice(1))}`)
      } else if (rel.startsWith('/src/')) {
        log(`${tag} ${dim('(client)')} ${g('hmr update ')}${dim(rel)}`)
      }
    }
  })
  ctx.defer(unsubscribe)
  if (mode === 'dev') {
    // A browser tab on the dashboard connects, and the dependency scan finds what the
    // first page load imports: Vite's usual first minute.
    const t1 = ctx.timers.setTimeout(() => log(`${tag} ${dim('(client)')} ${g('✨ new dependencies optimized: ')}${yellow('react-dom/client')}`), 2400)
    const t2 = ctx.timers.setTimeout(() => log(`${tag} ${dim('(client)')} ${g('✨ optimized dependencies changed. reloading')}`), 2900)
    const t3 = ctx.timers.setTimeout(() => log(`${tag} ${dim('(client)')} ${g('page reload ')}${dim('index.html')}`), 3100)
    ctx.defer(() => [t1, t2, t3].forEach((t) => ctx.timers.clear(t)))
  }

  let typed = ''
  ctx.onInput((data) => {
    for (const ch of data) {
      if (ch === '\r') {
        const cmd = typed.trim()
        typed = ''
        ctx.write(CRLF)
        if (cmd === 'h') {
          ctx.print(
            '',
            `  ${bold('Shortcuts')}`,
            `  ${dim('press ')}${bold('r + enter')}${dim(' to restart the server')}`,
            `  ${dim('press ')}${bold('u + enter')}${dim(' to show server url')}`,
            `  ${dim('press ')}${bold('o + enter')}${dim(' to open in browser')}`,
            `  ${dim('press ')}${bold('c + enter')}${dim(' to clear console')}`,
            `  ${dim('press ')}${bold('q + enter')}${dim(' to quit')}`
          )
        } else if (cmd === 'u') {
          ctx.print(`  ${g('➜')}  ${bold('Local')}:   ${cy(`http://localhost:${bold(String(port))}/`)}`, `  ${g('➜')}  ${bold('Network')}: ${dim('use ')}${bold('--host')}${dim(' to expose')}`)
        } else if (cmd === 'r') {
          ctx.write(`${stamp()} ${tag} ${g('server restarted.')}${CRLF}`)
        } else if (cmd === 'c') {
          ctx.write(`${csi('2J')}${csi('3J')}${csi('H')}`)
        } else if (cmd === 'q') {
          quit?.()
        }
      } else if (ch === '\x7f') {
        if (typed) {
          typed = typed.slice(0, -1)
          ctx.write('\b \b')
        }
      } else if (ch >= ' ' && !ch.startsWith('\x1b')) {
        typed += ch
        ctx.write(ch)
      }
    }
  })
  let quit: (() => void) | null = null
  await new Promise<void>((resolve) => {
    quit = resolve
  })
  return 0
}

function indexHtml(ctx: Ctx, pkg: Pkg): string {
  const html = readText(ctx, ctx.backend.vfs.join(pkg.dir, 'index.html'))
  const body = html && html.includes('<') ? html : '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <title>Harbor</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n'
  // Vite injects its client first.
  return body.replace('<head>', '<head>\n    <script type="module" src="/@vite/client"></script>\n')
}

/* ───────────────────────────── vite build ───────────────────────────── */

export async function viteBuild(ctx: Ctx, pkg: Pkg): Promise<number> {
  const t0 = performance.now()
  ctx.write(`${cy(`vite ${VITE}`)} ${g('building for production...')}${CRLF}`)
  await ctx.sleep(150)
  ctx.write(`transforming...`)
  const modules = 30 + countFiles(ctx, pkg.dir, /\.(tsx?|css)$/)
  await ctx.sleep(650 + Math.random() * 250)
  ctx.write(`\r${csi('K')}${g('✓')} ${modules} modules transformed.${CRLF}`)
  ctx.write('rendering chunks...')
  await ctx.sleep(180)
  ctx.write(`\r${csi('K')}computing gzip size...`)
  await ctx.sleep(120)
  ctx.write(`\r${csi('K')}`)
  const rows: Array<[string, string, number, number]> = [
    ['dist/', 'index.html', 0.46, 0.3],
    ['dist/assets/', 'index-DiwrgTda.css', 1.39, 0.72],
    ['dist/assets/', 'index-BVYhrI2N.js', 146.72 + modules * 0.11, 47.33 + modules * 0.03]
  ]
  const nameW = Math.max(...rows.map((r) => (r[0] + r[1]).length)) + 2
  for (const [dir, file, kb, gz] of rows) {
    const colour = file.endsWith('.js') ? cy : file.endsWith('.css') ? (s: string) => `\x1b[35m${s}\x1b[39m` : g
    const size = `${kb.toFixed(2)} kB`.padStart(9)
    ctx.print(`${dim(dir)}${colour(file)}${' '.repeat(nameW - (dir + file).length)}${bold(dim(size))}${dim(` │ gzip: ${gz.toFixed(2).padStart(5)} kB`)}`)
  }
  ctx.print(`${g(`✓ built in ${Math.round(performance.now() - t0)}ms`)}`)
  return 0
}

function countFiles(ctx: Ctx, dir: string, re: RegExp): number {
  let n = 0
  const walk = (d: string): void => {
    let entries
    try {
      entries = ctx.backend.vfs.readDir(d, { showHidden: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDir) {
        if (e.name !== 'node_modules' && e.name !== 'dist' && !e.name.startsWith('.')) walk(e.path)
      } else if (re.test(e.name)) n++
    }
  }
  walk(dir)
  return n
}

/* ───────────────────────────── vitest ───────────────────────────── */

interface TestCase {
  name: string
  fail: string | null
  /** 1-based line of the failure marker (for the code frame). */
  failLine: number
  ms: number
}

interface TestFile {
  rel: string
  path: string
  tests: TestCase[]
  lines: string[]
}

function hash(s: string): number {
  let h = 7
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function collect(ctx: Ctx, pkg: Pkg, filters: string[]): TestFile[] {
  const vfs = ctx.backend.vfs
  const files: TestFile[] = []
  const walk = (d: string): void => {
    let entries
    try {
      entries = vfs.readDir(d, { showHidden: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDir) {
        if (e.name !== 'node_modules' && e.name !== 'dist' && !e.name.startsWith('.')) walk(e.path)
        continue
      }
      if (!/\.(test|spec)\.[cm]?[jt]sx?$/.test(e.name)) continue
      const rel = vfs.relative(pkg.dir, e.path).replace(/\\/g, '/')
      if (filters.length && !filters.some((f) => rel.includes(f.replace(/\\/g, '/')))) continue
      const text = readText(ctx, e.path) ?? ''
      const lines = textLines(text)
      const readBeside = (name: string): string | null => readText(ctx, vfs.join(d, name))
      files.push({ rel, path: e.path, tests: parseTests(rel, lines, readBeside), lines })
    }
  }
  walk(pkg.dir)
  return files.sort((a, b) => a.rel.localeCompare(b.rel))
}

function parseTests(rel: string, lines: string[], readBeside: (name: string) => string | null): TestCase[] {
  const starts: Array<{ line: number; name: string }> = []
  const re = /^\s*(?:it|test)(?:\.(?:only|concurrent))?\(\s*(['"`])(.+?)\1/
  lines.forEach((l, i) => {
    const m = re.exec(l)
    if (m) starts.push({ line: i, name: m[2] })
  })
  if (starts.length === 0) {
    // Placeholder text: a stable, plausible count.
    const n = 2 + (hash(rel) % 5)
    return Array.from({ length: n }, (_, i) => ({ name: `case ${i + 1}`, fail: null, failLine: 0, ms: 2 + (hash(rel + i) % 9) }))
  }
  return starts.map((s, i) => {
    const end = starts[i + 1]?.line ?? lines.length
    let fail: string | null = null
    let failLine = 0
    for (let j = s.line; j < end; j++) {
      const m = /\/\/\s*demo-fail:\s*(.+)$/.exec(lines[j])
      if (m) {
        fail = m[1].trim()
        failLine = j + 1
        break
      }
    }
    const checked = fail ? null : checkedFailure(rel, s.name, lines, s.line, end, readBeside)
    if (checked) {
      fail = checked.message
      failLine = checked.line
    }
    return { name: s.name, fail, failLine, ms: 1 + (hash(rel + s.name) % 14) }
  })
}

export async function vitest(ctx: Ctx, pkg: Pkg, argv: string[]): Promise<number> {
  const t0 = performance.now()
  const watch = !argv.includes('run') && !argv.includes('--run') && ctx.tty && argv[0] !== 'run'
  const filters = argv.filter((a) => !a.startsWith('-') && a !== 'run' && a !== 'watch')
  const started = clockTime(Date.now())
  await ctx.sleep(350 + Math.random() * 150)
  ctx.print('', `${`\x1b[46m\x1b[30m RUN \x1b[39m\x1b[49m`} ${cy(VITEST)} ${gray(ctx.backend.vfs.toPosix(pkg.dir).replace(/^\/(\w)/, (_m, d: string) => `${d.toUpperCase()}:`))}`, '')
  const files = collect(ctx, pkg, filters)
  if (files.length === 0) {
    ctx.print(red('No test files found, exiting with code 1'), '', `${dim('filter: ')} ${filters.join(', ') || dim('(none)')}`, `${dim('include: ')} **/*.{test,spec}.?(c|m)[jt]s?(x)`, `${dim('exclude: ')} **/node_modules/**, **/.git/**`, '')
    return 1
  }
  let passed = 0
  let failed = 0
  const failures: Array<{ file: TestFile; test: TestCase }> = []
  for (const f of files) {
    await ctx.sleep(140 + (hash(f.rel) % 260))
    const fileMs = f.tests.reduce((a, t) => a + t.ms, 0) + 6
    const bad = f.tests.filter((t) => t.fail)
    passed += f.tests.length - bad.length
    failed += bad.length
    const count = `${f.tests.length} test${f.tests.length === 1 ? '' : 's'}${bad.length ? ` | ${red(`${bad.length} failed`)}` : ''}`
    if (bad.length === 0) {
      ctx.print(` ${g('✓')} ${f.rel} ${gray(`(${count})`)} ${gray(`${fileMs}ms`)}`)
    } else {
      ctx.print(` ${red('❯')} ${f.rel} ${gray(`(${count})`)} ${gray(`${fileMs}ms`)}`)
      for (const t of f.tests) {
        if (t.fail) {
          ctx.print(`   ${red('×')} ${t.name} ${gray(`${t.ms}ms`)}`, `     ${red(`→ ${t.fail}`)}`)
          failures.push({ file: f, test: t })
        } else ctx.print(`   ${g('✓')} ${t.name} ${gray(`${t.ms}ms`)}`)
      }
    }
  }
  if (failures.length) {
    ctx.print('', red(bold(`⎯⎯⎯⎯⎯⎯⎯ Failed Tests ${failures.length} ⎯⎯⎯⎯⎯⎯⎯`)), '')
    failures.forEach(({ file, test }, i) => {
      const frame: string[] = []
      for (let l = Math.max(1, test.failLine - 2); l <= Math.min(file.lines.length, test.failLine + 1); l++) {
        frame.push(`    ${gray(`${String(l).padStart(3)}|`)} ${file.lines[l - 1]}`)
        if (l === test.failLine) frame.push(`       ${gray('|')} ${red('^')}`)
      }
      ctx.print(
        ` ${`\x1b[41m\x1b[97m FAIL \x1b[39m\x1b[49m`} ${file.rel} ${gray('>')} ${test.name}`,
        red(`AssertionError: ${test.fail}`),
        '',
        ` ${cy('❯')} ${file.rel}:${test.failLine}:5`,
        ...frame,
        '',
        red(dim(`⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[${i + 1}/${failures.length}]⎯`)),
        ''
      )
    })
  }
  const filesFailed = new Set(failures.map((f) => f.file.rel)).size
  const took = (performance.now() - t0) / 1000
  const summary = (label: string, bad: number, good: number, total: number): string =>
    `${dim(label)} ${bad ? `${red(bold(`${bad} failed`))}${dim(' | ')}` : ''}${good ? g(bold(`${good} passed`)) : ''} ${gray(`(${total})`)}`
  ctx.print(
    '',
    summary(' Test Files ', filesFailed, files.length - filesFailed, files.length),
    summary('      Tests ', failed, passed, passed + failed),
    `${dim('   Start at ')} ${started}`,
    `${dim('   Duration ')} ${took.toFixed(2)}s ${gray(`(transform ${Math.round(took * 160)}ms, setup 0ms, collect ${Math.round(took * 380)}ms, tests ${passed * 4 + failed * 9}ms, environment 0ms, prepare ${Math.round(took * 90)}ms)`)}`,
    ''
  )
  if (watch) {
    ctx.print(`${failures.length ? `\x1b[41m\x1b[97m FAIL \x1b[39m\x1b[49m` : `\x1b[42m\x1b[30m PASS \x1b[39m\x1b[49m`} ${failures.length ? red('Tests failed. Watching for file changes...') : g('Waiting for file changes...')}`)
    ctx.print(`       ${dim('press ')}${bold('h')}${dim(' to show help, press ')}${bold('q')}${dim(' to quit')}`)
    await new Promise<void>((resolve) => {
      ctx.onInput((data) => {
        if (data.includes('q')) resolve()
      })
    })
    return 0
  }
  return failures.length ? 1 : 0
}

/* ───────────────────────── tsc, eslint, tsx ───────────────────────── */

export async function tsc(ctx: Ctx, argv: string[]): Promise<number> {
  if (argv.includes('-v') || argv.includes('--version')) {
    ctx.print('Version 5.9.2')
    return 0
  }
  await ctx.sleep(900 + Math.random() * 500)
  return 0
}

export async function eslint(ctx: Ctx, argv: string[]): Promise<number> {
  if (argv.includes('-v') || argv.includes('--version')) {
    ctx.print('v9.35.0')
    return 0
  }
  await ctx.sleep(1100 + Math.random() * 400)
  return 0
}

/** `tsx watch src/server.ts` / `node src/server.ts`: the API server, restarting on edits. */
export async function apiServer(ctx: Ctx, pkg: Pkg, entry: string, watch: boolean): Promise<number> {
  const vfs = ctx.backend.vfs
  const port = Number(ctx.sh.env.PORT ?? '8787') || 8787
  const log = (msg: string): void => {
    const d = new Date()
    const ms = String(d.getMilliseconds()).padStart(3, '0')
    ctx.write(`[${clockTime(d.getTime())}.${ms}] ${g('INFO')}: ${cy(msg)}${CRLF}`)
  }
  await ctx.sleep(420)
  if (ctx.svc.servers.has(port)) {
    ctx.print(
      red(`Error: listen EADDRINUSE: address already in use :::${port}`),
      '    at Server.setupListenHandle [as _listen2] (node:net:1939:16)',
      '    at listenInCluster (node:net:1996:12)',
      `    at Server.listen (node:net:2101:7)`,
      `    at ${vfs.join(pkg.dir, entry)}:41:8`,
      '',
      `Node.js ${ctx.backend.scenario.machine.versions.node ?? 'v22.19.0'}`
    )
    return 1
  }
  ctx.svc.servers.set(port, { name: pkg.name, body: () => '{"status":"ok","service":"harbor-api","uptime":42.7}' })
  ctx.defer(() => ctx.svc.servers.delete(port))
  log(`harbor-api listening on http://localhost:${port}`)
  if (watch) {
    const root = vfs.key(pkg.dir)
    const off = vfs.onChange((changes) => {
      const hit = changes.find((c) => !c.isDir && vfs.key(c.path).startsWith(root + '\\src\\'))
      if (!hit) return
      ctx.write(`${dim(viteTime(Date.now()))} ${yellow('[tsx]')} change in ./${vfs.relative(pkg.dir, hit.path).replace(/\\/g, '/')} ${dim('Rerunning...')}${CRLF}`)
      ctx.timers.setTimeout(() => log(`harbor-api listening on http://localhost:${port}`), 380)
    })
    ctx.defer(off)
  }
  return forever()
}
