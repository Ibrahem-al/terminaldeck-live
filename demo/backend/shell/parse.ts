/**
 * Command-line parsing for the three shell families: statements joined by
 * `;` / `&&` / `||` (cmd: `&`), pipelines, `>` / `>>` redirects, quoting and
 * variable expansion. Deliberately small — enough for what people type at a
 * prompt, not a language implementation.
 */
import type { ShellKind } from '@shared/types'

export type Family = 'ps' | 'cmd' | 'bash'

export const familyOf = (kind: ShellKind): Family =>
  kind === 'cmd' ? 'cmd' : kind === 'gitbash' ? 'bash' : 'ps'

export interface Word {
  /** After quote removal and expansion. */
  value: string
  /** As typed. */
  raw: string
  /** Offset of the word in the whole line (for PowerShell's `char:N` + squiggle). */
  start: number
  quoted: boolean
}

export interface SimpleCommand {
  words: Word[]
  redirect?: { path: string; append: boolean }
  /** The command's own text, trimmed. */
  text: string
  start: number
}

export interface Pipeline {
  /** How this pipeline joins the previous one (the first has ';'). */
  op: ';' | '&&' | '||'
  commands: SimpleCommand[]
  text: string
}

export type ParseResult = { ok: true; pipelines: Pipeline[] } | { ok: false; error: ParseError }

export interface ParseError {
  kind: 'and-or-unsupported' | 'unclosed-quote' | 'empty-pipe'
  token: string
  offset: number
}

export interface ExpandEnv {
  env: Record<string, string>
  home: string
  cwd: string
  /** bash `$PWD` and `~` are MSYS paths. */
  posix?: (path: string) => string
}

/** Case-insensitive environment lookup (Windows env names are). */
export function envGet(env: Record<string, string>, name: string): string | undefined {
  if (name in env) return env[name]
  const lower = name.toLowerCase()
  for (const k of Object.keys(env)) if (k.toLowerCase() === lower) return env[k]
  return undefined
}

/** cmd's `%NAME%` expansion (unknown names stay as typed, like cmd). */
export function expandCmdVars(text: string, x: ExpandEnv): string {
  return text.replace(/%([^%\s]+)%/g, (m, name: string) => cmdVar(name, x) ?? m)
}

export function parseLine(line: string, family: Family, psVersion7: boolean, x: ExpandEnv): ParseResult {
  const pipelines: Pipeline[] = []
  let words: Word[] = []
  let commands: SimpleCommand[] = []
  let redirect: SimpleCommand['redirect']
  let pendingRedirect: { append: boolean } | null = null
  let op: Pipeline['op'] = ';'
  let cmdStart = -1
  let pipeStart = 0

  let cur = ''
  let raw = ''
  let wordStart = -1
  let quoted = false
  let inWord = false

  const endWord = (): void => {
    if (!inWord) return
    const w: Word = { value: cur, raw, start: wordStart, quoted }
    if (pendingRedirect) {
      redirect = { path: w.value, append: pendingRedirect.append }
      pendingRedirect = null
    } else {
      if (!quoted && family === 'bash' && (w.value === '~' || w.value.startsWith('~/'))) {
        w.value = (x.posix ? x.posix(x.home) : x.home) + w.value.slice(1)
      }
      words.push(w)
    }
    cur = ''
    raw = ''
    quoted = false
    inWord = false
    wordStart = -1
  }
  const startWord = (i: number): void => {
    if (!inWord) {
      inWord = true
      wordStart = i
      if (cmdStart < 0) cmdStart = i
    }
  }
  const endCommand = (end: number): boolean => {
    endWord()
    if (words.length === 0 && !redirect) return false
    commands.push({ words, redirect, text: line.slice(cmdStart, end).trim(), start: cmdStart })
    words = []
    redirect = undefined
    cmdStart = -1
    return true
  }
  const endPipeline = (end: number): void => {
    endCommand(end)
    if (commands.length > 0) pipelines.push({ op, commands, text: line.slice(pipeStart, end).trim() })
    commands = []
  }

  let i = 0
  while (i < line.length) {
    const ch = line[i]
    const next = line[i + 1]

    // Quotes.
    if (ch === "'" && family !== 'cmd') {
      startWord(i)
      const end = line.indexOf("'", i + 1)
      if (end < 0) return { ok: false, error: { kind: 'unclosed-quote', token: "'", offset: i } }
      cur += line.slice(i + 1, end)
      raw += line.slice(i, end + 1)
      quoted = true
      i = end + 1
      continue
    }
    if (ch === '"') {
      startWord(i)
      let j = i + 1
      let body = ''
      while (j < line.length && line[j] !== '"') {
        if (family === 'ps' && line[j] === '`' && j + 1 < line.length) {
          body += escapePs(line[j + 1])
          j += 2
        } else if (family === 'bash' && line[j] === '\\' && '"\\$`'.includes(line[j + 1] ?? '')) {
          body += line[j + 1]
          j += 2
        } else if (family !== 'cmd' && line[j] === '$') {
          const [value, len] = expandVar(line, j, family, x)
          body += value
          j += len
        } else {
          body += line[j]
          j++
        }
      }
      if (j >= line.length) return { ok: false, error: { kind: 'unclosed-quote', token: '"', offset: i } }
      cur += body
      raw += line.slice(i, j + 1)
      quoted = true
      i = j + 1
      continue
    }

    // Separators.
    if (ch === ' ' || ch === '\t') {
      endWord()
      i++
      continue
    }
    if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
      if (family === 'ps' && !psVersion7) {
        return { ok: false, error: { kind: 'and-or-unsupported', token: ch + next, offset: i } }
      }
      endPipeline(i)
      op = ch === '&' ? '&&' : '||'
      i += 2
      pipeStart = i
      continue
    }
    if (ch === ';' && family !== 'cmd') {
      endPipeline(i)
      op = ';'
      i++
      pipeStart = i
      continue
    }
    if (ch === '&' && family === 'cmd') {
      endPipeline(i)
      op = ';'
      i++
      pipeStart = i
      continue
    }
    if (ch === '&' && family === 'ps' && !inWord && words.length === 0) {
      // The call operator: `& claude.exe`.
      i++
      continue
    }
    if (ch === '|') {
      if (!endCommand(i)) return { ok: false, error: { kind: 'empty-pipe', token: '|', offset: i } }
      i++
      continue
    }
    if (ch === '>' || (ch === '2' && next === '>' && !inWord)) {
      endWord()
      if (ch === '2') {
        // 2>&1, 2>$null, 2>/dev/null: stderr isn't separate here; drop the target.
        const m = /^2>(?:&1|\$null|\/dev\/null|nul|>?\S*)/i.exec(line.slice(i))
        i += m ? m[0].length : 2
        continue
      }
      const append = next === '>'
      pendingRedirect = { append }
      i += append ? 2 : 1
      continue
    }

    // Plain characters, escapes and variables.
    startWord(i)
    if (family === 'ps' && ch === '`' && next !== undefined) {
      cur += escapePs(next)
      raw += ch + next
      i += 2
      continue
    }
    if (family === 'bash' && ch === '\\' && next !== undefined) {
      cur += next
      raw += ch + next
      i += 2
      continue
    }
    if (family !== 'cmd' && ch === '$' && next !== undefined && /[A-Za-z_{?]/.test(next)) {
      const [value, len] = expandVar(line, i, family, x)
      cur += value
      raw += line.slice(i, i + len)
      i += len
      continue
    }
    cur += ch
    raw += ch
    i++
  }
  endPipeline(line.length)
  return { ok: true, pipelines }
}

