/**
 * The lighter agents (agent-tuis.md §4): aider, opencode, copilot, qwen,
 * cursor-agent, amp. One configurable TUI: a banner, a prompt line, a spinner
 * row, one-line tool notes and prose. They run the same brain, so a prompt
 * still reads and edits the real Vfs. All of them are `other` to the renderer.
 */
import type { Program, ProgramLaunch, ProgramSpec } from '../contracts'
import { cellWidth } from '../util/ansi'
import { diffStat } from '../util/diff'
import type { AgentName, TodoItem } from './brain'
import { AgentTui, type PermissionReq, type ToolEvent } from './agent'
import { oneshotAnswer, positional, printProgram } from './oneshot'
import { DOTS, bold, dim, gradient, mdLite, paint, spread, truncate, wrapAll, type Rgb } from './tui-kit'

interface LiteLook {
  name: string
  version: string
  accent: Rgb
  banner: (cols: number, cwd: string, branch: string) => string[]
  /** Draws the whole screen (alternate buffer) instead of scrolling in the terminal. */
  fullscreen?: boolean
  /** Tool calls as one-line notes; aider shows none for reads and searches. */
  quietTools?: boolean
  /** Prompt glyph at the start of the input line. */
  prompt: string
  placeholder: string
  /** Boxed input (opencode, copilot, qwen, amp) vs a bare line (aider, cursor). */
  boxed: boolean
  footer: (cols: number) => string
  spinner: string[]
  thinking: string
  interruptHint: string
  /** One-line permission question (aider style) or a numbered menu. */
  confirm: (cmd: string) => string
}

class LiteAgent extends AgentTui {
  readonly agent: AgentName = 'other'
  protected readonly tickMs = 110

  constructor(
    private readonly look: LiteLook,
    private readonly launch: ProgramLaunch
  ) {
    super()
    this.altScreen = look.fullscreen === true
  }

  protected voice(): string {
    return this.look.name
  }

  protected onLaunch(): void {
    this.io.setTitle(this.look.name)
    const prompt = positional(this.launch.argv, ['--model', '-m'])
    if (prompt) this.io.timers.setTimeout(() => void this.runPrompt(prompt), 500)
  }

  private async runPrompt(prompt: string): Promise<void> {
    this.commit((cols) => this.userEcho(prompt, cols), { k: 'user', text: prompt })
    await this.runTurn(prompt, null)
  }

  protected header(cols: number): string[] {
    let branch = ''
    try {
      branch = this.io.backend.vfs.git(this.io.cwd)?.currentBranch() ?? ''
    } catch {
      branch = ''
    }
    return this.look.banner(cols, this.io.cwd, branch).map((l) => truncate(l, cols))
  }

  protected composer(cols: number): { lines: string[]; park: { row: number; col: number } } {
    const L = this.look
    const prefix = `${paint(L.accent, L.prompt)} `
    const pw = cellWidth(prefix)
    let rows: string[]
    let row = 0
    let col = pw
    if (this.editor.text === '') rows = [`${prefix}${dim(truncate(L.placeholder, cols - pw - 4))}`]
    else {
      const lay = this.editor.layout(prefix, L.boxed ? cols - 4 : cols)
      rows = lay.rows
      row = lay.row
      col = lay.col
    }
    const footer = this.flash ? dim(this.flash) : L.footer(cols)
    if (!L.boxed) return { lines: ['', ...rows, footer], park: { row: 1 + row, col } }
    const inner = cols - 4
    const edge = (a: string, b: string): string => dim(`${a}${'─'.repeat(cols - 2)}${b}`)
    return {
      lines: [
        '',
        edge('╭', '╮'),
        ...rows.map((r) => `${dim('│')} ${r}${' '.repeat(Math.max(0, inner - cellWidth(r)))} ${dim('│')}`),
        edge('╰', '╯'),
        footer
      ],
      park: { row: 2 + row, col: col + 2 }
    }
  }

  protected status(cols: number): string[] {
    const w = this.work
    const L = this.look
    const secs = Math.floor((Date.now() - w.startedAt) / 1000)
    return [truncate(`${paint(L.accent, L.spinner[w.frame % L.spinner.length])} ${w.activity ?? L.thinking} ${dim(`${secs}s · ${L.interruptHint}`)}`, cols)]
  }

