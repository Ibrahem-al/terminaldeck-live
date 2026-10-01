/**
 * A minimal taskbar strip, shown only while TerminalDeck is minimized or
 * closed — the way back to the window, plus "Reset demo" and a clock.
 */
import type { WindowState } from '../backend/contracts'
import { APP_MARK } from './mark'

export interface Taskbar {
  /** The app button, where a minimized window flies to. */
  readonly appButton: HTMLButtonElement
  setAppState(state: WindowState): void
}

export function createTaskbar(opts: { desktop: HTMLElement; onApp: () => void; onReset: () => void }): Taskbar {
  const bar = document.createElement('nav')
  bar.className = 'taskbar'
  bar.setAttribute('aria-label', 'Desktop taskbar')
  bar.hidden = true

  const appButton = document.createElement('button')
  appButton.type = 'button'
  appButton.className = 'taskbar-app'
  appButton.innerHTML = `${APP_MARK}<span>TerminalDeck</span>`
  appButton.addEventListener('click', opts.onApp)

  const right = document.createElement('div')
  right.className = 'taskbar-right'
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'taskbar-reset'
  reset.textContent = 'Reset demo'
  reset.title = 'Start the demo over from the beginning'
  reset.addEventListener('click', opts.onReset)
  const clock = document.createElement('time')
  clock.className = 'taskbar-clock'
  right.append(reset, clock)

  bar.append(appButton, right)
  opts.desktop.append(bar)

  const tick = (): void => {
    clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  // The clock only ticks while the strip is on screen.
  let clockTimer: number | undefined

  return {
    appButton,
    setAppState(state) {
      const away = state === 'minimized' || state === 'closed'
      if (away && clockTimer === undefined) {
        tick()
        clockTimer = window.setInterval(tick, 15_000)
      } else if (!away && clockTimer !== undefined) {
        window.clearInterval(clockTimer)
        clockTimer = undefined
      }
      bar.hidden = !away
      appButton.dataset.running = String(state !== 'closed')
      appButton.title = state === 'closed' ? 'Open TerminalDeck' : 'Restore TerminalDeck'
    }
  }
}
