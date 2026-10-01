/**
 * Building blocks shared by the agent TUIs: colours, ANSI-aware wrapping, an
 * Ink-style live region (redraw a block in place, commit transcript lines
 * above it), a key parser, spinners and number formats.
 *
 * Every line a TUI hands to `LiveScreen` must already fit the terminal width:
 * the region math counts one row per line, and a line xterm wraps by itself
 * would make the next redraw erase the wrong rows.
 */
import { CRLF, ESC, cellWidth, csi, hideCursor, showCursor, sgr } from '../util/ansi'

/* ─────────────────────────── colour ─────────────────────────── */

export type Rgb = readonly [number, number, number]

export const fg = (c: Rgb): string => sgr.fg(c[0], c[1], c[2])
export const bg = (c: Rgb): string => sgr.bg(c[0], c[1], c[2])
export const paint = (c: Rgb, text: string): string => `${fg(c)}${text}${csi('39m')}`
export const dim = (text: string): string => `${sgr.dim}${text}${csi('22m')}`
export const bold = (text: string): string => `${sgr.bold}${text}${csi('22m')}`
export const grey = (text: string): string => `${sgr.gray}${text}${csi('39m')}`
export const inverse = (text: string): string => `${sgr.inverse}${text}${csi('27m')}`
export const italic = (text: string): string => `${sgr.italic}${text}${csi('23m')}`
export const strike = (text: string): string => `${csi('9m')}${text}${csi('29m')}`
export const RESET = sgr.reset

/** Linear gradient across the visible characters of `text`. */
export function gradient(text: string, stops: Rgb[]): string {
  const chars = [...text]
  const n = Math.max(1, chars.length - 1)
  return (
    chars
      .map((ch, i) => {
        if (ch === ' ') return ch
        const t = (i / n) * (stops.length - 1)
        const k = Math.min(stops.length - 2, Math.floor(t))
        const f = t - k
        const a = stops[k]
        const b = stops[k + 1]
        const mix: Rgb = [
          Math.round(a[0] + (b[0] - a[0]) * f),
          Math.round(a[1] + (b[1] - a[1]) * f),
          Math.round(a[2] + (b[2] - a[2]) * f)
        ]
        return fg(mix) + ch
      })
      .join('') + csi('39m')
  )
}

/* ─────────────────────────── text layout ─────────────────────────── */

// Escapes (zero width) and single code points (visible).
const TOKEN_RE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))|[\s\S]/gu

interface Tok {
  s: string
  w: number
  esc: boolean
}

function tokenize(s: string): Tok[] {
  const out: Tok[] = []
  for (const m of s.matchAll(TOKEN_RE)) {
    const t = m[0]
    if (t.startsWith(ESC)) out.push({ s: t, w: 0, esc: true })
    else out.push({ s: t, w: cellWidth(t), esc: false })
  }
  return out
}

/** The SGR state after `toks` — what a continuation line must restart with. */
function sgrState(toks: Tok[], start: string): string {
  let state = start
  for (const t of toks) {
    if (!t.esc || !t.s.endsWith('m') || !t.s.startsWith(`${ESC}[`)) continue
    if (t.s === `${ESC}[0m` || t.s === `${ESC}[m`) state = ''
    else state += t.s
  }
  return state
}

/**
 * Wrap one logical line (ANSI allowed) to `width` cells, breaking at spaces
 * where possible. Continuation rows start with `indent` (plain spaces) and
 * re-open the styles that were active, so a coloured span survives the break.
 */
export function wrap(line: string, width: number, indent = ''): string[] {
  width = Math.max(4, width)
  if (cellWidth(line) <= width) return [line]
  const toks = tokenize(line)
  const rows: string[] = []
  let cur: Tok[] = []
  let curW = 0
  let startState = ''
  let first = true
  const flush = (): void => {
    const body = cur.map((t) => t.s).join('')
    const end = sgrState(cur, startState)
    rows.push((first ? '' : indent + startState) + body + (end ? RESET : ''))
    startState = end
    first = false
    cur = []
    curW = cellWidth(indent)
  }
  for (const tok of toks) {
    if (tok.esc) {
      cur.push(tok)
      continue
    }
    const limit = width
    if (curW + tok.w > limit) {
      if (tok.s === ' ') {
        flush()
        continue
      }
      // Break at the last space of this row if it is not too far back.
      let cut = -1
      for (let i = cur.length - 1; i >= 0; i--) {
        if (!cur[i].esc && cur[i].s === ' ') {
          cut = i
          break
        }
      }
      if (cut > 0) {
        const rest = cur.slice(cut + 1)
        cur = cur.slice(0, cut)
        const restW = rest.reduce((a, t) => a + t.w, 0)
        if (restW < width * 0.6) {
          flush()
          // The moved tokens' styles are re-derived from the flushed row's end state.
          cur = rest
          curW += restW
        } else {
          cur.push({ s: ' ', w: 1, esc: false }, ...rest)
          flush()
        }
      } else flush()
    }
    cur.push(tok)
    curW += tok.w
  }
  if (cur.length > 0 || rows.length === 0) {
    const body = cur.map((t) => t.s).join('')
    rows.push((first ? '' : indent + startState) + body + (sgrState(cur, startState) ? RESET : ''))
  }
  return rows
}

