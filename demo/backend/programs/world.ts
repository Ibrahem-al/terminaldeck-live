/**
 * What an agent can touch: files (Vfs), commands (a headless Shell), sibling
 * panes (DeckTools), the notch hook server (NotchController). Every call is
 * guarded — a neighbouring module may still be a stub, or throw — so an agent
 * degrades to canned-but-consistent output instead of breaking the pane.
 */
import type { DeckPaneInfo } from '@shared/types'
import type {
  Backend,
  FramedMessage,
  HookEventName,
  PtySession,
  SendMessageResult,
  Timers
} from '../contracts'
import { stripAnsi } from '../util/ansi'

export interface RunResult {
  command: string
  output: string
  code: number
}

export interface GrepHit {
  path: string
  line: number
  text: string
}

export class World {
  constructor(
    readonly backend: Backend,
    readonly session: PtySession,
    /** The directory the agent was launched in. */
    readonly cwd: string
  ) {}

  /* ── paths ── */

  /** The project root: the git repo holding cwd, else cwd. */
  get root(): string {
    try {
      return this.backend.vfs.git(this.cwd)?.root ?? this.cwd
    } catch {
      return this.cwd
    }
  }

  abs(rel: string): string {
    try {
      return this.backend.vfs.resolve(this.root, rel)
    } catch {
      return `${this.root}\\${rel.replace(/\//g, '\\')}`
    }
  }

