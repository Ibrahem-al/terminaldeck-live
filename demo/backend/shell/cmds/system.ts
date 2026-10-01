/**
 * Everything that isn't files, git or npm: the demo's `help`, echo, env
 * vars, clear, dates, whoami/hostname, where/which/Get-Command, ping, curl /
 * Invoke-WebRequest, tree, python/cargo/winget, `code <file>`, sleep.
 */
import { CRLF, clearScreen, sgr } from '../../util/ansi'
import { psError } from '../dialect'
import { envGet } from '../parse'
import type { CommandFn, Ctx } from './context'
import { bashDate, pace, psLongDate, readLine, startup } from './context'
import { list, readText, resolve, stat } from './paths'
import { findPkg } from './pkg'
import { apiServer } from './tools'
import { fqid } from './psbind'

const bold = (s: string): string => `${sgr.bold}${s}${sgr.reset}`
const dim = (s: string): string => `${sgr.dim}${s}${sgr.reset}`

/* ─────────────────────────────── help ─────────────────────────────── */

export const help: CommandFn = (ctx) => {
  const f = ctx.d.family
  const agents = ctx.backend.programs
    .list()
    .filter((p) => p.kind === 'agent')
    .map((p) => p.name)
  const files =
    f === 'ps'
      ? 'ls, cd, pwd, cat, mkdir, ni, rm, mv, cp, tree, code <file>'
      : f === 'cmd'
        ? 'dir, cd, type, md, del, rd, move, copy, ren, tree, code <file>'
        : 'ls, cd, pwd, cat, mkdir, touch, rm, mv, cp, grep, find, head, code <file>'
  const system =
    f === 'ps'
      ? 'whoami, hostname, Get-Date, ping, curl localhost:5173, gcm, history, $env:NAME, cls, exit'
      : f === 'cmd'
        ? 'whoami, hostname, date /t, ping, curl localhost:5173, where, set, ver, cls, exit'
        : 'whoami, hostname, date, ping, curl localhost:5173, which, history, env, clear, exit'
  const width = Math.max(24, ctx.cols - 1)
  // Rows wrap under their own text, so the listing reads right in a narrow pane.
  const row = (label: string, text: string, tail = ''): string[] =>
    wordWrap(text + (tail ? ` ${tail}` : ''), width - 11).map((l, i) => {
      const body = tail && l.endsWith(tail) ? `${l.slice(0, -tail.length)}${dim(tail)}` : l
      return i === 0 ? `  ${bold(label.padEnd(6))}   ${body}` : `           ${body}`
    })
  ctx.print(
    '',
    ...wordWrap('This is a simulated terminal in the TerminalDeck web demo.', width).map(bold),
    ...wordWrap('It runs entirely in your browser — nothing here touches your computer. Try:', width).map(dim),
    '',
    ...row('Files', files),
    ...row('Git', 'git status | log --oneline | diff | add | commit -m "…" | push | checkout -b'),
    ...row('Node', 'npm install | test | run dev | run build | run lint, node -v, npx …'),
    ...row('Agents', agents.length ? agents.join(', ') : '(loading…)', '(or press Ctrl+Enter to start claude)'),
    ...row('System', system),
    '',
    ...wordWrap('Keys: ↑/↓ history · Tab completes · Ctrl+C stops · Ctrl+L clears · Esc clears the line', width).map(dim),
    ''
  )
  return 0
}

/** Break at spaces to fit `width` columns (plain text). */
function wordWrap(text: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) out.push(line)
  return out
}

/* ─────────────────────────── echo & friends ─────────────────────────── */

export const psEcho: CommandFn = (ctx) => {
  if (ctx.argv.length) ctx.print(...ctx.argv)
  return 0
}

const PS_COLORS: Record<string, string> = {
  black: '30', darkblue: '34', darkgreen: '32', darkcyan: '36', darkred: '31', darkmagenta: '35', darkyellow: '33', gray: '37',
  darkgray: '90', blue: '94', green: '92', cyan: '96', red: '91', magenta: '95', yellow: '93', white: '97'
}

export const writeHost: CommandFn = (ctx) => {
  const words: string[] = []
  let colour = ''
  let newline = true
  for (let i = 0; i < ctx.argv.length; i++) {
    const a = ctx.argv[i].toLowerCase()
    if (a === '-foregroundcolor' || a === '-fore' || a === '-f') colour = PS_COLORS[ctx.argv[++i]?.toLowerCase() ?? ''] ?? ''
    else if (a === '-nonewline') newline = false
    else if (a === '-backgroundcolor') i++
    else words.push(ctx.argv[i])
  }
  const text = words.join(' ')
  ctx.write((colour ? `\x1b[${colour}m${text}${sgr.reset}` : text) + (newline ? CRLF : ''))
  return 0
}

export const bashEcho: CommandFn = (ctx) => {
  const args = [...ctx.argv]
  let newline = true
  let escapes = false
  while (args[0] && /^-[neE]+$/.test(args[0])) {
    const flag = args.shift() ?? ''
    if (flag.includes('n')) newline = false
    if (flag.includes('e')) escapes = true
  }
  let text = args.join(' ')
  if (escapes) text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\e|\\033/g, '\x1b')
  ctx.write(text.replace(/\n/g, CRLF) + (newline ? CRLF : ''))
  return 0
}