  protected userEcho(text: string, cols: number): string[] {
    return [...wrapAll([`${paint(this.look.accent, this.look.prompt)} ${bold(text)}`], cols, '  '), '']
  }

  protected prose(text: string, cols: number): string[] {
    return [...this.wrapProse(mdLite(text, this.look.accent), cols, '', ''), '']
  }

  protected tool(ev: ToolEvent, cols: number): string[] {
    const w = this.world
    const note = (s: string): string[] => [truncate(`${dim('›')} ${s}`, cols)]
    if (this.look.quietTools && (ev.kind === 'read' || ev.kind === 'search' || ev.kind === 'list')) return []
    switch (ev.kind) {
      case 'read':
        return note(`Read ${ev.files.map((f) => w.showPosix(f.path)).join(', ')}`)
      case 'search':
        return note(`Searched for "${ev.pattern}" (${ev.matches} matches)`)
      case 'list':
        return note(`Listed ${w.showPosix(ev.path)} (${ev.entries.length} entries)`)
      case 'edit': {
        if (ev.error || ev.after === null) return note(paint([240, 100, 100], `Failed to edit ${w.showPosix(ev.path)}`))
        const s = diffStat(ev.before ?? '', ev.after)
        return [...note(`${ev.before === null ? 'Created' : 'Applied edit to'} ${bold(w.showPosix(ev.path))} ${paint([110, 190, 120], `+${s.added}`)} ${paint([224, 108, 117], `-${s.removed}`)}`), '']
      }
      case 'run': {
        const out = this.clip(ev.output, 6)
        return [...note(`Ran ${bold(ev.command)}`), ...out.lines.map((l) => truncate(`  ${l}`, cols)), ...(out.more ? [dim(`  … ${out.more} more lines`)] : []), '']
      }
      case 'message':
        return note(`send_message → pane ${ev.to}: ${ev.result.ok ? 'queued' : ev.result.error ?? 'refused'}`)
    }
  }

  protected todoList(_items: TodoItem[]): string[] {
    return []
  }

  protected permission(req: PermissionReq, sel: number, cols: number): string[] {
    if (req.kind !== 'bash') return ['', `${bold('Proceed with the plan?')} ${dim('(Y)es/(N)o')}`]
    const opts = ['Yes', "Yes, don't ask again", 'No']
    return [
      '',
      ...wrapAll([this.look.confirm(req.command)], cols, ''),
      ...opts.map((o, i) => (i === sel ? paint(this.look.accent, `❯ ${i + 1}. ${o}`) : `  ${i + 1}. ${o}`))
    ]
  }

  protected permissionHotkeys(): Record<string, number> {
    return { y: 0, d: 1, a: 1, n: 2 }
  }

  protected interrupted(): string[] {
    return [dim('^C Interrupted.'), '']
  }

  protected turnDone(ms: number): string[] {
    const tokens = Math.round(this.work.tokens)
    return this.look.name === 'aider' ? [dim(`Tokens: ${(2.4 + tokens / 1000).toFixed(1)}k sent, ${tokens} received. Cost: $0.01 message, $0.02 session.`), ''] : ms > 0 ? [] : []
  }

  protected goodbye(): string[] {
    return ['']
  }

  protected exitArmedText(): string {
    return 'Press Ctrl+C again to exit'
  }

  protected slash(cmd: string): boolean {
    if (cmd === 'exit' || cmd === 'quit') {
      this.exit(true)
      return true
    }
    if (cmd === 'clear' || cmd === 'new') {
      this.clearConversation()
      return true
    }
    if (cmd === 'help') {
      this.commit((c) => this.prose('Commands: `/help`, `/clear`, `/exit`. Anything else is a prompt.', c))
      return true
    }
    return false
  }
}

const rel = (cwd: string): string => cwd.replace(/^C:\\Users\\dev/i, '~')

