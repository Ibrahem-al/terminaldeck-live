/**
 * Claude Code 2.1.x (agent-tuis.md §1): condensed Clawd header, the ruled
 * composer with a FAINT placeholder, the orange spinner row with
 * `esc to interrupt`, ● tool calls with ⎿ results and line-numbered diffs, the
 * permission dialog, Shift+Tab modes, slash commands, and the hooks the real
 * CLI POSTs to TerminalDeck (SessionStart, UserPromptSubmit, Notification,
 * Stop, SessionEnd).
 */
import { claudeConversationKey, type Program, type ProgramLaunch, type ProgramSpec } from '../contracts'
import { cellWidth, stripAnsi } from '../util/ansi'
import { hunks, diffLines } from '../util/diff'
import type { TodoItem } from './brain'
import { AgentTui, type Mode, type PermissionReq, type SlashItem, type ToolEvent, type TranscriptEntry } from './agent'
import { flagValue, oneshotAnswer, positional, printProgram } from './oneshot'
import {
  bg,
  bold,
  dim,
  formatDuration,
  formatTokens,
  grey,
  inverse,
  mdLite,
  paint,
  pick,
  RESET,
  rule,
  strike,
  truncate,
  wrapAll,
  type Rgb
} from './tui-kit'

export const CLAUDE_VERSION = '2.1.284'

// Dark-theme tokens from the 2.1.284 binary.
const C = {
  claude: [215, 119, 87] as Rgb,
  shimmer: [235, 159, 127] as Rgb,
  permission: [177, 185, 249] as Rgb,
  autoAccept: [175, 135, 255] as Rgb,
  planMode: [72, 150, 140] as Rgb,
  warning: [255, 193, 7] as Rgb,
  error: [255, 107, 128] as Rgb,
  success: [78, 186, 101] as Rgb,
  border: [136, 136, 136] as Rgb,
  inactive: [153, 153, 153] as Rgb,
  diffAdded: [34, 92, 43] as Rgb,
  diffRemoved: [122, 41, 54] as Rgb,
  userBg: [55, 55, 55] as Rgb,
  code: [177, 185, 249] as Rgb
}

// Windows (non-ghostty) spinner frames, played forwards then back.
const FRAMES = ['·', '✢', '*', '✶', '✻', '✽']
const SPIN = [...FRAMES, ...[...FRAMES].reverse()]

const VERBS = [
  'Accomplishing', 'Baking', 'Brewing', 'Churning', 'Clauding', 'Cogitating', 'Combobulating', 'Computing',
  'Concocting', 'Considering', 'Crafting', 'Crunching', 'Deliberating', 'Elucidating', 'Forging', 'Germinating',
  'Hatching', 'Ideating', 'Marinating', 'Moseying', 'Noodling', 'Percolating', 'Pondering', 'Puttering',
  'Reticulating', 'Ruminating', 'Schlepping', 'Simmering', 'Spelunking', 'Stewing', 'Synthesizing', 'Thinking',
  'Tinkering', 'Transmuting', 'Unfurling', 'Vibing', 'Whirring', 'Wibbling', 'Working', 'Wrangling'
]
const PAST = ['Baked', 'Brewed', 'Churned', 'Cogitated', 'Cooked', 'Crunched', 'Sautéed', 'Worked']
const GOODBYES = ['Goodbye!', 'See ya!', 'Bye!', 'Catch you later!']

const MODELS = [
  { label: 'Default (recommended)', short: 'Default', model: 'Opus 5.5', id: 'claude-opus-5-5', blurb: 'Opus 5.5 · Most capable for complex work' },
  { label: 'Opus', short: 'Opus', model: 'Opus 5.5', id: 'claude-opus-5-5', blurb: 'Opus 5.5 for complex tasks · Reaches usage limits faster' },
  { label: 'Sonnet', short: 'Sonnet', model: 'Sonnet 5', id: 'claude-sonnet-5', blurb: 'Sonnet 5 for everyday tasks' },
  { label: 'Haiku', short: 'Haiku', model: 'Haiku 4.5', id: 'claude-haiku-4-5', blurb: 'Haiku 4.5 for simple tasks' }
]
/** /model "applies to this session and future Claude Code sessions". */
const MODEL_KEY = 'claude:model'

