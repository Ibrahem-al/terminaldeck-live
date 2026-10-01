/**
 * npm 10 and npx: install, run-script with workspaces, lifecycle headers and
 * failure reports, and `npx <package>` resolving agents from the program
 * registry. Scripts run through a tiny interpreter that knows the Harbor
 * toolchain (vite, vitest, tsc, eslint, tsx, nested npm).
 */
import { csi } from '../../util/ansi'
import type { Ctx } from './context'
import { findPkg, findRoot, workspace, workspaces, type Pkg } from './pkg'
import { apiServer, eslint, tsc, viteBuild, viteDev, vitest } from './tools'

const npmErr = (s: string): string => `\x1b[31mnpm error\x1b[39m ${s}`
const SPIN = ['⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏', '⠋']

function logPath(): string {
  const d = new Date().toISOString().replace(/:/g, '_').replace(/\.\d+Z$/, '_000Z')
  return `C:\\Users\\dev\\AppData\\Local\\npm-cache\\_logs\\${d}-debug-0.log`
}

async function spinner(ctx: Ctx, ms: number): Promise<void> {
  ctx.write(csi('?25l'))
  const end = performance.now() + ms
  let i = 0
  while (performance.now() < end && !ctx.cancelled) {
    ctx.write(`\r${SPIN[i++ % SPIN.length]}`)
    await ctx.sleep(80)
  }
  ctx.write(`\r${csi('K')}${csi('?25h')}`)
}

/** Parse npm's argv: the subcommand, `-w` targets, `--workspaces`, the rest. */
function parseArgs(argv: string[]): { sub: string; ws: string[]; allWs: boolean; ifPresent: boolean; rest: string[]; flags: string[] } {
  const ws: string[] = []
  const rest: string[] = []
  const flags: string[] = []
  let allWs = false
  let ifPresent = false
  let sub = ''
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-w' || a === '--workspace') ws.push(argv[++i] ?? '')
    else if (a.startsWith('--workspace=') || a.startsWith('-w=')) ws.push(a.slice(a.indexOf('=') + 1))
    else if (a === '--workspaces' || a === '-ws') allWs = true
    else if (a === '--if-present') ifPresent = true
    else if (a === '--') {
      rest.push(...argv.slice(i + 1))
      break
    } else if (a.startsWith('-') && !sub) flags.push(a)
    else if (!sub) sub = a
    else rest.push(a)
  }
  return { sub, ws, allWs, ifPresent, rest, flags }
}

export async function npm(ctx: Ctx): Promise<number> {
  const a = parseArgs(ctx.argv)
  const versions = ctx.backend.scenario.machine.versions
  if (a.flags.includes('-v') || a.flags.includes('--version') || a.sub === '-v') {
    ctx.print(versions.npm ?? '10.9.3')
    return 0
  }
  await ctx.sleep(180 + Math.random() * 120)
  switch (a.sub) {
    case '':
    case 'help':
      ctx.print(
        'npm <command>',
        '',
        'Usage:',
        '',
        'npm install        install all the dependencies in your project',
        'npm install <foo>  add the <foo> dependency to your project',
        'npm test           run this project\'s tests',
        'npm run <foo>      run the script named <foo>',
        'npm <command> -h   quick help on <command>',
        '',
        `npm@${versions.npm ?? '10.9.3'} C:\\Program Files\\nodejs\\node_modules\\npm`
      )
      return a.sub ? 0 : 1
    case 'install':
    case 'i':
    case 'ci':
    case 'add':
    case 'in':
      return install(ctx, a.rest, a.flags, a.ws)
    case 'test':
    case 't':
    case 'tst':
      return runScripts(ctx, 'test', a)
    case 'start':
      return runScripts(ctx, 'start', a)
    case 'run':
    case 'run-script':
    case 'rum':
    case 'urn': {
      const script = a.rest.shift()
      if (!script) return listScripts(ctx)
      return runScripts(ctx, script, a)
    }
    case 'ls':
    case 'list': {
      const pkg = findPkg(ctx, ctx.sh.cwd)
      ctx.print(`${pkg?.name ?? 'harbor'}@${pkg?.version ?? '0.1.0'} ${pkg?.dir ?? ctx.sh.cwd}`, '├── typescript@5.9.2', '├── vite@7.1.5', '└── vitest@3.2.4', '')
      return 0
    }
    case 'audit':
      await spinner(ctx, 900)
      ctx.print(`found ${'\x1b[32m\x1b[1m0\x1b[22m\x1b[39m'} vulnerabilities`)
      return 0
    case 'outdated':
      await spinner(ctx, 1200)
      return 0
    case 'fund':
      ctx.print('harbor@0.1.0', '├─┬ https://opencollective.com/vitest', '│ └── vitest@3.2.4', '└─┬ https://github.com/sponsors/yyx990803', '  └── vite@7.1.5')
      return 0
    default:
      ctx.print(`Unknown command: "${a.sub}"`, '', 'To see a list of supported npm commands, run:', '  npm help')
      return 1
  }
}