export const cmdEcho: CommandFn = (ctx) => {
  // cmd echoes the rest of the line verbatim, quotes and spacing included.
  const raw = ctx.line.slice(ctx.offset).replace(/^echo(\.|\s)?/i, (_m, sep: string | undefined) => (sep === '.' ? '.' : ''))
  if (raw === '.') {
    ctx.print('')
    return 0
  }
  if (raw.trim() === '') ctx.print('ECHO is on.')
  else ctx.print(raw.replace(/^\./, ''))
  return 0
}

export const clear: CommandFn = (ctx) => {
  ctx.write(clearScreen())
  return 0
}

/* ───────────────────────────── env vars ───────────────────────────── */

export const cmdSet: CommandFn = (ctx) => {
  const raw = ctx.line.slice(ctx.offset).replace(/^set\s*/i, '')
  const env = ctx.sh.env
  const eq = raw.indexOf('=')
  if (eq > 0) {
    const name = raw.slice(0, eq).trim()
    const value = raw.slice(eq + 1)
    if (value === '') delete env[name]
    else env[name] = value
    return 0
  }
  const prefix = raw.trim().toLowerCase()
  const rows = Object.entries(env)
    .filter(([k]) => k.toLowerCase().startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  if (rows.length === 0) {
    ctx.print(`Environment variable ${raw.trim()} not defined`)
    return 1
  }
  ctx.print(...rows.map(([k, v]) => `${k}=${v}`))
  return 0
}

export const bashExport: CommandFn = (ctx) => {
  for (const a of ctx.argv) {
    const eq = a.indexOf('=')
    if (eq > 0) ctx.sh.env[a.slice(0, eq)] = a.slice(eq + 1)
  }
  return 0
}

export const bashEnv: CommandFn = async (ctx) => {
  const vfs = ctx.backend.vfs
  const env = { ...ctx.sh.env, HOME: vfs.toPosix(ctx.backend.scenario.machine.home), PWD: vfs.toPosix(ctx.sh.cwd), SHELL: '/usr/bin/bash', MSYSTEM: 'MINGW64', TERM: 'xterm-256color' }
  if (ctx.name === 'printenv' && ctx.argv[0]) {
    const v = envGet(env, ctx.argv[0])
    if (v === undefined) return 1
    ctx.print(v)
    return 0
  }
  await pace(ctx, Object.entries(env).map(([k, v]) => `${k}=${k.toLowerCase() === 'path' ? v.split(';').map((p) => vfs.toPosix(p)).join(':') : v}`).join(CRLF) + CRLF)
  return 0
}

/** `ls env:` / `Get-ChildItem Env:` */
export async function psEnvTable(ctx: Ctx, filter: string): Promise<number> {
  const rows = Object.entries(ctx.sh.env)
    .filter(([k]) => !filter || new RegExp(`^${filter.replace(/\*/g, '.*')}$`, 'i').test(k))
    .sort(([a], [b]) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  const w = Math.max(4, ...rows.map(([k]) => k.length)) + 1
  const head = ctx.d.ps7 ? '\x1b[32;1m' : ''
  const reset = ctx.d.ps7 ? '\x1b[0m' : ''
  const maxV = Math.max(10, ctx.cols - w - 2)
  const lines = [
    '',
    `${head}${'Name'.padEnd(w)}Value${reset}`,
    `${head}${'----'.padEnd(w)}-----${reset}`,
    ...rows.map(([k, v]) => `${k.padEnd(w)}${v.length > maxV ? v.slice(0, maxV - 3) + '...' : v}`),
    ''
  ]
  if (!ctx.d.ps7) lines.push('')
  await pace(ctx, lines.join(CRLF))
  return 0
}

/* ───────────────────────────── identity ───────────────────────────── */

export const whoami: CommandFn = (ctx) => {
  const m = ctx.backend.scenario.machine
  ctx.print(ctx.d.family === 'bash' ? m.user : `${m.hostname.toLowerCase()}\\${m.user}`)
  return 0
}

export const hostname: CommandFn = (ctx) => {
  ctx.print(ctx.backend.scenario.machine.hostname)
  return 0
}

export const ver: CommandFn = (ctx) => {
  ctx.print('', `Microsoft Windows [Version ${ctx.backend.scenario.machine.versions.windows ?? '10.0.26200.6584'}]`)
  return 0
}

export const getDate: CommandFn = (ctx) => {
  if (ctx.d.family === 'bash') {
    ctx.print(bashDate(Date.now()))
    return 0
  }
  const lines = ['', psLongDate(Date.now()), '']
  if (!ctx.d.ps7) lines.push('')
  ctx.print(...lines)
  return 0
}

/** cmd's `date` / `time`: `/t` prints; otherwise it asks for a new value, like the real thing. */
export const cmdDateTime =
  (which: 'date' | 'time'): CommandFn =>
  async (ctx) => {
    const d = new Date()
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const two = (n: number): string => String(n).padStart(2, '0')
    const dateText = `${days[d.getDay()]} ${two(d.getMonth() + 1)}/${two(d.getDate())}/${d.getFullYear()}`
    const h12 = d.getHours() % 12 || 12
    if (ctx.argv.some((a) => a.toLowerCase() === '/t')) {
      ctx.print(which === 'date' ? dateText : `${two(h12)}:${two(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`)
      return 0
    }
    if (which === 'date') ctx.write(`The current date is: ${dateText}${CRLF}Enter the new date: (mm-dd-yy) `)
    else ctx.write(`The current time is: ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${two(Math.floor(d.getMilliseconds() / 10))}${CRLF}Enter the new time: `)
    const answer = await readLine(ctx)
    if (answer === null) {
      ctx.print('^C')
      return 1
    }
    if (answer.trim()) {
      ctx.print('A required privilege is not held by the client.')
      return 1
    }
    return 0
  }

/* ─────────────────────── where / which / gcm ─────────────────────── */

function exePath(ctx: Ctx, name: string): string | null {
  const home = ctx.backend.scenario.machine.home
  const lower = name.toLowerCase().replace(/\.(exe|cmd|bat|com)$/, '')
  const known: Record<string, string> = {
    node: 'C:\\Program Files\\nodejs\\node.exe',
    npm: 'C:\\Program Files\\nodejs\\npm.cmd',
    npx: 'C:\\Program Files\\nodejs\\npx.cmd',
    git: 'C:\\Program Files\\Git\\cmd\\git.exe',
    python: `${home}\\AppData\\Local\\Programs\\Python\\Python313\\python.exe`,
    py: 'C:\\WINDOWS\\py.exe',
    cargo: `${home}\\.cargo\\bin\\cargo.exe`,
    rustc: `${home}\\.cargo\\bin\\rustc.exe`,
    code: `${home}\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd`,
    curl: 'C:\\WINDOWS\\System32\\curl.exe',
    ping: 'C:\\WINDOWS\\System32\\PING.EXE',
    whoami: 'C:\\WINDOWS\\System32\\whoami.exe',
    hostname: 'C:\\WINDOWS\\System32\\HOSTNAME.EXE',
    tree: 'C:\\WINDOWS\\System32\\tree.com',
    where: 'C:\\WINDOWS\\System32\\where.exe',
    winget: `${home}\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe`,
    powershell: 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    pwsh: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    cmd: 'C:\\WINDOWS\\System32\\cmd.exe',
    bash: 'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    claude: `${home}\\.local\\bin\\claude.exe`
  }
  if (known[lower]) return known[lower]
  const spec = ctx.backend.programs.get(lower)
  if (spec) return `${home}\\AppData\\Roaming\\npm\\${spec.name}.cmd`
  return null
}

export const where: CommandFn = (ctx) => {
  const names = ctx.argv.filter((a) => !a.startsWith('/'))
  let code = 0
  for (const n of names) {
    const p = exePath(ctx, n)
    if (!p) {
      ctx.print('INFO: Could not find files for the given pattern(s).')
      code = 1
      continue
    }
    // npm-installed tools have an extensionless shell shim beside the .cmd.
    if (p.endsWith('.cmd')) ctx.print(p.slice(0, -4), p)
    else ctx.print(p)
  }
  return code
}

export const which: CommandFn = (ctx) => {
  const vfs = ctx.backend.vfs
  let code = 0
  for (const n of ctx.argv.filter((a) => !a.startsWith('-'))) {
    const p = exePath(ctx, n)
    if (!p) {
      ctx.print(`which: no ${n} in (/c/Users/dev/bin:/mingw64/bin:/usr/local/bin:/usr/bin:/bin:/c/WINDOWS/system32:/c/Program Files/nodejs:/c/Users/dev/AppData/Roaming/npm)`)
      code = 1
      continue
    }
    ctx.print(vfs.toPosix(p).replace(/\.(exe|cmd)$/i, ''))
  }
  return code
}

export function getCommand(isBuiltin: (name: string) => string | null): CommandFn {
  return (ctx) => {
    const names = ctx.argv.filter((a) => !a.startsWith('-'))
    const head = ctx.d.ps7 ? '\x1b[32;1m' : ''
    const reset = ctx.d.ps7 ? '\x1b[0m' : ''
    const rows: string[] = []
    let code = 0
    for (const n of names) {
      const cmdlet = isBuiltin(n)
      if (cmdlet) {
        const isAlias = cmdlet.toLowerCase() !== n.toLowerCase()
        rows.push(
          isAlias
            ? `${'Alias'.padEnd(16)}${`${n} -> ${cmdlet}`.padEnd(51)}${''.padEnd(11)}`
            : `${'Cmdlet'.padEnd(16)}${cmdlet.padEnd(51)}${(ctx.d.ps7 ? '7.0.0.0' : '3.1.0.0').padEnd(11)}Microsoft.PowerShell.Management`
        )
        continue
      }
      const p = exePath(ctx, n)
      if (!p) {
        const w = ctx.words.find((x) => x.value === n)
        ctx.write(
          psError(ctx.d.ps7, {
            source: 'Get-Command',
            message: ctx.d.ps7
              ? `The term '${n}' is not recognized as a name of a cmdlet, function, script file, or executable program.\nCheck the spelling of the name, or if a path was included, verify that the path is correct and try again.`
              : `The term '${n}' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.`,
            line: ctx.line,
            offset: w?.start ?? 0,
            length: n.length,
            category: `ObjectNotFound: (${n}:String) [Get-Command], CommandNotFoundException`,
            fqid: fqid('Get-Command', 'CommandNotFoundException')
          })
        )
        code = 1
        continue
      }
      const file = p.split('\\').pop() ?? n
      const version = /node/i.test(file) ? '22.19.0.0' : /git/i.test(file) ? '2.51.0.1' : '0.0.0.0'
      rows.push(`${'Application'.padEnd(16)}${file.padEnd(51)}${version.padEnd(11)}${p}`)
    }
    if (rows.length) {
      ctx.print(
        '',
        `${head}${'CommandType'.padEnd(16)}${'Name'.padEnd(51)}${'Version'.padEnd(11)}Source${reset}`,
        `${head}${'-----------'.padEnd(16)}${'----'.padEnd(51)}${'-------'.padEnd(11)}------${reset}`,
        // Format-Table cuts a row at the console width instead of letting it wrap.
        ...rows.map((r) => (r.length > ctx.cols ? `${r.slice(0, Math.max(1, ctx.cols - (ctx.d.ps7 ? 1 : 3)))}${ctx.d.ps7 ? '…' : '...'}` : r)),
        ''
      )
      if (!ctx.d.ps7) ctx.print('')
    }
    return code
  }
}

/* ──────────────────────────── network ──────────────────────────── */

const HOSTS: Record<string, string> = {
  'github.com': '140.82.121.4',
  'google.com': '142.250.185.78',
  'www.google.com': '142.250.185.100',
  'example.com': '23.215.0.136',
  'anthropic.com': '160.79.104.10',
  'claude.ai': '160.79.104.10',
  'openai.com': '104.18.33.45',
  'npmjs.com': '104.16.3.35',
  'registry.npmjs.org': '104.16.1.35',
  '1.1.1.1': '1.1.1.1',
  '8.8.8.8': '8.8.8.8'
}

function lookup(host: string): string | null {
  const h = host.toLowerCase()
  if (HOSTS[h]) return HOSTS[h]
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return h
  if (!h.includes('.')) return null
  let x = 0
  for (const c of h) x = (x * 33 + c.charCodeAt(0)) >>> 0
  return `${104 + (x % 60)}.${(x >> 8) % 256}.${(x >> 16) % 256}.${1 + ((x >> 24) % 250)}`
}

export const ping: CommandFn = async (ctx) => {
  const args = ctx.argv
  const host = args.filter((a, i) => !a.startsWith('-') && !a.startsWith('/') && !['-n', '/n', '-l', '-w'].includes(args[i - 1] ?? '')).pop()
  if (!host) {
    ctx.print('', 'Usage: ping [-t] [-a] [-n count] [-l size] [-f] [-i TTL] [-v TOS]', '            [-r count] [-s count] [[-j host-list] | [-k host-list]]', '            [-w timeout] [-R] [-S srcaddr] [-c compartment] [-p]', '            [-4] [-6] target_name', '')
    return 1
  }
  const forever = args.includes('-t') || args.includes('/t')
  const nIdx = args.findIndex((a) => a === '-n' || a === '/n')
  const count = forever ? Infinity : nIdx >= 0 ? Math.max(1, Number(args[nIdx + 1]) || 4) : 4
  const local = /^(localhost|127\.0\.0\.1|::1)$/i.test(host)
  const ip = local ? '::1' : lookup(host)
  await startup(ctx, 30)
  if (!ip) {
    ctx.print(`Ping request could not find host ${host}. Please check the name and try again.`)
    return 1
  }
  const label = local ? `${ctx.backend.scenario.machine.hostname} [::1]` : ip === host ? host : `${host} [${ip}]`
  ctx.print('', `Pinging ${label} ${local ? 'with' : 'with'} 32 bytes of data:`)
  const times: number[] = []
  let sent = 0
  const stats = (): void => {
    const min = Math.min(...times)
    const max = Math.max(...times)
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / Math.max(1, times.length))
    ctx.print(
      '',
      `Ping statistics for ${ip}:`,
      `    Packets: Sent = ${sent}, Received = ${times.length}, Lost = 0 (0% loss),`,
      'Approximate round trip times in milli-seconds:',
      `    Minimum = ${local ? 0 : min}ms, Maximum = ${local ? 0 : max}ms, Average = ${local ? 0 : avg}ms`
    )
  }
  // ping.exe prints its statistics on Ctrl+C whether or not it was counting (-n) or endless (-t).
  ctx.onInput((data) => {
    if (data.includes('\x03')) {
      stats()
      ctx.print('Control-C', '^C')
      stop?.()
    }
  }, { interrupt: true })
  let stop: (() => void) | null = null
  const stopped = new Promise<void>((resolve) => {
    stop = resolve
  })
  for (let i = 0; i < count; i++) {
    const t = local ? 0 : 14 + Math.round(Math.random() * 9)
    times.push(t)
    sent++
    ctx.print(local ? 'Reply from ::1: time<1ms' : `Reply from ${ip}: bytes=32 time=${t}ms TTL=56`)
    if (i < count - 1) {
      const next = ctx.sleep(1000)
      if ((await Promise.race([next.then(() => 'tick'), stopped.then(() => 'stop')])) === 'stop') return 1
    }
  }
  stats()
  return 0
}

function parseUrl(raw: string): { host: string; port: number; path: string } | null {
  const m = /^(?:(https?):\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/i.exec(raw)
  if (!m) return null
  const scheme = (m[1] ?? 'http').toLowerCase()
  return { host: m[2].toLowerCase(), port: Number(m[3] ?? (scheme === 'https' ? 443 : 80)), path: m[4] ?? '/' }
}

function httpBody(ctx: Ctx, url: { host: string; port: number; path: string }): string | null {
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.host)) return null
  const server = ctx.svc.servers.get(url.port)
  return server ? server.body() : null
}

