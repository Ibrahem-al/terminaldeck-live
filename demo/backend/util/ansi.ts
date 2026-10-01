/**
 * Terminal escape primitives shared by the shell and the programs. The byte
 * shapes follow terminal-signals.md: OSC is terminated with BEL, which is what
 * the app's own shell-integration scripts emit.
 */

export const ESC = '\x1b'
export const BEL = '\x07'
export const CRLF = '\r\n'

export const osc = (body: string): string => `${ESC}]${body}${BEL}`
export const csi = (body: string): string => `${ESC}[${body}`

/** OSC 133 shell-integration marks. */
export const mark = {
  /** Prompt start. */
  promptStart: (): string => osc('133;A'),
  /** Input start — the renderer's "ready" signal. */
  inputStart: (): string => osc('133;B'),
  /** Command start (after the submitted line's `\r\n`). */
  commandStart: (): string => osc('133;C'),
  /** Command end with exit code. */
  commandEnd: (code: number): string => osc(`133;D;${code}`)
}

/** OSC 9;9 working-directory report (what the app's PowerShell integration sends). */
export const cwdReport = (cwd: string): string => osc(`9;9;${cwd}`)
/** OSC 0 window title. */
export const setTitle = (title: string): string => osc(`0;${title}`)

export const clearScreen = (): string => `${csi('2J')}${csi('3J')}${csi('H')}`
export const cursorTo = (row: number, col = 1): string => csi(`${row};${col}H`)
export const eraseLine = (): string => `\r${csi('2K')}`
export const hideCursor = (): string => csi('?25l')
export const showCursor = (): string => csi('?25h')

/** SGR colours and styles. `sgr.reset` ends everything. */
export const sgr = {
  reset: csi('0m'),
  bold: csi('1m'),
  dim: csi('2m'),
  italic: csi('3m'),
  underline: csi('4m'),
  inverse: csi('7m'),
  noBold: csi('22m'),
  black: csi('30m'),
  red: csi('31m'),
  green: csi('32m'),
  yellow: csi('33m'),
  blue: csi('34m'),
  magenta: csi('35m'),
  cyan: csi('36m'),
  white: csi('37m'),
  gray: csi('90m'),
  brightRed: csi('91m'),
  brightGreen: csi('92m'),
  brightYellow: csi('93m'),
  brightBlue: csi('94m'),
  brightMagenta: csi('95m'),
  brightCyan: csi('96m'),
  brightWhite: csi('97m'),
  fg: (r: number, g: number, b: number): string => csi(`38;2;${r};${g};${b}m`),
  bg: (r: number, g: number, b: number): string => csi(`48;2;${r};${g};${b}m`)
}

// CSI, OSC (BEL or ST terminated), and two-byte escapes.
const ANSI_RE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_])/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

/**
 * Display width in terminal cells: wide CJK/emoji count 2, combining marks 0.
 * Good enough for laying out boxes; not a full wcwidth.
 */
export function cellWidth(s: string): number {
  let w = 0
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp === 0 || (cp >= 0x300 && cp <= 0x36f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) continue
    if (
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0x1f300 && cp <= 0x1faff)
    ) {
      w += 2
    } else w += 1
  }
  return w
}

/** Pad (or cut) to exactly `width` cells, ANSI-aware for padding. */
export function padCells(s: string, width: number): string {
  const w = cellWidth(s)
  if (w >= width) return s
  return s + ' '.repeat(width - w)
}
