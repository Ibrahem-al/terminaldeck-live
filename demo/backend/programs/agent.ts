/**
 * The engine every full agent TUI (Claude Code, Codex, Gemini) runs on: the
 * composer, the live region, the turn loop that executes a brain plan, the
 * permission modal, interrupts and exit. Subclasses only draw.
 *
 * Byte discipline (terminal-signals.md §5–6) matters more than looks:
 *  - idle means NO output — deck-message delivery waits for 1.2 s of quiet;
 *  - while working, the status row carries `esc to interrupt` (the gate's
 *    "working" signal) and nothing else on screen may look like an idle composer;
 *  - the composer is the lowest thing on screen, its placeholder FAINT.
 */
import type { FramedMessage, Program, ProgramIO, SendMessageResult } from '../contracts'
import { emptyResults, plan, type AgentName, type Offer, type Results, type Step, type TodoItem } from './brain'
import {
  CLEAR_ALL,
  LineEditor,
  LiveScreen,
  hideCursor,
  parseKeys,
  showCursor,
  truncate,
  wrap,
  wrapAll,
  type Key
} from './tui-kit'
import { World, outputLines } from './world'
import { cellWidth, stripAnsi } from '../util/ansi'

export type PermissionReq =
  | { kind: 'bash'; command: string; description: string; prefix: string; cwd: string }
  | { kind: 'plan'; plan: string[] }
  /** A file write or edit, with the text before (null: a new file) and after. */
  | { kind: 'edit'; path: string; before: string | null; after: string }

/** One row of a TUI's slash-command menu. */
export interface SlashItem {
  name: string
  desc: string
}

export type ToolEvent =
  | { kind: 'read'; files: Array<{ path: string; lines: number; missing: boolean }> }
  | { kind: 'search'; pattern: string; path: string; files: string[]; matches: number }
  | { kind: 'list'; path: string; entries: string[] }
  | { kind: 'edit'; path: string; before: string | null; after: string | null; error?: string }
  | { kind: 'run'; command: string; description: string; output: string; code: number }
  | { kind: 'message'; to: string; toName: string; text: string; result: SendMessageResult }

export type RunStep = Extract<Step, { t: 'run' }>

/**
 * A transcript cell as data, so a resumed conversation can be laid out again at
 * the pane's current width instead of re-wrapping rows cut for another one.
 */
export type TranscriptEntry =
  | { k: 'user'; text: string }
  | { k: 'prose'; text: string }
  | { k: 'tool'; ev: ToolEvent }
  | { k: 'todos'; items: TodoItem[] }
  | { k: 'declined'; req: PermissionReq }
  | { k: 'interrupted' }
  | { k: 'explore'; evs: ToolEvent[] }
  | { k: 'lines'; lines: string[] }

interface TranscriptCell {
  render: (cols: number) => string[]
  entry?: TranscriptEntry
}

export type Phase = 'idle' | 'working' | 'modal' | 'exited'

export interface WorkState {
  startedAt: number
  tokens: number
  /** What the status row says (a todo's activeForm, "Running tests"…). Null = the turn's verb. */
  activity: string | null
  frame: number
}

interface Modal {
  lines: (sel: number) => string[]
  count: number
  esc: number
  hotkeys: Record<string, number>
  sel: number
  resolve: (choice: number) => void
}

/** Thrown through the turn when the user interrupts or rejects. */
class Abort extends Error {
  constructor(readonly silent = false) {
    super('abort')
  }
}

export type Mode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypass'

export abstract class AgentTui implements Program {
  abstract readonly agent: AgentName
  /** Spinner redraw period. */
  protected abstract readonly tickMs: number

  protected io!: ProgramIO
  protected world!: World
  protected live!: LiveScreen
  protected phase: Phase = 'idle'
  protected editor = new LineEditor()
  protected work: WorkState = { startedAt: 0, tokens: 0, activity: null, frame: 0 }
  protected modal: Modal | null = null
  /** Transient footer text ("Press Ctrl-C again to exit"). */
  protected flash: string | null = null
  protected mode: Mode = 'default'
  /** Command prefixes the user said "don't ask again" for. */
  protected allowed = new Set<string>()
  protected turnTitle = ''
  protected turns = 0
  protected toolCalls = 0
  protected usage = { input: 0, output: 0, apiMs: 0, added: 0, removed: 0 }
  protected readonly startedAt = Date.now()

