/**
 * The simulated shells: PowerShell 5.1, PowerShell 7, cmd and Git Bash bound
 * to PTY sessions. A Shell owns the prompt (byte-exact shell integration,
 * terminal-signals.md §3/§7), the line editor, typeahead, the foreground
 * program, and hands each submitted line to the interpreter (exec.ts).
 *
 * The factory's `exec()` runs a command line headlessly and captures its
 * output (what an agent's "Bash(npm test)" tool call shows); each Shell also
 * has one bound to its own cwd.
 */
import type { ShellKind } from '@shared/types'
import type {
  Backend,
  ExecOptions,
  ExecResult,
  ModuleInstance,
  Program,
  ProgramIO,
  ProgramSpec,
  PtySession,
  Shell,
  ShellFactory,
  ShellSpawn,
  Timers
} from '../contracts'
import { CRLF, clearScreen, mark, setTitle, stripAnsi } from '../util/ansi'
import type { ShellServices, ShellState } from './cmds/context'
import { commonPrefix, complete, type Completion } from './completion'
import { dialectFor, type Dialect, type PromptInfo } from './dialect'
import { LineEditor, type EditorView } from './editor'
import { runLine, type ExecHost, type LineRun } from './exec'
import { createGitResolver } from './gitfallback'
import { highlightPs } from './highlight'
import { parseKeys } from './keys'
import type { Family } from './parse'

