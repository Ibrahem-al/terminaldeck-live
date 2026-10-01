/**
 * The PtyManager and every pty_* command: sessions keyed by id (and by pane
 * id for restore and deck tools), output to each pane's Channel as strings,
 * the ring + seq that notch mirrors replay, exit frames, adopt, and saved
 * scrollback across reloads.
 */
import type { PtyAdoptResult, PtyScrollback, PtySession as SpawnResult, PtySpawnOptions, ShellKind } from '@shared/types'
import {
  claudeConversationKey,
  type Backend,
  type ChannelLike,
  type CommandModule,
  type ModuleInstance,
  type PtyEvent,
  type PtyFrame,
  type PtyManager,
  type WindowLabel
} from '../contracts'
import { utf8ToBase64 } from '../util/text'
import { ScrollbackStore } from './scrollback'
import { PtySessionImpl } from './session'

const KINDS: ShellKind[] = ['powershell', 'pwsh', 'cmd', 'gitbash']

/** How long each shell takes to print its first prompt (ms, min–max). */
const STARTUP: Record<ShellKind, [number, number]> = {
  powershell: [260, 480],
  pwsh: [220, 400],
  cmd: [70, 140],
  gitbash: [180, 320]
}

const clampSize = (n: unknown, fallback: number): number => {
  const v = Math.floor(Number(n))
  return Number.isFinite(v) ? Math.min(20000, Math.max(2, v)) : fallback
}

