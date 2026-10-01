/**
 * Gemini CLI (agent-tuis.md §3): gradient pixel logo, tips, the rounded input
 * box with its status footer, braille spinner with "(esc to cancel, Ns)",
 * boxed tool calls, the "Allow execution" confirmation, and the session
 * summary on the way out. The renderer classifies Gemini as `other` (no
 * messaging gate), so a confirmation rings the bell for the notch heuristic.
 */
import type { Program, ProgramLaunch, ProgramSpec } from '../contracts'
import { BEL, cellWidth } from '../util/ansi'
import { diffLines, hunks } from '../util/diff'
import type { TodoItem } from './brain'
import { AgentTui, type PermissionReq, type RunStep, type ToolEvent } from './agent'
import { oneshotAnswer, positional, printProgram } from './oneshot'
import { DOTS, bold, dim, gradient, mdLite, paint, spread, truncate, wrapAll, type Rgb } from './tui-kit'

export const GEMINI_VERSION = '0.9.0'

const BLUE: Rgb = [71, 150, 228]
const PURPLE: Rgb = [132, 122, 206]
const PINK: Rgb = [195, 103, 127]
const GREEN: Rgb = [166, 227, 161]
const RED: Rgb = [243, 139, 168]
const YELLOW: Rgb = [249, 226, 175]
const GREY: Rgb = [108, 112, 134]
const STOPS = [BLUE, PURPLE, PINK]

// From the installed binary: the ">" chevron and the "GEMINI" letters.
const CHEVRON = ['▝▜▄  ', '  ▝▜▄', ' ▗▟▀ ', '▝▀   ']
const LETTERS = ['▗█▀▀▜▙▝█▛▀▀▌▜██▖▟██▘▜█▘▜██▖▝█▛▝█▛', '█▌     █▙▟  ▐█▝█▛▐█ ▐█ ▐█▝█▖█▌ █▌', '▜▙ ▝█▛ █▌▝ ▖▐█   ▐█ ▐█ ▐█ ▝██▌ █▌', ' ▀▀▀▀▘▝▀▀▀▀▘▀▀▘  ▀▀▘▀▀▘▀▀▘ ▝▀▀▝▀▀']

const THOUGHTS = ['Considering the request', 'Mapping the codebase', 'Formulating a plan', 'Checking the details', 'Reasoning it through']

/** Gemini's footer: cwd on the left, sandbox centred, model on the right; the middle goes first when it's tight. */
function spread3(left: string, mid: string, right: string, cols: number): string {
  const [l, m, r] = [cellWidth(left), cellWidth(mid), cellWidth(right)]
  if (l + m + r + 4 > cols) return spread(left, right, cols)
  let gapL = Math.max(2, Math.floor((cols - m) / 2) - l)
  let gapR = cols - l - gapL - m - r
  if (gapR < 2) {
    gapL -= 2 - gapR
    gapR = 2
  }
  return left + ' '.repeat(gapL) + mid + ' '.repeat(gapR) + right
}

class Gemini extends AgentTui {
  readonly agent = 'gemini' as const
  protected readonly tickMs = 100
  private readonly sessionId = crypto.randomUUID()
  private model = 'gemini-2.5-pro'
  private ok = 0
  /** The footer's ` (branch*)` as last drawn; Gemini re-renders when the repository moves on. */
  private lastBranch = ''

  constructor(private readonly launch: ProgramLaunch) {
    super()
    if (launch.argv.includes('--yolo') || launch.argv.includes('-y')) this.mode = 'auto'
  }

  private branchLabel(): string {
    try {
      const repo = this.io.backend.vfs.git(this.io.cwd)
      return repo ? ` (${repo.currentBranch()}${repo.status().length ? '*' : ''})` : ''
    } catch {
      return ''
    }
  }

  protected onLaunch(): void {
    this.io.setTitle(`Gemini - ${this.world.root.split('\\').pop() ?? 'gemini'}`)
    // Gemini watches .git/HEAD and the working tree; a poll is the same thing at demo scale.
    this.io.timers.setInterval(() => {
      if (this.phase === 'exited' || this.branchLabel() === this.lastBranch) return
      this.redraw()
    }, 1500)
    const prompt = positional(this.launch.argv, ['-m', '--model', '-i', '--prompt-interactive'])
    if (prompt) this.io.timers.setTimeout(() => void this.runPrompt(prompt), 500)
  }

  private async runPrompt(prompt: string): Promise<void> {
    this.commit((cols) => this.userEcho(prompt, cols), { k: 'user', text: prompt })
    await this.runTurn(prompt, null)
  }