const LOOKS: Record<string, LiteLook> = {
  aider: {
    name: 'aider',
    version: '0.86.1',
    accent: [0, 204, 0],
    banner: () => [
      dim('Aider v0.86.1'),
      dim('Main model: anthropic/claude-sonnet-5 with diff edit format, infinite output'),
      dim('Weak model: anthropic/claude-haiku-4-5'),
      dim(`Git repo: .git with 36 files`),
      dim('Repo-map: using 4096 tokens, auto refresh'),
      dim('https://aider.chat/HISTORY.html#release-notes'),
      ''
    ],
    prompt: '>',
    placeholder: '',
    boxed: false,
    footer: () => '',
    quietTools: true,
    spinner: ['░█       ', ' ░█      ', '  ░█     ', '   ░█    ', '    ░█   ', '     ░█  ', '      ░█ ', '       ░█'],
    thinking: 'Waiting for anthropic/claude-sonnet-5',
    interruptHint: 'ctrl+c to interrupt',
    confirm: (cmd) => `Run shell command? ${dim(cmd)} (Y)es/(N)o/(D)on't ask again [Yes]:`
  },
  opencode: {
    name: 'opencode',
    version: '1.4.2',
    accent: [250, 178, 131],
    banner: () => [
      '',
      `  ${dim('█▀▀█ █▀▀█ █▀▀ █▀▀▄')} ${bold('█▀▀ █▀▀█ █▀▀▄ █▀▀')}`,
      `  ${dim('█░░█ █░░█ █▀▀ █░░█')} ${bold('█░░ █░░█ █░░█ █▀▀')}`,
      `  ${dim('▀▀▀▀ █▀▀▀ ▀▀▀ ▀  ▀')} ${bold('▀▀▀ ▀▀▀▀ ▀▀▀  ▀▀▀')}`,
      '',
      `  ${dim('/new')}      new session      ${dim('ctrl+x n')}`,
      `  ${dim('/help')}     show help        ${dim('ctrl+x h')}`,
      `  ${dim('/models')}   list models      ${dim('ctrl+x m')}`,
      ''
    ],
    prompt: '>',
    placeholder: 'Ask anything…',
    boxed: true,
    footer: (cols) => dim(spread('  enter send', 'Build  claude-sonnet-5  ', cols)),
    spinner: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
    thinking: 'Working',
    interruptHint: 'esc interrupt',
    confirm: (cmd) => `${bold('Permission required')}: bash ${dim(cmd)}`,
    fullscreen: true
  },
  copilot: {
    name: 'copilot',
    version: '0.0.339',
    accent: [168, 132, 255],
    banner: (cols, cwd, branch) => [
      '',
      `  ${bold('Welcome to GitHub Copilot CLI')}`,
      `  ${dim('Version 0.0.339 · Commit 1f2e3d4')}`,
      '',
      `  ${dim('Copilot can write, test and debug code right from your terminal. Describe a task to get started or enter ? for help.')}`.slice(0, Math.max(cols, 40) * 2),
      '',
      `${paint([63, 185, 80], '●')} Logged in as user: ${bold('harbor-dev')}`,
      `${paint([63, 185, 80], '●')} Connected to GitHub MCP Server`,
      '',
      dim(`  ${rel(cwd)}${branch ? ` [⎇ ${branch}]` : ''}`),
      ''
    ],
    prompt: '>',
    placeholder: 'Enter @ to mention files or / for commands',
    boxed: true,
    footer: (cols) => dim(spread('  Ctrl+c Exit · Ctrl+r Expand recent', 'claude-sonnet-5 (1x)  ', cols)),
    spinner: ['◐', '◓', '◑', '◒'],
    thinking: 'Thinking',
    interruptHint: 'Esc to cancel',
    confirm: (cmd) => `${bold('Run command?')} ${dim(cmd)}`
  },
  qwen: {
    name: 'qwen',
    version: '0.1.1',
    accent: [155, 126, 255],
    banner: (cols) => [
      '',
      ...(cols >= 40
        ? [' ▄▄▄▄   █   █ █▀▀▀ █▄  █', '█    █  █ █ █ █▀▀  █ ▀▄█', ' ▀▀▀▀▄  ▀▀ ▀▀ ▀▀▀▀ ▀   ▀'].map((l) => gradient(l, [[99, 102, 241], [168, 85, 247], [236, 72, 153]]))
        : [gradient('Qwen Code', [[99, 102, 241], [236, 72, 153]])]),
      '',
      'Tips for getting started:',
      '1. Ask questions, edit files, or run commands.',
      '2. Be specific for the best results.',
      `3. ${bold('/help')} for more information.`,
      ''
    ],
    prompt: '>',
    placeholder: 'Type your message or @path/to/file',
    boxed: true,
    footer: (cols) => dim(spread('  no sandbox', 'qwen3-coder-plus (100% context left)  ', cols)),
    spinner: DOTS,
    thinking: 'Thinking',
    interruptHint: 'esc to cancel',
    confirm: (cmd) => `Allow execution of: '${cmd.split(' ')[0]}'?`
  },
  'cursor-agent': {
    name: 'cursor-agent',
    version: '2025.09.28',
    accent: [230, 230, 230],
    banner: (_c, cwd, branch) => ['', `  ${bold('Cursor Agent')}`, `  ${dim(rel(cwd))}${branch ? ` ${dim(`· ${branch}`)}` : ''}`, ''],
    prompt: '→',
    placeholder: 'Plan, search, build anything',
    boxed: true,
    footer: (cols) => dim(spread('  Auto', '/ commands · @ files · ! shell  ', cols)),
    spinner: ['⬡', '⬢'],
    thinking: 'Generating',
    interruptHint: 'ctrl+c to stop',
    confirm: (cmd) => `${bold('Run this command?')} ${dim(cmd)}  ${dim('(y) run · (n) skip')}`
  },
  amp: {
    name: 'amp',
    version: '0.0.1759',
    accent: [243, 94, 65],
    banner: (_c, cwd) => [
      '',
      `  ${gradient('▄▀█ █▀▄▀█ █▀█', [[243, 94, 65], [255, 170, 60]])}`,
      `  ${gradient('█▀█ █ ▀ █ █▀▀', [[243, 94, 65], [255, 170, 60]])}   ${dim('v0.0.1759 · by Sourcegraph')}`,
      '',
      `  ${bold('Welcome to Amp')}  ${dim(rel(cwd))}`,
      `  ${dim('Ctrl+O for help · use Tab/Shift+Tab to navigate')}`,
      ''
    ],
    prompt: '>',
    placeholder: 'Ask Amp to build, fix or explain…',
    boxed: true,
    footer: (cols) => dim(spread('  smart', '$0.00  ', cols)),
    spinner: ['∙∙∙', '●∙∙', '∙●∙', '∙∙●'],
    thinking: 'Thinking',
    interruptHint: 'Esc to cancel',
    confirm: (cmd) => `${bold('Allow command?')} ${dim(cmd)}`
  }
}