/** Wrap every line; `indent` for continuation rows. */
export function wrapAll(lines: string[], width: number, indent = ''): string[] {
  return lines.flatMap((l) => l.split('\n').flatMap((part) => wrap(part, width, indent)))
}

/** Cut a single line to `width` cells (ANSI-aware), adding `…` when cut. */
export function truncate(line: string, width: number): string {
  if (cellWidth(line) <= width) return line
  const toks = tokenize(line)
  let w = 0
  let out = ''
  for (const t of toks) {
    if (t.esc) {
      out += t.s
      continue
    }
    if (w + t.w > width - 1) break
    out += t.s
    w += t.w
  }
  return out + '…' + RESET
}

export const padRight = (s: string, width: number): string => {
  const w = cellWidth(s)
  return w >= width ? s : s + ' '.repeat(width - w)
}

/** A full-width row of `─` (U+2500): screenState's "rule" when ≥ 20 wide. */
export const rule = (width: number, ch = '─'): string => ch.repeat(Math.max(0, width))

/** Left and right text on one row, the right part flush with the edge. */
export function spread(left: string, right: string, width: number): string {
  const gap = width - cellWidth(left) - cellWidth(right)
  if (gap < 2) return truncate(left, width)
  return left + ' '.repeat(gap) + right
}

/* ─────────────────────────── live region ─────────────────────────── */

/**
 * The bottom-of-screen block a TUI redraws in place, in the main buffer.
 * `cursorRow` is how many rows the cursor sits below the region's top, so the
 * next redraw can climb back up before erasing.
 */
export class LiveScreen {
  private cursorRow = 0
  /** Rows of the last drawn region, and how many top rows the viewport clamp dropped. */
  private height = 0
  private dropped = 0
  constructor(
    private readonly out: (s: string) => void,
    private readonly rows: () => number
  ) {}

  private climb(): string {
    return '\r' + (this.cursorRow > 0 ? csi(`${this.cursorRow}A`) : '') + csi('J')
  }

  /** Keep the region within the viewport: the cursor can't climb above it. */
  private clamp(lines: string[], park?: { row: number; col: number }): { lines: string[]; park?: { row: number; col: number } } {
    const max = Math.max(3, this.rows() - 1)
    if (lines.length <= max) return { lines, park }
    const drop = lines.length - max
    this.dropped = drop
    return { lines: lines.slice(drop), park: park ? { row: Math.max(0, park.row - drop), col: park.col } : undefined }
  }

  private draw(lines: string[], park?: { row: number; col: number }): string {
    this.dropped = 0
    const fit = this.clamp(lines, park)
    this.height = fit.lines.length
    let s = fit.lines.join(CRLF)
    let cursorRow = fit.lines.length - 1
    if (fit.park) {
      const up = fit.lines.length - 1 - fit.park.row
      if (up > 0) s += csi(`${up}A`)
      s += '\r' + (fit.park.col > 0 ? csi(`${fit.park.col}C`) : '')
      cursorRow = fit.park.row
    }
    this.cursorRow = cursorRow
    return s
  }

  /** Replace the live region. */
  region(lines: string[], park?: { row: number; col: number }): void {
    this.out(this.climb() + this.draw(lines, park))
  }

  /**
   * Rewrite one row of the drawn region in place (cursor saved and restored),
   * so a ticking spinner costs one row of output instead of the whole block.
   * False when that row is not on screen: the caller redraws instead.
   */
  patch(row: number, line: string): boolean {
    const r = row - this.dropped
    if (r < 0 || r >= this.height) return false
    const up = this.cursorRow - r
    const move = up > 0 ? csi(`${up}A`) : up < 0 ? csi(`${-up}B`) : ''
    this.out(`${ESC}7${move}\r${line}${RESET}${csi('K')}${ESC}8`)
    return true
  }

  /** Print permanent lines above the region, then redraw the region (one write, no flicker). */
  commit(lines: string[], region: string[] = [], park?: { row: number; col: number }): void {
    let s = this.climb() + lines.map((l) => l + RESET + CRLF).join('')
    this.cursorRow = 0
    if (region.length > 0) s += this.draw(region, park)
    this.out(s)
  }

  /** Erase the region and leave the cursor at its top (before exit). */
  clear(): void {
    this.out(this.climb())
    this.cursorRow = 0
    this.height = 0
  }