  private transcript: TranscriptCell[] = []
  private ticker = 0
  private flashTimer = 0
  private armedExit = 0
  private escArmed = 0
  private abort: { aborted: boolean; silent: boolean } | null = null
  private queue: string[] = []
  /** What plan mode shows before the first write: the turn's edits and commands. */
  private planOutline: string[] = []
  private resizeTimer = 0
  /** Codex folds consecutive reads, searches and lists into one `Explored` cell. */
  protected groupExploration = false
  private exploring: ToolEvent[] = []
  /** Start on a cleared screen (see ClaudeCode: a launch TerminalDeck typed for the pane). */
  protected clearOnStart = false
  /** A full-screen TUI: runs in the alternate buffer and leaves the shell's screen untouched. */
  protected altScreen = false
  /** Status rows in the last full draw — ticks patch them in place when the count is unchanged. */
  private statusRows = -1
  private lastCols = 0
  /** What the last turn offered; a "yes" in the next turn accepts it. */
  private offer: Offer | null = null
  /** The highlighted row of the slash-command menu. */
  private menuSel = 0
  /**
   * Until then, ticks redraw the whole region instead of patching one row. Ink
   * re-renders everything after a dialog closes; that burst of output is also
   * what retires the notch's permission question once it's been answered.
   */
  private fullRedrawUntil = 0

  /* ───────────── what subclasses draw ───────────── */

  /** Banner printed at launch and after /clear. */
  protected abstract header(cols: number): string[]
  /** The idle bottom block (composer + footer) and where the cursor parks. */
  protected abstract composer(cols: number): { lines: string[]; park: { row: number; col: number } }
  /** Status rows drawn above the composer while working. */
  protected abstract status(cols: number): string[]
  protected abstract userEcho(text: string, cols: number): string[]
  protected abstract prose(text: string, cols: number): string[]
  protected abstract tool(ev: ToolEvent, cols: number): string[]
  protected abstract todoList(items: TodoItem[], cols: number): string[]
  /** Several reads/searches/lists as one cell (`active`: still gathering). Default: one cell each. */
  protected exploreGroup(evs: ToolEvent[], cols: number, _active: boolean): string[] {
    return evs.flatMap((ev) => this.tool(ev, cols))
  }
  protected abstract permission(req: PermissionReq, sel: number, cols: number): string[]
  protected abstract interrupted(cols: number): string[]
  protected abstract turnDone(ms: number, cols: number): string[]
  /** Lines printed on the way out (after the region is cleared). */
  protected abstract goodbye(cols: number, viaCommand: boolean): string[]
  protected abstract exitArmedText(): string

  /* ───────────── hooks for subclasses ───────────── */

  /** Handle `/cmd args`. Return false to fall through to "unknown command". */
  protected slash(_cmd: string, _args: string): boolean | Promise<boolean> {
    return false
  }
  protected onLaunch(): void {}
  protected onTurnStart(_title: string): void {}
  protected onTick(): void {}
  protected onTurnEnd(_interrupted: boolean): void {}
  protected onPermissionShown(_req: PermissionReq): void {}
  protected onExit(): void {}
  /** Hotkeys of the permission modal (Codex: y / p). */
  protected permissionHotkeys(_req: PermissionReq): Record<string, number> {
    return {}
  }
  /** A transcript note after an approval (Codex: "✔ You approved codex to run …"). */
  protected approvalNote(_req: PermissionReq, _choice: number, _cols: number): string[] {
    return []
  }
  /** Whether a run step must be approved first. */
  protected needsApproval(step: RunStep): boolean {
    if (this.mode === 'auto' || this.mode === 'bypass') return false
    if (/^git (status|diff|log|show|branch)\b/.test(step.command)) return false
    return ![...this.allowed].some((p) => step.command.startsWith(p))
  }
  /** Whether file writes and edits must be approved first (Claude Code's default mode). */
  protected editsNeedApproval(): boolean {
    return false
  }
  /** Lines for a request the user turned down (default: the interrupted line). */
  protected declined(_req: PermissionReq, cols: number): string[] {
    return this.interrupted(cols)
  }
  /** What an unrecognised `/command` prints. */
  protected unknownSlash(cmd: string, cols: number): string[] {
    return this.prose(`Unknown slash command: ${cmd}`, cols)
  }
  /** The commands `/` offers in the composer's menu (none: no menu). */
  protected slashCommands(): SlashItem[] {
    return []
  }
  /** The title a turn keeps when its plan has none of its own (small talk, a "yes"). */
  protected defaultTitle(): string {
    return ''
  }
  /** Shift+Tab. */
  protected cycleMode(): void {}
  /** Which lighter agent this is, so small talk comes out in its own voice. */
  protected voice(): string | undefined {
    return undefined
  }

