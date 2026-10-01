/**
 * The line editor behind every prompt: PSReadLine-like editing (insert
 * anywhere, word moves, selection with Shift+arrows — which the renderer uses
 * to type over a selection — history, Esc to revert), readline-ish keys for Git
 * Bash, and PowerShell 7's grey inline prediction.
 *
 * Cursor maths is relative to where typing starts (the 133;B position), in
 * cells, so wrapped input in a narrow pane redraws in place.
 */
import { csi } from '../util/ansi'
import type { Key } from './keys'

export interface EditorView {
  /** Terminal width. */
  cols: number
  /** Column typing starts at (the prompt's last-row width, mod cols). */
  startCol: number
}

export type EditorAction =
  | { t: 'none' }
  | { t: 'submit'; line: string }
  | { t: 'cancel' }
  | { t: 'complete'; back: boolean }
  | { t: 'clear-screen' }
  | { t: 'eof' }

export interface EditorOptions {
  /** Colour a line for display (PowerShell); must not change its length in cells. */
  highlight?: (line: string) => string[]
  /** Grey inline suggestion after the cursor (PowerShell 7). */
  predict?: (line: string) => string | null
  /** Esc reverts the line (PSReadLine, cmd); bash ignores Esc. */
  escClears: boolean
  /** bash-style Ctrl+A/E/U/K/W. */
  readline: boolean
  /**
   * What a bracketed paste's line breaks become in this one-line buffer: the shell's
   * statement separator, so a pasted script waits for Enter and then runs every line.
   */
  pasteJoin: string
}

export class LineEditor {
  private buf: string[] = []
  private cursor = 0
  private anchor: number | null = null
  /** Cells currently drawn after the input start (text + ghost), to erase on redraw. */
  private drawn = 0
  private histIndex = -1
  private draft = ''

  constructor(
    private readonly view: EditorView,
    private readonly history: () => readonly string[],
    private readonly opts: EditorOptions
  ) {}

  get line(): string {
    return this.buf.join('')
  }

  get cursorPos(): number {
    return this.cursor
  }

  /** A fresh prompt: forget the old line (it was already submitted/cancelled). */
  reset(): void {
    this.buf = []
    this.cursor = 0
    this.anchor = null
    this.drawn = 0
    this.histIndex = -1
    this.draft = ''
  }

  /** Replace the whole line (history, completion, `Shell.run`). */
  setLine(text: string, cursor = text.length): string {
    const from = this.cursor
    this.buf = [...text]
    this.cursor = Math.min(cursor, this.buf.length)
    this.anchor = null
    return this.redraw(from)
  }

  /** Replace `[start, end)` with `text`, cursor after it. */
  splice(start: number, end: number, text: string): string {
    const from = this.cursor
    this.buf.splice(start, end - start, ...text)
    this.cursor = start + [...text].length
    this.anchor = null
    return this.redraw(from)
  }

  /** Where to send the cursor before `\r\n` on submit: end of text, ghost erased. */
  finish(): string {
    const out = this.move(this.cursor, this.buf.length) + (this.drawn > this.buf.length ? csi('J') : '')
    this.cursor = this.buf.length
    this.drawn = this.buf.length
    return out
  }

  /** Redraw after the prompt was reprinted (Ctrl+L). */
  repaint(): string {
    this.drawn = 0
    const cur = this.cursor
    this.cursor = 0
    return this.redraw(0, cur)
  }

