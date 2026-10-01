/**
 * The desktop's window manager: the app window is an iframe in a frame that
 * can be maximized (fills the desktop), an inset window with a shadow,
 * minimized to the taskbar strip, or closed ("TerminalDeck is closed —
 * Reopen"). The renderer's own TopBar drives it through window_* commands.
 */
import { MAIN_LABEL, type Backend, type HostWindows, type WindowLabel, type WindowState } from '../backend/contracts'
import type { PointerTracker } from './pointer'

interface AppWindow {
  label: WindowLabel
  el: HTMLDivElement
  iframe: HTMLIFrameElement
  state: WindowState
  /** Inset geometry, in px. */
  rect: { x: number; y: number; w: number; h: number }
}

export interface WindowManager extends HostWindows {
  onChange(cb: (label: WindowLabel, state: WindowState) => void): () => void
  /** Create the window element for an app frame; `onLoad` runs after every (re)load. */
  mount(label: WindowLabel, src: string, onLoad: (iframe: HTMLIFrameElement) => void): void
}

export function createWindowManager(opts: {
  desktop: HTMLElement
  tracker: PointerTracker
  backend: () => Backend
  /** Where a minimized window flies to (the taskbar button), in viewport px. */
  minimizeTarget: () => DOMRect | null
  closedCard: HTMLElement
}): WindowManager {
  const windows = new Map<WindowLabel, AppWindow>()
  const listeners = new Set<(label: WindowLabel, state: WindowState) => void>()

  const insetRect = (): AppWindow['rect'] => {
    const vw = opts.desktop.clientWidth
    const vh = opts.desktop.clientHeight
    const w = Math.round(Math.min(vw - 48, Math.max(720, vw * 0.84)))
    const h = Math.round(Math.min(vh - 48, Math.max(480, vh * 0.84)))
    return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2.4), w, h }
  }

  const place = (win: AppWindow): void => {
    const { el } = win
    // A minimized window keeps the geometry it had, so restoring animates back to it.
    const geometry = win.state === 'minimized' ? (el.dataset.prev ?? 'maximized') : win.state
    el.dataset.state = win.state
    el.dataset.geometry = geometry
    if (geometry === 'normal') {
      el.style.left = `${win.rect.x}px`
      el.style.top = `${win.rect.y}px`
      el.style.width = `${win.rect.w}px`
      el.style.height = `${win.rect.h}px`
    } else {
      el.style.left = el.style.top = el.style.width = el.style.height = ''
    }
  }

  const setState = (win: AppWindow, state: WindowState): void => {
    const wasMax = win.state === 'maximized'
    win.state = state
    place(win)
    opts.closedCard.hidden = !(win.label === MAIN_LABEL && state === 'closed')
    for (const cb of listeners) cb(win.label, state)
    const isMax = state === 'maximized'
    if (wasMax !== isMax && (state === 'maximized' || state === 'normal')) {
      opts.backend().windows.notifyMaximized(win.label, isMax)
    }
  }

  /** Genie-lite: shrink toward the taskbar button, then hide. */
  const animateMinimize = (win: AppWindow, restoring: boolean): void => {
    const target = opts.minimizeTarget()
    const box = win.el.getBoundingClientRect()
    if (!target || box.width === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const dx = target.left + target.width / 2 - (box.left + box.width / 2)
    const dy = target.top + target.height / 2 - (box.top + box.height / 2)
    const collapsed = `translate(${dx}px, ${dy}px) scale(0.08)`
    const frames = [
      { transform: 'none', opacity: 1 },
      { transform: collapsed, opacity: 0 }
    ]
    win.el.animate(restoring ? frames.reverse() : frames, { duration: 220, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' })
  }

  const focusFrame = (win: AppWindow): void => {
    try {
      win.iframe.contentWindow?.focus()
    } catch {
      /* ignore */
    }
  }

  const manager: WindowManager = {
    state: (label) => windows.get(label)?.state ?? 'closed',

    minimize(label) {
      const win = windows.get(label)
      if (!win || win.state === 'minimized' || win.state === 'closed') return
      win.el.dataset.prev = win.state
      setState(win, 'minimized')
      // Measure from the visible box before it hides.
      win.el.style.visibility = 'visible'
      animateMinimize(win, false)
      window.setTimeout(() => win.state === 'minimized' && (win.el.style.visibility = ''), 220)
    },

    toggleMaximize(label) {
      const win = windows.get(label)
      if (!win || win.state === 'closed' || win.state === 'minimized') return
      if (win.state === 'maximized') {
        if (win.rect.w === 0) win.rect = insetRect()
        setState(win, 'normal')
      } else setState(win, 'maximized')
      focusFrame(win)
    },

    restore(label) {
      const win = windows.get(label)
      if (!win) return
      if (win.state === 'closed') {
        win.iframe.src = win.iframe.dataset.src ?? './app.html'
        // Reopens the way it was closed: an inset window stays an inset window.
        setState(win, win.el.dataset.prev === 'normal' ? 'normal' : 'maximized')
        focusFrame(win)
        return
      }
      if (win.state !== 'minimized') return
      setState(win, win.el.dataset.prev === 'normal' ? 'normal' : 'maximized')
      animateMinimize(win, true)
      focusFrame(win)
    },

    close(label) {
      const win = windows.get(label)
      if (!win || win.state === 'closed') return
      // Unloading the page ends its sessions, exactly like the process exiting.
      // Closed first, so what reacts to the detach (the notch) already sees the app gone.
      if (win.state !== 'minimized') win.el.dataset.prev = win.state
      setState(win, 'closed')
      win.iframe.src = 'about:blank'
      opts.backend().detach(label)
    },

    open: () => null,

    startDrag(label) {
      const win = windows.get(label)
      if (!win || win.state !== 'normal') return
      const start = { x: opts.tracker.x, y: opts.tracker.y, rx: win.rect.x, ry: win.rect.y }
      const maxX = opts.desktop.clientWidth - 80
      const maxY = opts.desktop.clientHeight - 40
      const off = opts.tracker.on((e) => {
        if (e.kind === 'up' || (e.kind === 'move' && (e.buttons & 1) === 0)) {
          off()
          return
        }
        if (e.kind !== 'move') return
        win.rect.x = Math.min(maxX, Math.max(80 - win.rect.w, start.rx + e.x - start.x))
        win.rect.y = Math.min(maxY, Math.max(0, start.ry + e.y - start.y))
        place(win)
      })
    },

    focus(label) {
      const win = windows.get(label)
      if (!win) return
      if (win.state === 'minimized' || win.state === 'closed') manager.restore(label)
      focusFrame(win)
    },

    frameElement: (label) => windows.get(label)?.iframe ?? null,

    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },

    mount(label, src, onLoad) {
      const el = document.createElement('div')
      el.className = 'td-window'
      const iframe = document.createElement('iframe')
      iframe.title = 'TerminalDeck'
      iframe.dataset.src = src
      iframe.allow = 'clipboard-read; clipboard-write'
      iframe.addEventListener('load', () => {
        if (iframe.src.endsWith('about:blank')) return
        onLoad(iframe)
      })
      iframe.src = src
      el.append(iframe)
      opts.desktop.append(el)
      const win: AppWindow = { label, el, iframe, state: 'maximized', rect: { x: 0, y: 0, w: 0, h: 0 } }
      windows.set(label, win)
      place(win)
    }
  }

  return manager
}