  /* ───────────── Program ───────────── */

  start(io: ProgramIO): void {
    this.io = io
    this.world = new World(io.backend, io.session, io.cwd)
    this.live = new LiveScreen((s) => this.io.write(s), () => this.io.rows)
    this.lastCols = io.cols
    this.io.write(hideCursor() + (this.altScreen ? `\x1b[?1049h${CLEAR_ALL}` : this.clearOnStart ? CLEAR_ALL : '\r\n'))
    this.printStatic(this.header(this.cols))
    this.onLaunch()
    this.redraw()
  }

  input(data: string): void {
    if (this.phase === 'exited') return
    for (const key of parseKeys(data)) this.key(key)
    if (!this.gone) this.redraw()
  }

  resize(cols: number): void {
    if (this.phase === 'exited') return
    this.io.timers.clear(this.resizeTimer)
    this.resizeTimer = this.io.timers.setTimeout(() => {
      if (this.gone) return
      if (cols !== this.lastCols) this.rerenderAll()
      else this.redraw()
      this.lastCols = cols
    }, 80)
  }

  kill(): void {
    this.phase = 'exited'
    if (this.abort) this.abort.aborted = true
  }

  get working(): boolean {
    return this.phase === 'working'
  }

  get awaitingAnswer(): boolean {
    return this.modal !== null
  }

  /** Re-reads the phase (TypeScript narrows `this.phase` across awaits and callbacks). */
  protected get gone(): boolean {
    return this.phase === 'exited'
  }

  /* ───────────── drawing ───────────── */

  protected get cols(): number {
    // Ink lays out at the real width, however narrow: drawing wider makes xterm wrap every rule.
    return Math.max(4, this.io.cols)
  }

  private bottom(): { lines: string[]; park?: { row: number; col: number } } {
    const cols = this.cols
    this.statusRows = -1
    if (this.modal) return { lines: this.modal.lines(this.modal.sel) }
    const box = this.composer(cols)
    if (this.phase !== 'working') return { lines: box.lines, park: box.park }
    // The cell still gathering reads sits above the status row; ticks then redraw the whole region.
    const active = this.exploring.length ? fitRows(this.exploreGroup(this.exploring, cols, true), cols) : []
    const above = [...active, ...this.status(cols)]
    this.statusRows = active.length ? -1 : above.length
    return { lines: [...above, ...box.lines], park: { row: box.park.row + above.length, col: box.park.col } }
  }

  protected redraw(): void {
    if (this.phase === 'exited' || !this.live) return
    const b = this.bottom()
    this.live.region(b.lines.map((l) => truncate(l, this.cols)), b.park)
  }

  /** Print lines above the live region and remember them for re-renders. */
  protected commit(render: (cols: number) => string[], entry?: TranscriptEntry): void {
    if (this.phase === 'exited') return
    if (entry?.k !== 'explore') this.flushExploration()
    this.transcript.push({ render, entry })
    if (this.transcript.length > 400) this.transcript.splice(0, this.transcript.length - 400)
    const b = this.bottom()
    this.live.commit(fitRows(render(this.cols), this.cols), b.lines, b.park)
  }