async function listScripts(ctx: Ctx): Promise<number> {
  const pkg = findPkg(ctx, ctx.sh.cwd)
  if (!pkg) return noPackage(ctx)
  const lifecycle = ['test', 'start']
  const lines: string[] = []
  const life = Object.entries(pkg.scripts).filter(([k]) => lifecycle.includes(k))
  const other = Object.entries(pkg.scripts).filter(([k]) => !lifecycle.includes(k))
  if (life.length) lines.push(`Lifecycle scripts included in ${pkg.name}@${pkg.version}:`, ...life.flatMap(([k, v]) => [`  ${k}`, `    ${v}`]))
  if (other.length) lines.push('available via `npm run-script`:', ...other.flatMap(([k, v]) => [`  ${k}`, `    ${v}`]))
  lines.push('')
  ctx.print(...lines)
  return 0
}

function noPackage(ctx: Ctx): number {
  const file = ctx.backend.vfs.join(ctx.sh.cwd, 'package.json')
  ctx.print(
    npmErr('code ENOENT'),
    npmErr('syscall open'),
    npmErr(`path ${file}`),
    npmErr('errno -4058'),
    npmErr(`enoent Could not read package.json: Error: ENOENT: no such file or directory, open '${file}'`),
    npmErr('enoent This is related to npm not being able to find a file.'),
    npmErr('enoent'),
    npmErr(`A complete log of this run can be found in: ${logPath()}`)
  )
  return 4294963238 | 0
}

async function install(ctx: Ctx, pkgs: string[], flags: string[], ws: string[]): Promise<number> {
  const here = findPkg(ctx, ctx.sh.cwd)
  if (!here) return noPackage(ctx)
  // `npm install x -w api` records the dependency in that workspace's manifest.
  const pkg = ws.length ? (workspace(ctx, findRoot(ctx, here), ws[0]) ?? here) : here
  const t0 = performance.now()
  await spinner(ctx, pkgs.length ? 1600 + pkgs.length * 400 : 2400)
  if (ctx.cancelled) return 1
  const dev = flags.includes('-D') || flags.includes('--save-dev')
  if (pkgs.length && pkg.json) {
    // Record the dependency the way npm would (caret on a plausible version).
    const field = dev ? 'devDependencies' : 'dependencies'
    const deps = { ...((pkg.json[field] as Record<string, string> | undefined) ?? {}) }
    for (const p of pkgs) {
      const name = p.replace(/(.)@[^/]*$/, '$1')
      deps[name] = `^${versionOf(name)}`
    }
    const sorted = Object.fromEntries(Object.entries(deps).sort(([x], [y]) => x.localeCompare(y)))
    const next = { ...pkg.json, [field]: sorted }
    try {
      ctx.backend.vfs.writeFile(ctx.backend.vfs.join(pkg.dir, 'package.json'), JSON.stringify(next, null, 2) + '\n')
    } catch {
      /* read-only: keep going */
    }
  }
  const secs = Math.max(1, Math.round((performance.now() - t0) / 1000))
  const added = pkgs.length ? pkgs.length + (pkgs.join('').length % 4) : 0
  ctx.print(
    '',
    added ? `added ${added} package${added === 1 ? '' : 's'}, and audited ${214 + added} packages in ${secs}s` : `up to date, audited 214 packages in ${secs}s`,
    '',
    '41 packages are looking for funding',
    '  run `npm fund` for details',
    '',
    `found ${'\x1b[32m\x1b[1m0\x1b[22m\x1b[39m'} vulnerabilities`
  )
  return 0
}

function versionOf(name: string): string {
  const known: Record<string, string> = { zod: '4.1.5', express: '5.1.0', 'express-rate-limit': '8.1.0', react: '19.1.1', lodash: '4.17.21', vitest: '3.2.4', vite: '7.1.5', typescript: '5.9.2' }
  return known[name] ?? '1.0.0'
}