/** curl.exe (cmd, Git Bash, PowerShell 7). */
export const curl: CommandFn = async (ctx) => {
  const args = ctx.argv
  const target = args.find((a, i) => !a.startsWith('-') && !['-o', '-H', '-X', '-d', '--data', '-u'].includes(args[i - 1] ?? ''))
  if (args.includes('--version') || args.includes('-V')) {
    ctx.print('curl 8.14.1 (Windows) libcurl/8.14.1 Schannel zlib/1.3.1 WinIDN WinLDAP', 'Release-Date: 2025-06-04', 'Protocols: dict file ftp ftps http https imap imaps ldap ldaps mqtt pop3 pop3s smtp smtps telnet tftp ws wss', 'Features: alt-svc AsynchDNS HSTS HTTPS-proxy IDN IPv6 Kerberos Largefile libz NTLM SPNEGO SSL SSPI threadsafe Unicode UnixSockets')
    return 0
  }
  if (!target) {
    ctx.print("curl: try 'curl --help' for more information")
    return 2
  }
  const url = parseUrl(target)
  if (!url) {
    ctx.print(`curl: (3) URL rejected: Malformed input to a URL function`)
    return 3
  }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.host)
  await ctx.sleep(local ? 60 : 400)
  const body = httpBody(ctx, url)
  if (body === null) {
    if (local) {
      await ctx.sleep(2100)
      ctx.print(`curl: (7) Failed to connect to ${url.host} port ${url.port} after ${2200 + Math.round(Math.random() * 60)} ms: Could not connect to server`)
      return 7
    }
    ctx.print(`curl: (6) Could not resolve host: ${url.host}`)
    return 6
  }
  if (args.includes('-I') || args.includes('--head')) {
    ctx.print('HTTP/1.1 200 OK', 'Vary: Origin', `Content-Type: ${body.startsWith('{') ? 'application/json' : 'text/html'}`, 'Cache-Control: no-cache', `Date: ${new Date().toUTCString()}`, 'Connection: keep-alive', 'Keep-Alive: timeout=5', '')
    return 0
  }
  await pace(ctx, body.replace(/\n/g, CRLF))
  return 0
}

