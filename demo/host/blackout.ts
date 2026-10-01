/**
 * The blackout cover over the whole desktop (notch included), and the idle
 * trigger behind Settings → Blackout. Lifting follows src-tauri/src/blackout.rs:
 * any key, a click, or a mouse move of at least 4 px — after a 1.5 s grace
 * that swallows the click or chord that started it.
 */
import type { Backend, HostBlackout } from '../backend/contracts'
import type { PointerTracker } from './pointer'

const GRACE_MS = 1500
const WAKE_MOVE_PX = 4
/** Rust clamps the idle threshold to at least this. */
const MIN_IDLE_MS = 6000

export function createBlackoutCover(opts: {
  desktop: HTMLElement
  tracker: PointerTracker
  backend: () => Backend
}): HostBlackout {
  const cover = document.createElement('div')
  cover.className = 'blackout-cover'
  cover.hidden = true
  cover.setAttribute('aria-hidden', 'true')
  opts.desktop.append(cover)

  let shownAt = 0
  let anchor: { x: number; y: number } | null = null
  /** Where the pointer last was, so the first move after the grace is measured from where it rested. */
  let pointer: { x: number; y: number } | null = null
  let lastInput = performance.now()

  opts.tracker.on((e) => {
    lastInput = performance.now()
    const rested = pointer
    if (e.kind === 'move') pointer = { x: e.x, y: e.y }
    if (cover.hidden) return
    if (performance.now() - shownAt < GRACE_MS) {
      anchor = pointer
      return
    }
    if (e.kind === 'key' || e.kind === 'down' || e.kind === 'wheel') {
      opts.backend().blackout.lift()
      return
    }
    if (e.kind !== 'move' || !pointer) return
    anchor ??= rested
    if (!anchor) {
      anchor = pointer
      return
    }
    if (Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y) >= WAKE_MOVE_PX) opts.backend().blackout.lift()
  })

  // "Black out the screen when you're away" — checked once a second of visible time.
  const idleCheck = (): void => {
    const backend = opts.backend()
    const cfg = backend.state.settings().blackout
    if (!cfg.enabled || backend.blackout.active) return
    if (cfg.onlyWhenInFront && !document.hasFocus()) return
    if (cfg.onlyWhileBusy && backend.notch.state().working === 0) return
    if (performance.now() - lastInput >= Math.max(MIN_IDLE_MS, cfg.idleMinutes * 60_000)) backend.blackout.start('idle')
  }
  // Armed only while Settings → Blackout is on (it's off by default): no work while idle otherwise.
  const timers = opts.backend().clock.group()
  let idleTimer: number | null = null
  const syncIdleCheck = (enabled: boolean): void => {
    if (enabled && idleTimer === null) idleTimer = timers.setInterval(idleCheck, 1000)
    else if (!enabled && idleTimer !== null) {
      timers.clear(idleTimer)
      idleTimer = null
    }
  }
  syncIdleCheck(opts.backend().state.settings().blackout.enabled)
  opts.backend().state.onSettings((next) => syncIdleCheck(next.blackout.enabled))

  return {
    show() {
      cover.hidden = false
      shownAt = performance.now()
      anchor = pointer
      document.documentElement.dataset.blackout = 'true'
    },
    hide() {
      cover.hidden = true
      lastInput = performance.now()
      delete document.documentElement.dataset.blackout
    }
  }
}