/** `npm test` / `npm run x`, for this package or its workspaces. */
async function runScripts(ctx: Ctx, script: string, a: ReturnType<typeof parseArgs>): Promise<number> {
  const here = findPkg(ctx, ctx.sh.cwd)
  if (!here) return noPackage(ctx)
  let targets: Pkg[] = [here]
  if (a.ws.length || a.allWs) {
    const root = findRoot(ctx, here)
    if (a.allWs) targets = workspaces(ctx, root)
    else {
      targets = []
      for (const name of a.ws) {
        const w = workspace(ctx, root, name)
        if (!w) {
          ctx.print(npmErr(`No workspaces found:`), npmErr(`  --workspace=${name}`), npmErr(`A complete log of this run can be found in: ${logPath()}`))
          return 1
        }
        targets.push(w)
      }
    }
  }
  let code = 0
  for (const pkg of targets) {
    const body = pkg.scripts[script]
    if (body === undefined) {
      if (a.ifPresent) continue
      ctx.print(npmErr(`Missing script: "${script}"`), npmErr(''), npmErr('To see a list of scripts, run:'), npmErr('  npm run'), npmErr(`A complete log of this run can be found in: ${logPath()}`))
      return 1
    }
    const extra = a.rest.length ? ' ' + a.rest.join(' ') : ''
    ctx.print('', `> ${pkg.name}@${pkg.version} ${script}`, `> ${body}${extra}`, '')
    code = await runScriptBody(ctx, pkg, body + extra)
    if (ctx.cancelled) return code
    if (code !== 0) {
      const ws = pkg !== here || a.ws.length ? [npmErr(`workspace ${pkg.name}@${pkg.version}`), npmErr(`location ${pkg.dir}`)] : []
      ctx.print(
        npmErr(`Lifecycle script \`${script}\` failed with error:`),
        npmErr(`code ${code}`),
        npmErr(`path ${pkg.dir}`),
        ...ws,
        npmErr('command failed'),
        npmErr(`command C:\\WINDOWS\\system32\\cmd.exe /d /s /c ${body}${extra}`)
      )
      return code
    }
  }
  return code
}

/** Run one script's command string (`tsc -b && vite build`) inside `pkg`. */
async function runScriptBody(ctx: Ctx, pkg: Pkg, body: string): Promise<number> {
  let code = 0
  for (const part of body.split(/\s*&&\s*/)) {
    code = await runTool(ctx, pkg, part.trim())
    if (code !== 0 || ctx.cancelled) return code
  }
  return code
}