// A terminal's automatic replies (DA, DSR/CPR, colour queries, DECRQSS, focus): never typing.
const REPLY_RE = /\x1b\[[?>]?[\d;]*[cnRy]|\x1b\[\?[\d;]*\$y|\x1b\][\d;]*rgb:[^\x07\x1b]*(?:\x07|\x1b\\)|\x1bP[\s\S]*?\x1b\\|\x1b\[[IO]/g

const SEED_HISTORY: Record<Family, string[]> = {
  ps: ['git status', 'npm install', 'npm test -w api', 'git log --oneline', 'npm run dev -w web', 'claude'],
  bash: ['git status', 'ls -la', 'npm test -w api', 'git log --oneline -5'],
  cmd: []
}

export function createShells(backend: Backend): ModuleInstance<ShellFactory> {
  const git = createGitResolver(backend)
  const svc: ShellServices = { git, servers: new Map() }

  /** PSReadLine / bash history is shared by every session of a family and survives reloads. */
  const sharedHistory = new Map<Family, string[]>()
  const historyOf = (family: Family): string[] => {
    let h = sharedHistory.get(family)
    if (!h) {
      h = backend.storage.get<string[]>(`shell:history:${family}`) ?? [...SEED_HISTORY[family]]
      sharedHistory.set(family, h)
    }
    return h
  }
  const remember = (family: Family, line: string): void => {
    if (family === 'cmd') return
    const h = historyOf(family)
    if (h[h.length - 1] !== line) h.push(line)
    if (h.length > 200) h.splice(0, h.length - 200)
    backend.storage.set(`shell:history:${family}`, h)
  }

  class TerminalShell implements Shell {
    readonly kind: ShellKind
    readonly session: PtySession
    readonly dialect: Dialect
    readonly env: Record<string, string>
    readonly history: string[] = []
    foreground: Program | null = null

    private _cwd: string
    private prevCwd: string | null = null
    private phase: 'starting' | 'prompt' | 'running' | 'exited' = 'starting'
    private readonly view: EditorView
    private readonly editor: LineEditor
    private readonly timers: Timers = backend.clock.group()
    private run_: LineRun | null = null
    /** The line being run (cmd asks "Terminate batch job" when Ctrl+C stops an npm shim). */
    private runLineText = ''
    /** cmd is waiting for the Y/N answer; the prompt follows it. */
    private batchAnswer: ((answer: string) => void) | null = null
    private input_: { cb: (data: string) => void; interrupt: boolean } | null = null
    private programTimers: Timers | null = null
    private programKill: (() => void) | null = null
    private typeahead = ''
    private readonly queue: Array<() => void> = []
    private pending: ((code: number) => void) | null = null
    private firstPrompt = true
    private atLineStart = true
    private completion: { base: Completion; index: number; lastTab: boolean; applied: number } | null = null
    private readonly localHistory: string[] = []
    private readonly state: ShellState

    constructor(spawn: ShellSpawn) {
      this.kind = spawn.kind
      this.session = spawn.session
      this.dialect = spawn.nested ? withoutIntegration(dialectFor(spawn.kind)) : dialectFor(spawn.kind)
      this.env = { ...spawn.env }
      this._cwd = spawn.cwd
      this.view = { cols: Math.max(2, spawn.cols), startCol: 0 }
      const family = this.dialect.family
      const shared = family === 'cmd' ? this.localHistory : historyOf(family)
      this.editor = new LineEditor(this.view, () => shared, {
        highlight: family === 'ps' ? highlightPs : undefined,
        predict: this.dialect.ps7 ? (line) => this.predict(line) : undefined,
        escClears: family !== 'bash',
        readline: family === 'bash',
        pasteJoin: family === 'cmd' ? ' & ' : '; '
      })
      const self = this
      this.state = {
        get kind() {
          return self.kind
        },
        get dialect() {
          return self.dialect
        },
        get cwd() {
          return self._cwd
        },
        setCwd: (p) => self.setCwd(p),
        get prevCwd() {
          return self.prevCwd
        },
        get env() {
          return self.env
        },
        get history() {
          return self.history
        },
        clearHistory: () => {
          self.history.length = 0
        },
        get label() {
          return self.session.label
        }
      }
    }

    get cwd(): string {
      return this._cwd
    }

    /** Checked after an await, where TypeScript's narrowing of `phase` is stale. */
    private gone(): boolean {
      return this.phase === 'exited'
    }

    get idle(): boolean {
      return this.phase === 'prompt' && !this.foreground && this.editor.line === ''
    }

    get line(): string {
      return this.phase === 'prompt' ? this.editor.line : ''
    }

    get atPrompt(): boolean {
      return this.phase === 'prompt' && !this.foreground
    }

    private setCwd(path: string): void {
      if (backend.vfs.key(path) !== backend.vfs.key(this._cwd)) this.prevCwd = this._cwd
      this._cwd = path
      this.session.cwd = path
    }

    /* ─────────────────────────── output ─────────────────────────── */

    private out(s: string): void {
      if (s === '' || this.phase === 'exited') return
      this.session.write(s)
      const plain = stripAnsi(s)
      if (s.includes('\x1b[H')) this.atLineStart = true
      if (plain === '') return
      const cut = Math.max(plain.lastIndexOf('\n'), plain.lastIndexOf('\r'))
      this.atLineStart = cut === plain.length - 1 || (cut >= 0 && plain.slice(cut + 1) === '')
    }

    private promptInfo(): PromptInfo {
      const m = backend.scenario.machine
      return {
        cwd: this._cwd,
        branch: this.dialect.family === 'bash' ? (git(this._cwd)?.currentBranch() ?? null) : null,
        lastCode: undefined,
        user: m.user,
        host: m.hostname,
        home: m.home,
        posix: (p) => backend.vfs.toPosix(p)
      }
    }

    /** A fresh prompt. `code` is the finished command's exit code (none after an empty line in cmd). */
    private prompt(code: number | undefined, afterCommand: boolean): void {
      const info = this.promptInfo()
      if (!this.firstPrompt) info.lastCode = this.dialect.family === 'cmd' ? (afterCommand ? 0 : undefined) : (code ?? 0)
      this.firstPrompt = false
      this.out(this.dialect.prompt(info))
      this.phase = 'prompt'
      this.editor.reset()
      this.view.startCol = this.dialect.promptWidth(info) % this.view.cols
      this.completion = null
      const next = this.queue.shift()
      if (next) {
        next()
        return
      }
      if (this.typeahead) {
        const t = this.typeahead
        this.typeahead = ''
        this.input(t)
      }
    }

    start(): void {
      if (this.phase !== 'starting') return
      const d = this.dialect
      if (d.startTitle) this.out(setTitle(d.startTitle))
      this.out(d.banner(backend.scenario.machine.versions))
      this.prompt(undefined, false)
    }

    /* ─────────────────────────── input ─────────────────────────── */

    input(data: string): void {
      if (this.phase === 'exited') return
      if (this.foreground) {
        this.foreground.input(data)
        return
      }
      data = data.replace(REPLY_RE, '')
      if (data === '') return
      if (this.batchAnswer) {
        const ch = [...data].find((c) => c >= ' ')
        if (ch) this.batchAnswer(ch)
        return
      }
      if (this.phase === 'running') {
        const handler = this.input_
        if (handler && (handler.interrupt || !data.includes('\x03'))) {
          handler.cb(data)
          return
        }
        if (data.includes('\x03')) {
          this.interrupt()
          return
        }
        this.typeahead += data
        return
      }
      if (this.phase === 'starting') {
        this.typeahead += data
        return
      }
      // At the prompt. Everything after a submitted Enter is typeahead for the next prompt.
      const segments = splitAtEnter(data)
      for (let i = 0; i < segments.length; i++) {
        if (this.phase !== 'prompt') {
          this.typeahead += segments.slice(i).join('')
          return
        }
        this.keys(segments[i])
      }
    }

    private keys(data: string): void {
      for (const key of parseKeys(data)) {
        if (this.phase !== 'prompt') return
        if (key.t !== 'tab') this.completion = null
        const action = this.editor.handle(key, (s) => this.out(s))
        switch (action.t) {
          case 'submit':
            this.submit(action.line)
            break
          case 'cancel':
            this.cancelLine()
            break
          case 'complete':
            this.tab(action.back)
            break
          case 'clear-screen':
            this.clearScreenKeepLine()
            break
          case 'eof':
            this.out(`${CRLF}exit${CRLF}`)
            this.exitSession(0)
            break
        }
      }
    }

    private cancelLine(): void {
      this.out(this.editor.finish() + '^C' + CRLF)
      this.prompt(undefined, false)
    }

    private clearScreenKeepLine(): void {
      const info = this.promptInfo()
      // Reprint the prompt with A/B but no D: nothing finished.
      const again = this.dialect.prompt(info).replace(/\x1b\]133;D;-?\d+\x07/, '')
      this.out(clearScreen() + again.replace(/^\r\n/, ''))
      this.out(this.editor.repaint())
    }

    private tab(back: boolean): void {
      const d = this.dialect
      if (this.completion && d.family !== 'bash') {
        // PowerShell / cmd: cycle.
        const c = this.completion
        const n = c.base.candidates.length
        c.index = (c.index + (back ? -1 : 1) + n) % n
        this.applyCandidate(c.base, c.base.candidates[c.index])
        return
      }
      const line = this.editor.line
      const result = complete({
        backend,
        family: d.family,
        ps7: d.ps7,
        cwd: this._cwd,
        line,
        cursor: this.editor.cursorPos,
        branches: () => git(this._cwd)?.branches() ?? []
      })
      if (!result) {
        if (d.family === 'bash') this.out('\x07')
        return
      }
      if (d.family !== 'bash') {
        const index = back ? result.candidates.length - 1 : 0
        this.completion = { base: result, index, lastTab: true, applied: result.end - result.start }
        this.applyCandidate(result, result.candidates[index])
        return
      }
      if (result.candidates.length === 1) {
        this.applyCandidate(result, result.candidates[0])
        return
      }
      const prefix = commonPrefix(result.candidates)
      const typed = line.slice(result.start, result.end)
      if (prefix.length > typed.length) {
        this.applyCandidate(result, prefix)
        return
      }
      if (this.completion?.lastTab) {
        // Second Tab: list the choices, then redraw the prompt and the line.
        const width = Math.max(...result.display.map((s) => s.length)) + 2
        const perRow = Math.max(1, Math.floor(this.view.cols / width))
        const rows: string[] = []
        for (let i = 0; i < result.display.length; i += perRow) {
          rows.push(result.display.slice(i, i + perRow).map((s) => s.padEnd(width)).join('').trimEnd())
        }
        const saved = line
        const cursor = this.editor.cursorPos
        this.out(this.editor.finish() + CRLF + rows.join(CRLF) + CRLF)
        const info = this.promptInfo()
        this.out(this.dialect.prompt(info).replace(/\x1b\]133;D;-?\d+\x07/, '').replace(/^\r\n/, ''))
        this.editor.reset()
        this.out(this.editor.setLine(saved, cursor))
        this.completion = { base: result, index: 0, lastTab: true, applied: 0 }
        return
      }
      this.out('\x07')
      this.completion = { base: result, index: 0, lastTab: true, applied: 0 }
    }

    /** Replace the token being completed; while cycling, that token is the previous candidate. */
    private applyCandidate(c: Completion, text: string): void {
      const state = this.completion
      const cycling = state !== null && state.base === c
      const len = cycling ? state.applied : c.end - c.start
      this.out(this.editor.splice(c.start, c.start + len, text))
      if (cycling) state.applied = [...text].length
    }

    private predict(line: string): string | null {
      if (line.trim() === '') return null
      const h = historyOf('ps')
      const lower = line.toLowerCase()
      for (let i = h.length - 1; i >= 0; i--) {
        if (h[i].length > line.length && h[i].toLowerCase().startsWith(lower)) return h[i].slice(line.length)
      }
      return null
    }

    /* ─────────────────────────── running ─────────────────────────── */

    private submit(line: string): void {
      const d = this.dialect
      this.out(this.editor.finish())
      if (d.family !== 'cmd') this.out('\x1b[?2004l')
      this.out(CRLF)
      if (line.trim() === '') {
        this.prompt(undefined, false)
        this.settle(0)
        return
      }
      this.history.push(line)
      remember(d.family, line.trim())
      if (d.family === 'cmd') this.localHistory.push(line)
      if (d.integrated) this.out(mark.commandStart())
      this.phase = 'running'
      const run = runLine(this.host(), line)
      this.run_ = run
      this.runLineText = line
      void run.done.then(async (code) => {
        if (this.run_ !== run || this.phase === 'exited') return
        this.run_ = null
        this.input_ = null
        if (this.batchAnswer) {
          await new Promise<void>((resolve) => {
            this.batchAnswer = (answer) => {
              this.out(answer + CRLF)
              if (/^[yn]$/i.test(answer)) {
                this.batchAnswer = null
                resolve()
              } else this.out('Terminate batch job (Y/N)? ')
            }
          })
          if (this.gone()) return
        }
        if (!this.atLineStart && this.dialect.family !== 'bash') this.out(CRLF)
        this.prompt(code, true)
        this.settle(code)
      })
    }

    private settle(code: number): void {
      const p = this.pending
      this.pending = null
      p?.(code)
    }

    private host(): ExecHost {
      return {
        backend,
        svc,
        state: this.state,
        dialect: this.dialect,
        cols: () => this.session.cols,
        rows: () => this.session.rows,
        write: (s) => this.out(s),
        tty: true,
        label: this.session.label,
        setInput: (cb, interrupt) => {
          this.input_ = cb ? { cb, interrupt } : null
        },
        launch: (spec, name, argv, commandLine) => this.launch(spec, name, argv, commandLine),
        exit: (code) => this.exitSession(code)
      }
    }

    private exitSession(code: number): void {
      // Let the last bytes reach the pane before the exit frame.
      this.timers.setTimeout(() => this.session.exit(code), 30)
    }

    private launch(spec: ProgramSpec, name: string, argv: string[], commandLine: string): Promise<number> {
      return new Promise<number>((resolve) => {
        const timers = backend.clock.group()
        let exited = false
        const shell = this
        let program: Program
        try {
          program = spec.create({ name, argv, commandLine, session: this.session, shell: this, backend })
        } catch (err) {
          console.error(`[demo] program ${name} failed to start`, err)
          resolve(1)
          return
        }
        const io: ProgramIO = {
          argv,
          commandLine,
          get cols() {
            return shell.session.cols
          },
          get rows() {
            return shell.session.rows
          },
          get cwd() {
            return shell._cwd
          },
          env: this.env,
          session: this.session,
          shell: this,
          backend,
          timers,
          write: (data) => {
            if (!exited) this.out(data)
          },
          setTitle: (title) => {
            if (!exited) this.out(setTitle(title))
          },
          exit: (code = 0) => {
            if (exited) return
            exited = true
            timers.dispose()
            if (this.foreground === program) {
              this.foreground = null
              this.programTimers = null
              this.programKill = null
            }
            resolve(code)
          },
          get exited() {
            return exited
          }
        }
        this.foreground = program
        this.programTimers = timers
        this.programKill = () => {
          exited = true
          try {
            program.kill()
          } catch (err) {
            console.error('[demo] program kill failed', err)
          }
          timers.dispose()
        }
        try {
          program.start(io)
        } catch (err) {
          console.error(`[demo] program ${name} crashed`, err)
          io.exit(1)
        }
      })
    }

    /* ─────────────────────────── contract API ─────────────────────────── */

    run(commandLine: string, opts?: { echo?: boolean }): Promise<number> {
      if (this.phase === 'exited') return Promise.resolve(1)
      if (this.foreground) {
        this.foreground.input(commandLine)
        return Promise.resolve(0)
      }
      return new Promise<number>((resolve) => {
        const go = (): void => {
          if (this.phase === 'exited') {
            resolve(1)
            return
          }
          if (this.foreground) {
            this.foreground.input(commandLine)
            resolve(0)
            return
          }
          this.pending = resolve
          this.completion = null
          if (this.editor.line !== '') this.out(this.editor.setLine(''))
          const text = commandLine.replace(/[\r\n]+$/, '')
          if (opts?.echo === false) this.editor.setLine(text)
          else this.out(this.editor.setLine(text))
          this.submit(text)
        }
        if (this.phase === 'prompt') go()
        else this.queue.push(go)
      })
    }

    type(text: string): void {
      if (this.foreground) {
        this.foreground.input(text)
        return
      }
      const clean = text.replace(/[\r\n]/g, '')
      if (this.phase === 'prompt') this.out(this.editor.insert(clean))
      else this.typeahead += clean
    }

    interrupt(): void {
      if (this.foreground) {
        this.foreground.input('\x03')
        return
      }
      if (this.phase === 'running' && this.run_) {
        // npm/npx/yarn are .cmd shims: cmd.exe asks before it abandons the batch file.
        const batch = this.dialect.family === 'cmd' && /^\s*(npm|npx|yarn|pnpm)\b/i.test(this.runLineText)
        if (batch) this.batchAnswer = () => undefined
        if (this.run_.cancel()) this.out(batch ? '^CTerminate batch job (Y/N)? ' : `^C${CRLF}`)
        else if (batch) this.batchAnswer = null
        return
      }
      if (this.phase === 'prompt') this.cancelLine()
    }

    resize(cols: number, rows: number): void {
      const oldCols = this.view.cols
      const newCols = Math.max(2, cols)
      if (this.phase === 'prompt' && !this.foreground && newCols !== oldCols) this.repaintPrompt(oldCols, newCols)
      else {
        this.view.cols = newCols
        if (this.phase === 'prompt') this.view.startCol = this.dialect.promptWidth(this.promptInfo()) % this.view.cols
      }
      this.foreground?.resize?.(cols, rows)
    }

    /**
     * What ConPTY + PSReadLine (or readline) do on a width change at the prompt.
     * The renderer runs xterm with reflowCursorLine off, so the rows holding the
     * prompt and the cursor are left exactly as they were — cut at the new width
     * when it shrank — and the shell is expected to redraw them: back to the
     * prompt's first row, erase below, print the prompt and the line again.
     */
    private repaintPrompt(oldCols: number, newCols: number): void {
      const info = this.promptInfo()
      const width = this.dialect.promptWidth(info)
      const up = Math.floor((width + this.editor.cursorPos) / oldCols)
      // The last row of the prompt, without the marks (they were sent with the original), then 133;B again.
      const full = this.dialect.prompt(info)
      const lastRow = full.slice(full.lastIndexOf('\r\n') + 1).replace(/^\n/, '')
      const text = lastRow.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
      this.view.cols = newCols
      this.view.startCol = width % newCols
      this.out(`\r${up > 0 ? `\x1b[${up}A` : ''}\x1b[J${text}${this.dialect.integrated ? mark.inputStart() : ''}${this.editor.repaint()}`)
    }

    dispose(): void {
      if (this.phase === 'exited') return
      this.phase = 'exited'
      this.batchAnswer?.('n')
      this.programKill?.()
      this.foreground = null
      this.programTimers?.dispose()
      this.run_?.cancel()
      this.run_ = null
      this.timers.dispose()
      this.settle(1)
      for (const q of this.queue.splice(0)) q()
    }

    /** Headless run in this shell's directory; the terminal is untouched. */
    exec(commandLine: string, opts: ExecOptions = {}): Promise<ExecResult> {
      return execHeadless(commandLine, { kind: this.kind, cwd: this._cwd, env: this.env, ...opts })
    }
  }

  function execHeadless(commandLine: string, opts: ExecOptions): Promise<ExecResult> {
    const kind = opts.kind ?? 'powershell'
    const dialect = dialectFor(kind)
    const wanted = opts.cwd ? backend.vfs.stat(opts.cwd) : null
    let cwd = wanted?.isDir ? wanted.path : backend.scenario.machine.home
    let prev: string | null = null
    const env = { ...backend.scenario.machine.env, ...(opts.env ?? {}) }
    let output = ''
    const state: ShellState = {
      kind,
      dialect,
      get cwd() {
        return cwd
      },
      setCwd: (p) => {
        prev = cwd
        cwd = p
      },
      get prevCwd() {
        return prev
      },
      env,
      history: [],
      clearHistory: () => undefined,
      label: undefined
    }
    let run: LineRun | null = null
    const host: ExecHost = {
      backend,
      svc,
      state,
      dialect,
      cols: () => opts.cols ?? 100,
      rows: () => 30,
      write: (s) => {
        output += s
        opts.onData?.(s)
      },
      tty: true,
      label: undefined,
      setInput: () => undefined,
      launch: null,
      exit: () => void run?.cancel()
    }
    run = runLine(host, commandLine)
    const current = run
    opts.signal?.addEventListener('abort', () => current.cancel(), { once: true })
    if (opts.signal?.aborted) current.cancel()
    return current.done.then((code) => ({ code, output }))
  }

  const service: ShellFactory = {
    create: (spawn) => new TerminalShell(spawn),
    available: () => backend.scenario.machine.shells,
    exec: (commandLine, opts) => execHeadless(commandLine, opts ?? {})
  }

  /**
   * `cmd`, `powershell`, `pwsh`, `bash` typed at a prompt: a second shell in
   * the same console. It writes to the pane directly; its `exit` ends only
   * itself (the session it sees has an `exit` that returns to the outer shell).
   */
  const nestedShell = (name: string, kind: ShellKind, aliases: string[], banner: (v: Record<string, string>) => string): ProgramSpec => ({
    name,
    aliases,
    summary: `${name} (a shell inside this shell; exit returns)`,
    kind: 'tool',
    create: () => {
      let inner: TerminalShell | null = null
      return {
        start(io) {
          const outer = io.session
          const session = new Proxy(outer, {
            get(target, prop) {
              if (prop === 'exit') return (code: number) => io.exit(code)
              const value: unknown = Reflect.get(target, prop)
              return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value
            },
            // The pane's cwd is the outer shell's: nothing reports the inner one to TerminalDeck.
            set: (target, prop, value) => (prop === 'cwd' ? true : Reflect.set(target, prop, value))
          })
          inner = new TerminalShell({ session, kind, cwd: io.cwd, env: { ...io.env }, cols: io.cols, rows: io.rows, nested: true })
          io.write(banner(backend.scenario.machine.versions))
          inner.start()
        },
        input: (data) => inner?.input(data),
        resize: (cols, rows) => inner?.resize(cols, rows),
        kill: () => inner?.dispose()
      }
    }
  })

  return {
    service,
    commands: {},
    start() {
      const psBanner = (): string =>
        `Windows PowerShell${CRLF}Copyright (C) Microsoft Corporation. All rights reserved.${CRLF}${CRLF}Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows${CRLF}${CRLF}`
      backend.programs.register(nestedShell('cmd', 'cmd', ['cmd.exe'], () => ''))
      backend.programs.register(nestedShell('powershell', 'powershell', ['powershell.exe'], psBanner))
      backend.programs.register(nestedShell('pwsh', 'pwsh', ['pwsh.exe'], (v) => `PowerShell ${v.pwsh ?? '7.5.3'}${CRLF}`))
      backend.programs.register(nestedShell('bash', 'gitbash', ['bash.exe', 'sh'], () => ''))
    }
  }
}

/** A shell the app didn't spawn: the same prompt, without the OSC 133 / 9;9 marks. */
function withoutIntegration(d: Dialect): Dialect {
  return {
    ...d,
    integrated: false,
    prompt: (p) => d.prompt(p).replace(/\x1b\](?:133;[^\x07]*|9;9;[^\x07]*)\x07/g, '')
  }
}

/** Split input after each Enter that isn't inside a bracketed paste. */
function splitAtEnter(data: string): string[] {
  const out: string[] = []
  let cur = ''
  let inPaste = false
  for (let i = 0; i < data.length; i++) {
    if (data.startsWith('\x1b[200~', i)) inPaste = true
    if (data.startsWith('\x1b[201~', i)) inPaste = false
    cur += data[i]
    if (!inPaste && data[i] === '\r') {
      if (data[i + 1] === '\n') {
        cur += '\n'
        i++
      }
      out.push(cur)
      cur = ''
    }
  }
  if (cur) out.push(cur)
  return out
}