const SLASH: SlashItem[] = [
  { name: 'add-dir', desc: 'Add a new working directory' },
  { name: 'agents', desc: 'Manage agent configurations' },
  { name: 'clear', desc: 'Clear conversation history and free up context' },
  { name: 'compact', desc: 'Clear conversation history but keep a summary in context' },
  { name: 'config', desc: 'Open config panel' },
  { name: 'context', desc: 'Visualize current context usage as a colored grid' },
  { name: 'cost', desc: 'Show the total cost and duration of the current session' },
  { name: 'doctor', desc: 'Diagnose and verify your Claude Code installation and settings' },
  { name: 'exit', desc: 'Exit the REPL' },
  { name: 'export', desc: 'Export the current conversation to a file or clipboard' },
  { name: 'help', desc: 'Show help and available commands' },
  { name: 'hooks', desc: 'Manage hook configurations for tool events' },
  { name: 'init', desc: 'Initialize a new CLAUDE.md file with codebase documentation' },
  { name: 'mcp', desc: 'Manage MCP servers' },
  { name: 'memory', desc: 'Edit Claude memory files' },
  { name: 'model', desc: 'Set the AI model for Claude Code' },
  { name: 'permissions', desc: 'Manage allow & deny tool permission rules' },
  { name: 'resume', desc: 'Resume a conversation' },
  { name: 'review', desc: 'Review a pull request' },
  { name: 'status', desc: 'Show Claude Code status including version, model, account, API connectivity, and tool statuses' },
  { name: 'statusline', desc: "Set up Claude Code's status line UI" },
  { name: 'todos', desc: 'List current todo items' },
  { name: 'usage', desc: 'Show plan usage limits' }
]
/** Rows of the slash menu under the composer. */
const MENU_ROWS = 6
/** Transcript cells kept per conversation for `--resume`. */
const KEEP_ENTRIES = 80

/** What `--resume` reads back (`lines`: the older, pre-rendered form). */
interface SavedConversation {
  entries?: TranscriptEntry[]
  lines?: string[]
}

const PLACEHOLDERS = [
  'Try "add rate limiting to the API and cover it with a test"',
  'Try "explain api/src/server.ts"',
  'Try "review my uncommitted changes"',
  'Try "write a test for api/src/routes/rates.ts"'
]

/** Rows the input box shows before it scrolls (fewer in a short pane). */
const COMPOSER_MAX_ROWS = 10

const CLAWD = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  ']

class ClaudeCode extends AgentTui {
  readonly agent = 'claude' as const
  protected readonly tickMs = 120
  private model = MODELS[0]
  private verb = 'Thinking'
  private placeholder: string
  private readonly sessionUuid: string
  private readonly canBypass: boolean
  private lastTitle = ''
  /** `--resume <id>`: the conversation to print back before the composer. */
  private readonly resuming: boolean

  constructor(private readonly launch: ProgramLaunch) {
    super()
    const argv = launch.argv
    const savedModel = launch.backend.storage.get<string>(MODEL_KEY)
    this.model = MODELS.find((x) => x.label === savedModel) ?? MODELS[0]
    this.canBypass = argv.some((a) => a === '--dangerously-skip-permissions' || a === '--allow-dangerously-skip-permissions')
    if (argv.includes('--dangerously-skip-permissions') || flagValue(argv, '--permission-mode') === 'bypassPermissions') this.mode = 'bypass'
    const pm = flagValue(argv, '--permission-mode')
    if (pm === 'acceptEdits') this.mode = 'acceptEdits'
    if (pm === 'plan') this.mode = 'plan'
    const m = (flagValue(argv, '--model') ?? '').toLowerCase()
    if (m) this.model = MODELS.find((x) => x.short.toLowerCase().startsWith(m)) ?? this.model
    const resumeId = flagValue(argv, '--resume', '-r')
    this.resuming = !!resumeId
    this.sessionUuid = flagValue(argv, '--session-id') || resumeId || launch.session.claudeSessionId || crypto.randomUUID()
    this.placeholder = pick(PLACEHOLDERS.slice(0, 2), launch.session.paneId ?? launch.session.id)
    // The pane's own auto-run (TerminalDeck chose the id): start on a clean screen, like the first layout pass leaves it.
    this.clearOnStart = !!launch.session.claudeSessionId && flagValue(argv, '--session-id') === launch.session.claudeSessionId
  }

  protected onLaunch(): void {
    this.io.setTitle('✳ Claude Code')
    this.world.hook('SessionStart')
    this.io.backend.pty.noteClaude(this.io.session.id, this.sessionUuid)
    if (this.resuming) {
      const saved = this.io.backend.storage.get<SavedConversation>(claudeConversationKey(this.sessionUuid))
      const entries = saved?.entries ?? (saved?.lines?.length ? [{ k: 'lines' as const, lines: saved.lines }] : [])
      if (entries.length) {
        this.placeholder = ''
        this.restoreTranscript(entries)
      }
    }
    const prompt = positional(this.launch.argv, ['--model', '--session-id', '--resume', '-r', '--permission-mode', '--add-dir', '--settings'])
    if (prompt) this.io.timers.setTimeout(() => void this.runPrompt(prompt), 600)
  }