  protected header(cols: number): string[] {
    const logo =
      cols >= 44
        ? CHEVRON.map((c, i) => gradient(`${c}  ${LETTERS[i]}`, STOPS))
        : [gradient('✦ Gemini CLI', STOPS)]
    return [
      '',
      ...logo,
      '',
      'Tips for getting started:',
      '1. Ask questions, edit files, or run commands.',
      '2. Be specific for the best results.',
      `3. Create ${bold(paint(PURPLE, 'GEMINI.md'))} files to customize your interactions with Gemini.`,
      `4. ${bold(paint(PURPLE, '/help'))} for more information.`,
      ''
    ].map((l) => truncate(l, cols))
  }

  private boxed(rows: string[], cols: number, border: Rgb): string[] {
    const inner = Math.max(4, cols - 4)
    return [
      paint(border, `╭${'─'.repeat(cols - 2)}╮`),
      ...rows.map((r) => {
        const t = truncate(r, inner)
        return `${paint(border, '│')} ${t}${' '.repeat(Math.max(0, inner - cellWidth(t)))} ${paint(border, '│')}`
      }),
      paint(border, `╰${'─'.repeat(cols - 2)}╯`)
    ]
  }

  protected composer(cols: number): { lines: string[]; park: { row: number; col: number } } {
    const prefix = `${paint(PURPLE, '>')}   `
    let rows: string[]
    let row = 0
    let col = 6
    if (this.editor.text === '') rows = [`${prefix}${dim('Type your message or @path/to/file')}`]
    else {
      const lay = this.editor.layout(prefix, cols - 4)
      rows = lay.rows
      row = lay.row
      col = lay.col + 2
    }
    const branch = this.branchLabel()
    this.lastBranch = branch
    const home = this.io.backend.scenario.machine.home
    const cwd = this.io.cwd.toLowerCase().startsWith(home.toLowerCase()) ? `~${this.io.cwd.slice(home.length)}` : this.io.cwd
    const left = paint(BLUE, `${cwd}${branch}`)
    const mid = this.mode === 'auto' ? paint(RED, 'YOLO mode (ctrl + y to toggle)') : `${paint(RED, 'no sandbox')} ${dim('(see /docs)')}`
    const right = `${paint(BLUE, this.model)} ${dim(`(${Math.max(1, 100 - this.turns * 2)}% context left)`)}`
    // One column short of the edge: the pane's overlay scrollbar sits on the last one.
    const footer = this.flash ? paint(YELLOW, this.flash) : spread3(left, mid, right, cols - 1)
    return { lines: ['', ...this.boxed(rows, cols, GREY), truncate(footer, cols)], park: { row: 2 + row, col } }
  }

  protected status(cols: number): string[] {
    const w = this.work
    const spin = paint(BLUE, DOTS[w.frame % DOTS.length])
    const thought = w.activity ?? THOUGHTS[Math.floor(w.frame / 30) % THOUGHTS.length]
    const secs = Math.floor((Date.now() - w.startedAt) / 1000)
    return [truncate(`${spin} ${bold(paint(PURPLE, thought))} ${dim(`(esc to cancel, ${secs}s)`)}`, cols)]
  }

  protected userEcho(text: string, cols: number): string[] {
    return ['', ...wrapAll([`${paint(GREY, '>')} ${paint(GREY, text)}`], cols, '  '), '']
  }

  protected prose(text: string, cols: number): string[] {
    const styled = text
      .split('\n')
      .map((l) => (l.startsWith('> ') ? dim(l.slice(2)) : mdLite(l, PURPLE)))
      .join('\n')
    return [...this.wrapProse(styled, cols, `${paint(PURPLE, '✦')} `, '  '), '']
  }

  private toolBox(title: string, detail: string[], cols: number, ok = true): string[] {
    if (ok) this.ok++
    const mark = ok ? paint(GREEN, '✔') : paint(RED, 'x')
    return [...this.boxed([`${mark}  ${title}`, ...detail.map((d) => `   ${d}`)], cols, GREY), '']
  }

