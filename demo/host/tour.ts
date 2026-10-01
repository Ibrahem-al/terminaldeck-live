/**
 * The guided tour (demo-spec.md "Guided tour"), driven through the real UI:
 * the prompt is typed into Claude's pane through the renderer's own input bus,
 * the permission question is answered in the notch's mini terminal session,
 * and everything else — the edit, the tests, the message to Codex and its
 * reply, the finished turn — is the simulated agents doing their work while
 * the tour waits for it to show up.
 *
 * It stops the instant the visitor presses a key or clicks (tourhost aborts
 * `ctx.signal`, and every wait here goes through `ctx.sleep`). When a
 * neighbour isn't there yet (an agent program without the scripted plan),
 * each step waits a bounded time and then does the least it takes for the
 * story to go on — never more than the real agent would have done.
 */
import type { DeckMessage, NotchAttention } from '@shared/types'
import type { Backend, TdStores, TourContext, TourRunner } from '../backend/contracts'
import { stripAnsi } from '../backend/util/ansi'
import { PANE } from '../scenario/session'

const PROMPT = 'add rate limiting to the API and cover it with a test'
const REVIEW_REQUEST =
  'Please review the rate limiter I just added in api/src/middleware/rateLimit.ts and its test — anything I missed?'

/** Typing pace for the prompt: quick, but readable. */
const TYPE_MS = [28, 70] as const
const POLL_MS = 200

const STEPS = [
  'One deck: Claude Code, Codex, a dev server and a shell',
  'Asking Claude to add rate limiting',
  'Claude reads the code and edits the middleware',
  'A permission question drops out of the notch',
  'Answered from the notch — the tests run',
  'Claude asks Codex for a review',
  'Codex replies — the message flies back',
  'Turn finished — the notch says so'
] as const

type Step = (typeof STEPS)[number]

/** What the tour changed on the way, so a visitor who stops it early gets the panes back as they were. */
interface Trail {
  /** Part of the prompt is in Claude's input box. */
  typed: boolean
  submitted: boolean
  /** Shift+Tab presses sent to Claude. */
  modeTabs: number
  focusBefore: string | null
}

/** Claude Code's Shift+Tab cycle (without bypass): default → accept edits → plan → auto. */
const CLAUDE_MODES = 4

export const tour: TourRunner = {
  total: STEPS.length,
  async run(ctx) {
    const { backend } = ctx
    const step = (title: Step): void => ctx.step(title)

    const until = async (pred: () => boolean, timeoutMs: number): Promise<boolean> => {
      const end = Date.now() + timeoutMs
      while (Date.now() < end) {
        if (pred()) return true
        await ctx.sleep(POLL_MS)
      }
      return pred()
    }

    const app = await waitForApp(ctx)
    if (!app) return
    const restoreNames = preferSmartNames(app)
    const trail: Trail = { typed: false, submitted: false, modeTabs: 0, focusBefore: activePane(app) }
    try {
      await play(ctx, backend, app, until, step, trail)
    } finally {
      restoreNames()
      if (ctx.signal.aborted) tidyUp(ctx, app, trail)
    }
  }
}