export function createPtyManager(backend: Backend): ModuleInstance<PtyManager> {
  const sessions = new Map<string, PtySessionImpl>()
  const byPaneId = new Map<string, PtySessionImpl>()
  const subscribers = new Set<(e: PtyEvent) => void>()
  let counter = 0
  // Rust offers a conversation back only when its transcript exists on disk.
  const scrollback = new ScrollbackStore(backend.storage, (id) => backend.storage.get(claudeConversationKey(id)) !== undefined)
  const startTimers = backend.clock.group()

  const publish = (e: PtyEvent): void => {
    for (const cb of subscribers) {
      try {
        cb(e)
      } catch (err) {
        console.error('[demo] pty subscriber failed', err)
      }
    }
  }

  const gone = (s: PtySessionImpl): void => {
    sessions.delete(s.id)
    if (s.paneId && byPaneId.get(s.paneId) === s) byPaneId.delete(s.paneId)
  }

  // Rust keeps the conversation a shell was launched for (or is running) until its Claude exits,
  // so an offer nobody answered yet survives another restart.
  const inClaude = (s: PtySessionImpl): boolean => !!s.claudeSessionId && !s.claudeEnded

  const saveScrollback = (label?: WindowLabel): void => {
    const list = [...sessions.values()].filter((s) => label === undefined || s.label === label)
    if (list.length) scrollback.save(list, inClaude)
  }

  // The whole demo going away (reload, tab close): keep what the panes showed.
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => saveScrollback())

  const resolveCwd = (requested: string | undefined): string => {
    const vfs = backend.vfs
    if (requested) {
      try {
        const s = vfs.stat(requested)
        if (s?.isDir) return s.path
      } catch {
        /* fall through to home, as Rust does */
      }
    }
    return backend.scenario.machine.home
  }

  const service: PtyManager = {
    get: (id) => sessions.get(id),
    byPane: (paneId) => byPaneId.get(paneId),
    list: (label) => [...sessions.values()].filter((s) => label === undefined || s.label === label),
    write: (id, data, source) => sessions.get(id)?.input(data, source),
    kill: (id) => sessions.get(id)?.kill(),
    subscribe(cb) {
      subscribers.add(cb)
      return () => subscribers.delete(cb)
    },
    noteClaude(sessionId, claudeSessionId) {
      const s = sessions.get(sessionId)
      if (!s) return
      if (claudeSessionId) s.claudeSessionId = claudeSessionId
      s.claudeEnded = claudeSessionId === null
    }
  }

  const commands: CommandModule = {
    pty_shells: () => backend.shells.available(),

    pty_create: (
      { options, output }: { options: PtySpawnOptions; output?: ChannelLike<PtyFrame> },
      { label }
    ): SpawnResult => {
      const opts: Partial<PtySpawnOptions> = options ?? {}
      const requested = opts.shell && KINDS.includes(opts.shell) ? opts.shell : undefined
      const available = backend.shells.available().map((s) => s.kind)
      const preferred = backend.state.settings().general.defaultShell
      const kind: ShellKind =
        requested && available.includes(requested) ? requested : available.includes(preferred) ? preferred : (available[0] ?? 'powershell')
      const cwd = resolveCwd(opts.cwd)
      const env = { ...backend.scenario.machine.env, ...(opts.env ?? {}) }
      const session = new PtySessionImpl({
        id: `pty-${++counter}`,
        label,
        paneId: opts.restoreKey,
        kind,
        integrated: kind !== 'cmd',
        env,
        cwd,
        cols: clampSize(opts.cols, 80),
        rows: clampSize(opts.rows, 24),
        claudeSessionId: opts.claudeSessionId,
        channel: output ?? null,
        publish,
        onGone: gone
      })
      session.shell = backend.shells.create({ session, kind, cwd, env, cols: session.cols, rows: session.rows })
      sessions.set(session.id, session)
      if (session.paneId) {
        // A pane restarted ("New session"): the new session replaces the old one.
        const old = byPaneId.get(session.paneId)
        if (old && old !== session && old.alive) old.kill()
        byPaneId.set(session.paneId, session)
      }
      publish({ type: 'created', session })
      // The bridge holds frames that arrive before this invoke resolves; a real shell
      // also needs a moment before its first prompt.
      const [min, max] = STARTUP[kind]
      startTimers.setTimeout(() => {
        if (session.alive) session.shell.start()
      }, min + Math.random() * (max - min))
      return { sessionId: session.id, shell: kind, cwd, integrated: session.integrated }
    },

    pty_write: ({ sessionId, data }: { sessionId: string; data: string }) => {
      if (typeof data === 'string') sessions.get(sessionId)?.input(data, 'pane')
      return null
    },

    pty_resize: ({ sessionId, cols, rows }: { sessionId: string; cols: number; rows: number }) => {
      const s = sessions.get(sessionId)
      s?.resize(clampSize(cols, s.cols), clampSize(rows, s.rows))
      return null
    },

    pty_kill: ({ sessionId }: { sessionId: string }) => {
      sessions.get(sessionId)?.kill()
      return null
    },

    pty_ack: ({ sessionId, frames }: { sessionId: string; frames: number }) => {
      const s = sessions.get(sessionId)
      if (s && Number.isFinite(frames)) s.acked += frames
      return null
    },

    pty_set_visible: ({ sessionIds }: { sessionIds: string[] }, { label }) => {
      const visible = new Set(Array.isArray(sessionIds) ? sessionIds : [])
      for (const s of sessions.values()) if (s.label === label) s.visible = visible.has(s.id)
      return null
    },

    pty_scrollback: ({ restoreKey }: { restoreKey: string }): PtyScrollback | null =>
      typeof restoreKey === 'string' ? scrollback.load(restoreKey) : null,

    pty_prune_scrollback: ({ keys }: { keys: string[] }) => {
      if (Array.isArray(keys)) scrollback.prune(keys)
      return null
    },

    pty_set_launched_claude: ({ sessionId, claudeSessionId }: { sessionId: string; claudeSessionId: string }) => {
      const s = sessions.get(sessionId)
      if (s && typeof claudeSessionId === 'string') {
        s.claudeSessionId = claudeSessionId
        s.claudeEnded = false
      }
      return null
    },

    pty_adopt: ({ sessionId, output }: { sessionId: string; output?: ChannelLike<PtyFrame> }, { label }): PtyAdoptResult => {
      const s = sessions.get(sessionId)
      if (!s) throw `no such session: ${sessionId}`
      const { data, headSeq, reset } = s.replay(0)
      s.rebind(label, output ?? null)
      return { headSeq, reset, replayB64: utf8ToBase64(data) }
    }
  }

  return {
    service,
    commands,
    frameDetached(label) {
      saveScrollback(label)
      for (const s of [...sessions.values()]) if (s.label === label) s.kill()
    }
  }
}
