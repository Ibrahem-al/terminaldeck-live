/**
 * The notch's brain — a port of src-tauri/src/notch/mod.rs (the attention
 * controller), session_registry.rs (the sessions_report registry) and the
 * parts of notch/window.rs that decide whether the overlay is shown.
 *
 * Invariant (mod.rs:5): at most ONE attention per session, keyed `s:<id>`;
 * the latest wins and mints a fresh id. At most 8 are kept.
 *
 * Clearing rules (mod.rs:8-14): an Enter written to the session; PTY exit;
 * ≥ 4096 bytes of output arriving more than 1.5 s after the raise (1024 for a
 * heuristic one); SessionStart / SessionEnd hooks; a Stop replacing a
 * question; the user's dismiss. In "Hidden until needed" mode announcements
 * (turn-done, command-done) retract after 5 s unless the notch is engaged.
 */
import type {
  NotchAgentSignal,
  NotchAttachResult,
  NotchAttention,
  NotchAttentionKind,
  NotchHooksStatus,
  NotchJumpTarget,
  NotchStatePayload,
  PaneSessionInfo,
  TaskCompletePayload
} from '@shared/types'
import {
  MAIN_LABEL,
  NOTCH_LABEL,
  type Backend,
  type CommandModule,
  type HookEventName,
  type HostBridge,
  type ModuleInstance,
  type NotchController,
  type PtyEvent,
  type WindowLabel
} from './contracts'
import { utf8Length, utf8ToBase64 } from './util/text'

const MAX_ATTENTIONS = 8
/** Output within this window after an attention is its own redraw, not an answer. */
const OUTPUT_CLEAR_GRACE_MS = 1500
const OUTPUT_CLEAR_BYTES = 4096
const OUTPUT_CLEAR_BYTES_HEURISTIC = 1024
const AUTO_DISMISS_MS = 5000
const AUTO_DISMISS_RECHECK_MS = 1500
const PUSH_DEBOUNCE_MS = 50
const PERMISSION_RX = /permission|approv/i
/** A peek that the pointer never settles on retracts after this (the host only reports hover changes). */
const PEEK_UNCLAIMED_MS = 1500
/** autoFocusQuestions: only when the visitor has been input-idle this long. */
const FOCUS_IDLE_MS = 2000
const FOCUS_DELAY_MS = 250

interface HooksRecord {
  installed: boolean
}

const HOOKS_KEY = 'notch-hooks'

/** Dev/QA hooks published on `window.__tdBackend.dev`. */
export interface NotchDevHooks {
  /** Raise an attention of any kind for a pane (defaults to p1). */
  raise(kind: NotchAttentionKind, opts?: { paneId?: string; detail?: string }): string | null
  clearAll(): void
  peek(): void
}

function devHooks(backend: Backend): Record<string, unknown> {
  backend.dev ??= {}
  return backend.dev
}