  /** Forget the region without touching the screen (after a full clear). */
  reset(): void {
    this.cursorRow = 0
    this.height = 0
  }

  /** Leave the region on screen as-is and move below it (exit). */
  release(regionHeight: number): void {
    const down = regionHeight - 1 - this.cursorRow
    this.out((down > 0 ? csi(`${down}B`) : '') + '\r' + CRLF)
    this.cursorRow = 0
  }
}

export const CLEAR_ALL = `${csi('2J')}${csi('3J')}${csi('H')}`
export { hideCursor, showCursor }

/* ─────────────────────────── keys ─────────────────────────── */

export type Key =
  | { name: 'char'; ch: string }
  | { name: 'paste'; text: string }
  | {
      name:
        | 'enter'
        | 'backspace'
        | 'delete'
        | 'up'
        | 'down'
        | 'left'
        | 'right'
        | 'home'
        | 'end'
        | 'esc'
        | 'tab'
        | 'shift-tab'
        | 'ctrl-c'
        | 'ctrl-d'
        | 'ctrl-l'
        | 'ctrl-u'
        | 'ctrl-a'
        | 'ctrl-e'
        | 'ctrl-w'
        | 'ctrl-left'
        | 'ctrl-right'
        | 'newline'
    }

const CSI_KEYS: Record<string, Key['name']> = {
  A: 'up',
  B: 'down',
  C: 'right',
  D: 'left',
  H: 'home',
  F: 'end',
  Z: 'shift-tab'
}

/** Split raw terminal input into keys. Terminal replies (DA, focus, CPR) are dropped. */
export function parseKeys(data: string): Key[] {
  const keys: Key[] = []
  let i = 0
  while (i < data.length) {
    const c = data[i]
    if (c === ESC) {
      const rest = data.slice(i)
      if (rest.startsWith(`${ESC}[200~`)) {
        const end = rest.indexOf(`${ESC}[201~`)
        const text = end < 0 ? rest.slice(6) : rest.slice(6, end)
        keys.push({ name: 'paste', text })
        i += end < 0 ? rest.length : end + 6
        continue
      }
      const m = /^\x1b(?:\[([0-9;?>]*)([A-Za-z~])|O([A-Za-z])|\][^\x07\x1b]*(?:\x07|\x1b\\))/.exec(rest)
      if (m) {
        i += m[0].length
        const params = m[1] ?? ''
        const fin = m[2] ?? m[3] ?? ''
        if (!fin) continue
        if (fin === '~') {
          if (params === '3') keys.push({ name: 'delete' })
          else if (params === '1' || params === '7') keys.push({ name: 'home' })
          else if (params === '4' || params === '8') keys.push({ name: 'end' })
          continue
        }
        if (params.includes(';5') && (fin === 'C' || fin === 'D')) {
          keys.push({ name: fin === 'C' ? 'ctrl-right' : 'ctrl-left' })
          continue
        }
        const name = CSI_KEYS[fin]
        if (name && !params.startsWith('?') && !params.startsWith('>')) keys.push({ name } as Key)
        continue
      }
      if (rest[1] === '\r') {
        keys.push({ name: 'newline' })
        i += 2
        continue
      }
      keys.push({ name: 'esc' })
      i += 1
      continue
    }
    i += 1
    switch (c) {
      case '\r':
        keys.push({ name: 'enter' })
        if (data[i] === '\n') i++
        break
      case '\n':
        keys.push({ name: 'newline' })
        break
      case '\x7f':
      case '\b':
        keys.push({ name: 'backspace' })
        break
      case '\t':
        keys.push({ name: 'tab' })
        break
      case '\x03':
        keys.push({ name: 'ctrl-c' })
        break
      case '\x04':
        keys.push({ name: 'ctrl-d' })
        break
      case '\x0c':
        keys.push({ name: 'ctrl-l' })
        break
      case '\x15':
        keys.push({ name: 'ctrl-u' })
        break
      case '\x01':
        keys.push({ name: 'ctrl-a' })
        break
      case '\x05':
        keys.push({ name: 'ctrl-e' })
        break
      case '\x17':
        keys.push({ name: 'ctrl-w' })
        break
      default: {
        const cp = c.codePointAt(0) ?? 0
        if (cp >= 0xd800 && cp <= 0xdbff && i < data.length) {
          keys.push({ name: 'char', ch: c + data[i] })
          i++
        } else if (cp >= 0x20) keys.push({ name: 'char', ch: c })
      }
    }
  }
  return keys
}

/* ─────────────────────────── line editor ─────────────────────────── */

/** A single-buffer text editor for composers (no real multi-line; `\n` allowed). */
export class LineEditor {
  text = ''
  pos = 0

  set(text: string): void {
    this.text = text
    this.pos = text.length
  }