async function runTool(ctx: Ctx, pkg: Pkg, command: string): Promise<number> {
  const argv = command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((s) => s.replace(/^["']|["']$/g, '')) ?? []
  const bin = argv.shift() ?? ''
  switch (bin) {
    case 'vite':
      if (argv[0] === 'build') return viteBuild(ctx, pkg)
      if (argv[0] === 'preview') return viteDev(ctx, pkg, 'preview')
      return viteDev(ctx, pkg)
    case 'vitest':
      return vitest(ctx, pkg, argv)
    case 'tsc':
      return tsc(ctx, argv)
    case 'eslint':
      return eslint(ctx, argv)
    case 'tsx':
      return apiServer(ctx, pkg, argv.filter((x) => x !== 'watch' && !x.startsWith('-'))[0] ?? 'src/server.ts', argv[0] === 'watch')
    case 'node':
      return apiServer(ctx, pkg, argv[0] ?? 'dist/server.js', false)
    case 'concurrently':
      return concurrently(ctx, pkg, argv)
    case 'echo':
      ctx.print(argv.join(' '))
      return 0
    case 'exit':
      return Number(argv[0] ?? 0)
    case 'npm': {
      // Nested npm (`npm run dev -w web`) runs relative to this package.
      const a = parseArgs(argv)
      if (a.sub === 'run' || a.sub === 'run-script') {
        const script = a.rest.shift() ?? ''
        return runScripts(withCwd(ctx, pkg.dir), script, a)
      }
      if (a.sub === 'test' || a.sub === 't') return runScripts(withCwd(ctx, pkg.dir), 'test', a)
      return 0
    }
    default:
      ctx.print(`'${bin}' is not recognized as an internal or external command,`, 'operable program or batch file.')
      return 1
  }
}

const PREFIX_SGR: Record<string, string> = {
  black: '30', red: '31', green: '32', yellow: '33', blue: '34', magenta: '35', cyan: '36', white: '37', gray: '90', grey: '90'
}

/** `concurrently -n api,web -c blue,magenta "cmd" "cmd"`: every command at once, each line tagged. */
async function concurrently(ctx: Ctx, pkg: Pkg, argv: string[]): Promise<number> {
  let names: string[] = []
  let colors: string[] = []
  const commands: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-n' || a === '--names') names = (argv[++i] ?? '').split(',')
    else if (a === '-c' || a === '--prefix-colors') colors = (argv[++i] ?? '').split(',')
    else if (!a.startsWith('-')) commands.push(a)
  }
  const tagOf = (i: number): string => `\x1b[${PREFIX_SGR[colors[i] ?? ''] ?? '0'}m[${names[i] || i}]\x1b[0m `
  const codes = await Promise.all(commands.map((cmd, i) => runTool(tagged(ctx, tagOf(i)), pkg, cmd)))
  if (!ctx.cancelled) commands.forEach((cmd, i) => ctx.print(`${tagOf(i)}${cmd} exited with code ${codes[i]}`))
  return codes.find((c) => c !== 0) ?? 0
}

/** A view of `ctx` whose output has `tag` at the start of every line. */
function tagged(ctx: Ctx, tag: string): Ctx {
  let lineStart = true
  const write = (s: string): void => {
    let out = ''
    for (const piece of s.split(/(\r?\n)/)) {
      if (piece === '') continue
      if (/^\r?\n$/.test(piece)) {
        if (lineStart) out += tag
        out += piece
        lineStart = true
      } else {
        out += lineStart ? tag + piece : piece
        lineStart = false
      }
    }
    ctx.write(out)
  }
  const view = Object.create(ctx) as Ctx
  Object.defineProperty(view, 'write', { value: write })
  Object.defineProperty(view, 'print', { value: (...lines: string[]) => write(lines.map((l) => l + '\r\n').join('')) })
  return view
}

/** The same context, looking at another directory (scripts run in their package dir). */
function withCwd(ctx: Ctx, cwd: string): Ctx {
  const sh = Object.create(ctx.sh) as Ctx['sh']
  Object.defineProperty(sh, 'cwd', { value: cwd })
  const view = Object.create(ctx) as Ctx
  Object.defineProperty(view, 'sh', { value: sh })
  return view
}

/** `npx <pkg>`: a registry program (claude, codex…), a local tool, or a 404. */
export async function npx(ctx: Ctx): Promise<number> {
  const args = [...ctx.argv]
  let pkgName: string | null = null
  const rest: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (pkgName === null && (a === '-y' || a === '--yes' || a === '--no-install' || a === '-q' || a === '--quiet')) continue
    if (pkgName === null && (a === '-p' || a === '--package')) {
      i++
      continue
    }
    if (pkgName === null && a.startsWith('--package=')) continue
    if (pkgName === null) pkgName = a
    else rest.push(a)
  }
  if (!pkgName) {
    ctx.print(npmErr('npx requires a package or command to run'))
    return 1
  }
  if (pkgName === '-v' || pkgName === '--version') {
    ctx.print(ctx.backend.scenario.machine.versions.npm ?? '10.9.3')
    return 0
  }
  const bare = pkgName.replace(/(.)@[^/]*$/, '$1')
  const spec = ctx.backend.programs.get(bare)
  if (spec) {
    await ctx.sleep(500 + Math.random() * 300)
    return ctx.launch(spec, spec.name, rest)
  }
  const pkg = findPkg(ctx, ctx.sh.cwd)
  if (pkg && ['vite', 'vitest', 'tsc', 'eslint', 'tsx'].includes(bare)) {
    return runTool(ctx, pkg, [bare, ...rest].join(' '))
  }
  await ctx.sleep(1100)
  ctx.print(
    npmErr('code E404'),
    npmErr(`404 Not Found - GET https://registry.npmjs.org/${bare} - Not found`),
    npmErr('404'),
    npmErr(`404  '${bare}@*' is not in this registry.`),
    npmErr('404'),
    npmErr('404 Note that you can also install from a'),
    npmErr('404 tarball, folder, http url, or git url.'),
    npmErr(`A complete log of this run can be found in: ${logPath()}`)
  )
  return 1
}