/** Windows PowerShell's `curl` / `iwr` alias for Invoke-WebRequest. */
export const invokeWebRequest: CommandFn = async (ctx) => {
  const target = ctx.argv.find((a) => !a.startsWith('-'))
  if (!target) {
    ctx.print('', 'cmdlet Invoke-WebRequest at command pipeline position 1', 'Supply values for the following parameters:')
    return 1
  }
  const url = parseUrl(target)
  const body = url ? httpBody(ctx, url) : null
  await ctx.sleep(body === null ? 2200 : 120)
  if (body === null) {
    ctx.write(
      psError(ctx.d.ps7, {
        source: 'Invoke-WebRequest',
        message: ctx.d.ps7 ? `No connection could be made because the target machine actively refused it. (${url?.host ?? target}:${url?.port ?? 80})` : 'Unable to connect to the remote server',
        line: ctx.line,
        offset: ctx.offset,
        length: ctx.line.length - ctx.offset,
        category: 'InvalidOperation: (System.Net.HttpWebRequest:HttpWebRequest) [Invoke-WebRequest], WebException',
        fqid: 'WebCmdletWebResponseException,Microsoft.PowerShell.Commands.InvokeWebRequestCommand'
      })
    )
    return 1
  }
  const lines = body.split('\n')
  const indent = ' '.repeat(20)
  const content = lines.slice(0, 5).map((l, i) => (i === 0 ? l : indent + l)).join(CRLF) + (lines.length > 5 ? '...' : '')
  const type = body.startsWith('{') ? 'application/json' : 'text/html'
  const out = [
    '',
    '',
    `StatusCode        : 200`,
    `StatusDescription : OK`,
    `Content           : ${content}`,
    `RawContent        : HTTP/1.1 200 OK`,
    `${indent}Vary: Origin`,
    `${indent}Connection: keep-alive`,
    `${indent}Keep-Alive: timeout=5`,
    `${indent}Content-Type: ${type}`,
    `${indent}Cache-Control: no-cache...`,
    'Forms             : {}',
    `Headers           : {[Vary, Origin], [Connection, keep-alive], [Keep-Alive, timeout=5], [Content-Type, ${type}]...}`,
    'Images            : {}',
    'InputFields       : {}',
    'Links             : {}',
    'ParsedHtml        : mshtml.HTMLDocumentClass',
    `RawContentLength  : ${new TextEncoder().encode(body).length}`,
    '',
    '',
    ''
  ]
  await pace(ctx, out.join(CRLF))
  return 0
}