  private async runPrompt(prompt: string): Promise<void> {
    this.commit((cols) => this.userEcho(prompt, cols), { k: 'user', text: prompt })
    await this.runTurn(prompt, null)
  }

  /* ── frame pieces ── */

  protected header(cols: number): string[] {
    return [
      `${paint(C.claude, CLAWD[0])}  ${bold('Claude Code')} ${dim(`v${CLAUDE_VERSION}`)}`,
      `${paint(C.claude, CLAWD[1])}  ${dim(`${this.model.model} · Claude Max`)}`,
      `${paint(C.claude, CLAWD[2])}  ${dim(this.io.cwd)}`,
      ''
    ].map((l) => truncate(l, cols))
  }

  protected composer(cols: number): { lines: string[]; park: { row: number; col: number } } {
    const border = paint(C.border, rule(cols))
    let rows: string[]
    let row = 0
    let col = 2
    if (this.editor.text === '') {
      // Placeholder: the drawn cursor (inverse) on its first letter, the rest FAINT.
      const ph = truncate(this.placeholder, cols - 3)
      rows = [ph ? `❯ ${inverse(ph.charAt(0))}${dim(ph.slice(1))}` : `❯ ${inverse(' ')}`]
    } else {
      const lay = this.editor.layout('❯ ', cols)
      rows = lay.rows
      row = lay.row
      col = lay.col
      // A long input scrolls inside the box, `❯` kept on its first row, so both
      // rules stay on screen: the renderer reads the box between them.
      const max = Math.max(1, Math.min(COMPOSER_MAX_ROWS, this.io.rows - 6))
      if (rows.length > max) {
        const start = Math.min(Math.max(0, row - max + 1), rows.length - max)
        rows = rows.slice(start, start + max)
        if (start > 0) rows[0] = `❯ ${rows[0].slice(2)}`
        row -= start
      }
    }
    const menu = this.slashMenu()
    return {
      lines: ['', border, ...rows, border, ...(menu ? this.menuRows(menu.items, menu.sel, cols) : [this.footer(cols)])],
      park: { row: 2 + row, col }
    }
  }

  /** The slash-command suggestions that replace the footer while typing `/…`; the highlighted row in the suggestion colour. */
  private menuRows(items: SlashItem[], sel: number, cols: number): string[] {
    const start = Math.min(Math.max(0, sel - MENU_ROWS + 1), Math.max(0, items.length - MENU_ROWS))
    const nameW = Math.min(22, Math.max(...items.map((i) => i.name.length)) + 3)
    return items.slice(start, start + MENU_ROWS).map((it, i) => {
      const name = `/${it.name}`.padEnd(nameW)
      const row = truncate(`  ${name}${it.desc}`, cols)
      return start + i === sel ? paint(C.permission, row) : `  ${name}${dim(truncate(it.desc, Math.max(1, cols - nameW - 2)))}`
    })
  }

  private footer(cols: number): string {
    if (this.flash) return dim(`  ${this.flash}`)
    const hint = dim('(shift+tab to cycle)')
    const text: Record<Mode, string> = {
      default: dim('  ? for shortcuts'),
      acceptEdits: `  ${paint(C.autoAccept, '⏵⏵ accept edits on')} ${hint}`,
      plan: `  ${paint(C.planMode, '⏸ plan mode on')} ${hint}`,
      auto: `  ${paint(C.warning, '⏵⏵ auto mode on')} ${hint}`,
      bypass: `  ${paint(C.error, '⏵⏵ bypass permissions on')} ${hint}`
    }
    return truncate(text[this.mode], cols)
  }

  protected status(cols: number): string[] {
    const w = this.work
    const glyph = SPIN[w.frame % SPIN.length]
    const word = `${w.activity ?? this.verb}…`
    // The shimmer: a 3-letter highlight sweeping across the verb.
    const chars = [...word]
    const at = Math.max(0, Math.min(chars.length, (w.frame % (chars.length + 8)) - 4))
    const verb =
      paint(C.claude, chars.slice(0, at).join('')) + paint(C.shimmer, chars.slice(at, at + 3).join('')) + paint(C.claude, chars.slice(at + 3).join(''))
    const secs = Math.floor((Date.now() - w.startedAt) / 1000)
    const arrow = secs < 2 ? '↑' : '↓'
    const meta = dim(`(${formatDuration(secs * 1000)} · ${arrow} ${formatTokens(w.tokens)} tokens · esc to interrupt)`)
    return [truncate(`${paint(C.claude, glyph)} ${verb} ${meta}`, cols)]
  }