function liteSpec(key: keyof typeof LOOKS, summary: string, aliases: string[] = []): ProgramSpec {
  const look = LOOKS[key]
  return {
    name: key,
    aliases,
    summary,
    kind: 'agent',
    create(launch): Program {
      const argv = launch.argv
      if (argv.some((a) => a === '--version' || a === '-v' || a === '-V')) return printProgram(`${look.name} ${look.version}`)
      if (argv.some((a) => a === '-h' || a === '--help')) return printProgram(`Usage: ${look.name} [options] [prompt]\n\n  -p, --print      Print the answer and exit\n  --version        Show version\n  -h, --help       Show help`)
      if (argv.some((a) => a === '-p' || a === '--print' || a === '--message' || a === '-m')) {
        const prompt = positional(argv) ?? ''
        return printProgram((io) => oneshotAnswer(io, 'other', prompt), { delayMs: 1800 })
      }
      return new LiteAgent(look, launch)
    }
  }
}

export const otherSpecs: ProgramSpec[] = [
  liteSpec('aider', 'aider — AI pair programming (simulated)', ['aider-chat']),
  liteSpec('opencode', 'opencode — terminal coding agent (simulated)', ['opencode-ai']),
  liteSpec('copilot', 'GitHub Copilot CLI (simulated)', ['@github/copilot']),
  liteSpec('qwen', 'Qwen Code (simulated)', ['@qwen-code/qwen-code']),
  liteSpec('cursor-agent', 'Cursor Agent CLI (simulated)'),
  liteSpec('amp', 'Amp by Sourcegraph (simulated)', ['@sourcegraph/amp'])
]