  /** How agents print a path: relative to their cwd, Windows separators. */
  show(path: string): string {
    const abs = /^[a-z]:/i.test(path) ? path : this.abs(path)
    try {
      const rel = this.backend.vfs.relative(this.cwd, abs)
      return rel && !rel.startsWith('..') ? rel : abs
    } catch {
      return path.replace(/\//g, '\\')
    }
  }

  /** The same, with `/` (imports, test runner paths, Codex's history cells). */
  showPosix(path: string): string {
    return this.show(path).replace(/\\/g, '/')
  }

  /** An absolute path as project-relative with `/` (the form plans use); outside the project it stays absolute. */
  rel(abs: string): string {
    const root = this.root
    const a = abs.replace(/\//g, '\\')
    if (a.toLowerCase() === root.toLowerCase()) return '.'
    return (a.toLowerCase().startsWith(`${root.toLowerCase()}\\`) ? a.slice(root.length + 1) : a).replace(/\\/g, '/')
  }

  /** A path the user typed relative to the agent's cwd, as a project-relative path if it exists. */
  fromCwd(typed: string): string | null {
    try {
      const abs = this.backend.vfs.resolve(this.cwd, typed.replace(/\//g, '\\'))
      return this.backend.vfs.exists(abs) ? this.rel(abs) : null
    } catch {
      return null
    }
  }

  /* ── files ── */

  read(rel: string): string | null {
    try {
      return this.backend.vfs.readFile(this.abs(rel))
    } catch {
      return null
    }
  }

  exists(rel: string): boolean {
    try {
      return this.backend.vfs.exists(this.abs(rel))
    } catch {
      return false
    }
  }

  /** Returns an error message, or null on success. */
  write(rel: string, content: string): string | null {
    try {
      this.backend.vfs.writeFile(this.abs(rel), content, { createDirs: true })
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }

  list(rel: string): Array<{ name: string; isDir: boolean }> {
    try {
      return this.backend.vfs.readDir(this.abs(rel)).map((e) => ({ name: e.name, isDir: e.isDir }))
    } catch {
      return []
    }
  }

  grep(pattern: string | RegExp, rel = '.', opts?: { glob?: string; limit?: number }): GrepHit[] {
    try {
      return this.backend.vfs
        .grep(this.abs(rel), pattern, { ignoreCase: typeof pattern === 'string', limit: opts?.limit ?? 50, glob: opts?.glob })
        .filter((h) => !/[\\/]node_modules[\\/]/i.test(h.path))
    } catch {
      return []
    }
  }

  /** File-name search, best first (absolute paths). */
  findFiles(query: string, limit = 10): string[] {
    try {
      return this.backend.vfs.search(this.root, query, { limit })
    } catch {
      return []
    }
  }

  /* ── commands ── */

  /**
   * Run a command line the way the agent's Bash tool would: headless, through
   * the demo's own interpreter in the agent's cwd and shell dialect. Falls
   * back to `fallback` when the shell fails, doesn't know the command, or
   * takes too long.
   */
  async exec(
    commandLine: string,
    timers: Timers,
    fallback: () => RunResult | null
  ): Promise<RunResult> {
    const canned = (): RunResult =>
      fallback() ?? { command: commandLine, output: `${commandLine.split(' ')[0]}: finished`, code: 0 }
    const stop = new AbortController()
    try {
      const run = this.backend.shells.exec(commandLine, {
        cwd: this.cwd,
        kind: this.session.kind === 'cmd' ? 'powershell' : this.session.kind,
        env: { ...this.session.env },
        cols: 100,
        signal: stop.signal
      })
      const result = await Promise.race([run, timers.sleep(12_000).then(() => null)])
      if (!result) {
        stop.abort()
        return canned()
      }
      const output = cleanOutput(result.output)
      if (!output.trim() || /is not recognized|command not found|not wired|is not supported in this demo/i.test(output))
        return canned()
      return { command: commandLine, output, code: result.code }
    } catch {
      stop.abort()
      return canned()
    }
  }

  /* ── deck tools ── */

  myPaneId(): string | undefined {
    return this.session.paneId
  }

  panes(): DeckPaneInfo[] {
    try {
      return this.backend.deck.panes()
    } catch {
      return []
    }
  }

  pane(paneId: string): DeckPaneInfo | undefined {
    return this.panes().find((p) => p.paneId === paneId)
  }

  /** The pane of another agent, by kind (`codex`, `claude`). */
  findAgentPane(kind: string): DeckPaneInfo | undefined {
    const mine = this.myPaneId()
    const others = this.panes().filter((p) => p.kind === 'terminal' && p.paneId !== mine)
    return (
      others.find((p) => p.agent === kind) ??
      others.find((p) => (p.autoRun ?? '').toLowerCase().startsWith(kind)) ??
      others.find((p) => p.name.toLowerCase().includes(kind))
    )
  }

  async sendMessage(toPaneId: string, text: string, replyTo?: number): Promise<SendMessageResult> {
    const from = this.myPaneId()
    if (!from) return { ok: false, error: 'This pane has no id, so it cannot send messages.' }
    try {
      return await this.backend.deck.sendMessage(from, toPaneId, text, replyTo === undefined ? undefined : { replyTo })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  parseFramed(text: string): FramedMessage | null {
    try {
      const parsed = this.backend.deck.parseFramed(text)
      if (parsed) return parsed
    } catch {
      /* fall through to our own parser */
    }
    return parseFramedLocal(text)
  }

  /* ── hooks ── */

  hook(event: HookEventName, message?: string): void {
    try {
      this.backend.notch.hook(this.session.id, event, message ? { message } : undefined)
    } catch {
      /* the notch is optional */
    }
  }
}

/** Captured output without the terminal-only sequences (titles, marks, mode switches). */
function cleanOutput(raw: string): string {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[\?[0-9;]*[hl]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n+$/, '')
}

/** Plain lines of captured output (ANSI kept for colour, trailing blanks dropped). */
export function outputLines(output: string): string[] {
  const lines = output.split(/\r?\n/)
  while (lines.length > 0 && stripAnsi(lines[lines.length - 1]).trim() === '') lines.pop()
  while (lines.length > 0 && stripAnsi(lines[0]).trim() === '') lines.shift()
  return lines
}

const FRAME_RE =
  /\[TerminalDeck msg #(\d+)(?: re #(\d+))? from (.+?) in pane (\S+) "([^"]*)",[^\]]*\]\s*<<msg ([0-9a-f]+)>>\s*([\s\S]*?)\s*<<end \6>>/

export function parseFramedLocal(text: string): FramedMessage | null {
  const m = FRAME_RE.exec(text)
  if (!m) return null
  return {
    id: Number(m[1]),
    replyTo: m[2] ? Number(m[2]) : undefined,
    fromAgent: m[3],
    fromPaneId: m[4],
    fromName: m[5],
    nonce: m[6],
    body: m[7].replace(/ ⏎ /g, '\n')
  }
}