/* ──────────────────────────── misc tools ──────────────────────────── */

export const tree: CommandFn = async (ctx) => {
  const files = ctx.argv.some((a) => a.toLowerCase() === '/f')
  const target = ctx.argv.find((a) => !a.startsWith('/'))
  const root = target ? resolve(ctx, target) : ctx.sh.cwd
  const s = stat(ctx, root)
  if (!s || !s.isDir) {
    ctx.print('Folder PATH listing', 'Volume serial number is 6C3A-91F2', `Invalid path - ${target ? root.slice(2).toUpperCase() : '\\'}`, 'No subfolders exist ', '')
    return 1
  }
  const lines = ['Folder PATH listing', 'Volume serial number is 6C3A-91F2', target ? s.path.toUpperCase() : 'C:.']
  const walk = (dir: string, prefix: string): void => {
    const entries = list(ctx, dir)
    const dirs = entries.filter((e) => e.isDir)
    if (files) {
      const fl = entries.filter((e) => !e.isDir)
      const bar = dirs.length ? '│   ' : '    '
      for (const f of fl) lines.push(`${prefix}${bar}${f.name}`)
      if (fl.length) lines.push(`${prefix}${bar}`.trimEnd() === '' ? '' : `${prefix}${bar}`)
    }
    dirs.forEach((d, i) => {
      const last = i === dirs.length - 1
      lines.push(`${prefix}${last ? '└───' : '├───'}${d.name}`)
      if (d.name !== 'node_modules') walk(d.path, prefix + (last ? '    ' : '│   '))
    })
  }
  walk(s.path, '')
  if (lines.length === 3) lines.push('No subfolders exist ')
  lines.push('')
  await pace(ctx, lines.join(CRLF) + CRLF, { perTick: 12, tickMs: 20 })
  return 0
}