async function play(
  ctx: TourContext,
  backend: Backend,
  app: TdStores,
  until: (pred: () => boolean, timeoutMs: number) => Promise<boolean>,
  step: (title: Step) => void,
  trail: Trail
): Promise<void> {
  const claudePane = PANE.claude
  const codexPane = PANE.codex
  const session = (paneId: string): string | undefined => backend.pty.byPane(paneId)?.id
  const deckPane = (paneId: string) => backend.deck.pane(paneId)
  const isAgent = (paneId: string): boolean => deckPane(paneId)?.foreground === 'agent'
  const program = (paneId: string) => backend.pty.byPane(paneId)?.shell.foreground ?? null
  /** Claude is showing a permission dialog (whether or not the notch heard about it). */
  const asking = (): boolean => !!program(claudePane)?.awaitingAnswer
  const attentionFor = (paneId: string, kind: NotchAttention['kind']): NotchAttention | undefined => {
    const sid = session(paneId)
    return backend.notch.state().attentions.find((a) => a.sessionId === sid && a.kind === kind)
  }
  const messageBetween = (from: string, to: string, since: number, status?: DeckMessage['status']): DeckMessage | undefined =>
    backend.deck
      .messages()
      .find((m) => m.kind === 'message' && m.from?.paneId === from && m.to?.paneId === to && m.at >= since && (!status || m.status === status))
  const type = async (paneId: string, text: string): Promise<void> => {
    for (const ch of text) {
      app.inputBus.sendToPane(paneId, ch)
      await ctx.sleep(TYPE_MS[0] + Math.random() * (TYPE_MS[1] - TYPE_MS[0]))
    }
  }

  // 1. The Harbor deck, in front.
  step(STEPS[0])
  const winState = backend.host.windows.state('main')
  if (winState === 'minimized' || winState === 'closed') backend.host.windows.restore('main')
  app.workspace.revealPane(claudePane)
  await ctx.sleep(1600)

  // 2. Claude must be up in p1 (auto-run); if the visitor quit it, start it again.
  step(STEPS[1])
  if (!(await until(() => isAgent(claudePane), 4000))) {
    await type(claudePane, 'claude')
    app.inputBus.sendToPane(claudePane, '\r')
    await until(() => isAgent(claudePane), 8000)
  }
  // Let its first frame settle before typing into the input box.
  await ctx.sleep(1200)
  // Shift+Tab to "accept edits", as you would before handing Claude a change to make:
  // the edits go straight in, and the one question left is the test run.
  await acceptEdits(ctx, backend, app, claudePane, trail)
  const startedAt = Date.now()
  trail.typed = true
  await type(claudePane, PROMPT)
  await ctx.sleep(450)
  app.inputBus.sendToPane(claudePane, '\r')
  trail.submitted = true

  // 3. It reads and edits; the file tree and any open editor follow along.
  step(STEPS[2])
  const sid = session(claudePane)
  const reached = await until(() => asking() || !!attentionFor(claudePane, 'question'), 40_000)

  // 4. The permission prompt: raised by Claude Code's Notification hook.
  step(STEPS[3])
  if (sid && !attentionFor(claudePane, 'question')) {
    // No question in the notch: hooks are off (the heuristics only say "may be waiting"), or Claude
    // never got there. Send what its hook would have; with hooks uninstalled the notch drops it, as the
    // real one would, and the tour answers in the terminal all the same.
    backend.notch.hook(sid, 'Notification', { message: 'Claude needs your permission to use Bash' })
    await until(() => !!attentionFor(claudePane, 'question'), 1500)
  }
  // Long enough to watch the pulldown expand onto the live terminal.
  await ctx.sleep(2600)

  // 5. Answer "1. Yes" in the notch mini terminal: the same session the pane runs.
  step(STEPS[4])
  if (sid && reached && asking()) backend.pty.write(sid, '1', 'notch')
  await until(() => !asking(), 5000)
  const question = attentionFor(claudePane, 'question')
  if (question && !(await until(() => !attentionFor(claudePane, 'question'), 3000))) backend.notch.dismiss(question.id)
  // Back to the app, as you would after answering: the pulldown folds away when the notch loses focus.
  await ctx.sleep(1200)
  backend.host.windows.focus('main')

  /** Waits for `pred`, saying "1. Yes" to any further dialog Claude puts up on the way. */
  const answering = (pred: () => boolean, ms: number): Promise<boolean> =>
    until(() => {
      if (sid && asking()) backend.pty.write(sid, '1', 'notch')
      return pred()
    }, ms)

  // 6. Claude hands the review to Codex through deck tools.
  step(STEPS[5])
  let sent = await answering(() => !!messageBetween(claudePane, codexPane, startedAt), 40_000)
  if (!sent && isAgent(codexPane) && !program(claudePane)?.working) {
    // Claude's own plan didn't reach its send_message: make the call it would have made.
    void backend.deck.sendMessage(claudePane, codexPane, REVIEW_REQUEST)
    sent = await until(() => !!messageBetween(claudePane, codexPane, startedAt), 3000)
  }
  if (sent) await answering(() => !!messageBetween(claudePane, codexPane, startedAt, 'delivered'), 25_000)

  // 7. Codex reviews and replies; the packet flies back.
  step(STEPS[6])
  await answering(() => !!messageBetween(codexPane, claudePane, startedAt, 'delivered'), 45_000)

  // 8. Claude wraps up: the Stop hook turns the notch green (without hooks, the turn just ends).
  step(STEPS[7])
  await ctx.sleep(1500)
  await answering(() => !!attentionFor(claudePane, 'turn-done') || !program(claudePane)?.working, 40_000)
  await ctx.sleep(2500)
}

