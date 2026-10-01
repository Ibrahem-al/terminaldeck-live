/**
 * The notch overlay: a transparent 760×500 (× scale) iframe pinned to the top
 * centre of the desktop, click-through until armed — the browser version of
 * the always-on-top overlay window and Rust's cursor poll (notch/window.rs).
 *
 * The host hit-tests the pointer against the last `notch_ui_rect` (+14 px
 * halo on the sides and bottom) and emits `notch:hover`; NotchApp answers with
 * `notch_set_ignore_mouse`, which flips the iframe's pointer-events.
 */
import { NOTCH_LABEL, type Backend, type NotchSurface } from '../backend/contracts'
import type { PointerTracker } from './pointer'

const BASE_W = 760
const BASE_H = 500
const HALO = 14
/** "Hidden until needed": the reveal strip and how long the pointer must rest on it. */
const EDGE_STRIP = 3
const EDGE_DWELL_MS = 240

export interface NotchOverlay extends NotchSurface {
  readonly iframe: HTMLIFrameElement
}

export function createNotchOverlay(opts: {
  desktop: HTMLElement
  tracker: PointerTracker
  backend: () => Backend
  src: string
  onLoad: (iframe: HTMLIFrameElement) => void
}): NotchOverlay {
  const iframe = document.createElement('iframe')
  iframe.className = 'notch-frame'
  iframe.title = 'TerminalDeck notch'
  iframe.setAttribute('allowtransparency', 'true')
  iframe.addEventListener('load', () => opts.onLoad(iframe))
  iframe.src = opts.src
  opts.desktop.append(iframe)

  let rect: { x: number; y: number; w: number; h: number } | null = null
  let visible = true
  let scale = 1
  let inside = false
  let edgeTimer: number | undefined
  const edgeListeners = new Set<() => void>()

  const onEdge = (x: number, y: number): boolean => {
    const box = iframe.getBoundingClientRect()
    return y <= EDGE_STRIP && Math.abs(x - (box.left + box.width / 2)) <= box.width / 2
  }

  const applySize = (): void => {
    iframe.style.width = `${Math.round(BASE_W * scale)}px`
    iframe.style.height = `${Math.round(BASE_H * scale)}px`
  }
  applySize()
  iframe.style.pointerEvents = 'none'

  /** What NotchApp last asked for (notch_set_ignore_mouse), which the host may override for the moment the pointer is outside. */
  let armed = false
  const setHover = (next: boolean): void => {
    if (next === inside) return
    inside = next
    // Disarm the instant our own hit-test says "outside": waiting for NotchApp's
    // round trip would let a quick click land on the transparent frame instead of the pane under it.
    if (!next) iframe.style.pointerEvents = 'none'
    else if (armed) iframe.style.pointerEvents = 'auto'
    opts.backend().events.emitTo(NOTCH_LABEL, 'notch:hover', next)
  }

  opts.tracker.on((e) => {
    if (e.kind !== 'move') return
    if (!visible) {
      setHover(false)
      if (!onEdge(e.x, e.y)) {
        window.clearTimeout(edgeTimer)
        edgeTimer = undefined
      } else if (edgeTimer === undefined) {
        // A deliberate rest on the edge, not a fly-by: check again once the dwell has passed.
        edgeTimer = window.setTimeout(() => {
          edgeTimer = undefined
          if (!visible && onEdge(opts.tracker.x, opts.tracker.y)) for (const cb of edgeListeners) cb()
        }, EDGE_DWELL_MS)
      }
      return
    }
    const box = iframe.getBoundingClientRect()
    if (!rect) {
      setHover(false)
      return
    }
    const px = e.x - box.left
    const py = e.y - box.top
    setHover(px >= rect.x - HALO && px <= rect.x + rect.w + HALO && py >= rect.y && py <= rect.y + rect.h + HALO)
  })

  return {
    iframe,
    setUiRect(next) {
      rect = next
    },
    setIgnoreMouse(ignore) {
      armed = !ignore
      iframe.style.pointerEvents = ignore ? 'none' : 'auto'
    },
    setVisible(next) {
      visible = next
      iframe.classList.toggle('notch-hidden', !next)
      if (!next) iframe.style.pointerEvents = 'none'
    },
    get visible() {
      return visible
    },
    setScale(next) {
      scale = Math.min(1.5, Math.max(0.85, next || 1))
      applySize()
    },
    focus() {
      try {
        iframe.contentWindow?.focus()
      } catch {
        /* ignore */
      }
    },
    onEdgeDwell(cb) {
      edgeListeners.add(cb)
      return () => edgeListeners.delete(cb)
    }
  }
}