  protected userEcho(text: string, cols: number): string[] {
    const rows = wrapAll([text], cols - 2, '')
    return [...rows.map((r, i) => `${bg(C.userBg)}${i === 0 ? grey('> ') : '  '}${r}${' '.repeat(Math.max(0, cols - 2 - cellWidth(r)))}${RESET}`), '']
  }

  protected prose(text: string, cols: number): string[] {
    const styled = text
      .split('\n')
      .map((l) => (l.startsWith('> ') ? italic(dim(l)) : mdLite(l, C.code)))
      .join('\n')
    return [...this.wrapProse(styled, cols, '● ', '  '), '']
  }

  private call(name: string, args: string, ok = true): string {
    return `${paint(ok ? C.success : C.error, '●')} ${bold(name)}(${args})`
  }

  private result(lines: string[], cols: number): string[] {
    return lines.flatMap((l, i) => wrapAll([l], cols - 5, '').map((r, j) => (i === 0 && j === 0 ? `  ⎿  ${r}` : `     ${r}`)))
  }

  protected tool(ev: ToolEvent, cols: number): string[] {
    const w = this.world
    const fit = (s: string): string[] => wrapAll([s], cols, '  ')
    switch (ev.kind) {
      case 'read':
        return ev.files.flatMap((f) => [
          ...fit(this.call('Read', w.show(f.path), !f.missing)),
          ...this.result([f.missing ? paint(C.error, 'Error: File does not exist.') : `Read ${bold(String(f.lines))} lines`], cols),
          ''
        ])
      case 'search':
        return [
          ...fit(this.call('Search', `pattern: "${ev.pattern}", path: "${w.show(ev.path)}"`)),
          ...this.result([`Found ${bold(String(ev.files.length))} file${ev.files.length === 1 ? '' : 's'} (ctrl+o to expand)`], cols),
          ''
        ]
      case 'list':
        return [
          ...fit(this.call('List', w.show(ev.path))),
          ...this.result([`Listed ${bold(String(ev.entries.length))} paths (ctrl+o to expand)`], cols),
          ''
        ]
      case 'edit':
        return this.editBlock(ev, cols)
      case 'run': {
        // The preview skips blank lines: `> api@0.1.0 test` / `> vitest run` / `RUN v3…`, not the gaps between.
        const out = this.clip(ev.output.split(/\r?\n/).filter((l) => stripAnsi(l).trim() !== '').join('\n'), 4)
        const body = out.lines.length ? out.lines : [dim('(No content)')]
        const res = ev.code === 0 ? body : [paint(C.error, `Error: Exit code ${ev.code}`), ...body]
        if (out.more) res.push(dim(`… +${out.more} lines (ctrl+o to expand)`))
        return [...fit(this.call('Bash', ev.command, ev.code === 0)), ...this.result(res.map((l) => truncate(l, cols - 5)), cols), '']
      }
      case 'message': {
        const short = ev.text.replace(/\n/g, ' ').slice(0, 60)
        const res = ev.result.ok
          ? dim(JSON.stringify({ ok: true, id: ev.result.id, status: ev.result.status ?? 'queued' }))
          : paint(C.error, `Error: ${ev.result.error ?? ev.result.reason ?? 'refused'}`)
        return [
          ...fit(this.call('terminaldeck - send_message', `paneId: "${ev.to}", text: "${short}${ev.text.length > 60 ? '…' : ''}"`, ev.result.ok).replace('send_message', `send_message${RESET}${dim(' (MCP)')}`)),
          ...this.result([res], cols),
          ''
        ]
      }
    }
  }

