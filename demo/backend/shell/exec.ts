/**
 * Runs one submitted command line: statements (`;` `&&` `||`), pipelines and
 * redirects, PowerShell assignments/expressions, `exit`, builtins, PATH
 * executables, the program registry, and the "not recognized" fallback. It
 * knows nothing about prompts — the terminal shell and the headless `exec`
 * both drive it through an ExecHost.
 */
import type { Backend, ProgramSpec, Timers, WindowLabel } from '../contracts'
import { CRLF, stripAnsi } from '../util/ansi'
import { builtin } from './cmds'
import type { CommandFn, Ctx, ShellServices, ShellState } from './cmds/context'
import { arithmetic } from './cmds/system'
import { demoTip, notFound, psError, type Dialect } from './dialect'
import { expandCmdVars, parseLine, type Pipeline, type SimpleCommand } from './parse'

export interface ExecHost {
  backend: Backend
  svc: ShellServices
  state: ShellState
  dialect: Dialect
  cols(): number
  rows(): number
  /** Terminal (or capture) output. */
  write(s: string): void
  /** Output reaches a terminal (colour, TUIs, interactive prompts). */
  tty: boolean
  label: WindowLabel | undefined
  /** Route raw input to the running command (null to stop). */
  setInput(cb: ((data: string) => void) | null, interrupt: boolean): void
  /** Give the terminal to a registry program; null when there is no terminal. */
  launch: ((spec: ProgramSpec, name: string, argv: string[], commandLine: string) => Promise<number>) | null
  /** `exit [n]` */
  exit(code: number): void
}

export interface LineRun {
  /** Resolves with the line's exit code (the interrupt code after Ctrl+C). */
  done: Promise<number>
  /** Ctrl+C: stop whatever runs now. Returns false when the line already finished. */
  cancel(): boolean
}

interface Frame {
  timers: Timers
  defers: Array<() => void>
}

