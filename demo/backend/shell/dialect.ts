/**
 * What differs between PowerShell 5.1, PowerShell 7, cmd and Git Bash: the
 * prompt bytes (terminal-signals.md §3/§7 — byte-exact integration), error
 * text, and how paths are shown.
 */
import type { ShellKind } from '@shared/types'
import { CRLF, cwdReport, mark, setTitle, sgr } from '../util/ansi'
import { familyOf, type Family } from './parse'

export interface PromptInfo {
  cwd: string
  /** Git Bash shows the branch. */
  branch: string | null
  /** Exit code of the last command; undefined on the very first prompt (no 133;D). */
  lastCode: number | undefined
  user: string
  host: string
  home: string
  posix: (path: string) => string
}

export interface Dialect {
  kind: ShellKind
  family: Family
  /** PowerShell 7 (ConciseView errors, `&&`, inline predictions). */
  ps7: boolean
  integrated: boolean
  /** The whole prompt, including every integration mark. */
  prompt(p: PromptInfo): string
  /** Width of the last prompt row in cells — where typing starts. */
  promptWidth(p: PromptInfo): number
  /** Title the shell sets when it starts (ConPTY's window title). */
  startTitle: string | null
  /** Written once before the first prompt. */
  banner(versions: Record<string, string>): string
  /** The cwd as this shell prints it (`pwd`). */
  showPath(path: string, p: Pick<PromptInfo, 'posix'>): string
  /** Exit code a Ctrl+C'd native program leaves behind. */
  interruptCode: number
}

const PS_REPORT = (cwd: string): string => `${mark.promptStart()}${cwdReport(cwd)}`

/** `~/projects/harbor` for Git Bash's `\w`. */
export function bashTilde(path: string, home: string, posix: (p: string) => string): string {
  const pp = posix(path)
  const hp = posix(home)
  if (pp.toLowerCase() === hp.toLowerCase()) return '~'
  if (pp.toLowerCase().startsWith(hp.toLowerCase() + '/')) return '~' + pp.slice(hp.length)
  return pp
}

export function dialectFor(kind: ShellKind): Dialect {
  const family = familyOf(kind)
  if (family === 'ps') {
    return {
      kind,
      family,
      ps7: kind === 'pwsh',
      integrated: true,
      // integration.ps1: [D;ec] A, 9;9 cwd, the prompt text, B. Bracketed paste is on while
      // the line is read, so a multi-line paste lands in the buffer instead of running line by line.
      prompt: (p) =>
        `${p.lastCode === undefined ? '' : mark.commandEnd(p.lastCode)}${PS_REPORT(p.cwd)}PS ${p.cwd}> ${mark.inputStart()}\x1b[?2004h`,
      promptWidth: (p) => `PS ${p.cwd}> `.length,
      startTitle: kind === 'pwsh' ? 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' : 'Windows PowerShell',
      banner: () => '',
      showPath: (path) => path,
      // STATUS_CONTROL_C_EXIT as a signed int — what $LASTEXITCODE holds.
      interruptCode: -1073741510
    }
  }
  if (family === 'cmd') {
    return {
      kind,
      family,
      ps7: false,
      integrated: false,
      prompt: (p) => `${p.lastCode === undefined ? '' : CRLF}${p.cwd}>`,
      promptWidth: (p) => `${p.cwd}>`.length,
      startTitle: 'C:\\WINDOWS\\system32\\cmd.exe',
      banner: (v) => `Microsoft Windows [Version ${v.windows ?? '10.0.26200.6584'}]${CRLF}(c) Microsoft Corporation. All rights reserved.${CRLF}${CRLF}`,
      showPath: (path) => path,
      interruptCode: -1073741510
    }
  }
  return {
    kind,
    family,
    ps7: false,
    integrated: true,
    // integration.bash: PROMPT_COMMAND = [D;$?] A 9;9 $PWD; git-prompt.sh's PS1 (title,
    // blank line, user@host MSYSTEM path (branch), `$ `) + B. Bracketed paste on at the prompt.
    prompt: (p) => {
      const pwd = p.posix(p.cwd)
      const where = bashTilde(p.cwd, p.home, p.posix)
      return (
        `${p.lastCode === undefined ? '' : mark.commandEnd(p.lastCode)}${mark.promptStart()}${cwdReport(pwd)}` +
        `${setTitle(`MINGW64:${pwd}`)}${CRLF}` +
        `${sgr.green}${p.user}@${p.host} ${sgr.magenta}MINGW64 ${sgr.yellow}${where}` +
        `${p.branch ? `${sgr.cyan} (${p.branch})` : ''}${sgr.reset}${CRLF}$ ${mark.inputStart()}\x1b[?2004h`
      )
    },
    promptWidth: () => 2,
    startTitle: null,
    banner: () => '',
    showPath: (path, p) => p.posix(path),
    interruptCode: 130
  }
}

/* ─────────────────────────── error text ─────────────────────────── */

export interface PsErrorInfo {
  /** `Get-ChildItem`; empty for errors that aren't from a cmdlet (not-recognized). */
  source: string
  message: string
  /** The whole statement as typed, for `At line:1 char:N` and the squiggle. */
  line: string
  /** 0-based offset + length of the offending text in `line`. */
  offset: number
  length: number
  category: string
  fqid: string
}

/** A PowerShell error record as the default view prints it (5.1 NormalView / 7 ConciseView). */
export function psError(ps7: boolean, e: PsErrorInfo): string {
  if (ps7) {
    const head = e.source ? `${e.source}: ` : ''
    return e.message
      .split('\n')
      .map((l, i) => `\x1b[31;1m${i === 0 ? head : ''}${l}\x1b[0m`)
      .join(CRLF) + CRLF
  }
  const red = '\x1b[91m'
  const squiggle = ' '.repeat(e.offset) + '~'.repeat(Math.max(1, e.length))
  const lines = [
    `${e.source ? `${e.source} : ` : ''}${e.message.replace(/\n/g, ' ')}`,
    `At line:1 char:${e.offset + 1}`,
    `+ ${e.line}`,
    `+ ${squiggle}`,
    `    + CategoryInfo          : ${e.category}`,
    `    + FullyQualifiedErrorId : ${e.fqid}`,
    ''
  ]
  return lines.map((l) => (l ? `${red}${l}${sgr.reset}` : l)).join(CRLF) + CRLF
}

/** Every shell's "no such command" text. */
export function notFound(d: Dialect, name: string, line: string, offset: number): string {
  if (d.family === 'bash') return `bash: ${name}: command not found${CRLF}`
  if (d.family === 'cmd') {
    return `'${name}' is not recognized as an internal or external command,${CRLF}operable program or batch file.${CRLF}`
  }
  if (d.ps7) {
    return psError(true, {
      source: name,
      message:
        `The term '${name}' is not recognized as a name of a cmdlet, function, script file, or executable program.\n` +
        'Check the spelling of the name, or if a path was included, verify that the path is correct and try again.',
      line,
      offset,
      length: name.length,
      category: '',
      fqid: ''
    })
  }
  return psError(false, {
    source: name,
    message:
      `The term '${name}' is not recognized as the name of a cmdlet, function, script file, or operable program. ` +
      'Check the spelling of the name, or if a path was included, verify that the path is correct and try again.',
    line,
    offset,
    length: name.length,
    category: `ObjectNotFound: (${name}:String) [], CommandNotFoundException`,
    fqid: 'CommandNotFoundException'
  })
}

export const demoTip = (): string => `${sgr.dim}Tip: type help to see what this demo can run.${sgr.reset}${CRLF}`
