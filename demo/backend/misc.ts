/**
 * The small commands: Smart pane names (pane_names_summarize), opening links,
 * and the drag / clipboard shims a browser can't do the native way.
 *
 * Smart names stand in for src-tauri/src/autoname.rs's `claude -p` call:
 * the renderer sends the pane's recent screen, and we answer with the
 * scenario's canned title for whichever pane is showing that screen, picked
 * by what it is doing right now — so a pane reads "Adding API Rate Limiting"
 * while Claude edits and "Writing Rate Limiter Tests" once the tests run.
 */
import type { PaneNameSummarizeOptions } from '@shared/types'
import type { Backend, CommandModule, MiscService, ModuleInstance } from './contracts'
import { stripAnsi } from './util/ansi'

/** autoname.rs gives the model up to 20 s; a haiku call usually takes one or two. */
const SUMMARY_MS = [700, 1400] as const
/** How much of a session's recent output is compared with the renderer's snapshot. */
const MATCH_TAIL_CHARS = 24_000
/** How long a summary may wait for the pane's work to show up (autoname.rs allows 20 s). */
const HOLD_MS = 18_000
const POLL_MS = 400

/**
 * What a pane is doing, when the scenario has no canned name for it. An agent
 * sitting at its welcome screen isn't doing anything yet, so it gets no name
 * here and keeps its deterministic one.
 */
const GENERIC: Array<[RegExp, string]> = [
  [/\b(vitest|jest|npm (run )?test|cargo test|pytest)\b/i, 'Running The Test Suite'],
  [/\b(npm run dev|vite v?\d|localhost:\d+)/i, 'Running Dev Server'],
  [/\bgit commit\b/i, 'Committing Changes'],
  [/\bgit (status|diff|log)\b/i, 'Checking Git Status'],
  [/\bnpm (install|i|ci)\b/i, 'Installing Dependencies'],
  [/\b(npm run build|tsc\b|cargo build)/i, 'Building The Project']
]

export function createMisc(backend: Backend): ModuleInstance<MiscService> {
  const service: MiscService = {
    openExternal(url) {
      if (!/^https?:\/\//i.test(url)) return
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  /** Which pane is showing this screen: the one whose recent output holds most of its lines. */
  const paneShowing = (text: string): string | undefined => {
    const probes = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length >= 8)
      .slice(-40)
    if (!probes.length) return undefined
    let best: { paneId: string; score: number } | undefined
    for (const session of backend.pty.list()) {
      if (!session.paneId || !session.alive) continue
      const tail = stripAnsi(session.replay().data.slice(-MATCH_TAIL_CHARS))
      let score = 0
      for (const p of probes) if (tail.includes(p)) score++
      if (score > 0 && (!best || score > best.score)) best = { paneId: session.paneId, score }
    }
    return best?.paneId
  }

  /** The pane's own recent output, plain. */
  const liveTail = (paneId: string): string | null => {
    const s = backend.pty.byPane(paneId)
    return s?.alive ? stripAnsi(s.replay().data.slice(-MATCH_TAIL_CHARS)) : null
  }

  /** The canned name whose trigger appears latest in the pane's output: what it's doing now. Null before any has. */
  const pickCanned = (names: Array<{ name: string; when: RegExp }>, text: string): string | null => {
    let best: string | null = null
    let at = -1
    for (const { name, when } of names) {
      const rx = new RegExp(when.source, when.flags.includes('g') ? when.flags : `${when.flags}g`)
      let last = -1
      for (const m of text.matchAll(rx)) last = m.index ?? last
      if (last > at) {
        at = last
        best = name
      }
    }
    return best
  }

  const commands: CommandModule = {
    pane_names_summarize: async ({ options }: { options: PaneNameSummarizeOptions }): Promise<string> => {
      const text = options?.text ?? ''
      const timers = backend.clock.group()
      try {
        await timers.sleep(SUMMARY_MS[0] + Math.random() * (SUMMARY_MS[1] - SUMMARY_MS[0]))
        const paneId = paneShowing(text)
        const canned = paneId ? backend.scenario.smartNames[paneId] : undefined
        if (paneId && canned?.length) {
          // Like the model call, this answer arrives a little later than the snapshot: take it from
          // what the pane shows by then, and wait (within autoname.rs's 20 s budget) for work to start.
          const end = Date.now() + HOLD_MS
          for (;;) {
            const live = liveTail(paneId)
            if (live === null) break
            const name = pickCanned(canned, live)
            if (name) return name
            if (Date.now() >= end) break
            await timers.sleep(POLL_MS)
          }
        }
        // A short command can be over by the time the answer is ready. The renderer would keep a
        // late name at the idle prompt, so answer as a model looking at a prompt would: no title.
        const shell = paneId ? backend.pty.byPane(paneId)?.shell : undefined
        if (shell?.atPrompt) throw 'claude -p returned no usable title'
        const tail = text.slice(-2000)
        for (const [rx, name] of GENERIC) if (rx.test(tail)) return name
        // The renderer's documented fallback: keep the deterministic name.
        throw 'claude -p returned no usable title'
      } finally {
        timers.dispose()
      }
    },
    shell_open_external: ({ url }: { url: string }) => {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw 'Only http and https links can be opened.'
      service.openExternal(url)
      return null
    },
    // Native OLE drag-out has no browser equivalent; the renderer treats it as fire-and-forget.
    shell_start_drag: () => null
  }

  return { service, commands }
}