export function runLine(host: ExecHost, typed: string): LineRun {
  const expandEnv = {
    env: host.state.env,
    home: host.backend.scenario.machine.home,
    cwd: host.state.cwd,
    posix: (p: string) => host.backend.vfs.toPosix(p)
  }
  // cmd expands %VARS% before it parses anything; offsets then refer to the expanded text.
  const line = host.dialect.family === 'cmd' ? expandCmdVars(typed, expandEnv) : typed
  let cancelled = false
  let finished = false
  let frame: Frame | null = null
  let abort: (code: number) => void = () => undefined

  const closeFrame = (): void => {
    const f = frame
    frame = null
    if (!f) return
    f.timers.dispose()
    for (const d of f.defers.splice(0)) {
      try {
        d()
      } catch (err) {
        console.error('[demo] shell cleanup failed', err)
      }
    }
    host.setInput(null, false)
  }

  const aborted = new Promise<number>((resolve) => {
    abort = resolve
  })

  const work = (async (): Promise<number> => {
    const d = host.dialect
    const parsed = parseLine(line, d.family, d.ps7, expandEnv)
    if (!parsed.ok) {
      host.write(parseErrorText(d, line, parsed.error))
      return d.family === 'bash' ? 2 : 1
    }
    let code = 0
    for (const p of parsed.pipelines) {
      if (cancelled) break
      if (p.op === '&&' && code !== 0) continue
      if (p.op === '||' && code === 0) continue
      code = await runPipeline(p)
    }
    return code
  })()

  async function runPipeline(p: Pipeline): Promise<number> {
    let stdin: string | null = null
    let code = 0
    for (let i = 0; i < p.commands.length; i++) {
      if (cancelled) return code
      const cmd = p.commands[i]
      const last = i === p.commands.length - 1
      const captured = !last || cmd.redirect !== undefined
      let buffer = ''
      const sink = captured ? (s: string) => void (buffer += s) : (s: string) => host.write(s)
      code = await runCommand(cmd, stdin, sink, !captured && host.tty)
      if (captured) {
        const text = stripAnsi(buffer).replace(/\r\n/g, '\n')
        if (cmd.redirect) {
          writeRedirect(cmd.redirect, text)
          stdin = null
        } else stdin = text
      }
    }
    return code
  }

  function writeRedirect(r: NonNullable<SimpleCommand['redirect']>, text: string): void {
    const vfs = host.backend.vfs
    const target = r.path.toLowerCase()
    if (target === '$null' || target === 'nul' || target === '/dev/null') return
    const path = vfs.resolve(host.state.cwd, r.path)
    let prev = ''
    if (r.append) {
      try {
        prev = vfs.readFile(path)
      } catch {
        prev = ''
      }
    }
    try {
      vfs.writeFile(path, prev + text)
    } catch {
      host.write(host.dialect.family === 'bash' ? `bash: ${r.path}: No such file or directory${CRLF}` : `The system cannot find the path specified.${CRLF}`)
    }
  }

  async function runCommand(cmd: SimpleCommand, stdin: string | null, sink: (s: string) => void, tty: boolean): Promise<number> {
    const d = host.dialect
    const words = cmd.words
    if (words.length === 0) return 0
    const first = words[0]

    // PowerShell `$env:X = "v"`, `$x = …`, and bare expressions (`$env:PATH`, `"hi"`, `1+1`).
    if (d.family === 'ps') {
      if (first.raw.startsWith('$') && words[1]?.raw === '=') {
        const m = /^\$env:(\w+)$/i.exec(first.raw)
        if (m) host.state.env[m[1]] = words.slice(2).map((w) => w.value).join(' ')
        return 0
      }
      if (first.raw.startsWith('$') || (first.quoted && words.length === 1)) {
        const value = words.map((w) => w.value).join(' ')
        if (value !== '') sink(value.replace(/\n/g, CRLF) + CRLF)
        return 0
      }
      if (/^[\d\s+\-*/().%]+$/.test(cmd.text) && /\d/.test(cmd.text)) {
        const v = arithmetic(cmd.text)
        if (v !== null) {
          sink(String(v) + CRLF)
          return 0
        }
      }
    }
    // bash `NAME=value`.
    if (d.family === 'bash' && /^[A-Za-z_]\w*=/.test(first.raw) && words.length === 1) {
      const eq = first.value.indexOf('=')
      host.state.env[first.value.slice(0, eq)] = first.value.slice(eq + 1)
      return 0
    }

    const name = first.value
    const lower = name.toLowerCase().replace(/\.(exe|cmd|bat|com)$/, '')

    if (lower === 'exit' || (d.family === 'ps' && lower === 'exit-pssession')) {
      const n = Number(words[1]?.value ?? 0)
      if (d.family === 'bash') sink(`exit${CRLF}`)
      host.exit(Number.isFinite(n) ? n : 0)
      return new Promise<number>(() => undefined)
    }

    const fn = builtin(d.family, d.ps7, name)
    if (fn) return invoke(fn, cmd, stdin, sink, tty)

    const spec = host.backend.programs.get(lower)
    if (spec) {
      const argv = words.slice(1).map((w) => w.value)
      if (!host.launch) {
        sink(`${spec.name}: interactive programs need a terminal${CRLF}`)
        return 1
      }
      const launch = host.launch
      return invoke(() => launch(spec, spec.name, argv, cmd.text), cmd, stdin, sink, tty)
    }

    // `.\script.ps1`, `./build.sh`: a file that exists runs (quietly); otherwise not found.
    if (/[\\/]/.test(name)) {
      const path = host.backend.vfs.resolve(host.state.cwd, name)
      if (host.backend.vfs.stat(path)) return 0
    }
    sink(notFound(d, name, line, first.start))
    if (tty) sink(demoTip())
    return d.family === 'bash' ? 127 : d.family === 'cmd' ? 9009 : 1
  }

  async function invoke(fn: CommandFn, cmd: SimpleCommand, stdin: string | null, sink: (s: string) => void, tty: boolean): Promise<number> {
    const f: Frame = { timers: host.backend.clock.group(), defers: [] }
    frame = f
    const ctx: Ctx = {
      backend: host.backend,
      svc: host.svc,
      sh: host.state,
      d: host.dialect,
      name: cmd.words[0].value,
      argv: cmd.words.slice(1).map((w) => w.value),
      words: cmd.words,
      line,
      offset: cmd.start,
      get cols() {
        return host.cols()
      },
      get rows() {
        return host.rows()
      },
      tty,
      interactive: tty && host.launch !== null,
      stdin,
      timers: f.timers,
      get cancelled() {
        return cancelled
      },
      write: (s) => {
        if (!cancelled) sink(s)
      },
      print: (...lines) => {
        if (!cancelled) sink(lines.join(CRLF) + CRLF)
      },
      sleep: (ms) => f.timers.sleep(ms),
      onInput: (cb, opts) => host.setInput(cb, opts?.interrupt === true),
      defer: (cb) => void f.defers.push(cb),
      launch: (spec, name, argv) => {
        if (!host.launch) return Promise.resolve(1)
        return host.launch(spec, name, argv, cmd.text)
      },
      setTitle: (title) => {
        if (!cancelled && tty) sink(`\x1b]0;${title}\x07`)
      },
      sub: async (commandLine) => {
        const inner = runLine({ ...host, write: sink }, commandLine)
        return inner.done
      }
    }
    try {
      return await fn(ctx)
    } catch (err) {
      console.error('[demo] shell command failed', err)
      return 1
    } finally {
      if (frame === f) closeFrame()
    }
  }

  const done = Promise.race([work, aborted]).then((code) => {
    finished = true
    closeFrame()
    return code
  })

  return {
    done,
    cancel() {
      if (finished || cancelled) return false
      cancelled = true
      closeFrame()
      abort(host.dialect.interruptCode)
      return true
    }
  }
}

function parseErrorText(d: Dialect, line: string, e: { kind: string; token: string; offset: number }): string {
  if (d.family === 'bash') {
    return e.kind === 'unclosed-quote'
      ? `bash: unexpected EOF while looking for matching \`${e.token}'${CRLF}`
      : `bash: syntax error near unexpected token \`${e.token}'${CRLF}`
  }
  if (d.family === 'cmd') return `${e.token} was unexpected at this time.${CRLF}`
  const message =
    e.kind === 'and-or-unsupported'
      ? `The token '${e.token}' is not a valid statement separator in this version.`
      : e.kind === 'unclosed-quote'
        ? `The string is missing the terminator: ${e.token}.`
        : 'An empty pipe element is not allowed.'
  if (d.ps7) return psError(true, { source: 'ParserError', message, line, offset: e.offset, length: e.token.length, category: '', fqid: '' })
  // Windows PowerShell prints parse errors without a source prefix, location first.
  const red = '\x1b[91m'
  return [
    `At line:1 char:${e.offset + 1}`,
    `+ ${line}`,
    `+ ${' '.repeat(e.offset)}${'~'.repeat(e.token.length)}`,
    message,
    `    + CategoryInfo          : ParserError: (:) [], ParentContainsErrorRecordException`,
    `    + FullyQualifiedErrorId : ${e.kind === 'and-or-unsupported' ? 'InvalidEndOfLine' : e.kind === 'unclosed-quote' ? 'TerminatorExpectedAtEndOfString' : 'EmptyPipeElement'}`,
    ''
  ]
    .map((l) => (l ? `${red}${l}\x1b[0m` : l))
    .join(CRLF) + CRLF
}

