/**
 * Keys a browser keeps for itself. Ctrl+W, Ctrl+T, Ctrl+Tab and Ctrl+1–9 are
 * TerminalDeck shortcuts in the app, but in a browser tab they close, open and
 * switch tabs before the page ever sees them. So: a one-time note pointing at
 * the tmux prefix (Ctrl+A, on by default), which does the same things.
 *
 * Deliberately no leave-page guard: the demo's state already survives a reload
 * (sessionStorage), and a beforeunload prompt in the website's iframe would
 * also stop the visitor leaving the marketing page.
 */
import type { PointerTracker } from './pointer'

const SEEN_KEY = 'td-demo:keyhint-seen'
const SHOW_MS = 14_000

export function createKeyHint(opts: { desktop: HTMLElement; tracker: PointerTracker }): void {
  let seen = false
  try {
    seen = localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    seen = false
  }

  const card = document.createElement('aside')
  card.className = 'key-hint'
  card.hidden = true
  card.setAttribute('role', 'note')
  card.innerHTML = `
    <p><strong>Browser keys win here.</strong> <kbd>Ctrl</kbd>+<kbd>W</kbd>, <kbd>Ctrl</kbd>+<kbd>T</kbd>, <kbd>Ctrl</kbd>+<kbd>Tab</kbd> and <kbd>Ctrl</kbd>+<kbd>1</kbd>–<kbd>9</kbd> close and switch your browser tabs.
    In the demo, press <kbd>Ctrl</kbd>+<kbd>A</kbd> then <kbd>x</kbd> to close a pane, <kbd>c</kbd> for a new deck, <kbd>n</kbd> / <kbd>p</kbd> or <kbd>1</kbd>–<kbd>9</kbd> to switch decks.</p>
    <button type="button" class="key-hint-close" aria-label="Dismiss">×</button>`
  opts.desktop.append(card)

  let timer: number | undefined
  const hide = (): void => {
    window.clearTimeout(timer)
    card.hidden = true
  }
  card.querySelector('button')?.addEventListener('click', hide)

  const off = opts.tracker.on((e) => {
    if (!e.trusted || (e.kind !== 'key' && e.kind !== 'down') || e.label === 'host') return
    off()
    if (seen) return
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* private mode: it just shows again next time */
    }
    card.hidden = false
    timer = window.setTimeout(hide, SHOW_MS)
  })
}