  private printStatic(lines: string[]): void {
    this.live.commit(lines)
  }

  /** A read, search or list: its own cell, or (Codex) one more line of the cell being gathered. */
  private explored(ev: ToolEvent): void {
    if (!this.groupExploration) return this.commit((cols) => this.tool(ev, cols), { k: 'tool', ev })
    this.exploring.push(ev)
    this.redraw()
  }

  /** The gathered reads become one permanent cell, before anything else is printed. */
  private flushExploration(): void {
    if (!this.exploring.length) return
    const evs = this.exploring
    this.exploring = []
    this.commit((cols) => this.exploreGroup(evs, cols, false), { k: 'explore', evs })
  }

  /** The conversation so far as data (what `--resume` shows again); cells without one keep their rows at this width. */
  protected transcriptEntries(): TranscriptEntry[] {
    return this.transcript.map((c) => c.entry ?? { k: 'lines', lines: c.render(this.cols) })
  }

  private renderEntry(e: TranscriptEntry, cols: number): string[] {
    switch (e.k) {
      case 'user':
        return this.userEcho(e.text, cols)
      case 'prose':
        return this.prose(e.text, cols)
      case 'tool':
        return this.tool(e.ev, cols)
      case 'todos':
        return this.todoList(e.items, cols)
      case 'declined':
        return this.declined(e.req, cols)
      case 'interrupted':
        return this.interrupted(cols)
      case 'explore':
        return this.exploreGroup(e.evs, cols, false)
      case 'lines':
        return e.lines
    }
  }

  /** A resumed conversation, laid out at this width and kept as if this session had committed it. */
  protected restoreTranscript(entries: TranscriptEntry[]): void {
    if (!entries.length) return
    const cells = entries.map((entry): TranscriptCell => ({ render: (cols) => this.renderEntry(entry, cols), entry }))
    this.transcript.push(...cells)
    const b = this.bottom()
    this.live.commit(fitRows(cells.flatMap((c) => c.render(this.cols)), this.cols), b.lines, b.park)
  }

  /** After a width change: clear, and re-lay the header and the transcript tail at the new width. */
  protected rerenderAll(): void {
    const cols = this.cols
    const body = fitRows([...this.header(cols), ...this.transcript.flatMap((c) => c.render(cols))], cols)
    const tail = body.slice(-Math.max(200, this.io.rows * 4))
    this.io.write(CLEAR_ALL)
    this.live.reset()
    const b = this.bottom()
    this.live.commit(tail, b.lines, b.park)
  }

  /** `/clear`: forget the conversation, fresh header. */
  protected clearConversation(): void {
    this.transcript = []
    this.io.write(CLEAR_ALL)
    this.live.reset()
    this.printStatic(this.header(this.cols))
    this.redraw()
  }

  protected flashFooter(text: string, ms: number): void {
    this.flash = text
    this.io.timers.clear(this.flashTimer)
    this.flashTimer = this.io.timers.setTimeout(() => {
      this.flash = null
      this.redraw()
    }, ms)
  }

  /* ───────────── input ───────────── */

  /** The slash-command menu while the composer holds a bare `/word`: matches (prefix first) and the highlighted row. */
  protected slashMenu(): { items: SlashItem[]; sel: number } | null {
    const m = /^\/([\w:-]*)$/.exec(this.editor.text)
    if (!m || this.modal) return null
    const q = m[1].toLowerCase()
    const all = this.slashCommands()
    const items = [...all.filter((c) => c.name.startsWith(q)), ...all.filter((c) => !c.name.startsWith(q) && q.length > 1 && c.name.includes(q))]
    if (!items.length) return null
    return { items, sel: Math.min(this.menuSel, items.length - 1) }
  }

