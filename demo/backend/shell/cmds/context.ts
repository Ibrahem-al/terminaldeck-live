/**
 * What a shell command sees while it runs, plus small output helpers every
 * command file shares (TTY-paced printing, PowerShell table formatting).
 */
import type { ShellKind } from '@shared/types'
import type { Backend, GitRepo, ProgramSpec, Timers, WindowLabel } from '../../contracts'
import { CRLF } from '../../util/ansi'
import type { Dialect } from '../dialect'
import type { Word } from '../parse'
import { parseKeys } from '../keys'

/** The shell state a command may read or change. */
export interface ShellState {
  readonly kind: ShellKind
  readonly dialect: Dialect
  readonly cwd: string
  setCwd(path: string): void
  readonly prevCwd: string | null
  readonly env: Record<string, string>
  readonly history: readonly string[]
  /** Clear the session's command history (`Clear-History`, `history -c`). */
  clearHistory(): void
  /** Owning window (`code <file>` opens the editor there). Undefined when headless. */
  readonly label: WindowLabel | undefined
}

/** State shared by every shell in the demo. */
export interface ShellServices {
  /** The repo containing a path: vfs.git(), else the shell's own fallback model. */
  git(path: string): GitRepo | null
  /** Dev servers "listening" right now, by port (curl / Invoke-WebRequest answer from these). */
  readonly servers: Map<number, { name: string; body: () => string }>
}

export interface Ctx {
  readonly backend: Backend
  readonly svc: ShellServices
  readonly sh: ShellState
  readonly d: Dialect
  /** The command name as typed. */
  readonly name: string
  /** Arguments after the name (quotes removed, variables expanded). */
  readonly argv: string[]
  readonly words: Word[]
  /** The statement as typed (PowerShell errors quote it). */
  readonly line: string
  /** Offset of this command inside `line`. */
  readonly offset: number
  readonly cols: number
  readonly rows: number
  /** Output goes to a terminal (not a pipe, redirect or capture). */
  readonly tty: boolean
  /** Someone can type at it: a pane's shell, not an agent's headless tool call (no pager, no prompts). */
  readonly interactive: boolean
  /** Text piped in from the previous command, or null. */
  readonly stdin: string | null
  readonly timers: Timers
  /** True once Ctrl+C stopped this command — stop writing. */
  readonly cancelled: boolean
  write(s: string): void
  /** Write lines (each followed by CRLF). */
  print(...lines: string[]): void
  sleep(ms: number): Promise<void>
  /**
   * Receive raw terminal input while running (Vite's `h + enter`, a REPL).
   * With `interrupt`, Ctrl+C is delivered too instead of stopping the command.
   */
  onInput(cb: ((data: string) => void) | null, opts?: { interrupt?: boolean }): void
  /** Run `cb` when the command ends, however it ends (Ctrl+C included). */
  defer(cb: () => void): void
  /** Hand the terminal to a registry program; resolves with its exit code. */
  launch(spec: ProgramSpec, name: string, argv: string[]): Promise<number>
  setTitle(title: string): void
  /** Run another command line in this shell (npm scripts, `npx`). Same output sink. */
  sub(commandLine: string): Promise<number>
}

export type CommandFn = (ctx: Ctx) => Promise<number> | number

/**
 * Print text the way a real TTY delivers it: short bursts of lines, not one
 * megabyte write. Small outputs go out at once.
 */
export async function pace(ctx: Ctx, text: string, opts: { perTick?: number; tickMs?: number } = {}): Promise<void> {
  const lines = text.split(/\r?\n/)
  const perTick = opts.perTick ?? 24
  const tickMs = opts.tickMs ?? 16
  if (lines.length <= perTick) {
    ctx.write(lines.join(CRLF))
    return
  }
  for (let i = 0; i < lines.length; i += perTick) {
    if (ctx.cancelled) return
    const chunk = lines.slice(i, i + perTick).join(CRLF)
    ctx.write(i + perTick < lines.length ? chunk + CRLF : chunk)
    if (i + perTick < lines.length) await ctx.sleep(tickMs)
  }
}

/** A small, human-looking latency for a native executable starting up. */
export const startup = (ctx: Ctx, ms = 60): Promise<void> => ctx.sleep(ms + Math.round(Math.random() * ms * 0.6))

/* ─────────────────────── dates and numbers ─────────────────────── */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const two = (n: number): string => String(n).padStart(2, '0')