  private editBlock(ev: Extract<ToolEvent, { kind: 'edit' }>, cols: number): string[] {
    const w = this.world
    const path = w.show(ev.path)
    const created = ev.before === null
    const head = wrapAll([this.call(created ? 'Write' : 'Update', path, !ev.error)], cols, '  ')
    if (ev.error || ev.after === null) return [...head, ...this.result([paint(C.error, `Error: ${ev.error ?? 'edit failed'}`)], cols), '']
    const after = ev.after.split('\n')
    if (after[after.length - 1] === '') after.pop()
    if (created) {
      const shown = after.slice(0, 8)
      const width = String(shown.length).length
      return [
        ...head,
        ...this.result([`Wrote ${bold(String(after.length))} lines to ${path}`], cols),
        ...shown.map((l, i) => truncate(`     ${String(i + 1).padStart(width + 1)} ${l}`, cols)),
        ...(after.length > shown.length ? [dim(`     … +${after.length - shown.length} lines (ctrl+o to expand)`)] : []),
        ''
      ]
    }
    const ops = diffLines(ev.before ?? '', ev.after)
    const added = ops.filter((o) => o.op === 'insert').length
    const removed = ops.filter((o) => o.op === 'delete').length
    const summary = `Updated ${path} with ${added} addition${added === 1 ? '' : 's'}${removed ? ` and ${removed} removal${removed === 1 ? '' : 's'}` : ''}`
    const out = [...head, ...this.result([dim(summary)], cols)]
    const hs = hunks(ops, 2)
    const numW = String(Math.max(...hs.map((h) => Math.max(h.oldStart + h.oldLines, h.newStart + h.newLines)))).length
    hs.forEach((h, hi) => {
      if (hi > 0) out.push(dim(`     ${' '.repeat(numW)}  ...`))
      let o = h.oldStart
      let n = h.newStart
      for (const line of h.lines) {
        const mark = line[0]
        const text = line.slice(1)
        const num = mark === '-' ? o++ : n++
        if (mark === ' ') o++
        const row = truncate(`     ${String(num).padStart(numW + 1)} ${mark === ' ' ? ' ' : mark}  ${text}`, cols)
        if (mark === ' ') out.push(row)
        else {
          const pad = ' '.repeat(Math.max(0, cols - cellWidth(row)))
          out.push(`${bg(mark === '+' ? C.diffAdded : C.diffRemoved)}${row}${pad}${RESET}`)
        }
      }
    })
    out.push('')
    return out
  }

  protected todoList(items: TodoItem[], cols: number): string[] {
    const rows = items.map((it) =>
      it.status === 'completed' ? dim(`☒ ${strike(it.content)}`) : it.status === 'in_progress' ? bold(`☐ ${it.content}`) : `☐ ${it.content}`
    )
    return [`${paint(C.success, '●')} ${bold('Update Todos')}`, ...this.result(rows, cols), '']
  }

  protected permission(req: PermissionReq, sel: number, cols: number): string[] {
    const opts =
      req.kind === 'bash'
        ? ['Yes', `Yes, and don't ask again for ${bold(req.prefix)} commands in ${bold(req.cwd)}`, 'No, and tell Claude what to do differently (esc)']
        : req.kind === 'edit'
          ? ['Yes', 'Yes, allow all edits during this session (shift+tab)', 'No, and tell Claude what to do differently (esc)']
          : ['Yes, and auto-accept edits', 'Yes, and manually approve edits', 'No, keep planning']
    const optRows = opts.flatMap((o, i) => {
      const label = `${i + 1}. ${o}`
      const rows = wrapAll([label], cols - 4, '   ')
      return rows.map((r, j) => (j === 0 ? (i === sel ? ` ${paint(C.permission, `❯ ${r}`)}` : `   ${r}`) : `   ${r}`))
    })
    const top = paint(C.permission, rule(cols))
    if (req.kind === 'edit') {
      const created = req.before === null
      const name = req.path.split('/').pop() ?? req.path
      const dash = dim('╌'.repeat(cols))
      return [
        top,
        ` ${bold(paint(C.permission, created ? 'Create file' : 'Edit file'))}`,
        ` ${this.world.show(req.path)}`,
        dash,
        ...this.editPreview(req, cols),
        dash,
        ` Do you want to ${created ? `create ${bold(name)}` : `make this edit to ${bold(name)}`}?`,
        ...optRows
      ]
    }
    if (req.kind === 'bash')
      return [
        top,
        ` ${bold(paint(C.permission, 'Bash command'))}`,
        '',
        ...wrapAll([`   ${req.command}`], cols, '   '),
        ...wrapAll([`   ${dim(req.description)}`], cols, '   '),
        '',
        ' Do you want to proceed?',
        ...optRows
      ]
    return [
      top,
      ` ${bold(paint(C.planMode, 'Ready to code?'))}`,
      '',
      " Here is Claude's plan:",
      ...req.plan.flatMap((p) => wrapAll([`   ${p}`], cols, '   ')),
      '',
      ' Would you like to proceed?',
      ...optRows
    ]
  }