  protected tool(ev: ToolEvent, cols: number): string[] {
    const w = this.world
    switch (ev.kind) {
      case 'read':
        return ev.files.flatMap((f) => this.toolBox(`${bold('ReadFile')} ${w.show(f.path)}`, f.missing ? [paint(RED, 'File not found.')] : [], cols, !f.missing))
      case 'search':
        return this.toolBox(`${bold('SearchText')} '${ev.pattern}' in ${w.show(ev.path)}`, [dim(`Found ${ev.matches} match${ev.matches === 1 ? '' : 'es'}`)], cols)
      case 'list':
        return this.toolBox(`${bold('ReadFolder')} ${w.show(ev.path)}`, [dim(`Listed ${ev.entries.length} item(s).`)], cols)
      case 'edit': {
        if (ev.error || ev.after === null) return this.toolBox(`${bold('Edit')} ${w.show(ev.path)}`, [paint(RED, ev.error ?? 'failed')], cols, false)
        const ops = diffLines(ev.before ?? '', ev.after)
        const rows: string[] = []
        for (const h of hunks(ops, 1)) {
          let n = h.newStart
          let o = h.oldStart
          for (const l of h.lines) {
            if (rows.length >= 12) break
            const mark = l[0]
            const num = mark === '-' ? o : n
            if (mark !== '+') o++
            if (mark !== '-') n++
            const text = `${String(num).padStart(3)} ${mark === ' ' ? ' ' : mark} ${l.slice(1)}`
            rows.push(mark === '+' ? paint(GREEN, text) : mark === '-' ? paint(RED, text) : dim(text))
          }
        }
        const verb = ev.before === null ? 'WriteFile' : 'Edit'
        const what = ev.before === null ? `Writing to ${w.show(ev.path)}` : w.show(ev.path)
        return this.toolBox(`${bold(verb)} ${what}`, rows, cols)
      }
      case 'run': {
        const out = this.clip(ev.output, 8)
        const rows = out.lines.map((l) => l)
        if (out.more) rows.push(dim(`... ${out.more} more lines`))
        return this.toolBox(`${bold('Shell')} ${ev.command} ${dim(`(${ev.description})`)}`, rows, cols, ev.code === 0)
      }
      case 'message':
        return this.toolBox(
          `${bold('send_message')} ${dim('(terminaldeck MCP Server)')} ${dim(JSON.stringify({ paneId: ev.to }))}`,
          [ev.result.ok ? dim(JSON.stringify({ ok: true, id: ev.result.id })) : paint(RED, ev.result.error ?? 'refused')],
          cols,
          ev.result.ok
        )
    }
  }

  protected todoList(_items: TodoItem[]): string[] {
    return []
  }

  protected permission(req: PermissionReq, sel: number, cols: number): string[] {
    const opts =
      req.kind === 'bash'
        ? ['Yes, allow once', `Yes, allow always "${req.command.split(' ')[0]} ..."`, 'No, suggest changes (esc)']
        : ['Yes, proceed', 'Yes, and review each edit', 'No, keep planning (esc)']
    const optRows = opts.map((o, i) => (i === sel ? paint(GREEN, `● ${i + 1}. ${o}`) : `  ${i + 1}. ${o}`))
    const rows =
      req.kind === 'bash'
        ? [
            `${paint(YELLOW, '?')}  ${bold('Shell')} ${req.command} ${dim(`(${req.description})`)}`,
            '',
            `   ${paint(YELLOW, req.command)}`,
            '',
            `Allow execution of: '${req.command.split(' ')[0]}'?`,
            '',
            ...optRows
          ]
        : req.kind === 'edit'
          ? [`${paint(YELLOW, '?')}  ${bold(req.before === null ? 'WriteFile' : 'Edit')} ${this.world.showPosix(req.path)}`, '', 'Apply this change?', '', ...optRows]
          : [`${paint(YELLOW, '?')}  ${bold('Plan')}`, '', ...req.plan, '', 'Proceed with these changes?', '', ...optRows]
    return this.boxed(rows, cols, YELLOW)
  }

  protected onPermissionShown(): void {
    this.io.write(BEL)
  }

  protected needsApproval(step: RunStep): boolean {
    if (this.mode === 'auto') return false
    if (/^git (status|diff|log)\b/.test(step.command)) return false
    return ![...this.allowed].some((p) => step.command.startsWith(p.split(' ')[0]))
  }

  protected interrupted(): string[] {
    return [`${paint(YELLOW, 'ℹ')} ${paint(YELLOW, 'Request cancelled.')}`, '']
  }

  protected turnDone(): string[] {
    return []
  }