export const python: CommandFn = async (ctx) => {
  const v = ctx.backend.scenario.machine.versions.python ?? '3.13.7'
  if (ctx.argv.includes('--version') || ctx.argv.includes('-V')) {
    ctx.print(`Python ${v}`)
    return 0
  }
  if (ctx.argv.length > 0) {
    const file = ctx.argv.find((a) => !a.startsWith('-'))
    if (file && !ctx.backend.vfs.exists(resolve(ctx, file))) {
      ctx.print(`${ctx.backend.scenario.machine.home}\\AppData\\Local\\Programs\\Python\\Python313\\python.exe: can't open file '${resolve(ctx, file)}': [Errno 2] No such file or directory`)
      return 2
    }
    return 0
  }
  await ctx.sleep(120)
  ctx.print(`Python ${v} (tags/v${v}:bcee1c3, Aug 14 2025, 14:15:11) [MSC v.1944 64 bit (AMD64)] on win32`, 'Type "help", "copyright", "credits" or "license" for more information.')
  for (let n = 0; ; n++) {
    ctx.write('>>> ')
    const line = await readLine(ctx)
    if (line === null) {
      ctx.print('', 'KeyboardInterrupt')
      continue
    }
    const src = line.trim()
    if (src === '') continue
    if (/^(exit|quit)\(\)$/.test(src) || src === '\x1a') return 0
    if (src === 'exit' || src === 'quit') return 0
    const printed = /^print\((.*)\)$/.exec(src)
    const expr = printed ? printed[1] : src
    const str = /^(['"])(.*)\1$/.exec(expr)
    if (str) {
      ctx.print(printed ? str[2] : `'${str[2]}'`)
      continue
    }
    if (/^[\d\s+\-*/().%]+$/.test(expr)) {
      const value = arithmetic(expr.replace(/\/\//g, '/'))
      if (value !== null) {
        ctx.print(String(value))
        continue
      }
    }
    const name = /^[A-Za-z_]\w*/.exec(expr)?.[0] ?? expr
    ctx.print('Traceback (most recent call last):', `  File "<python-input-${n}>", line 1, in <module>`, `    ${src}`, `NameError: name '${name}' is not defined`)
  }
}

/** Evaluate + - * / % and parentheses without eval. */
function arithmetic(src: string): number | null {
  const tokens = src.match(/\d+(?:\.\d+)?|[+\-*/%()]/g)
  if (!tokens) return null
  let i = 0
  const expr = (): number => {
    let v = term()
    while (tokens[i] === '+' || tokens[i] === '-') v = tokens[i++] === '+' ? v + term() : v - term()
    return v
  }
  const term = (): number => {
    let v = factor()
    while (tokens[i] === '*' || tokens[i] === '/' || tokens[i] === '%') {
      const op = tokens[i++]
      const r = factor()
      v = op === '*' ? v * r : op === '/' ? v / r : v % r
    }
    return v
  }
  const factor = (): number => {
    const t = tokens[i++]
    if (t === '(') {
      const v = expr()
      i++
      return v
    }
    if (t === '-') return -factor()
    return Number(t)
  }
  try {
    const v = expr()
    return i === tokens.length && Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

export { arithmetic }

export const cargo: CommandFn = (ctx) => {
  const v = ctx.backend.scenario.machine.versions
  if (ctx.argv[0] === '--version' || ctx.argv[0] === '-V') {
    ctx.print(`cargo ${v.cargo ?? '1.90.0'}`)
    return 0
  }
  if (ctx.argv.length === 0) {
    ctx.print("Rust's package manager", '', `${sgr.bold}${sgr.green}Usage:${sgr.reset} ${sgr.bold}${sgr.cyan}cargo${sgr.reset} ${sgr.cyan}[OPTIONS] [COMMAND]${sgr.reset}`, '', 'See \'cargo help <command>\' for more information on a specific command.')
    return 0
  }
  ctx.print(`${sgr.bold}${sgr.red}error${sgr.reset}: could not find \`Cargo.toml\` in \`${ctx.sh.cwd}\` or any parent directory`)
  return 101
}

export const rustc: CommandFn = (ctx) => {
  ctx.print(`rustc ${ctx.backend.scenario.machine.versions.rustc ?? '1.90.0'}`)
  return 0
}

export const winget: CommandFn = (ctx) => {
  ctx.print(
    'Windows Package Manager v1.11.430',
    'Copyright (c) Microsoft Corporation. All rights reserved.',
    '',
    dim('This is the TerminalDeck web demo — it can\'t install software.'),
    dim('To get TerminalDeck itself, download the installer from the website; no winget needed.')
  )
  return ctx.argv.length ? 1 : 0
}

/** `code <file>` opens it in TerminalDeck's own editor pane. */
export const code: CommandFn = async (ctx) => {
  const target = ctx.argv.find((a) => !a.startsWith('-'))
  if (!target || ctx.argv.includes('--version') || ctx.argv.includes('-v')) {
    ctx.print('1.104.2', 'e3a5acfb517a443235981655413d566533107e92', 'x64')
    return 0
  }
  const vfs = ctx.backend.vfs
  const path = resolve(ctx, target)
  await ctx.sleep(150)
  const s = stat(ctx, path)
  if (s?.isDir) {
    ctx.print(dim(`The web demo opens files, not folders — try: code ${target.replace(/[\\/]$/, '')}${ctx.d.family === 'bash' ? '/' : '\\'}README.md`))
    return 0
  }
  if (!s) {
    try {
      vfs.writeFile(path, '', { createDirs: false })
    } catch {
      ctx.print(dim(`Can't create ${path}: the folder doesn't exist.`))
      return 1
    }
  }
  const app = ctx.sh.label ? ctx.backend.host.app(ctx.sh.label) : null
  if (!app) {
    ctx.print(dim(`(In the demo, code <file> opens the file in TerminalDeck's editor.)`))
    return 0
  }
  app.editor.useEditorStore.getState().openFile(vfs.stat(path)?.path ?? path)
  return 0
}

/** `Start-Sleep 2` / `sleep 2` / cmd's `timeout /t 5`. */
export const sleep: CommandFn = async (ctx) => {
  const n = Number(ctx.argv.find((a) => /^\d+(\.\d+)?$/.test(a)) ?? 1)
  const ms = ctx.argv.some((a) => /^-m/i.test(a)) ? n : n * 1000
  await ctx.sleep(Math.min(ms, 600_000))
  return 0
}

export const timeout: CommandFn = async (ctx) => {
  const i = ctx.argv.findIndex((a) => a.toLowerCase() === '/t')
  const n = Math.min(99999, Math.max(0, Number(ctx.argv[i + 1] ?? ctx.argv[0]) || 0))
  ctx.write(`${CRLF}Waiting for ${String(n).padStart(2)} seconds, press a key to continue ...`)
  let skipped = false
  ctx.onInput(() => {
    skipped = true
  })
  for (let left = n - 1; left >= 0 && !skipped; left--) {
    await ctx.sleep(1000)
    if (skipped) break
    ctx.write(`\rWaiting for ${String(left).padStart(2)} seconds, press a key to continue ...`)
  }
  ctx.print('')
  return 0
}

export const node: CommandFn = async (ctx) => {
  const v = ctx.backend.scenario.machine.versions.node ?? 'v22.19.0'
  const args = ctx.argv
  if (args[0] === '-v' || args[0] === '--version') {
    ctx.print(v)
    return 0
  }
  if (args[0] === '-e' || args[0] === '-p' || args[0] === '--eval' || args[0] === '--print') {
    const out = evaluate(args.slice(1).join(' '))
    if (out.logs.length) ctx.print(...out.logs)
    if (out.error) {
      ctx.print(`[eval]:1`, args.slice(1).join(' '), '^', '', out.error, '', `Node.js ${v}`)
      return 1
    }
    if (args[0] === '-p' || args[0] === '--print') ctx.print(out.value)
    return 0
  }
  const file = args.find((a) => !a.startsWith('-'))
  if (file) {
    const path = resolve(ctx, file)
    if (!ctx.backend.vfs.exists(path)) {
      ctx.print(
        'node:internal/modules/cjs/loader:1368',
        '  throw err;',
        '  ^',
        '',
        `Error: Cannot find module '${path}'`,
        '    at Function._resolveFilename (node:internal/modules/cjs/loader:1365:15)',
        '    at defaultResolveImpl (node:internal/modules/cjs/loader:1021:19)',
        '    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1026:22)',
        '    at Function._load (node:internal/modules/cjs/loader:1175:37)',
        '    at TracingChannel.traceSync (node:diagnostics_channel:322:14)',
        '    at wrapModuleLoad (node:internal/modules/cjs/loader:235:24)',
        '    at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)',
        '    at node:internal/main/run_main_module:36:49 {',
        "  code: 'MODULE_NOT_FOUND',",
        '  requireStack: []',
        '}',
        '',
        `Node.js ${v}`
      )
      return 1
    }
    const text = readText(ctx, path) ?? ''
    if (/server\.[cm]?[jt]s$/i.test(path)) {
      const pkg = findPkg(ctx, ctx.backend.vfs.dirname(path))
      if (pkg) return apiServer(ctx, pkg, file, false)
    }
    // Modules can't run in the page; a plain script can.
    if (/^\s*(import|export)\s|\brequire\(/m.test(text)) return 0
    const out = evaluate(text, true)
    if (out.logs.length) ctx.print(...out.logs)
    if (out.error) {
      ctx.print(`${path}:1`, '', out.error, '', `Node.js ${v}`)
      return 1
    }
    return 0
  }
  // The REPL.
  ctx.print(`Welcome to Node.js ${v}.`, 'Type ".help" for more information.')
  let armed = false
  for (;;) {
    ctx.write('> ')
    const line = await readLine(ctx)
    if (line === null) {
      if (armed) {
        ctx.print('')
        return 0
      }
      armed = true
      ctx.print('', '(To exit, press Ctrl+C again or Ctrl+D or type .exit)')
      continue
    }
    armed = false
    const src = line.trim()
    if (src === '') continue
    if (src === '.exit') return 0
    if (src === '.help') {
      ctx.print('.break    Sometimes you get stuck, this gets you out', '.clear    Alias for .break', '.editor   Enter editor mode', '.exit     Exit the REPL', '.help     Print this help message', '.load     Load JS from a file into the REPL session', '.save     Save all evaluated commands in this REPL session to a file', '', 'Press Ctrl+C to abort current expression, Ctrl+D to exit the REPL')
      continue
    }
    const out = evaluate(src)
    if (out.logs.length) ctx.print(...out.logs)
    if (out.error) ctx.print(`Uncaught ${out.error}`)
    else ctx.print(out.value)
  }
}

/** Evaluate a JS snippet in the visitor's own page: it is their browser, and only what they type. */
function evaluate(src: string, script = false): { value: string; logs: string[]; error: string | null } {
  const logs: string[] = []
  const show = (v: unknown): string => inspect(v)
  const fakeConsole = { log: (...a: unknown[]) => logs.push(a.map((x) => (typeof x === 'string' ? x : show(x))).join(' ')) }
  try {
    if (script) throw new SyntaxError('not an expression')
    const fn = new Function('console', 'require', 'process', `"use strict"; return (${src})`) as (...a: unknown[]) => unknown
    const value = fn(fakeConsole, () => ({}), { version: 'v22.19.0', platform: 'win32', argv: ['node'], env: {} })
    return { value: show(value), logs, error: null }
  } catch (e) {
    try {
      const fn = new Function('console', `"use strict"; ${src}`) as (...a: unknown[]) => unknown
      fn(fakeConsole)
      return { value: show(undefined), logs, error: null }
    } catch (e2) {
      const err = e2 instanceof Error ? e2 : e instanceof Error ? e : null
      return { value: '', logs, error: err ? `${err.name}: ${err.message}` : String(e2) }
    }
  }
}

function inspect(v: unknown): string {
  if (v === undefined) return `\x1b[90mundefined\x1b[39m`
  if (v === null) return '\x1b[1mnull\x1b[22m'
  if (typeof v === 'number' || typeof v === 'bigint') return `\x1b[33m${String(v)}\x1b[39m`
  if (typeof v === 'boolean') return `\x1b[33m${v}\x1b[39m`
  if (typeof v === 'string') return `\x1b[32m'${v}'\x1b[39m`
  if (typeof v === 'function') return `\x1b[36m[Function: ${v.name || '(anonymous)'}]\x1b[39m`
  try {
    return JSON.stringify(v)
      .replace(/"(\w+)":/g, '$1: ')
      .replace(/,/g, ', ')
      .replace(/^\{/, '{ ')
      .replace(/\}$/, ' }')
  } catch {
    return String(v)
  }
}
