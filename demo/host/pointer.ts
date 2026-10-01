/**
 * One view of the visitor's pointer and keyboard across the host page and
 * every same-origin iframe. A pointer over an iframe never reaches the host
 * document, yet the notch hit-test, the blackout wake, window dragging and the
 * tour's "stop on input" all need it — so each frame's events are forwarded
 * here in host-viewport coordinates.
 */
import type { WindowLabel } from '../backend/contracts'

export interface PointerSample {
  x: number
  y: number
  buttons: number
  /** Where it happened. */
  label: WindowLabel | 'host'
  trusted: boolean
}

export type InputKind = 'move' | 'down' | 'up' | 'key' | 'wheel'

export interface InputEventInfo extends PointerSample {
  kind: InputKind
  /** For 'key'. */
  key?: string
}

export interface PointerTracker {
  readonly x: number
  readonly y: number
  on(cb: (e: InputEventInfo) => void): () => void
  /** Forward a frame's events; call again after every (re)load of that iframe. */
  watchFrame(label: WindowLabel, iframe: HTMLIFrameElement): void
}

export function createPointerTracker(): PointerTracker {
  let x = -1
  let y = -1
  const listeners = new Set<(e: InputEventInfo) => void>()

  const dispatch = (e: InputEventInfo): void => {
    if (e.kind !== 'key') {
      x = e.x
      y = e.y
    }
    for (const cb of listeners) {
      try {
        cb(e)
      } catch (err) {
        console.error('[demo] input listener failed', err)
      }
    }
  }

  const attach = (target: Window, label: WindowLabel | 'host', toHost: (cx: number, cy: number) => [number, number]): void => {
    const mouse = (kind: InputKind) => (ev: MouseEvent) => {
      const [hx, hy] = toHost(ev.clientX, ev.clientY)
      dispatch({ kind, x: hx, y: hy, buttons: ev.buttons, label, trusted: ev.isTrusted })
    }
    const opts = { capture: true, passive: true }
    target.addEventListener('mousemove', mouse('move'), opts)
    target.addEventListener('mousedown', mouse('down'), opts)
    target.addEventListener('mouseup', mouse('up'), opts)
    target.addEventListener('wheel', mouse('wheel') as EventListener, opts)
    target.addEventListener(
      'keydown',
      (ev: KeyboardEvent) => dispatch({ kind: 'key', key: ev.key, x, y, buttons: 0, label, trusted: ev.isTrusted }),
      opts
    )
  }

  attach(window, 'host', (cx, cy) => [cx, cy])

  return {
    get x() {
      return x
    },
    get y() {
      return y
    },
    on(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    watchFrame(label, iframe) {
      const win = iframe.contentWindow
      if (!win) return
      try {
        attach(win, label, (cx, cy) => {
          const r = iframe.getBoundingClientRect()
          // The window may be mid-animation (scaled); map through the rendered box.
          const sx = iframe.offsetWidth > 0 ? r.width / iframe.offsetWidth : 1
          const sy = iframe.offsetHeight > 0 ? r.height / iframe.offsetHeight : 1
          return [r.left + cx * sx, r.top + cy * sy]
        })
      } catch {
        /* cross-origin frame: nothing to forward */
      }
    }
  }
}