  /** The dialog's preview: the new file's first lines, or the changed lines with a little context. Short enough to fit the pane. */
  private editPreview(req: Extract<PermissionReq, { kind: 'edit' }>, cols: number): string[] {
    const room = Math.max(3, Math.min(12, this.io.rows - 12))
    if (req.before === null) {
      const lines = req.after.split('\n')
      if (lines[lines.length - 1] === '') lines.pop()
      const width = String(Math.min(lines.length, room)).length
      const shown = lines.slice(0, room).map((l, i) => truncate(` ${String(i + 1).padStart(width)} ${l}`, cols))
      return lines.length > room ? [...shown, dim(` … +${lines.length - room} lines`)] : shown
    }
    const hs = hunks(diffLines(req.before, req.after), 1)
    const numW = String(Math.max(1, ...hs.map((h) => h.newStart + h.newLines))).length
    const out: string[] = []
    for (const [hi, h] of hs.entries()) {
      // No room for the next hunk to say anything: end on an ellipsis rather than one stray row.
      if (out.length + 2 >= room) {
        if (hi > 0) out.push(dim(` ${' '.repeat(numW)}   …`))
        break
      }
      // Between hunks, as Claude Code's diff does: the unchanged lines in the gap are skipped, not lost silently.
      if (hi > 0) out.push(dim(` ${' '.repeat(numW)}   ...`))
      let o = h.oldStart
      let n = h.newStart
      for (const line of h.lines) {
        if (out.length >= room) break
        const mark = line[0]
        const num = mark === '-' ? o++ : n++
        if (mark === ' ') o++
        const row = truncate(` ${String(num).padStart(numW)} ${mark === ' ' ? ' ' : mark} ${line.slice(1)}`, cols)
        out.push(mark === ' ' ? row : `${bg(mark === '+' ? C.diffAdded : C.diffRemoved)}${row}${' '.repeat(Math.max(0, cols - cellWidth(row)))}${RESET}`)
      }
    }
    return out
  }

  protected permissionHotkeys(): Record<string, number> {
    return {}
  }

  protected interrupted(): string[] {
    return [`  ⎿  ${paint(C.error, 'Interrupted')} ${dim('· What should Claude do instead?')}`, '']
  }

  protected declined(req: PermissionReq, cols: number): string[] {
    const head =
      req.kind === 'bash'
        ? this.call('Bash', req.command)
        : req.kind === 'edit'
          ? this.call(req.before === null ? 'Write' : 'Update', this.world.show(req.path))
          : null
    return [...(head ? wrapAll([head], cols, '  ') : []), ...this.interrupted()]
  }

  protected editsNeedApproval(): boolean {
    return true
  }

  protected slashCommands(): SlashItem[] {
    return SLASH
  }

  protected defaultTitle(): string {
    return 'Claude Code'
  }

  protected turnDone(ms: number): string[] {
    if (ms < 4000) return []
    return [`${paint(C.claude, '✻')} ${dim(`${pick(PAST, this.turns + this.turnTitle)} for ${formatDuration(ms)}`)}`, '']
  }

  protected goodbye(cols: number, viaCommand: boolean): string[] {
    if (viaCommand) return [`  ⎿  ${dim(pick(GOODBYES, this.sessionUuid))}`, '']
    // Ctrl+C twice: Ink unmounts and its last frame stays on screen, footer gone.
    const border = paint(C.border, rule(cols))
    return ['', border, '❯ ', border, '']
  }

  protected exitArmedText(): string {
    return 'Press Ctrl-C again to exit'
  }

  /* ── behaviour ── */

  protected cycleMode(): void {
    const order: Mode[] = ['default', 'acceptEdits', 'plan', 'auto', ...(this.canBypass ? (['bypass'] as Mode[]) : [])]
    this.mode = order[(order.indexOf(this.mode) + 1) % order.length]
  }

  protected onTurnStart(title: string): void {
    // Claude Code only suggests a prompt in an empty conversation.
    this.placeholder = ''
    this.verb = pick(VERBS, `${title}#${this.turns}`)
    this.world.hook('UserPromptSubmit')
    this.lastTitle = ''
    this.setWorkingTitle()
  }

  private setWorkingTitle(): void {
    const glyph = SPIN[this.work.frame % SPIN.length]
    const title = `${glyph === '·' ? '✳' : glyph} ${this.turnTitle}`
    if (title !== this.lastTitle) {
      this.lastTitle = title
      this.io.setTitle(title)
    }
  }

  protected onTick(): void {
    if (this.work.frame % 8 === 0) this.setWorkingTitle()
  }

  protected onTurnEnd(interrupted: boolean): void {
    this.io.setTitle(`✳ ${this.turnTitle}`)
    this.saveConversation()
    if (!interrupted) this.world.hook('Stop')
  }

  /** Claude Code appends every turn to its transcript; ours keeps the cells as data for `--resume`. */
  private saveConversation(): void {
    const entries = this.transcriptEntries()
    if (entries.length) this.io.backend.storage.set(claudeConversationKey(this.sessionUuid), { entries: entries.slice(-KEEP_ENTRIES) } satisfies SavedConversation)
  }

  protected onPermissionShown(req: PermissionReq): void {
    const tool = req.kind === 'bash' ? 'Bash' : req.kind === 'edit' ? (req.before === null ? 'Write' : 'Edit') : null
    this.world.hook('Notification', tool ? `Claude needs your permission to use ${tool}` : 'Claude needs your approval for the plan')
  }