  private key(key: Key): void {
    if (this.modal) return this.modalKey(key)
    const menu = this.slashMenu()
    if (menu) {
      const n = menu.items.length
      if (key.name === 'up' || key.name === 'down') {
        this.menuSel = (menu.sel + (key.name === 'up' ? n - 1 : 1)) % n
        return
      }
      if (key.name === 'tab') {
        this.editor.set(`/${menu.items[menu.sel].name} `)
        this.menuSel = 0
        return
      }
      if (key.name === 'enter') {
        this.editor.set(`/${menu.items[menu.sel].name}`)
        this.menuSel = 0
      }
    }
    switch (key.name) {
      case 'ctrl-c':
      case 'ctrl-d':
        if (this.phase === 'working') return this.interrupt()
        if (this.editor.text !== '' && key.name === 'ctrl-c') return this.editor.clear()
        if (Date.now() < this.armedExit) return this.exit(false)
        this.armedExit = Date.now() + 1500
        this.flashFooter(this.exitArmedText(), 1500)
        return
      case 'esc':
        if (this.phase === 'working') return this.interrupt()
        if (this.editor.text === '') return
        if (Date.now() < this.escArmed) {
          this.editor.clear()
          this.flash = null
          return
        }
        this.escArmed = Date.now() + 1200
        this.flashFooter('Esc again to clear', 1200)
        return
      case 'shift-tab':
        this.cycleMode()
        return
      case 'ctrl-l':
        this.rerenderAll()
        return
      case 'enter': {
        const text = this.editor.text.trim()
        if (text === '') return
        this.editor.clear()
        if (this.phase === 'working') {
          this.queue.push(text)
          return
        }
        void this.submit(text)
        return
      }
      case 'tab':
        return
      default:
        if (this.editor.apply(key)) this.menuSel = 0
    }
  }

  private modalKey(key: Key): void {
    const m = this.modal
    if (!m) return
    const choose = (i: number): void => {
      this.modal = null
      this.fullRedrawUntil = Date.now() + 3000
      m.resolve(i)
    }
    switch (key.name) {
      case 'up':
        m.sel = (m.sel + m.count - 1) % m.count
        return
      case 'down':
      case 'tab':
        m.sel = (m.sel + 1) % m.count
        return
      case 'enter':
        return choose(m.sel)
      case 'esc':
      case 'ctrl-c':
        return choose(m.esc)
      case 'char': {
        const n = Number(key.ch)
        if (Number.isInteger(n) && n >= 1 && n <= m.count) return choose(n - 1)
        const hk = m.hotkeys[key.ch.toLowerCase()]
        if (hk !== undefined) return choose(hk)
        return
      }
      default:
        return
    }
  }

  protected ask(lines: (sel: number) => string[], count: number, esc: number, hotkeys: Record<string, number> = {}): Promise<number> {
    this.flushExploration()
    return new Promise((resolve) => {
      this.modal = { lines, count, esc, hotkeys, sel: 0, resolve }
      this.redraw()
    })
  }

  /* ───────────── turns ───────────── */

  private async submit(text: string): Promise<void> {
    if (text.startsWith('/') && !text.startsWith('//')) {
      const [cmd, ...rest] = text.slice(1).split(/\s+/)
      this.commit((cols) => this.userEcho(text, cols), { k: 'user', text })
      const handled = await this.slash(cmd.toLowerCase(), rest.join(' '))
      if (!handled && this.phase !== 'exited') this.commit((cols) => this.unknownSlash(`/${cmd}`, cols))
      return
    }
    const peer = text.includes('[TerminalDeck msg #') ? this.world.parseFramed(text) : null
    this.commit((cols) => this.userEcho(text, cols), { k: 'user', text })
    await this.runTurn(text, peer)
  }