  handle(key: Key, out: (s: string) => void): EditorAction {
    const len = this.buf.length
    switch (key.t) {
      case 'text':
      case 'paste': {
        const text = key.t === 'paste' ? key.text.replace(/(\r\n?|\n)+$/, '').replace(/(\r\n?|\n)+/g, this.opts.pasteJoin) : key.text
        this.histIndex = -1
        out(this.insert(text))
        return { t: 'none' }
      }
      case 'enter':
        return { t: 'submit', line: this.line }
      case 'backspace': {
        if (this.deleteSelection(out)) return { t: 'none' }
        if (this.cursor === 0) return { t: 'none' }
        const start = key.word ? this.wordLeft(this.cursor) : this.cursor - 1
        out(this.splice(start, this.cursor, ''))
        return { t: 'none' }
      }
      case 'delete': {
        if (this.deleteSelection(out)) return { t: 'none' }
        if (this.cursor >= len) return { t: 'none' }
        const end = key.word ? this.wordRight(this.cursor) : this.cursor + 1
        const at = this.cursor
        out(this.splice(at, end, ''))
        return { t: 'none' }
      }
      case 'left':
      case 'right':
      case 'home':
      case 'end': {
        const shift = 'shift' in key && key.shift === true
        if (shift && this.anchor === null) this.anchor = this.cursor
        if (!shift && this.anchor !== null) {
          this.anchor = null
          out(this.redraw(this.cursor))
        }
        const word = 'word' in key && key.word === true
        let to = this.cursor
        if (key.t === 'left') to = word ? this.wordLeft(this.cursor) : Math.max(0, this.cursor - 1)
        else if (key.t === 'right') {
          // At the end, → accepts PowerShell 7's inline prediction.
          if (this.cursor === len && !shift) {
            const ghost = this.opts.predict?.(this.line)
            if (ghost) {
              out(this.insert(ghost))
              return { t: 'none' }
            }
          }
          to = word ? this.wordRight(this.cursor) : Math.min(len, this.cursor + 1)
        } else if (key.t === 'home') to = 0
        else {
          const ghost = this.cursor === len && !shift ? this.opts.predict?.(this.line) : null
          if (ghost) {
            out(this.insert(ghost))
            return { t: 'none' }
          }
          to = len
        }
        const from = this.cursor
        this.cursor = to
        out(shift ? this.redraw(from) : this.move(from, to))
        return { t: 'none' }
      }
      case 'up':
      case 'down': {
        const h = this.history()
        if (h.length === 0) return { t: 'none' }
        if (this.histIndex === -1) {
          if (key.t === 'down') return { t: 'none' }
          this.draft = this.line
          this.histIndex = h.length - 1
        } else if (key.t === 'up') {
          this.histIndex = Math.max(0, this.histIndex - 1)
        } else if (this.histIndex >= h.length - 1) {
          this.histIndex = -1
          out(this.setLine(this.draft))
          return { t: 'none' }
        } else {
          this.histIndex++
        }
        out(this.setLine(h[this.histIndex]))
        return { t: 'none' }
      }
      case 'tab':
        return { t: 'complete', back: key.back === true }
      case 'esc':
        if (this.opts.escClears && len > 0) {
          this.histIndex = -1
          out(this.setLine(''))
        }
        return { t: 'none' }
      case 'ctrl':
        return this.ctrl(key.key, out)
      default:
        return { t: 'none' }
    }
  }

  private ctrl(k: string, out: (s: string) => void): EditorAction {
    switch (k) {
      case 'c':
        return { t: 'cancel' }
      case 'l':
        return { t: 'clear-screen' }
      case 'd':
        if (this.buf.length === 0 && this.opts.readline) return { t: 'eof' }
        return this.handle({ t: 'delete' }, out)
      case 'a':
        if (this.opts.readline) return this.handle({ t: 'home' }, out)
        // PSReadLine: Ctrl+A selects the whole line.
        this.anchor = 0
        this.cursor = this.buf.length
        out(this.redraw(this.cursor))
        return { t: 'none' }
      case 'e':
        return this.handle({ t: 'end' }, out)
      case 'u':
        if (this.opts.readline) out(this.splice(0, this.cursor, ''))
        return { t: 'none' }
      case 'k':
        if (this.opts.readline) out(this.splice(this.cursor, this.buf.length, ''))
        return { t: 'none' }
      case 'w':
        if (this.opts.readline) out(this.splice(this.wordLeft(this.cursor), this.cursor, ''))
        return { t: 'none' }
      default:
        return { t: 'none' }
    }
  }