  protected onExit(): void {
    this.world.hook('SessionEnd')
    this.io.backend.pty.noteClaude(this.io.session.id, null)
  }

  protected async slash(cmd: string, _args: string): Promise<boolean> {
    const cols = this.cols
    switch (cmd) {
      case 'exit':
      case 'quit':
        this.exit(true)
        return true
      case 'clear':
      case 'reset':
      case 'new':
        this.clearConversation()
        return true
      case 'help':
        this.commit((c) => this.helpPanel(c))
        return true
      case 'model': {
        const choice = await this.ask((sel) => this.modelPicker(sel, cols), MODELS.length, -1)
        if (choice >= 0) {
          this.model = MODELS[choice]
          this.io.backend.storage.set(MODEL_KEY, this.model.label)
          const m = this.model
          this.commit(() => [`  ⎿  Set model to ${bold(m.short)} ${dim(`(${m.model})`)}`, ''])
        } else {
          const m = this.model
          this.commit(() => [`  ⎿  ${dim(`Kept model as ${m.short}`)}`, ''])
        }
        return true
      }
      case 'status':
        this.commit((c) => this.statusPanel(c))
        return true
      case 'cost':
        this.commit((c) => this.costPanel(c, false))
        return true
      case 'usage':
        this.commit((c) => this.costPanel(c, true))
        return true
      case 'resume':
        this.commit(() => [`  ⎿  ${dim('No other conversations in this folder. Quit and run `claude --resume <id>` to pick one.')}`, ''])
        return true
      case 'compact':
        this.commit(() => [`  ⎿  ${dim('Compacted (ctrl+o to see full summary)')}`, ''])
        return true
      case 'init':
        await this.runTurn('explain this repo', null)
        return true
      case 'review':
        await this.runTurn('review my changes', null)
        return true
      default:
        if (SLASH.some((s) => s.name === cmd)) {
          this.commit(() => [`  ⎿  ${dim(`/${cmd} isn't simulated in the TerminalDeck web demo.`)}`, ''])
          return true
        }
        return false
    }
  }

  protected unknownSlash(cmd: string): string[] {
    return [`  ⎿  Unknown slash command: ${cmd}`, '']
  }

  private helpPanel(cols: number): string[] {
    // Two columns; a long description wraps under itself, not under the key.
    const k = (a: string, b: string): string[] => {
      const rows = wrapAll([b], Math.max(12, cols - 28), '')
      return rows.map((r, i) => `  ${(i === 0 ? a : '').padEnd(26)}${dim(r)}`)
    }
    return [
      `  ${bold(paint(C.claude, `Claude Code v${CLAUDE_VERSION}`))}`,
      '',
      `  ${bold('Shortcuts')}`,
      ...k('! for bash mode', 'double tap esc to clear input'),
      ...k('/ for commands', 'shift + tab to cycle modes'),
      ...k('@ for file paths', 'ctrl + c twice to exit'),
      ...k('esc to interrupt', 'shift + ⏎ for newline'),
      '',
      `  ${bold('Commands')}`,
      ...k('/clear', 'Clear conversation history and free up context'),
      ...k('/cost', 'Show the total cost and duration of the current session'),
      ...k('/exit', 'Exit the REPL'),
      ...k('/help', 'Show help and available commands'),
      ...k('/model', 'Set the AI model for Claude Code'),
      ...k('/status', 'Show Claude Code status including version, model, account, and API connectivity'),
      '',
      `  ${dim('For more help: https://code.claude.com/docs/en/overview')}`,
      ''
    ]
  }

  private modelPicker(sel: number, cols: number): string[] {
    return [
      paint(C.permission, rule(cols)),
      ` ${bold(paint(C.permission, 'Select model'))}`,
      ` ${dim('Switch between Claude models. Applies to this session and future Claude Code sessions.')}`,
      '',
      ...MODELS.map((m, i) => {
        const cur = m === this.model ? ` ${paint(C.success, '✔')}` : ''
        const label = `${i + 1}. ${m.label.padEnd(22)}`
        const row = i === sel ? ` ${paint(C.permission, `❯ ${label}`)}` : `   ${label}`
        return truncate(`${row}${dim(m.blurb)}${cur}`, cols)
      }),
      '',
      ` ${dim('Enter to confirm · Esc to exit')}`
    ]
  }

  private statusPanel(cols: number): string[] {
    const row = (k: string, v: string): string => truncate(`  ${bold(k)} ${v}`, cols)
    return [
      `  ${dim('Status   Config   Usage   (tab to cycle)')}`,
      '',
      row('Version:', CLAUDE_VERSION),
      row('Session ID:', this.sessionUuid),
      row('cwd:', this.io.cwd),
      row('Login method:', 'Claude Max Account'),
      row('Organization:', "dev's Organization"),
      row('Email:', 'dev@harbor.test'),
      '',
      row('Model:', `${this.model.short} (${this.model.model})`),
      row('MCP servers:', `terminaldeck ${paint(C.success, '✔')}`),
      row('Setting sources:', 'User settings, Project local settings'),
      ''
    ]
  }

  /** /cost on a Max plan has nothing to bill; /usage adds the session's numbers by model. */
  private costPanel(cols: number, detailed: boolean): string[] {
    const lines = [
      'With your Claude Max subscription, no need to monitor cost — your subscription includes Claude Code usage',
      ...(detailed
        ? [
            `Total duration (API):  ${formatDuration(this.usage.apiMs)}`,
            `Total duration (wall): ${formatDuration(Date.now() - this.startedAt)}`,
            `Total code changes:    ${this.usage.added} line${this.usage.added === 1 ? '' : 's'} added, ${this.usage.removed} line${this.usage.removed === 1 ? '' : 's'} removed`,
            'Usage by model:',
            `    ${this.model.id}:  ${formatTokens(this.usage.input)} input, ${formatTokens(this.usage.output)} output, ${formatTokens(this.usage.input * 6)} cache read, 0 cache write`
          ]
        : [])
    ]
    const width = Math.max(12, cols - 5)
    const out = lines.flatMap((l, i) => wrapAll([l], width, /^s/.test(l) ? '      ' : '').map((r, j) => (i === 0 && j === 0 ? `  ⎿  ${dim(r)}` : `     ${dim(r)}`)))
    return [...out, '']
  }
}

function italic(s: string): string {
  return `\x1b[3m${s}\x1b[23m`
}

const HELP = `Usage: claude [options] [command] [prompt]

Claude Code - starts an interactive session by default, use -p/--print for
non-interactive output

Arguments:
  prompt                                            Your prompt

Options:
  -d, --debug [filter]                              Enable debug mode
  -p, --print                                       Print response and exit (useful for pipes)
  -c, --continue                                    Continue the most recent conversation
  -r, --resume [sessionId]                          Resume a conversation
  --model <model>                                   Model for the current session (e.g. 'sonnet' or 'opus')
  --permission-mode <mode>                          Permission mode (acceptEdits, bypassPermissions, default, plan)
  --dangerously-skip-permissions                    Bypass all permission checks
  --session-id <uuid>                               Use a specific session ID for the conversation
  -v, --version                                     Output the version number
  -h, --help                                        Display help for command

Commands:
  config                                            Manage configuration
  doctor                                            Check the health of your Claude Code auto-updater
  mcp                                               Configure and manage MCP servers
  update                                            Check for updates and install if available
`

export const claudeSpec: ProgramSpec = {
  name: 'claude',
  aliases: ['@anthropic-ai/claude-code', 'claude-code'],
  summary: 'Claude Code — Anthropic’s coding agent (simulated)',
  kind: 'agent',
  create(launch): Program {
    const argv = launch.argv
    if (argv.some((a) => a === '-v' || a === '--version')) return printProgram(`${CLAUDE_VERSION} (Claude Code)`)
    if (argv.some((a) => a === '-h' || a === '--help')) return printProgram(HELP)
    const sub = argv.find((a) => !a.startsWith('-'))
    if (sub === 'doctor') return printProgram(`\n Diagnostics\n └ Currently running: native (${CLAUDE_VERSION})\n └ Path: C:\\Users\\dev\\.local\\bin\\claude.exe\n └ Auto-updates: enabled\n`, { delayMs: 700 })
    if (sub === 'update' || sub === 'upgrade') return printProgram(`Current version: ${CLAUDE_VERSION}\nChecking for updates...\nClaude Code is up to date (${CLAUDE_VERSION})`, { delayMs: 900 })
    if (sub === 'mcp') return printProgram('terminaldeck: node C:\\Users\\dev\\AppData\\Local\\TerminalDeck\\deck-tools.js - ✓ Connected', { delayMs: 600 })
    if (argv.some((a) => a === '-p' || a === '--print' || /^-[a-z]*p[a-z]*$/.test(a))) {
      const prompt = positional(argv, ['--model', '--output-format', '--permission-mode']) ?? ''
      if (!prompt) return printProgram('Error: Input must be provided either through stdin or as a prompt argument when using --print', { code: 1 })
      return printProgram((io) => oneshotAnswer(io, 'claude', prompt), { delayMs: 2200 })
    }
    return new ClaudeCode(launch)
  }
}