/** `9/27/2026` + ` 9:30 AM` as PowerShell's en-US table shows them. */
export function psDate(ms: number): { date: string; time: string } {
  const d = new Date(ms)
  const h = d.getHours() % 12 || 12
  return {
    date: `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`,
    time: `${h}:${two(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`
  }
}

/** `Monday, September 29, 2026 11:40:12 PM` (Get-Date). */
export function psLongDate(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours() % 12 || 12
  return `${LONG_DAYS[d.getDay()]}, ${LONG_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h}:${two(d.getMinutes())}:${two(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`
}

/** `09/27/2026  09:30 AM` (cmd `dir`). */
export function cmdDate(ms: number): string {
  const d = new Date(ms)
  const h = d.getHours() % 12 || 12
  return `${two(d.getMonth() + 1)}/${two(d.getDate())}/${d.getFullYear()}  ${two(h)}:${two(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`
}

/** `Sep 27 09:30` (ls -l). */
export function unixDate(ms: number): string {
  const d = new Date(ms)
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${two(d.getHours())}:${two(d.getMinutes())}`
}

/** `Mon Sep 29 23:40:12 CEST 2026` (bash `date`). */
export function bashDate(ms: number): string {
  const d = new Date(ms)
  const tz = /\(([^)]+)\)/.exec(d.toString())?.[1] ?? ''
  const abbr = tz.split(' ').map((w) => w[0]).join('') || 'UTC'
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())} ${abbr} ${d.getFullYear()}`
}

/** `14:02:11` */
export const clockTime = (ms: number): string => {
  const d = new Date(ms)
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

/** `2:14:07 PM` (Vite's log timestamps). */
export const viteTime = (ms: number): string => {
  const d = new Date(ms)
  const h = d.getHours() % 12 || 12
  return `${h}:${two(d.getMinutes())}:${two(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`
}

export const withCommas = (n: number): string => n.toLocaleString('en-US')

/** Lay names out in columns, top-to-bottom like GNU `ls -C`. `widthOf` measures without ANSI. */
export function columns(items: Array<{ text: string; width: number }>, cols: number): string[] {
  if (items.length === 0) return []
  const maxW = Math.max(...items.map((i) => i.width)) + 2
  const perRow = Math.max(1, Math.floor(cols / maxW))
  const rows = Math.ceil(items.length / perRow)
  // Narrow the columns to their own widest entry, as ls does.
  const colCount = Math.ceil(items.length / rows)
  const widths: number[] = []
  for (let c = 0; c < colCount; c++) {
    let w = 0
    for (let r = 0; r < rows; r++) w = Math.max(w, items[c * rows + r]?.width ?? 0)
    widths.push(w + 2)
  }
  if (widths.reduce((a, b) => a + b, 0) > cols && perRow > 1) return columns(items, cols - maxW)
  const out: string[] = []
  for (let r = 0; r < rows; r++) {
    let line = ''
    for (let c = 0; c < colCount; c++) {
      const it = items[c * rows + r]
      if (!it) continue
      const last = c === colCount - 1 || !items[(c + 1) * rows + r]
      line += it.text + (last ? '' : ' '.repeat(widths[c] - it.width))
    }
    out.push(line)
  }
  return out
}

/**
 * Read one line of input while a command runs (a REPL, cmd's Y/N prompt),
 * echoing as a cooked console would. Resolves null on Ctrl+C / Ctrl+D / Ctrl+Z.
 */
export function readLine(ctx: Ctx): Promise<string | null> {
  return new Promise((resolve) => {
    let buf = ''
    const done = (value: string | null): void => {
      ctx.onInput(null)
      resolve(value)
    }
    ctx.onInput(
      (data) => {
        for (const key of parseKeys(data)) {
          if (key.t === 'enter') {
            ctx.write(CRLF)
            return done(buf)
          }
          if (key.t === 'ctrl' && (key.key === 'c' || key.key === 'd' || key.key === 'z')) return done(null)
          if (key.t === 'backspace' && buf.length > 0) {
            buf = buf.slice(0, -1)
            ctx.write('\b \b')
          } else if (key.t === 'text' || key.t === 'paste') {
            const text = key.text.replace(/[\r\n]/g, '')
            buf += text
            ctx.write(text)
          }
        }
      },
      { interrupt: true }
    )
  })
}