function escapePs(c: string): string {
  return c === 'n' ? '\n' : c === 't' ? '\t' : c === 'e' ? '\x1b' : c === '0' ? '' : c
}

function cmdVar(name: string, x: ExpandEnv): string | undefined {
  const upper = name.toUpperCase()
  if (upper === 'CD') return x.cwd
  if (upper === 'DATE') return new Date().toLocaleDateString('en-US', { weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric' }).replace(',', '')
  if (upper === 'TIME') return new Date().toTimeString().slice(0, 8) + '.00'
  if (upper === 'ERRORLEVEL') return '0'
  return envGet(x.env, name)
}

/** Expand the `$…` at `i`. Returns the value and how many characters it used. */
function expandVar(line: string, i: number, family: Family, x: ExpandEnv): [string, number] {
  const rest = line.slice(i)
  if (family === 'ps') {
    const m = /^\$(?:\{([^}]+)\}|(env:[A-Za-z_][\w()]*|[A-Za-z_?][\w]*))/.exec(rest)
    if (!m) return ['$', 1]
    const name = (m[1] ?? m[2]).toLowerCase()
    return [psVar(name, x), m[0].length]
  }
  const m = /^\$(?:\{([^}]+)\}|([A-Za-z_][\w]*|\?))/.exec(rest)
  if (!m) return ['$', 1]
  const name = m[1] ?? m[2]
  if (name === 'PWD') return [x.posix ? x.posix(x.cwd) : x.cwd, m[0].length]
  if (name === 'HOME') return [x.posix ? x.posix(x.home) : x.home, m[0].length]
  if (name === '?') return ['0', m[0].length]
  return [x.env[name] ?? '', m[0].length]
}

function psVar(name: string, x: ExpandEnv): string {
  if (name.startsWith('env:')) return envGet(x.env, name.slice(4)) ?? ''
  switch (name) {
    case 'home':
      return x.home
    case 'pwd':
      return x.cwd
    case 'true':
      return 'True'
    case 'false':
      return 'False'
    case 'null':
      return ''
    case '?':
      return 'True'
    case 'pid':
      return '14332'
    case 'profile':
      return `${x.home}\\Documents\\WindowsPowerShell\\Microsoft.PowerShell_profile.ps1`
    default:
      return ''
  }
}