  clear(): void {
    this.set('')
  }

  insert(s: string): void {
    this.text = this.text.slice(0, this.pos) + s + this.text.slice(this.pos)
    this.pos += s.length
  }

  /** Returns false for keys it does not handle. */
  apply(key: Key): boolean {
    switch (key.name) {
      case 'char':
        this.insert(key.ch)
        return true
      case 'paste':
        this.insert(key.text.replace(/\r\n?/g, '\n'))
        return true
      case 'newline':
        this.insert('\n')
        return true
      case 'backspace':
        if (this.pos > 0) {
          const prev = [...this.text.slice(0, this.pos)].pop() ?? ''
          this.text = this.text.slice(0, this.pos - prev.length) + this.text.slice(this.pos)
          this.pos -= prev.length
        }
        return true
      case 'delete':
        if (this.pos < this.text.length) {
          const next = [...this.text.slice(this.pos)][0] ?? ''
          this.text = this.text.slice(0, this.pos) + this.text.slice(this.pos + next.length)
        }
        return true
      case 'left':
        if (this.pos > 0) this.pos -= ([...this.text.slice(0, this.pos)].pop() ?? '').length
        return true
      case 'right':
        if (this.pos < this.text.length) this.pos += ([...this.text.slice(this.pos)][0] ?? '').length
        return true
      case 'home':
      case 'ctrl-a':
        this.pos = 0
        return true
      case 'end':
      case 'ctrl-e':
        this.pos = this.text.length
        return true
      case 'ctrl-u':
        this.text = this.text.slice(this.pos)
        this.pos = 0
        return true
      case 'ctrl-w': {
        const before = this.text.slice(0, this.pos).replace(/\S+\s*$/, '')
        this.text = before + this.text.slice(this.pos)
        this.pos = before.length
        return true
      }
      case 'ctrl-left': {
        const m = /\S+\s*$/.exec(this.text.slice(0, this.pos))
        this.pos = m ? m.index : 0
        return true
      }
      case 'ctrl-right': {
        const m = /^\s*\S+/.exec(this.text.slice(this.pos))
        this.pos += m ? m[0].length : this.text.length - this.pos
        return true
      }
      default:
        return false
    }
  }

  /**
   * Lay the text out after a `prefix` (e.g. `❯ `), wrapping at `width` with a
   * continuation indent of the prefix's width, the cursor drawn as an inverse
   * cell. Returns the rows and the cursor's row/column.
   */
  layout(prefix: string, width: number, drawCursor = true): { rows: string[]; row: number; col: number } {
    const pw = cellWidth(prefix)
    const inner = Math.max(4, width - pw - 1)
    // Plain chunks with their offsets into `text`.
    const chunks: Array<{ text: string; start: number; lastOfLine: boolean }> = []
    let offset = 0
    for (const ln of this.text.split('\n')) {
      const chars = [...ln]
      if (chars.length === 0) chunks.push({ text: '', start: offset, lastOfLine: true })
      let consumed = 0
      for (let i = 0; i < chars.length; i += inner) {
        const text = chars.slice(i, i + inner).join('')
        chunks.push({ text, start: offset + consumed, lastOfLine: i + inner >= chars.length })
        consumed += text.length
      }
      offset += ln.length + 1
    }
    let row = 0
    let col = pw
    const rows = chunks.map((c, idx) => {
      const end = c.start + c.text.length
      let body = c.text
      if (this.pos >= c.start && (this.pos < end || (this.pos === end && c.lastOfLine))) {
        const at = this.pos - c.start
        const ch = [...c.text.slice(at)][0]
        if (drawCursor) body = c.text.slice(0, at) + inverse(ch ?? ' ') + (ch ? c.text.slice(at + ch.length) : '')
        row = idx
        col = pw + cellWidth(c.text.slice(0, at))
      }
      return (idx === 0 ? prefix : ' '.repeat(pw)) + body
    })
    return { rows, row, col }
  }
}

/* ─────────────────────────── formats ─────────────────────────── */

export const formatTokens = (n: number): string => (n < 1000 ? `${Math.round(n)}` : `${(n / 1000).toFixed(1)}k`)

/** `12s`, `1m 5s`. */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

/** Braille spinner (Gemini, others). */
export const DOTS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** Pick deterministically from a list by a seed string. */
export function pick<T>(list: readonly T[], seed: string | number): T {
  let h = 2166136261
  const s = String(seed)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return list[(h >>> 0) % list.length]
}

/** Markdown-lite for agent prose: **bold**, `code` (coloured), leading `- ` bullets kept. */
export function mdLite(text: string, codeColour: Rgb): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, (_m, b: string) => bold(b))
    .replace(/`([^`]+)`/g, (_m, c: string) => paint(codeColour, c))
}
