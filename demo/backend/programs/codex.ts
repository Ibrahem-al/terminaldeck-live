/**
 * Codex CLI (agent-tuis.md §2, shapes from the upstream insta snapshots): the
 * dim session-header box, `›` composer with a blank row under it, the
 * `• Working (5s • esc to interrupt)` status, `• Explored / Ran / Edited`
 * history cells, the approval modal. Codex has no hooks in TerminalDeck, so an
 * approval rings the bell and sends OSC 9: the renderer's heuristics raise the
 * notch attention, exactly as they would for the real CLI.
 */
import type { Program, ProgramIO, ProgramLaunch, ProgramSpec } from '../contracts'
import { BEL, cellWidth, osc } from '../util/ansi'
import { diffLines, hunks } from '../util/diff'
import type { TodoItem } from './brain'
import { AgentTui, type PermissionReq, type RunStep, type SlashItem, type ToolEvent } from './agent'
import { oneshotAnswer, positional, printProgram } from './oneshot'
import {
  bold,
  dim,
  hideCursor,
  mdLite,
  paint,
  pick,
  rule,
  showCursor,
  spread,
  strike,
  truncate,
  wrapAll,
  type Rgb
} from './tui-kit'

export const CODEX_VERSION = '0.128.0'

const CYAN: Rgb = [86, 182, 194]
const GREEN: Rgb = [110, 190, 120]
const RED: Rgb = [224, 108, 117]
const MAGENTA: Rgb = [198, 120, 221]
/** Rows the input box shows before it scrolls (the renderer scans the bottom 12 rows for `›`). */
const COMPOSER_MAX_ROWS = 8

const PLACEHOLDERS = [
  'Ask Codex to do anything',
  'Explain this codebase',
  'Summarize recent commits',
  'Find and fix a bug in @filename',
  'Write tests for @filename'
]

const MODELS = [
  { id: 'gpt-5.5-codex', effort: 'high', blurb: 'Optimized for coding tasks with many tools.' },
  { id: 'gpt-5.5-codex', effort: 'medium', blurb: 'Balanced speed and depth.' },
  { id: 'gpt-5.5', effort: 'high', blurb: 'Broad world knowledge with strong general reasoning.' },
  { id: 'gpt-5.5-codex-mini', effort: 'medium', blurb: 'Cheaper, faster, less capable.' }
]

/** Codex's `/` popup, in its own order. */
const SLASH: SlashItem[] = [
  { name: 'model', desc: 'choose what model and reasoning effort to use' },
  { name: 'approvals', desc: 'choose what Codex can do without approval' },
  { name: 'review', desc: 'review my current changes and find issues' },
  { name: 'new', desc: 'start a new chat during a conversation' },
  { name: 'init', desc: 'create an AGENTS.md file with instructions for Codex' },
  { name: 'compact', desc: 'summarize conversation to prevent hitting the context limit' },
  { name: 'diff', desc: 'show git diff (including untracked files)' },
  { name: 'status', desc: 'show current session configuration and token usage' },
  { name: 'quit', desc: 'exit Codex' }
]
const MENU_ROWS = 7
/** /model switches "this and future Codex CLI sessions". */
const MODEL_KEY = 'codex:model'

