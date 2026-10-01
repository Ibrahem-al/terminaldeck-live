/**
 * Tauri's event plugin, rebuilt for several iframes and one backend.
 *
 * `shouldMockEvents` is not an option (mock-events.md §3c): it ignores targets,
 * has no `emit_to`, and never removes an unlistened id — every later emit then
 * logs "Couldn't find callback id". Here each frame's listeners are kept with
 * their target and delivered with `runCallback`, exactly as Tauri's JS shim
 * does, honouring `match_any_or_filter`.
 */
import type { EventBus, ListenArgs, TauriEventTarget, UnlistenArgs, WindowLabel } from './contracts'

interface TauriInternals {
  runCallback?: (id: number, data: unknown) => void
  callbacks?: Map<number, unknown>
}

interface FrameListeners {
  byEvent: Map<string, Map<number, TauriEventTarget>>
}

export function createEventBus(frameWindow: (label: WindowLabel) => Window | undefined): EventBus {
  const frames = new Map<WindowLabel, FrameListeners>()
  const taps = new Set<(event: string, payload: unknown, to: WindowLabel | null) => void>()

  const listenersOf = (label: WindowLabel): FrameListeners => {
    let f = frames.get(label)
    if (!f) frames.set(label, (f = { byEvent: new Map() }))
    return f
  }

  const clone = (payload: unknown): unknown => {
    if (payload === null || typeof payload !== 'object') return payload
    try {
      return structuredClone(payload)
    } catch {
      return payload
    }
  }

  // Tauri delivers events asynchronously; so do we, in emit order.
  const deliver = (event: string, payload: unknown, to: WindowLabel | null): void => {
    for (const cb of taps) {
      try {
        cb(event, payload, to)
      } catch (err) {
        console.error('[demo] event tap failed', err)
      }
    }
    queueMicrotask(() => {
      for (const [label, f] of frames) {
        const listeners = f.byEvent.get(event)
        if (!listeners || listeners.size === 0) continue
        const win = frameWindow(label)
        const internals = (win as unknown as { __TAURI_INTERNALS__?: TauriInternals } | undefined)?.__TAURI_INTERNALS__
        if (!internals?.runCallback) continue
        for (const [id, target] of [...listeners]) {
          // `Any` gets everything, even emit_to of another label; `AnyLabel`
          // gets broadcasts and emit_to of its own label (bridge:86-97).
          const ok = to === null || target.kind === 'Any' || ('label' in target && target.label === to)
          if (!ok) continue
          // The bridge unregisters the callback synchronously and tells us a
          // tick later; a delivery in that gap must not warn.
          if (internals.callbacks && !internals.callbacks.has(id)) {
            listeners.delete(id)
            continue
          }
          try {
            internals.runCallback(id, { event, id, payload: clone(payload) })
          } catch (err) {
            console.error(`[demo] listener for ${event} in ${label} threw`, err)
          }
        }
      }
    })
  }

  return {
    listen(label: WindowLabel, { event, target, handler }: ListenArgs): number {
      const f = listenersOf(label)
      let m = f.byEvent.get(event)
      if (!m) f.byEvent.set(event, (m = new Map()))
      m.set(handler, target ?? { kind: 'Any' })
      return handler
    },
    unlisten(label: WindowLabel, { event, eventId }: UnlistenArgs): void {
      frames.get(label)?.byEvent.get(event)?.delete(eventId)
    },
    emit(event, payload = null) {
      deliver(event, payload, null)
    },
    emitTo(label, event, payload = null) {
      deliver(event, payload, label)
    },
    hasListener(label, event) {
      const m = frames.get(label)?.byEvent.get(event)
      return !!m && m.size > 0
    },
    resetFrame(label) {
      frames.delete(label)
    },
    tap(cb) {
      taps.add(cb)
      return () => taps.delete(cb)
    }
  }
}