/** Cycle Claude's mode (Shift+Tab) until its footer says edits are accepted. */
async function acceptEdits(ctx: TourContext, backend: Backend, app: TdStores, paneId: string, trail: Trail): Promise<void> {
  const MODES = /\? for shortcuts|accept edits on|plan mode on|auto mode on|bypass permissions on/g
  for (let i = 0; i < 5; i++) {
    const tail = stripAnsi(backend.pty.byPane(paneId)?.replay().data.slice(-6000) ?? '')
    const modes = tail.match(MODES)
    const mode = modes?.[modes.length - 1]
    if (!mode || /accept edits|auto mode|bypass/.test(mode)) return
    app.inputBus.sendToPane(paneId, '\x1b[Z')
    trail.modeTabs++
    await ctx.sleep(450)
  }
}

function activePane(app: TdStores): string | null {
  const ws = app.workspace.useWorkspace.getState()
  return ws.tabs.find((t) => t.id === ws.activeTabId)?.activePaneId ?? null
}

/**
 * The visitor stopped the tour: take back what it left half-done. A prompt still being typed is
 * cleared (Ctrl+C with text in the box only empties it), Claude's mode goes back round the cycle,
 * and a key press (which a click would have done by itself) puts focus back where it was.
 */
function tidyUp(ctx: TourContext, app: TdStores, trail: Trail): void {
  const pane = PANE.claude
  const byKey = ctx.signal.reason === 'key'
  // After the stopping key has landed (it types into the pane the tour focused): it goes with the rest.
  window.setTimeout(() => {
    if (trail.typed && !trail.submitted) app.inputBus.sendToPane(pane, '\x03')
    const back = (CLAUDE_MODES - (trail.modeTabs % CLAUDE_MODES)) % CLAUDE_MODES
    if (back > 0 && !trail.submitted) app.inputBus.sendToPane(pane, '\x1b[Z'.repeat(back))
    if (byKey && trail.focusBefore && trail.focusBefore !== pane) app.workspace.revealPane(trail.focusBefore)
  }, 60)
}

/** The main window's stores, once its renderer has booted. */
async function waitForApp(ctx: TourContext): Promise<TdStores | null> {
  for (let i = 0; i < 50; i++) {
    const app = ctx.app()
    if (app) return app
    await ctx.sleep(POLL_MS)
  }
  ctx.backend.host.appToast('error', 'Guided tour', 'The app is still starting — try again in a moment.')
  return null
}

/**
 * Smart pane names make the headers say what each pane is doing as the tour
 * goes, summarised every 30 s (the shortest interval Settings allows) while it
 * runs. Smart mode stays on afterwards: switching it off would drop the names
 * the notch's last alert was raised under, and the headers would stop matching it.
 */
function preferSmartNames(app: TdStores): () => void {
  const store = app.settings.useSettings
  const before = store.getState().settings.paneNames
  if (before.mode === 'off') return () => {}
  store.getState().update('paneNames', { mode: 'smart', smartIntervalSec: 30 })
  return () => {
    const now = store.getState().settings.paneNames
    if (now.smartIntervalSec === 30 && before.smartIntervalSec !== 30) store.getState().update('paneNames', { smartIntervalSec: before.smartIntervalSec })
  }
}