  protected async runTurn(prompt: string, peer: FramedMessage | null): Promise<void> {
    // A peer's message doesn't answer what the last turn offered the user.
    const offer = peer ? null : this.offer
    if (!peer) this.offer = null
    const p = plan({ prompt, agent: this.agent, world: this.world, peer, offer, voice: this.voice() })
    this.turnTitle = p.title || this.turnTitle || this.defaultTitle()
    this.planOutline = p.steps.flatMap((s) =>
      s.t === 'edit' ? [`${s.why} (${this.world.show(s.path)})`] : s.t === 'run' ? [`Run ${s.command}`] : []
    )
    this.turns++
    this.phase = 'working'
    this.work = { startedAt: Date.now(), tokens: 0, activity: null, frame: 0 }
    this.abort = { aborted: false, silent: false }
    this.onTurnStart(p.title)
    this.ticker = this.io.timers.setInterval(() => this.tick(), this.tickMs)
    this.redraw()
    const results: Results = emptyResults()
    let interrupted = false
    try {
      await this.execSteps(p.steps, results)
    } catch (err) {
      // Stop the spinner before the interrupted line lands: a status row redrawn under it would
      // put `esc to interrupt` back on screen, which the renderer reads as still working.
      this.io.timers.clear(this.ticker)
      if (!this.gone) this.phase = 'idle'
      if (!(err instanceof Abort)) {
        console.error('[demo] agent turn failed', err)
        this.commit((cols) => this.prose('Something went wrong in the simulated agent. Try another prompt.', cols))
      }
      interrupted = err instanceof Abort
      if (err instanceof Abort && !err.silent) this.commit((cols) => this.interrupted(cols), { k: 'interrupted' })
    }
    if (this.gone) return
    this.io.timers.clear(this.ticker)
    this.flushExploration()
    const elapsed = Date.now() - this.work.startedAt
    this.usage.apiMs += elapsed
    this.usage.output += Math.round(this.work.tokens)
    this.usage.input += 2400 + Math.round(this.work.tokens * 3.2)
    this.phase = 'idle'
    this.abort = null
    if (!interrupted) {
      const done = this.turnDone(elapsed, this.cols)
      if (done.length) this.commit(() => this.turnDone(elapsed, this.cols))
      // A peer's reply can end with a question for the user too ("handle them now?").
      if (p.offer) this.offer = p.offer
    }
    this.onTurnEnd(interrupted)
    this.redraw()
    const next = this.queue.shift()
    if (next !== undefined) void this.submit(next)
  }

  private tick(): void {
    // A modal is waiting for the user: stay quiet so output volume does not clear its notch attention.
    if (this.phase !== 'working' || this.modal) return
    this.work.frame++
    this.work.tokens += 4 + ((this.work.frame * 7) % 9)
    this.onTick()
    const rows = this.status(this.cols)
    if (Date.now() >= this.fullRedrawUntil && rows.length === this.statusRows && rows.every((line, i) => this.live.patch(i, line))) return
    this.redraw()
  }

  protected interrupt(): void {
    if (this.abort) this.abort.aborted = true
  }

  private check(): void {
    if (this.phase === 'exited' || this.abort?.aborted) throw new Abort(this.abort?.silent ?? false)
  }

  private async sleep(ms: number): Promise<void> {
    // Short slices so Esc takes effect promptly.
    const end = Date.now() + ms
    while (Date.now() < end) {
      await this.io.timers.sleep(Math.min(150, end - Date.now()))
      this.check()
    }
    this.check()
  }

  private async execSteps(steps: Step[], r: Results): Promise<void> {
    for (const step of steps) {
      this.check()
      await this.execStep(step, r)
    }
  }