  /** Typed text (replacing a selection). Appending at the end echoes just the new text. */
  insert(text: string): string {
    const chars = [...text].filter((c) => c >= ' ')
    if (chars.length === 0) return ''
    if (this.anchor !== null) {
      const [s, e] = this.selection()
      this.buf.splice(s, e - s)
      this.cursor = s
      this.anchor = null
      const from = this.cursor
      this.buf.splice(this.cursor, 0, ...chars)
      this.cursor += chars.length
      return this.redraw(from)
    }
    const from = this.cursor
    const atEnd = this.cursor === this.buf.length
    this.buf.splice(this.cursor, 0, ...chars)
    this.cursor += chars.length
    if (atEnd && this.drawn <= from && !this.opts.predict) {
      // Fast path: plain echo, coloured like the full redraw would colour it.
      const colours = this.opts.highlight?.(this.line)
      let s = ''
      for (let i = from; i < this.cursor; i++) s += (colours?.[i] ?? '') + this.buf[i]
      if (colours) s += csi('0m')
      this.drawn = this.cursor
      return s + this.wrapFix(this.cursor)
    }
    return this.redraw(from)
  }

  private deleteSelection(out: (s: string) => void): boolean {
    if (this.anchor === null) return false
    const [s, e] = this.selection()
    this.anchor = null
    if (s === e) {
      out(this.redraw(this.cursor))
      return true
    }
    out(this.splice(s, e, ''))
    return true
  }

  private selection(): [number, number] {
    const a = this.anchor ?? this.cursor
    return a < this.cursor ? [a, this.cursor] : [this.cursor, a]
  }

  private wordLeft(from: number): number {
    let i = from
    while (i > 0 && this.buf[i - 1] === ' ') i--
    while (i > 0 && this.buf[i - 1] !== ' ') i--
    return i
  }

  private wordRight(from: number): number {
    let i = from
    const n = this.buf.length
    while (i < n && this.buf[i] !== ' ') i++
    while (i < n && this.buf[i] === ' ') i++
    return i
  }

  /** Redraw everything from the input start; the terminal cursor was at offset `from`. */
  private redraw(from: number, cursorAfter = this.cursor): string {
    const colours = this.opts.highlight?.(this.line)
    const [ss, se] = this.anchor === null ? [-1, -1] : this.selection()
    let body = ''
    for (let i = 0; i < this.buf.length; i++) {
      const sel = i >= ss && i < se
      body += (sel ? csi('0;7m') : i === se && se >= 0 ? csi('0m') : '') + (sel ? '' : colours?.[i] ?? '') + this.buf[i]
    }
    if (colours || ss >= 0) body += csi('0m')
    let end = this.buf.length
    const ghost = this.cursor === this.buf.length && this.anchor === null ? this.opts.predict?.(this.line) : null
    if (ghost) {
      // PSReadLine's InlinePredictionColor.
      body += `${csi('97;2;3m')}${ghost}${csi('0m')}`
      end += [...ghost].length
    }
    const out = this.move(from, 0) + csi('J') + body + this.wrapFix(end) + this.move(end, cursorAfter)
    this.drawn = end
    this.cursor = cursorAfter
    return out
  }

  /**
   * Text ending exactly at the right margin leaves xterm in "pending wrap" on the
   * last column; force the wrap so the cursor maths below stays row/col exact.
   */
  private wrapFix(end: number): string {
    const { cols, startCol } = this.view
    // Space to wrap, back, then ECH to blank it. Not `\r` + EL: erasing a row from
    // column 0 clears xterm's wrapped flag, and a later reflow would split the line there.
    return end > 0 && (startCol + end) % cols === 0 ? ` \b${csi('X')}` : ''
  }

  /** Cursor movement between two input offsets. */
  move(from: number, to: number): string {
    if (from === to) return ''
    const { cols, startCol } = this.view
    const rowOf = (o: number): number => Math.floor((startCol + o) / cols)
    const colOf = (o: number): number => (startCol + o) % cols
    const dr = rowOf(to) - rowOf(from)
    let s = dr < 0 ? csi(`${-dr}A`) : dr > 0 ? csi(`${dr}B`) : ''
    if (dr === 0) {
      const dc = colOf(to) - colOf(from)
      s += dc < 0 ? csi(`${-dc}D`) : csi(`${dc}C`)
    } else {
      const c = colOf(to)
      s += '\r' + (c > 0 ? csi(`${c}C`) : '')
    }
    return s
  }
}
