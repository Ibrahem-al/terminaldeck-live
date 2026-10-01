/**
 * Terminal input → key events. xterm.js sends keystrokes, pastes and its own
 * automatic replies (DA, DSR, CPR, OSC colour answers — terminal-signals.md
 * §10) down the same pipe; replies must be swallowed, never echoed.
 */

export type Key =
  | { t: 'text'; text: string }
  | { t: 'paste'; text: string }
  | { t: 'enter' }
  | { t: 'backspace'; word?: boolean }
  | { t: 'delete'; word?: boolean }
  | { t: 'tab'; back?: boolean }
  | { t: 'esc' }
  | { t: 'left' | 'right'; word?: boolean; shift?: boolean }
  | { t: 'home' | 'end'; shift?: boolean }
  | { t: 'up' | 'down' }
  | { t: 'ctrl'; key: string }
  | { t: 'ignored' }

const CSI_RE = /^\x1b\[([0-?]*)([ -/]*)([@-~])/
const STRING_RE = /^\x1b[\]P_^][\s\S]*?(?:\x07|\x1b\\)/
const PASTE_START = '\x1b[200~'
const PASTE_END = '\x1b[201~'

/** Split one `pty_write` chunk into key events. */
export function parseKeys(data: string): Key[] {
  const keys: Key[] = []
  let text = ''
  const flush = (): void => {
    if (text) keys.push({ t: 'text', text })
    text = ''
  }
  let i = 0
  while (i < data.length) {
    const rest = data.slice(i)
    if (rest.startsWith(PASTE_START)) {
      flush()
      const end = rest.indexOf(PASTE_END)
      const body = end < 0 ? rest.slice(PASTE_START.length) : rest.slice(PASTE_START.length, end)
      keys.push({ t: 'paste', text: body })
      i += end < 0 ? rest.length : end + PASTE_END.length
      continue
    }
    const ch = data[i]
    if (ch === '\x1b') {
      flush()
      const consumed = parseEscape(rest, keys)
      i += consumed
      continue
    }
    const code = ch.charCodeAt(0)
    if (ch === '\r' || ch === '\n') {
      flush()
      keys.push({ t: 'enter' })
      // A pasted CRLF is one Enter.
      if (ch === '\r' && data[i + 1] === '\n') i++
    } else if (ch === '\x7f') {
      flush()
      keys.push({ t: 'backspace' })
    } else if (ch === '\b') {
      // xterm sends ^H for Ctrl+Backspace.
      flush()
      keys.push({ t: 'backspace', word: true })
    } else if (ch === '\t') {
      flush()
      keys.push({ t: 'tab' })
    } else if (code < 0x20) {
      flush()
      keys.push({ t: 'ctrl', key: String.fromCharCode(code + 0x60) })
    } else {
      text += ch
    }
    i++
  }
  flush()
  return keys
}

function parseEscape(s: string, keys: Key[]): number {
  if (s.length === 1) {
    keys.push({ t: 'esc' })
    return 1
  }
  const str = STRING_RE.exec(s)
  if (str) {
    // OSC / DCS replies (colour queries, DECRQSS): never input.
    keys.push({ t: 'ignored' })
    return str[0].length
  }
  const csi = CSI_RE.exec(s)
  if (csi) {
    keys.push(csiKey(csi[1], csi[3]))
    return csi[0].length
  }
  if (s[1] === 'O' && s.length >= 3) {
    // SS3: application-cursor arrows and Home/End.
    const map: Record<string, Key> = {
      A: { t: 'up' },
      B: { t: 'down' },
      C: { t: 'right' },
      D: { t: 'left' },
      H: { t: 'home' },
      F: { t: 'end' }
    }
    keys.push(map[s[2]] ?? { t: 'ignored' })
    return 3
  }
  if (s[1] === '\x1b') {
    keys.push({ t: 'esc' })
    return 1
  }
  // Alt+key: Alt+B / Alt+F word moves (bash), Alt+Backspace; anything else ignored.
  const alt = s[1]
  if (alt === 'b') keys.push({ t: 'left', word: true })
  else if (alt === 'f') keys.push({ t: 'right', word: true })
  else if (alt === '\x7f') keys.push({ t: 'backspace', word: true })
  else keys.push({ t: 'ignored' })
  return 2
}

function csiKey(params: string, final: string): Key {
  const parts = params.split(';')
  const mod = Number(parts[1] ?? 1) - 1
  const shift = (mod & 1) !== 0
  const ctrl = (mod & 4) !== 0
  switch (final) {
    case 'A':
      return { t: 'up' }
    case 'B':
      return { t: 'down' }
    case 'C':
      return { t: 'right', word: ctrl, shift }
    case 'D':
      return { t: 'left', word: ctrl, shift }
    case 'H':
      return { t: 'home', shift }
    case 'F':
      return { t: 'end', shift }
    case 'Z':
      return { t: 'tab', back: true }
    case '~':
      switch (parts[0]) {
        case '1':
        case '7':
          return { t: 'home', shift }
        case '4':
        case '8':
          return { t: 'end', shift }
        case '3':
          return { t: 'delete', word: ctrl }
        default:
          return { t: 'ignored' }
      }
    default:
      // DA/DSR/CPR/DECRQM replies, focus reports, mouse reports.
      return { t: 'ignored' }
  }
}