  protected goodbye(cols: number): string[] {
    const wall = Date.now() - this.startedAt
    const active = this.usage.apiMs
    const pct = (a: number, b: number): string => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '0.0%')
    const secs = (ms: number): string => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s` : `${(ms / 1000).toFixed(1)}s`)
    const k = (a: string, b: string): string => `${a.padEnd(18)}${b}`
    const rows = [
      '',
      gradient('Agent powering down. Goodbye!', STOPS),
      '',
      bold('Interaction Summary'),
      k('Session ID:', this.sessionId),
      k('Tool Calls:', `${this.toolCalls} ( ${paint(GREEN, `✔ ${this.toolCalls}`)} ${paint(RED, 'x 0')} )`),
      k('Success Rate:', this.toolCalls ? '100.0%' : '0.0%'),
      '',
      bold('Performance'),
      k('Wall Time:', secs(wall)),
      k('Agent Active:', secs(active)),
      k('  » API Time:', `${secs(active * 0.8)} (${pct(active * 0.8, active)})`),
      k('  » Tool Time:', `${secs(active * 0.2)} (${pct(active * 0.2, active)})`),
      ''
    ]
    return ['', ...this.boxed(rows, Math.min(cols, 72), GREY), '']
  }

  protected exitArmedText(): string {
    return 'Press Ctrl+C again to exit.'
  }

  protected cycleMode(): void {
    this.mode = this.mode === 'auto' ? 'default' : 'auto'
  }

  protected async slash(cmd: string): Promise<boolean> {
    switch (cmd) {
      case 'quit':
      case 'exit':
        this.exit(true)
        return true
      case 'clear':
        this.clearConversation()
        return true
      case 'help':
      case '?':
        this.commit((c) => this.helpBox(c))
        return true
      case 'model': {
        const models = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']
        const choice = await this.ask(
          (sel) =>
            this.boxed(
              [bold('Select Model'), '', ...models.map((m, i) => (i === sel ? paint(GREEN, `● ${i + 1}. ${m}`) : `  ${i + 1}. ${m}`)), '', dim('(Press Esc to close)')],
              this.cols,
              GREY
            ),
          models.length,
          -1
        )
        if (choice >= 0) this.model = models[choice]
        return true
      }
      case 'stats':
      case 'cost':
        this.commit((c) => this.boxed([bold('Session Stats'), '', `Tool Calls:   ${this.toolCalls}`, `Turns:        ${this.turns}`, `API Time:     ${(this.usage.apiMs / 1000).toFixed(1)}s`, `Output Tokens: ${this.usage.output}`], c, GREY))
        return true
      case 'about':
        this.commit((c) => this.boxed([bold('About Gemini CLI'), '', `CLI Version      ${GEMINI_VERSION}`, `Model            ${this.model}`, 'Sandbox          no sandbox', 'OS               win32', 'Auth Method      OAuth'], c, GREY))
        return true
      default:
        return false
    }
  }

  private helpBox(cols: number): string[] {
    const c = (n: string, d: string): string => ` ${bold(paint(PURPLE, n))} - ${d}`
    return [
      ...this.boxed(
        [
          bold('Basics:'),
          `${bold(paint(PURPLE, 'Add context'))}: Use ${bold(paint(PURPLE, '@'))} to specify files for context.`,
          `${bold(paint(PURPLE, 'Shell mode'))}: Execute shell commands via ${bold(paint(PURPLE, '!'))}.`,
          '',
          bold('Commands:'),
          c('/about', 'show version info'),
          c('/clear', 'clear the screen and conversation history'),
          c('/help', 'for help on gemini-cli'),
          c('/model', 'choose the model'),
          c('/stats', 'check session stats'),
          c('/quit', 'exit the cli'),
          '',
          bold('Keyboard Shortcuts:'),
          `${bold(paint(PURPLE, 'Esc'))} - Cancel operation`,
          `${bold(paint(PURPLE, 'Ctrl+C'))} - Quit application`,
          `${bold(paint(PURPLE, 'Ctrl+Y'))} - Toggle YOLO mode`
        ],
        cols,
        GREY
      ),
      ''
    ]
  }
}

export const geminiSpec: ProgramSpec = {
  name: 'gemini',
  aliases: ['@google/gemini-cli', 'gemini-cli'],
  summary: 'Gemini CLI (simulated)',
  kind: 'agent',
  create(launch): Program {
    const argv = launch.argv
    if (argv.some((a) => a === '-v' || a === '--version')) return printProgram(GEMINI_VERSION)
    if (argv.some((a) => a === '-h' || a === '--help'))
      return printProgram(
        'Usage: gemini [options] [command]\n\nGemini CLI - Launch an interactive CLI, use -p/--prompt for non-interactive mode\n\nOptions:\n  -m, --model        Model\n  -p, --prompt       Prompt. Appended to input on stdin (if any).\n  -y, --yolo         Automatically accept all actions\n  -v, --version      Show version number\n  -h, --help         Show help'
      )
    if (argv.some((a) => a === '-p' || a === '--prompt')) {
      const prompt = positional(argv, ['-m', '--model']) ?? ''
      return printProgram((io) => oneshotAnswer(io, 'gemini', prompt), { delayMs: 2000 })
    }
    return new Gemini(launch)
  }
}