export function createNotch(backend: Backend): ModuleInstance<NotchController> {
  /* ── the session registry (session_registry.rs) ── */
  const reports = new Map<WindowLabel, PaneSessionInfo[]>()

  const sessions = (): PaneSessionInfo[] => {
    const seen = new Set<string>()
    const merged: PaneSessionInfo[] = []
    for (const list of reports.values()) {
      for (const s of list) {
        if (seen.has(s.id)) continue
        seen.add(s.id)
        merged.push(s)
      }
    }
    return merged
  }
  const sessionInfo = (sessionId: string): PaneSessionInfo | undefined => {
    for (const list of reports.values()) {
      const hit = list.find((s) => s.id === sessionId)
      if (hit) return hit
    }
    return undefined
  }
  const windowOfSession = (sessionId: string): WindowLabel | undefined => {
    for (const [label, list] of reports) if (list.some((s) => s.id === sessionId)) return label
    return undefined
  }

  /* ── the attention controller (mod.rs Inner) ── */
  // Insertion-ordered like Rust's IndexMap: Map.set on an existing key keeps its place.
  const attentions = new Map<string, NotchAttention>()
  const workingCmd = new Set<string>()
  const hookCovered = new Set<string>()
  const raisedAt = new Map<string, number>()
  const outputSince = new Map<string, number>()
  const dismissGen = new Map<string, number>()
  let generation = 0
  let expandHint: string | null = null

  const timers = backend.clock.group()
  const listeners = new Set<(s: NotchStatePayload) => void>()
  let pushArmed = false

  const hooksPath = `${backend.scenario.machine.home}\\.claude\\settings.json`
  let hooksInstalled = backend.storage.get<HooksRecord>(HOOKS_KEY)?.installed ?? true
  const hooksStatus = (): NotchHooksStatus => ({ installed: hooksInstalled, settingsPath: hooksPath })

  const cfg = () => backend.state.settings().notch

  /* ── overlay visibility (window.rs apply_visibility) ── */
  let hiddenForEmpty = false
  let hiddenForBlackout = false
  let hiddenForFocus = false
  let peeking = false
  let hoverInside = false
  let peekTimer = 0
  let lastUserInput = 0

  const notchFocused = (): boolean => {
    try {
      return backend.frame(NOTCH_LABEL)?.document.hasFocus() ?? false
    } catch {
      return false
    }
  }
  // Closing the main window quits TerminalDeck, and the always-on-top overlay goes with it.
  const appClosed = (): boolean => backend.host.windows.state(MAIN_LABEL) === 'closed'
  const overlayVisible = (): boolean =>
    cfg().enabled && !appClosed() && !hiddenForBlackout && !hiddenForFocus && !(hiddenForEmpty && !peeking)

  const applyVisibility = (): void => {
    const host = backend.host
    const visible = overlayVisible()
    if (host.notch.visible !== visible) host.notch.setVisible(visible)
    if (!visible) hoverInside = false
  }

  /** is_engaged: the pointer is on the visible UI, or the notch holds the keyboard. */
  const engaged = (): boolean => overlayVisible() && (hoverInside || notchFocused())

  /* ── state + push ── */
  const state = (): NotchStatePayload => {
    // Newest first; Array.prototype.sort is stable, so same-ms ties keep insertion order.
    const list = [...attentions.values()].sort((a, b) => b.createdAt - a.createdAt)
    const hint = expandHint && list.some((a) => a.id === expandHint) ? expandHint : undefined
    const payload: NotchStatePayload = {
      attentions: list,
      sessions: sessions()
        .filter((s) => s.alive)
        .map((s) => ({
          kind: 'terminal' as const,
          sessionId: s.id,
          paneId: s.paneId,
          title: s.title,
          cwd: s.cwd,
          shell: s.shell,
          working: workingCmd.has(s.id)
        })),
      working: workingCmd.size,
      ui: { scale: cfg().scale }
    }
    if (hint) payload.expandHint = hint
    return payload
  }

  const push = (): void => {
    if (!cfg().enabled || pushArmed) return
    pushArmed = true
    timers.setTimeout(() => {
      pushArmed = false
      if (!cfg().enabled) return
      const payload = state()
      for (const cb of listeners) {
        try {
          cb(payload)
        } catch (err) {
          console.error('[demo] notch state listener failed', err)
        }
      }
      if (backend.frame(NOTCH_LABEL)) backend.events.emitTo(NOTCH_LABEL, 'notch:state', payload)
      // Taskbar-style auto-hide: away while nothing needs attention.
      const nextEmpty = cfg().visibility === 'autohide' && payload.attentions.length === 0
      if (nextEmpty !== hiddenForEmpty) {
        hiddenForEmpty = nextEmpty
        // A real reason to show supersedes the peek.
        if (!nextEmpty) peeking = false
        applyVisibility()
      }
    }, PUSH_DEBOUNCE_MS)
  }

  /* ── set / clear (mod.rs:573-659) ── */
  const clear = (key: string): void => {
    dismissGen.delete(key)
    attentions.delete(key)
    raisedAt.delete(key)
    outputSince.delete(key)
  }

  const set = (
    key: string,
    kind: NotchAttentionKind,
    source: NotchAttention['source'],
    sessionId: string | undefined,
    paneId: string | undefined,
    title: string,
    detail: string | undefined
  ): NotchAttention => {
    const attention: NotchAttention = {
      id: crypto.randomUUID(),
      kind,
      source,
      title,
      createdAt: Date.now()
    }
    if (sessionId !== undefined) attention.sessionId = sessionId
    if (paneId !== undefined) attention.paneId = paneId
    if (detail !== undefined) attention.detail = detail
    attentions.set(key, attention)
    raisedAt.set(key, Date.now())
    outputSince.delete(key)
    if (attentions.size > MAX_ATTENTIONS) {
      // The first minimum in insertion order: equally-old ones evict the earliest-inserted.
      let oldest: string | null = null
      let at = Infinity
      for (const [k, a] of attentions) {
        if (a.createdAt < at) {
          at = a.createdAt
          oldest = k
        }
      }
      if (oldest !== null) clear(oldest)
    }
    armAutoDismiss(key)
    if (kind === 'question') agentNeedsUser(attention.id)
    return attention
  }

  const armAutoDismiss = (key: string): void => {
    const gen = ++generation
    dismissGen.set(key, gen)
    const attention = attentions.get(key)
    if (cfg().visibility !== 'autohide' || !attention || (attention.kind !== 'turn-done' && attention.kind !== 'command-done')) {
      dismissGen.delete(key)
      return
    }
    const id = attention.id
    const owns = (): boolean =>
      dismissGen.get(key) === gen && attentions.get(key)?.id === id && cfg().visibility === 'autohide'
    const check = (): void => {
      if (!owns()) return
      // Reading it, or typing into its mini terminal? Look again later.
      if (engaged()) {
        timers.setTimeout(check, AUTO_DISMISS_RECHECK_MS)
        return
      }
      clear(key)
      push()
    }
    timers.setTimeout(check, AUTO_DISMISS_MS)
  }

  /* ── blackout wake (blackout.rs agent_needs_user) ── */
  const wokenFor = new Set<string>()
  let relightTimer = 0
  const agentNeedsUser = (attentionId: string): void => {
    const blackoutCfg = backend.state.settings().blackout
    if (!backend.blackout.active || !blackoutCfg.wakeOnAgentQuestion) return
    if (wokenFor.has(attentionId)) return
    wokenFor.add(attentionId)
    const grace = Math.min(600, Math.max(15, blackoutCfg.wakeGraceSeconds || 60)) * 1000
    const litAt = Date.now()
    backend.blackout.lift()
    timers.clear(relightTimer)
    // Ignore the question and the screen goes back to black; any input means you came back.
    relightTimer = timers.setTimeout(() => {
      if (lastUserInput <= litAt && !backend.blackout.active) backend.blackout.start('idle')
    }, grace)
  }

  /* ── autoFocusQuestions (mod.rs:735-747) ── */
  const maybeFocusForQuestion = (): void => {
    if (!cfg().autoFocusQuestions) return
    if (Date.now() - lastUserInput < FOCUS_IDLE_MS) return
    timers.setTimeout(() => backend.host.notch.focus(), FOCUS_DELAY_MS)
  }

  /* ── inputs ── */
  const hook = (sessionId: string, event: HookEventName, info?: { message?: string }): void => {
    // The hook script only exists while installed; uninstalled, Claude Code has nothing to call.
    if (!hooksInstalled) return
    const key = `s:${sessionId}`
    const reported = sessionInfo(sessionId)
    const title = reported?.title ?? 'Terminal agent'
    const paneId = reported?.paneId
    switch (event) {
      case 'SessionStart':
        hookCovered.add(sessionId)
        clear(key)
        break
      case 'Notification': {
        hookCovered.add(sessionId)
        const message = info?.message ?? 'needs your input'
        const raised = set(key, 'question', 'hook', sessionId, paneId, title, message)
        if (PERMISSION_RX.test(message)) {
          expandHint = raised.id
          maybeFocusForQuestion()
        }
        break
      }
      case 'Stop':
        hookCovered.add(sessionId)
        if (cfg().notifyTurnDone) set(key, 'turn-done', 'hook', sessionId, paneId, title, 'finished a turn — waiting for you')
        else clear(key)
        break
      case 'SessionEnd':
        hookCovered.delete(sessionId)
        clear(key)
        break
      default:
        break
    }
    push()
  }

  const signal = (sessionId: string, sig: NotchAgentSignal): void => {
    if (sig.kind === 'command-state') {
      if (sig.running) workingCmd.add(sessionId)
      else {
        workingCmd.delete(sessionId)
        // However the command died, the next one gets heuristics back until it re-covers itself.
        hookCovered.delete(sessionId)
      }
      push()
      return
    }
    if (!cfg().heuristics || hookCovered.has(sessionId)) return
    const reported = sessionInfo(sessionId)
    const detail =
      sig.kind === 'osc9'
        ? preview(sig.message, 120)
        : sig.kind === 'bell'
          ? 'rang the bell'
          : (sig.detail ?? 'may be waiting for input')
    set(`s:${sessionId}`, 'maybe-waiting', 'heuristic', sessionId, reported?.paneId, reported?.title ?? 'Terminal', detail)
    push()
  }

  const taskComplete = (p: TaskCompletePayload): void => {
    const { notifyCommandDone, minCommandSec } = cfg()
    if (!notifyCommandDone || p.durationMs < minCommandSec * 1000 || !p.sessionId) return
    const mins = Math.floor(p.durationMs / 60_000)
    const secs = Math.round((p.durationMs % 60_000) / 1000)
    const took = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
    const detail = p.exitCode === 0 ? `command finished · ${took}` : `exit ${p.exitCode} · ${took}`
    set(`s:${p.sessionId}`, 'command-done', 'command', p.sessionId, p.paneId, p.title, detail)
    push()
  }

  const hasTerminalAttention = (): boolean => {
    for (const k of attentions.keys()) if (k.startsWith('s:')) return true
    return false
  }

  const onPty = (e: PtyEvent): void => {
    const id = e.session.id
    if (e.type === 'exit') {
      workingCmd.delete(id)
      hookCovered.delete(id)
      if (attentions.has(`s:${id}`)) clear(`s:${id}`)
      push()
      return
    }
    if (e.type === 'input') {
      // An Enter from the pane, the notch or the tour means the user is answering.
      // Deck tools' own writes (a message's Enter) are not the user.
      if (e.source === 'deck' || e.source === 'program') return
      lastUserInput = Date.now()
      if (!e.data.includes('\r') || !hasTerminalAttention()) return
      if (attentions.has(`s:${id}`)) {
        clear(`s:${id}`)
        push()
      }
      return
    }
    if (e.type !== 'output' || !hasTerminalAttention()) return
    const key = `s:${id}`
    const attention = attentions.get(key)
    if (!attention) return
    if (Date.now() - (raisedAt.get(key) ?? 0) <= OUTPUT_CLEAR_GRACE_MS) return
    const seen = (outputSince.get(key) ?? 0) + utf8Length(e.data)
    outputSince.set(key, seen)
    if (seen >= (attention.source === 'heuristic' ? OUTPUT_CLEAR_BYTES_HEURISTIC : OUTPUT_CLEAR_BYTES)) {
      clear(key)
      push()
    }
  }

  /* ── actions from the notch renderer ── */
  const dismiss = (attentionId: string): void => {
    for (const [key, a] of attentions) {
      if (a.id !== attentionId) continue
      clear(key)
      push()
      return
    }
  }

  const jump = (target: NotchJumpTarget): void => {
    let sessionId = target.sessionId
    let paneId: string | undefined
    if (target.attentionId) {
      const a = [...attentions.values()].find((x) => x.id === target.attentionId)
      if (!a) return
      sessionId = a.sessionId
      paneId = a.paneId
    }
    if (!sessionId) return
    paneId ??= sessionInfo(sessionId)?.paneId
    const label = windowOfSession(sessionId)
    if (!label) return
    const host = backend.host
    const winState = host.windows.state(label)
    if (winState === 'minimized' || winState === 'closed') host.windows.restore(label)
    host.windows.focus(label)
    if (paneId) backend.events.emitTo(label, 'pane:focus', { paneId })
  }

  /* ── mirrors (notch_attach / notch:stream, cmds.rs:1099-1132) ── */
  const attached = new Map<string, number>()
  const streamFrame = (e: PtyEvent): void => {
    const id = e.session.id
    if (!attached.has(id) || !backend.frame(NOTCH_LABEL)) return
    if (e.type === 'output') {
      backend.events.emitTo(NOTCH_LABEL, 'notch:stream', { t: 'data', sessionId: id, seq: e.seq, b64: utf8ToBase64(e.data) })
    } else if (e.type === 'resize') {
      backend.events.emitTo(NOTCH_LABEL, 'notch:stream', { t: 'resize', sessionId: id, cols: e.cols, rows: e.rows })
    } else if (e.type === 'exit') {
      backend.events.emitTo(NOTCH_LABEL, 'notch:stream', { t: 'exit', sessionId: id, code: e.code })
      attached.delete(id)
    }
  }

  /* ── the host: wired lazily, since backend.host is the null bridge while modules start ── */
  let wiredHost: HostBridge | null = null
  let unwireHost: Array<() => void> = []
  const wireHost = (): void => {
    const host = backend.host
    if (wiredHost === host) return
    for (const off of unwireHost) off()
    wiredHost = host
    unwireHost = [
      host.onUserInput(() => {
        lastUserInput = Date.now()
      }),
      host.notch.onEdgeDwell(() => {
        if (!cfg().enabled || !hiddenForEmpty || peeking || hiddenForBlackout || hiddenForFocus) return
        peeking = true
        applyVisibility()
        timers.clear(peekTimer)
        peekTimer = timers.setTimeout(() => {
          if (peeking && !hoverInside) {
            peeking = false
            applyVisibility()
          }
        }, PEEK_UNCLAIMED_MS)
      })
    ]
    host.notch.setScale(cfg().scale)
    applyVisibility()
  }

  // showWhenFocused=false: hidden while a TerminalDeck window has the keyboard.
  const appFocused = (): boolean =>
    backend.frames().some((label) => {
      if (label === NOTCH_LABEL) return false
      try {
        return backend.frame(label)?.document.hasFocus() ?? false
      } catch {
        return false
      }
    })
  const refreshFocus = (): void => {
    const next = !cfg().showWhenFocused && appFocused()
    if (next === hiddenForFocus) return
    hiddenForFocus = next
    if (next) peeking = false
    applyVisibility()
  }

  const service: NotchController = {
    sessions,
    windowOfSession,
    hook,
    signal,
    taskComplete,
    state,
    onState(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    dismiss,
    jump,
    hasHookCoverage: (sessionId) => hookCovered.has(sessionId)
  }

  const commands: CommandModule = {
    sessions_report: ({ list }: { list: PaneSessionInfo[] }, { label }) => {
      const prev = reports.get(label)
      const next = Array.isArray(list) ? structuredClone(list) : []
      // Five renderer stores schedule reports; one that says nothing new is not forwarded.
      if (prev && JSON.stringify(prev) === JSON.stringify(next)) return null
      reports.set(label, next)
      push()
      return null
    },
    notch_get_state: () => {
      wireHost()
      return state()
    },
    notch_agent_signal: ({ sessionId, signal: sig }: { sessionId: string; signal: NotchAgentSignal }) => {
      if (typeof sessionId === 'string' && sig) signal(sessionId, sig)
      return null
    },
    notify_task_complete: ({ payload }: { payload: TaskCompletePayload }) => {
      if (payload) taskComplete(payload)
      return null
    },
    notch_dismiss: ({ attentionId }: { attentionId: string }) => {
      dismiss(attentionId)
      return null
    },
    notch_jump: ({ target }: { target: NotchJumpTarget }) => {
      if (target) jump(target)
      return null
    },
    notch_ui_rect: ({ rect }: { rect: { x: number; y: number; w: number; h: number } | null }) => {
      wireHost()
      backend.host.notch.setUiRect(rect ?? null)
      return null
    },
    notch_set_ignore_mouse: ({ ignore }: { ignore: boolean }) => {
      backend.host.notch.setIgnoreMouse(!!ignore)
      return null
    },
    notch_attach: ({ sessionId, since }: { sessionId: string; since: number }): NotchAttachResult => {
      const session = backend.pty.get(sessionId)
      if (!session || !session.alive) return { ok: false, cols: 80, rows: 24, headSeq: 0, reset: false, replayB64: '' }
      attached.set(sessionId, (attached.get(sessionId) ?? 0) + 1)
      const { data, headSeq, reset } = session.replay(Number(since) || 0)
      return { ok: true, cols: session.cols, rows: session.rows, headSeq, reset, replayB64: utf8ToBase64(data) }
    },
    notch_detach: ({ sessionId }: { sessionId: string }) => {
      const n = (attached.get(sessionId) ?? 0) - 1
      if (n > 0) attached.set(sessionId, n)
      else attached.delete(sessionId)
      return null
    },
    notch_hooks_status: () => hooksStatus(),
    notch_hooks_install: () => {
      hooksInstalled = true
      backend.storage.set(HOOKS_KEY, { installed: true })
      return hooksStatus()
    },
    notch_hooks_uninstall: () => {
      hooksInstalled = false
      backend.storage.set(HOOKS_KEY, { installed: false })
      return hooksStatus()
    }
  }

  const dev: NotchDevHooks = {
    raise(kind, opts = {}) {
      const paneId = opts.paneId ?? 'p1'
      const info = sessions().find((s) => s.paneId === paneId)
      const sessionId = info?.id ?? backend.pty.byPane(paneId)?.id
      if (!sessionId) return null
      const title = info?.title ?? 'Terminal agent'
      let raised: NotchAttention
      if (kind === 'question') {
        const message = opts.detail ?? 'Claude needs your permission to use Bash'
        raised = set(`s:${sessionId}`, 'question', 'hook', sessionId, paneId, title, message)
        if (PERMISSION_RX.test(message)) {
          expandHint = raised.id
          maybeFocusForQuestion()
        }
      } else if (kind === 'turn-done') {
        raised = set(`s:${sessionId}`, kind, 'hook', sessionId, paneId, title, opts.detail ?? 'finished a turn — waiting for you')
      } else if (kind === 'command-done') {
        raised = set(`s:${sessionId}`, kind, 'command', sessionId, paneId, title, opts.detail ?? 'command finished · 42s')
      } else {
        raised = set(`s:${sessionId}`, kind, 'heuristic', sessionId, paneId, title, opts.detail ?? 'may be waiting for input')
      }
      push()
      return raised.id
    },
    clearAll() {
      for (const key of [...attentions.keys()]) clear(key)
      push()
    },
    peek() {
      peeking = true
      applyVisibility()
    }
  }

  return {
    service,
    commands,
    start() {
      devHooks(backend).notch = dev
      backend.pty.subscribe((e) => {
        onPty(e)
        streamFrame(e)
      })
      backend.state.onSettings((next, prev) => {
        const n = next.notch
        const p = prev.notch
        if (n.enabled && !p.enabled) {
          // A notch page that comes back pulls the state itself; nothing stale to hide behind.
          hiddenForEmpty = n.visibility === 'autohide' && attentions.size === 0
        }
        if (n.visibility !== p.visibility) {
          hiddenForEmpty = n.visibility === 'autohide' && attentions.size === 0
          peeking = false
        }
        backend.host.notch.setScale(n.scale)
        refreshFocus()
        applyVisibility()
        // Visibility can flip while attentions are up: re-arm or cancel their retracts.
        for (const key of [...attentions.keys()]) armAutoDismiss(key)
        push()
      })
      backend.blackout.onChange((active) => {
        hiddenForBlackout = active
        if (active) peeking = false
        applyVisibility()
      })
      backend.events.tap((event, payload, to) => {
        if (event !== 'notch:hover' || to !== NOTCH_LABEL) return
        hoverInside = payload === true
        // A peeked notch retracts once the pointer has left it.
        if (!hoverInside && peeking) {
          peeking = false
          applyVisibility()
        }
      })
      hiddenForEmpty = cfg().visibility === 'autohide' && attentions.size === 0
    },
    frameAttached(label) {
      wireHost()
      if (label === NOTCH_LABEL) {
        backend.host.notch.setScale(cfg().scale)
        applyVisibility()
        return
      }
      applyVisibility()
      const win = backend.frame(label)
      if (!win) return
      try {
        win.addEventListener('focus', refreshFocus)
        // Focus may be moving between our own frames: look once it has landed.
        win.addEventListener('blur', () => timers.setTimeout(refreshFocus, 80))
      } catch {
        /* a frame we cannot reach */
      }
    },
    frameDetached(label) {
      if (label === NOTCH_LABEL) {
        attached.clear()
        hoverInside = false
        return
      }
      if (reports.delete(label)) push()
      refreshFocus()
      applyVisibility()
    }
  }
}

/** Cut at `max` UTF-16 units with an ellipsis, like mod.rs `preview`. */
function preview(text: string, max: number): string {
  if (text.length <= max) return text
  let cut = text.slice(0, max)
  // Never leave a lone high surrogate.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1)
  return `${cut}…`
}
