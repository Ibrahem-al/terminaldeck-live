/**
 * index.html: the demo "desktop". Creates the one simulated backend BEFORE any
 * iframe loads (each frame's boot reads `parent.__tdBackend`), then the app
 * window, the notch overlay, the blackout cover, the taskbar strip, the tour
 * and the website's postMessage API.
 */
// The app's UI font, so the taskbar and the closed card match the renderer.
import '@fontsource-variable/schibsted-grotesk/index.css'
import './host.css'
import { createBackend } from '../backend/index'
import { MAIN_LABEL, NOTCH_LABEL, type HostBridge, type TdStores } from '../backend/contracts'
import { createBlackoutCover } from './blackout'
import { createFolderPicker } from './folderpicker'
import { createKeyHint } from './keyhint'
import { deferReviewEditor } from './lazyreview'
import { createHostBridge } from './bridge'
import { APP_MARK } from './mark'
import { createNotchOverlay } from './notch'
import { createPointerTracker } from './pointer'
import { listenToSite, postToSite } from './site'
import { createTaskbar } from './taskbar'
import { tour } from './tour'
import { createTourHost } from './tourhost'
import { createWindowManager } from './windows'

declare global {
  interface Window {
    __tdHost?: HostBridge
  }
}

const embedded = new URLSearchParams(location.search).get('embed') === '1'
if (embedded) document.documentElement.dataset.embed = ''

const backend = createBackend()
window.__tdBackend = backend
const getBackend = () => backend

const desktop = document.getElementById('desktop') as HTMLElement
const tracker = createPointerTracker()

const reset = (): void => host.reset()

const closedCard = document.createElement('section')
closedCard.className = 'closed-card'
closedCard.hidden = true
closedCard.setAttribute('aria-label', 'TerminalDeck is closed')
closedCard.innerHTML = `
  ${APP_MARK.replace('width="18" height="18"', 'width="40" height="40"')}
  <h1>TerminalDeck is closed</h1>
  <p>Your decks and panes are kept for this tab. Reopen to pick up where you left off.</p>
  <div class="closed-actions">
    <button type="button" class="btn-primary" data-reopen>Reopen</button>
    <button type="button" class="btn-quiet" data-reset>Reset demo</button>
  </div>`
desktop.append(closedCard)

const taskbar = createTaskbar({
  desktop,
  onApp: () => windows.restore(MAIN_LABEL),
  onReset: reset
})

// The taskbar hides again while a window restores; remember where the button was.
let lastTarget: DOMRect | null = null
const windows = createWindowManager({
  desktop,
  tracker,
  backend: getBackend,
  closedCard,
  minimizeTarget: () => {
    const r = taskbar.appButton.getBoundingClientRect()
    if (r.width > 0) lastTarget = r
    return lastTarget
  }
})
windows.onChange((label, state) => {
  if (label === MAIN_LABEL) taskbar.setAppState(state)
})
closedCard.querySelector('[data-reopen]')?.addEventListener('click', () => windows.restore(MAIN_LABEL))
closedCard.querySelector('[data-reset]')?.addEventListener('click', reset)

const notch = createNotchOverlay({
  desktop,
  tracker,
  backend: getBackend,
  src: './notch.html',
  onLoad: (iframe) => tracker.watchFrame(NOTCH_LABEL, iframe)
})

const blackout = createBlackoutCover({ desktop, tracker, backend: getBackend })

const tourHost = createTourHost({
  backend: getBackend,
  app: () => host.app(MAIN_LABEL),
  post: postToSite,
  tracker
})
tourHost.register(tour)

const host = createHostBridge({
  backend: getBackend,
  embedded,
  windows,
  notch,
  blackout,
  tour: tourHost,
  tracker,
  folders: createFolderPicker({ desktop, backend: getBackend })
})
backend.setHost(host)
window.__tdHost = host

// "ready" once the main window has booted its workspace (its first sessions_report).
let announced = false
backend.onInvoke((label, cmd) => {
  if (announced || label !== MAIN_LABEL || cmd !== 'sessions_report') return
  announced = true
  const win = windows.frameElement(MAIN_LABEL)?.contentWindow as (Window & { __tdReady?: Promise<TdStores> }) | null
  void (win?.__tdReady ?? Promise.resolve()).then(() => postToSite({ type: 'ready' }))
})

backend.state.onSettings((next, prev) => {
  if (next.general.theme !== prev.general.theme) postToSite({ type: 'theme', theme: next.general.theme })
})

listenToSite(backend, host)
createKeyHint({ desktop, tracker })

let offReview: (() => void) | null = null
windows.mount(MAIN_LABEL, './app.html', (iframe) => {
  tracker.watchFrame(MAIN_LABEL, iframe)
  iframe.contentWindow?.focus()
  offReview?.()
  offReview = null
  const win = iframe.contentWindow as (Window & { __tdReady?: Promise<TdStores> }) | null
  void win?.__tdReady?.then((stores) => {
    if (iframe.contentWindow === win) offReview = deferReviewEditor(stores, backend.storage)
  })
})