  private async execStep(step: Step, r: Results): Promise<void> {
    const w = this.world
    if (/^(read|search|list|edit|run|message)$/.test(step.t)) this.toolCalls++
    switch (step.t) {
      case 'think':
        if (step.activity) this.work.activity = step.activity
        await this.sleep(step.ms)
        return
      case 'todos': {
        const items = step.items.map((i) => ({ ...i }))
        const lines = this.todoList(items, this.cols)
        if (lines.length) this.commit((cols) => this.todoList(items, cols), { k: 'todos', items })
        this.work.activity = items.find((i) => i.status === 'in_progress')?.activeForm ?? this.work.activity
        await this.sleep(300)
        return
      }
      case 'read': {
        await this.sleep(350)
        const files = step.paths.map((path) => {
          const text = w.read(path)
          r.reads[path] = text
          return { path, lines: text === null ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0), missing: text === null }
        })
        this.explored({ kind: 'read', files })
        await this.sleep(250)
        return
      }
      case 'search': {
        await this.sleep(400)
        const hits = w.grep(step.pattern, step.path ?? '.')
        r.searches[step.pattern] = hits
        const files = [...new Set(hits.map((h) => w.showPosix(h.path)))]
        this.explored({ kind: 'search', pattern: step.pattern, path: step.path ?? '.', files, matches: hits.length })
        return
      }
      case 'list': {
        await this.sleep(250)
        const entries = w.list(step.path).map((e) => (e.isDir ? `${e.name}/` : e.name))
        this.explored({ kind: 'list', path: step.path, entries })
        return
      }
      case 'edit':
        return this.execEdit(step, r)
      case 'run':
        return this.execRun(step, r)
      case 'say': {
        const text = step.text(r)
        await this.sleep(200)
        this.commit((cols) => this.prose(text, cols), { k: 'prose', text })
        return
      }
      case 'message':
        return this.execMessage(step, r)
      case 'then':
        return this.execSteps(step.next(r), r)
    }
  }

  private async execEdit(step: Extract<Step, { t: 'edit' }>, r: Results): Promise<void> {
    if (this.mode === 'plan') await this.leavePlanMode()
    const w = this.world
    const before = w.read(step.path)
    let after: string | null
    try {
      after = step.apply(before)
    } catch {
      after = null
    }
    await this.sleep(500)
    if (after === null) {
      this.commit((cols) => this.tool({ kind: 'edit', path: step.path, before, after: null, error: `File does not exist: ${step.path}` }, cols))
      return
    }
    if (after === before) {
      // Already done (a second run of the same plan): show it as a read.
      this.commit((cols) => this.tool({ kind: 'read', files: [{ path: step.path, lines: after.split('\n').length - 1, missing: false }] }, cols))
      return
    }
    if (this.editsNeedApproval() && this.mode === 'default') {
      const req: PermissionReq = { kind: 'edit', path: step.path, before, after }
      this.onPermissionShown(req)
      const choice = await this.ask((sel) => this.permission(req, sel, this.cols), 3, 2)
      this.check()
      if (choice === 2) return this.decline(req)
      if (choice === 1) this.mode = 'acceptEdits'
      this.redraw()
    }
    const error = w.write(step.path, after)
    const ev: ToolEvent = { kind: 'edit', path: step.path, before, after, error: error ?? undefined }
    if (!error) {
      const b = before === null ? [] : before.split('\n')
      const a = after.split('\n')
      const added = Math.max(0, a.filter((l) => !b.includes(l)).length)
      const removed = Math.max(0, b.filter((l) => !a.includes(l)).length)
      r.edits.push({ path: step.path, created: before === null, added, removed })
      this.usage.added += added
      this.usage.removed += removed
    }
    this.commit((cols) => this.tool(ev, cols), { k: 'tool', ev })
    await this.sleep(300)
  }

  private async execRun(step: RunStep, r: Results): Promise<void> {
    if (this.mode === 'plan') await this.leavePlanMode()
    if (this.needsApproval(step)) {
      const prefix = step.command.split(' ').slice(0, 2).join(' ')
      const req: PermissionReq = { kind: 'bash', command: step.command, description: step.description, prefix, cwd: this.world.cwd }
      this.onPermissionShown(req)
      const choice = await this.ask((sel) => this.permission(req, sel, this.cols), 3, 2, this.permissionHotkeys(req))
      this.check()
      if (choice === 2) {
        r.declined.push(step.command)
        return this.decline(req)
      }
      if (choice === 1) this.allowed.add(prefix)
      if (this.approvalNote(req, choice, this.cols).length) this.commit((cols) => this.approvalNote(req, choice, cols))
      else this.redraw()
    }
    const before = this.work.activity
    if (this.agent === 'codex') this.work.activity = 'Running'
    const result = await this.world.exec(step.command, this.io.timers, step.fallback)
    this.check()
    this.work.activity = before === 'Running' ? null : before
    await this.sleep(600)
    r.runs.push(result)
    const ev: ToolEvent = { kind: 'run', command: step.command, description: step.description, output: result.output, code: result.code }
    this.commit((cols) => this.tool(ev, cols), { k: 'tool', ev })
  }

  private async execMessage(step: Extract<Step, { t: 'message' }>, r: Results): Promise<void> {
    const text = step.text(r)
    const to = step.to()
    await this.sleep(400)
    let result: SendMessageResult
    if (!to) result = { ok: false, error: `No ${step.toName} pane is open in this window.` }
    else {
      const sent = this.world.sendMessage(to, text, step.replyTo)
      // Delivery can take a while (it waits for the target to be idle); don't hold the turn for it.
      const timeout = this.io.timers.sleep(6000).then((): SendMessageResult => ({ ok: true, status: 'queued' }))
      result = await Promise.race([sent, timeout])
    }
    this.check()
    r.sent.push({ ...result, to: to ?? '?' })
    const ev: ToolEvent = { kind: 'message', to: to ?? '?', toName: step.toName, text, result }
    this.commit((cols) => this.tool(ev, cols), { k: 'tool', ev })
  }

  /** The user said no at a permission prompt: show what was turned down, and end the turn there. */
  private decline(req: PermissionReq): never {
    this.commit((cols) => this.declined(req, cols), { k: 'declined', req })
    throw new Abort(true)
  }

  /** Plan mode reached a write: show the plan and ask to proceed. */
  private async leavePlanMode(): Promise<void> {
    const steps = this.planOutline.length ? this.planOutline : [`Carry out "${this.turnTitle}"`]
    const req: PermissionReq = { kind: 'plan', plan: steps.map((s, i) => `${i + 1}. ${s}`) }
    this.onPermissionShown(req)
    const choice = await this.ask((sel) => this.permission(req, sel, this.cols), 3, 2)
    this.check()
    if (choice === 2) {
      this.abort = { aborted: true, silent: false }
      throw new Abort()
    }
    this.mode = choice === 0 ? 'acceptEdits' : 'default'
    this.redraw()
  }

  /* ───────────── exit ───────────── */

  protected exit(viaCommand: boolean): void {
    if (this.phase === 'exited') return
    if (this.abort) this.abort.aborted = true
    this.io.timers.clear(this.ticker)
    this.modal = null
    const lines = this.goodbye(this.cols, viaCommand)
    if (this.altScreen) this.io.write('\x1b[?1049l')
    else this.live.clear()
    this.io.write(lines.map((l) => l + '\x1b[0m\r\n').join('') + showCursor())
    this.phase = 'exited'
    this.onExit()
    this.io.exit(0)
  }

  /* ───────────── shared formatting ───────────── */

  /** Output lines of a command, clipped like the agents do (first N + "… +M lines"). */
  protected clip(output: string, keep: number): { lines: string[]; more: number } {
    const lines = outputLines(output)
    if (lines.length <= keep) return { lines, more: 0 }
    return { lines: lines.slice(0, keep), more: lines.length - keep }
  }

  protected wrapProse(text: string, cols: number, first: string, rest: string): string[] {
    const out: string[] = []
    text.split('\n').forEach((para, i) => {
      const bullet = /^\s*(- |\d+\. )/.exec(para)
      const indent = rest + (bullet ? ' '.repeat(bullet[0].length) : '')
      const rows = wrapAll([para], cols - rest.length, indent.slice(rest.length))
      rows.forEach((row, j) => out.push((i === 0 && j === 0 ? first : rest) + row))
    })
    return out
  }
}

/** Safety net: every committed row must fit, or the live-region math drifts. */
function fitRows(lines: string[], cols: number): string[] {
  return lines.flatMap((l) => {
    if (cellWidth(l) <= cols) return [l]
    // A hanging indent, as Ink and ratatui wrap: under the text, past any `⎿` gutter.
    const plain = stripAnsi(l)
    const lead = /^\s*(?:⎿\s+|[●•]\s|- )?/.exec(plain)?.[0] ?? ''
    return wrap(l, cols, ' '.repeat(Math.min(cellWidth(lead), Math.floor(cols / 2))))
  })
}