const codexDuration =(ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

class Codex extends AgentTui {
  readonly agent = 'codex' as const
  protected readonly tickMs = 250
  private model = MODELS[0]
  private readonly sessionId: string
  private readonly placeholder: string
  private readonly yolo: boolean
  protected groupExploration = true
  /** Whether the hardware cursor is shown (ratatui hides it while a modal owns the screen). */
  private cursorShown = true

  constructor(private readonly launch: ProgramLaunch) {
    super()
    const argv = launch.argv
    this.yolo = argv.some((a) => a === '--yolo' || a === '--dangerously-bypass-approvals-and-sandbox')
    const saved = launch.backend.storage.get<number>(MODEL_KEY)
    if (typeof saved === 'number' && MODELS[saved]) this.model = MODELS[saved]
    if (this.yolo) this.mode = 'bypass'
    // Codex session ids are UUIDv7-looking; the first block stays stable per pane.
    this.sessionId = `019a${crypto.randomUUID().slice(4)}`
    this.placeholder = pick(PLACEHOLDERS.slice(0, 1), launch.session.id)
  }

  start(io: Parameters<AgentTui['start']>[0]): void {
    super.start(io)
    // Codex drives the real terminal cursor (ratatui), it doesn't draw one.
    io.write(showCursor())
  }

  protected onLaunch(): void {
    const prompt = positional(this.launch.argv, ['-m', '--model', '-a', '--ask-for-approval', '-s', '--sandbox', '-c', '--config', '-C', '--cd'])
    if (prompt) this.io.timers.setTimeout(() => void this.runPrompt(prompt), 500)
  }

  private async runPrompt(prompt: string): Promise<void> {
    this.commit((cols) => this.userEcho(prompt, cols), { k: 'user', text: prompt })
    await this.runTurn(prompt, null)
  }

  protected redraw(): void {
    super.redraw()
    const want = !this.modal && !this.gone
    if (want === this.cursorShown || this.gone) return
    this.cursorShown = want
    this.io.write(want ? showCursor() : hideCursor())
  }

  private get tildeCwd(): string {
    const home = this.io.backend.scenario.machine.home
    return this.io.cwd.toLowerCase().startsWith(home.toLowerCase()) ? `~${this.io.cwd.slice(home.length)}` : this.io.cwd
  }

  /* ── frame pieces ── */

  protected header(cols: number): string[] {
    const rows = [
      `${dim('>_ ')}${bold('OpenAI Codex')} ${dim(`(v${CODEX_VERSION})`)}`,
      '',
      `${dim('model:    ')} ${this.model.id} ${this.model.effort}   ${paint(CYAN, '/model')}${dim(' to change')}`,
      `${dim('directory:')} ${this.tildeCwd}`,
      ...(this.yolo ? [`${dim('permissions:')} ${bold(paint(MAGENTA, 'YOLO mode'))}`] : [])
    ]
    const inner = Math.min(cols - 4, Math.max(...rows.map((r) => cellWidth(r))) + 1)
    const box = [
      dim(`╭${'─'.repeat(inner + 2)}╮`),
      ...rows.map((r) => {
        const t = truncate(r, inner)
        return `${dim('│')} ${t}${' '.repeat(Math.max(0, inner - cellWidth(t)))} ${dim('│')}`
      }),
      dim(`╰${'─'.repeat(inner + 2)}╯`)
    ]
    const cmd = (c: string, d: string): string[] => wrapAll([`  ${c}${dim(` - ${d}`)}`], cols, '    ')
    const intro = wrapAll(['  To get started, describe a task or try one of these commands:'], cols, '  ')
    const commands = [
      ...cmd('/init', 'create an AGENTS.md file with instructions for Codex'),
      ...cmd('/status', 'show current session configuration'),
      ...cmd('/permissions', 'choose what Codex is allowed to do'),
      ...cmd('/model', 'choose what model and reasoning effort to use'),
      ...cmd('/review', 'review any changes and find issues')
    ]
    // The composer (4 rows) must stay on screen with the welcome card whole: in a short
    // pane the command list goes first, then the intro line.
    const room = this.io.rows - 4 - box.length
    if (room >= intro.length + commands.length + 3) return [...box, '', ...intro, '', ...commands, '']
    if (room >= intro.length + 2) return [...box, '', ...intro, '']
    return [...box, '']
  }

  private contextLeft(): number {
    return Math.max(1, 100 - Math.round((this.usage.input + this.usage.output + this.work.tokens) / 2720))
  }

  protected composer(cols: number): { lines: string[]; park: { row: number; col: number } } {
    let rows: string[]
    let row = 0
    let col = 2
    if (this.editor.text === '') rows = [`${bold('›')} ${dim(truncate(this.placeholder, cols - 3))}`]
    else {
      const lay = this.editor.layout(`${bold('›')} `, cols, false)
      rows = lay.rows
      row = lay.row
      col = lay.col
      // Codex's composer stops growing and scrolls, its `›` gutter on the first
      // visible row; the renderer only looks for that row near the bottom.
      const max = Math.max(1, Math.min(COMPOSER_MAX_ROWS, this.io.rows - 5))
      if (rows.length > max) {
        const start = Math.min(Math.max(0, row - max + 1), rows.length - max)
        rows = rows.slice(start, start + max)
        if (start > 0) rows[0] = `${bold('›')} ${rows[0].slice(2)}`
        row -= start
      }
    }
    const menu = this.slashMenu()
    if (menu) {
      // The popup takes the footer's place under the composer; the row under `›` stays blank.
      const start = Math.min(Math.max(0, menu.sel - MENU_ROWS + 1), Math.max(0, menu.items.length - MENU_ROWS))
      const nameW = Math.max(...menu.items.map((i) => i.name.length)) + 3
      const popup = menu.items.slice(start, start + MENU_ROWS).map((it, i) => {
        const name = `/${it.name}`.padEnd(nameW)
        return truncate(start + i === menu.sel ? `  ${bold(paint(CYAN, name))}${paint(CYAN, it.desc)}` : `  ${name}${dim(it.desc)}`, cols)
      })
      return { lines: ['', ...rows, '', ...popup], park: { row: 1 + row, col } }
    }
    let left = this.phase === 'working' ? '  tab to queue message' : '  ? for shortcuts'
    if (this.mode === 'plan' && this.phase !== 'working') left += ' · Plan mode (shift+tab to cycle)'
    const footer = this.flash ? dim(`  ${this.flash}`) : dim(spread(left, `${this.contextLeft()}% context left  `, cols))
    return { lines: ['', ...rows, '', footer], park: { row: 1 + row, col } }
  }

  protected status(cols: number): string[] {
    const w = this.work
    const label = w.activity ?? 'Working'
    // Shimmer: one bright letter sweeping across the bold header.
    const chars = [...label]
    const at = w.frame % (chars.length + 6)
    // Bold throughout; one letter at a time drops the faint (dim() would also end bold, so raw SGR).
    const head = `\x1b[1;2m${chars.slice(0, at).join('')}\x1b[22;1m${chars[at] ?? ''}\x1b[2m${chars.slice(at + 1).join('')}\x1b[22m`
    const secs = Math.floor((Date.now() - w.startedAt) / 1000)
    return [truncate(`${dim('•')} ${head} ${dim(`(${secs}s • esc to interrupt)`)}`, cols), '']
  }

  protected userEcho(text: string, cols: number): string[] {
    const rows = wrapAll([text], cols - 2, '')
    return [...rows.map((r, i) => `${i === 0 ? dim('›') + ' ' : '  '}${r}`), '']
  }

  protected prose(text: string, cols: number): string[] {
    const styled = text
      .split('\n')
      .map((l) => (l.startsWith('> ') ? dim(l.slice(2)) : mdLite(l, CYAN)))
      .join('\n')
    return [...this.wrapProse(styled, cols, '• ', '  '), '']
  }

  private cell(title: string, details: string[], cols: number, ok = true): string[] {
    const head = wrapAll([`${paint(ok ? GREEN : RED, '•')} ${title}`], cols, '  ')
    const body = details.flatMap((d, i) => wrapAll([d], cols - 4, '').map((r, j) => (i === 0 && j === 0 ? `  ${dim('└')} ${r}` : `    ${r}`)))
    return [...head, ...body, '']
  }

  protected tool(ev: ToolEvent, cols: number): string[] {
    switch (ev.kind) {
      case 'read':
      case 'search':
      case 'list':
        return this.exploreGroup([ev], cols, false)
      case 'edit':
        return this.editCell(ev, cols)
      case 'run': {
        const out = this.clip(ev.output, 5)
        const lines = out.lines.map((l) => truncate(dim(l), cols - 4))
        if (out.more) lines.push(dim(`… +${out.more} lines`))
        if (!lines.length) lines.push(dim('(no output)'))
        return this.cell(`${bold('Ran')} ${ev.command}`, lines, cols, ev.code === 0)
      }
      case 'message': {
        const args = JSON.stringify({ paneId: ev.to, text: ev.text.length > 70 ? `${ev.text.slice(0, 70)}…` : ev.text })
        const res = ev.result.ok
          ? dim(JSON.stringify({ ok: true, id: ev.result.id, status: ev.result.status ?? 'queued' }))
          : paint(RED, ev.result.error ?? ev.result.reason ?? 'refused')
        return this.cell(`${bold('Called')} ${paint(CYAN, 'terminaldeck.send_message')}(${args})`, [res], cols, ev.result.ok)
      }
    }
  }

  /** Codex's exploring cell: consecutive reads merge into one `Read a, b` line, one `└` per call otherwise. */
  protected exploreGroup(evs: ToolEvent[], cols: number, active: boolean): string[] {
    const name = (p: string): string => p.split('/').pop() ?? p
    const where = (p: string): string => (p === '.' || p === '' ? '' : ` in ${p}`)
    const lines: string[] = []
    let reads: string[] | null = null
    for (const ev of evs) {
      if (ev.kind === 'read') {
        const names = ev.files.map((f) => name(f.path) + (f.missing ? dim(' (missing)') : ''))
        if (reads) reads.push(...names)
        else {
          reads = names
          lines.push('')
        }
        lines[lines.length - 1] = `${paint(CYAN, 'Read')} ${reads.join(', ')}`
        continue
      }
      reads = null
      if (ev.kind === 'search') lines.push(`${paint(CYAN, 'Search')} ${ev.pattern}${where(ev.path)}`)
      else if (ev.kind === 'list') lines.push(`${paint(CYAN, 'List')} ${ev.path === '.' ? '.' : ev.path}`)
    }
    return this.cell(bold(active ? 'Exploring' : 'Explored'), lines, cols)
  }

  private editCell(ev: Extract<ToolEvent, { kind: 'edit' }>, cols: number): string[] {
    const path = this.world.showPosix(ev.path)
    if (ev.error || ev.after === null) return this.cell(`${bold('Edit failed')} ${path}`, [paint(RED, ev.error ?? 'failed')], cols, false)
    const ops = diffLines(ev.before ?? '', ev.after)
    const added = ops.filter((o) => o.op === 'insert').length
    const removed = ops.filter((o) => o.op === 'delete').length
    const stat = `(${paint(GREEN, `+${added}`)} ${paint(RED, `-${removed}`)})`
    const head = `${paint(GREEN, '•')} ${bold(ev.before === null ? 'Added' : 'Edited')} ${path} ${stat}`
    const out = [truncate(head, cols)]
    const hs = hunks(ops, 1)
    const width = String(Math.max(1, ...hs.map((h) => h.newStart + h.newLines))).length
    let shown = 0
    hs.forEach((h, hi) => {
      if (shown >= 14) return
      if (hi > 0) out.push(dim(`    ${' '.repeat(width)}⋮`))
      let o = h.oldStart
      let n = h.newStart
      for (const line of h.lines) {
        if (shown >= 14) break
        const mark = line[0]
        const num = mark === '-' ? o : n
        if (mark !== '+') o++
        if (mark !== '-') n++
        const text = truncate(`${mark === ' ' ? ' ' : mark}${line.slice(1)}`, cols - width - 5)
        const coloured = mark === '+' ? paint(GREEN, text) : mark === '-' ? paint(RED, text) : text
        out.push(`    ${dim(String(num).padStart(width))} ${coloured}`)
        shown++
      }
    })
    const total = hs.reduce((a, h) => a + h.lines.length, 0)
    if (total > shown) out.push(dim(`    … +${total - shown} lines`))
    out.push('')
    return out
  }

  protected todoList(items: TodoItem[], cols: number): string[] {
    const rows = items.map((it) =>
      it.status === 'completed' ? dim(`✔ ${strike(it.content)}`) : it.status === 'in_progress' ? bold(paint(CYAN, `□ ${it.content}`)) : `□ ${it.content}`
    )
    return this.cell(bold('Updated Plan'), rows, cols)
  }

  protected permission(req: PermissionReq, sel: number, cols: number): string[] {
    const opts =
      req.kind === 'bash'
        ? ['Yes, proceed (y)', `Yes, and don't ask again for commands that start with \`${req.prefix}\` (p)`, 'No, and tell Codex what to do differently (esc)']
        : req.kind === 'edit'
          ? ['Yes, proceed (y)', "Yes, and don't ask again for these files (a)", 'No, and tell Codex what to do differently (esc)']
          : ['Yes, implement this plan (y)', 'Yes, and review each edit (a)', 'No, keep planning (esc)']
    const optRows = opts.map((o, i) => truncate(i === sel ? paint(CYAN, `› ${i + 1}. ${o}`) : `  ${i + 1}. ${o}`, cols))
    const body =
      req.kind === 'bash'
        ? ['  Would you like to run the following command?', '', ...wrapAll([`  Reason: ${req.description}`], cols, '  '), '', ...wrapAll([`  $ ${req.command}`], cols, '    ')]
        : req.kind === 'edit'
          ? ['  Would you like to make the following edits?', '', ...this.editCell({ kind: 'edit', path: req.path, before: req.before, after: req.after }, cols)]
          : ['  Would you like to implement this plan?', '', ...req.plan.flatMap((p) => wrapAll([`  ${p}`], cols, '  '))]
    return ['', ...body, '', '', ...optRows, '', dim('  Press enter to confirm or esc to cancel')]
  }

  protected permissionHotkeys(): Record<string, number> {
    return { y: 0, p: 1, a: 1, n: 2 }
  }

  protected approvalNote(req: PermissionReq, choice: number): string[] {
    if (req.kind !== 'bash') return []
    const tick = paint(GREEN, '✔')
    return choice === 1
      ? [`${tick} You approved codex to always run commands that start with ${bold(req.prefix)}`, '']
      : [`${tick} You approved codex to run ${bold(req.command)} this time`, '']
  }

  protected needsApproval(step: RunStep): boolean {
    // on-request in a trusted workspace: sandboxed, read-mostly commands run without asking.
    if (step.safe) return false
    return super.needsApproval(step)
  }

  protected declined(req: PermissionReq, cols: number): string[] {
    const what = req.kind === 'bash' ? `run ${bold(req.command)}` : req.kind === 'edit' ? `edit ${bold(this.world.showPosix(req.path))}` : 'implement the plan'
    return [`${paint(RED, '✗')} You canceled the request to ${what}`, '', ...this.interrupted(cols)]
  }

  protected slashCommands(): SlashItem[] {
    return SLASH
  }

  protected defaultTitle(): string {
    return 'codex'
  }

  protected onPermissionShown(req: PermissionReq): void {
    const what = req.kind === 'bash' ? req.command : req.kind === 'edit' ? `edit ${req.path}` : 'plan'
    this.io.write(BEL + osc(`9;Approval requested: ${what}`))
  }

  protected interrupted(cols: number): string[] {
    return [...wrapAll([`${paint(RED, '■')} Conversation interrupted - tell the model what to do differently. Something went wrong? Hit \`/feedback\` to report the issue.`], cols, '  '), '']
  }

  protected turnDone(ms: number, cols: number): string[] {
    const text = `─ Worked for ${codexDuration(ms)} `
    return [dim(text + rule(Math.max(0, cols - cellWidth(text)))), '']
  }

  protected goodbye(): string[] {
    const fmt = (n: number): string => Math.round(n).toLocaleString('en-US')
    if (this.turns === 0) return ['']
    const cached = Math.round(this.usage.input * 0.4)
    return [
      '',
      `${bold('Token usage')}: total=${fmt(this.usage.input + this.usage.output)} input=${fmt(this.usage.input)} (+ ${fmt(cached)} cached) output=${fmt(this.usage.output)}`,
      `To continue this session, run ${paint(CYAN, `codex resume ${this.sessionId}`)}`
    ]
  }

  protected exitArmedText(): string {
    return 'ctrl+c again to quit'
  }

  protected cycleMode(): void {
    if (this.yolo) return
    this.mode = this.mode === 'plan' ? 'default' : 'plan'
  }

  protected async slash(cmd: string): Promise<boolean> {
    const cols = this.cols
    switch (cmd) {
      case 'quit':
      case 'exit':
        this.exit(true)
        return true
      case 'new':
      case 'clear':
        this.clearConversation()
        return true
      case 'help':
      case '?':
        this.commit(() => this.helpLines())
        return true
      case 'status':
        this.commit((c) => this.statusCard(c))
        return true
      case 'model': {
        const choice = await this.ask((sel) => this.modelPicker(sel, cols), MODELS.length, -1)
        if (choice >= 0) {
          this.model = MODELS[choice]
          this.io.backend.storage.set(MODEL_KEY, choice)
          this.commit(() => [`${paint(GREEN, '•')} ${bold(paint(MAGENTA, 'model changed:'))} ${this.model.id} ${this.model.effort}`, ''])
        }
        return true
      }
      case 'review':
        await this.runTurn('review my uncommitted changes', null)
        return true
      case 'diff':
        await this.runTurn('review my changes', null)
        return true
      case 'init':
        this.commit((c) => this.prose("AGENTS.md creation isn't simulated in this demo. Ask me to `explain this repo` instead.", c))
        return true
      case 'approvals':
      case 'permissions':
        this.commit(() => [`${paint(GREEN, '•')} Approval mode: ${bold(this.yolo ? 'never (YOLO)' : 'on-request')} · sandbox: ${bold(this.yolo ? 'danger-full-access' : 'workspace-write')}`, ''])
        return true
      default:
        if (SLASH.some((s) => s.name === cmd)) {
          this.commit(() => [dim(`• /${cmd} isn't simulated in the TerminalDeck web demo.`), ''])
          return true
        }
        return false
    }
  }

  private helpLines(): string[] {
    const c = (n: string, d: string): string => `  ${paint(CYAN, n.padEnd(14))}${dim(d)}`
    return [
      c('/model', 'choose what model and reasoning effort to use'),
      c('/permissions', 'choose what Codex is allowed to do'),
      c('/review', 'review my current changes and find issues'),
      c('/new', 'start a new chat during a conversation'),
      c('/init', 'create an AGENTS.md file with instructions for Codex'),
      c('/diff', 'show git diff (including untracked files)'),
      c('/status', 'show current session configuration and token usage'),
      c('/quit', 'exit Codex'),
      ''
    ]
  }

  private statusCard(cols: number): string[] {
    const rows: Array<[string, string]> = [
      ['Model', `${this.model.id} (reasoning ${this.model.effort}, summaries auto)`],
      ['Directory', this.tildeCwd],
      ['Approval', this.yolo ? 'never' : 'on-request'],
      ['Sandbox', this.yolo ? 'danger-full-access' : 'workspace-write'],
      ['Agents.md', '<none>'],
      ['Account', 'dev@harbor.test (Plus)'],
      ['Session', this.sessionId],
      ['', ''],
      ['Context window', `${this.contextLeft()}% left (${Math.round((this.usage.input + this.usage.output) / 1000)}K used / 272K)`],
      ['5h limit', `[${'█'.repeat(1)}${'░'.repeat(19)}] 4% used`]
    ]
    const lines = [`${dim('>_ ')}${bold('OpenAI Codex')} ${dim(`(v${CODEX_VERSION})`)}`, '', ...rows.map(([k, v]) => (k ? `${dim(`${k}:`.padEnd(17))} ${v}` : ''))]
    const inner = Math.min(cols - 4, Math.max(...lines.map((l) => cellWidth(l))) + 1)
    return [
      dim(`╭${'─'.repeat(inner + 2)}╮`),
      ...lines.map((l) => {
        const t = truncate(l, inner)
        return `${dim('│')} ${t}${' '.repeat(Math.max(0, inner - cellWidth(t)))} ${dim('│')}`
      }),
      dim(`╰${'─'.repeat(inner + 2)}╯`),
      ''
    ]
  }

  private modelPicker(sel: number, cols: number): string[] {
    return [
      '',
      `  ${bold('Select Model and Effort')}`,
      dim('  Switch the model for this and future Codex CLI sessions'),
      '',
      ...MODELS.map((m, i) => {
        const cur = m === this.model ? ' (current)' : ''
        const label = `${i + 1}. ${m.id} ${m.effort}${cur}`
        return truncate(i === sel ? `${paint(CYAN, `› ${label}`)}  ${dim(m.blurb)}` : `  ${label}  ${dim(m.blurb)}`, cols)
      }),
      '',
      dim('  Press enter to confirm or esc to go back')
    ]
  }
}

const HELP = `Codex CLI

If no subcommand is specified, options will be forwarded to the interactive CLI.

Usage: codex [OPTIONS] [PROMPT]
       codex [OPTIONS] <COMMAND> [ARGS]

Commands:
  exec        Run Codex non-interactively [aliases: e]
  review      Run a code review non-interactively
  login       Manage login
  logout      Remove stored authentication credentials
  mcp         [experimental] Run Codex as an MCP server and manage MCP servers
  resume      Resume a previous interactive session
  help        Print this message or the help of the given subcommand(s)

Arguments:
  [PROMPT]  Optional user prompt to start the session

Options:
  -m, --model <MODEL>                Model the agent should use
  -a, --ask-for-approval <POLICY>    When to ask for approval [untrusted, on-failure, on-request, never]
  -s, --sandbox <SANDBOX_MODE>       [read-only, workspace-write, danger-full-access]
      --yolo                         Skip all confirmation prompts and run commands without sandboxing
  -h, --help                         Print help (see a summary with '-h')
  -V, --version                      Print version
`

/** `codex exec`: the header at once, the answer when the model is done, each stamped when it's printed. */
function execProgram(prompt: string): Program {
  let io: ProgramIO | null = null
  const print = (text: string): void => {
    if (io && !io.exited) io.write(text.replace(/\r?\n/g, '\r\n') + '\r\n')
  }
  return {
    start(programIo) {
      io = programIo
      const [head, tail] = execTranscript(programIo, prompt)
      print(head)
      programIo.timers.setTimeout(() => print(`${ts()} \x1b[35m\x1b[3mthinking\x1b[0m\n\x1b[3m**Reading the relevant files**\x1b[0m`), 1100)
      programIo.timers.setTimeout(() => {
        print(tail())
        if (io && !io.exited) io.exit(0)
      }, 2900)
    },
    input(data) {
      if (data.includes('\x03') && io && !io.exited) {
        io.write('^C\r\n')
        io.exit(130)
      }
    },
    kill() {
      io = null
    }
  }
}

const ts = (): string => `[${new Date().toISOString().slice(0, 19)}]`

function execTranscript(io: ProgramIO, prompt: string): [string, () => string] {
  const answer = oneshotAnswer(io, 'codex', prompt)
  const tokens = 1800 + answer.length * 2
  const head = [
    `${ts()} OpenAI Codex v${CODEX_VERSION} (research preview)`,
    '--------',
    `workdir: ${io.cwd}`,
    'model: gpt-5.5-codex',
    'provider: openai',
    'approval: never',
    'sandbox: read-only',
    'reasoning effort: high',
    'reasoning summaries: auto',
    '--------',
    `${ts()} User instructions:`,
    prompt
  ].join('\n')
  return [head, () => [`${ts()} \x1b[35m\x1b[3mcodex\x1b[0m`, answer, `${ts()} tokens used: ${tokens.toLocaleString('en-US')}`].join('\n')]
}

export const codexSpec: ProgramSpec = {
  name: 'codex',
  aliases: ['@openai/codex'],
  summary: 'OpenAI Codex CLI (simulated)',
  kind: 'agent',
  create(launch): Program {
    const argv = launch.argv
    if (argv.some((a) => a === '-V' || a === '--version')) return printProgram(`codex-cli ${CODEX_VERSION}`)
    if (argv.some((a) => a === '-h' || a === '--help') || argv[0] === 'help') return printProgram(HELP)
    if (argv[0] === 'exec' || argv[0] === 'e') {
      const prompt = positional(argv.slice(1), ['-m', '--model', '-s', '--sandbox', '-C', '--cd']) ?? ''
      if (!prompt) return printProgram('No prompt provided. Either specify one as an argument or pipe the prompt into stdin.', { code: 1 })
      return execProgram(prompt)
    }
    if (argv[0] === 'login') return printProgram('Logged in using ChatGPT', { delayMs: 400 })
    if (argv[0] === 'mcp') return printProgram('Name          Command  Args\nterminaldeck  node     deck-tools.js', { delayMs: 300 })
    return new Codex(launch)
  }
}
