/**
 * The postMessage API between the website (parent frame) and the demo.
 * Same-origin only: the site serves the demo at /demo/, so anything from
 * another origin — or not from our parent — is ignored.
 *
 *   site → demo  { source: 'td-site', type: 'tour' | 'reset' | 'type' | 'theme' | 'blackout' | 'focus', … }
 *   demo → site  { source: 'td-demo', type: 'ready' | 'tour-step' | 'tour-done' | 'theme', … }
 */
import { MAIN_LABEL, type Backend, type DemoEvent, type HostBridge, type SiteCommand } from '../backend/contracts'

export function postToSite(event: DemoEvent): void {
  if (window.parent === window) return
  try {
    window.parent.postMessage({ source: 'td-demo', ...event }, location.origin)
  } catch {
    /* parent went away */
  }
}

export function listenToSite(backend: Backend, host: HostBridge): void {
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window.parent || e.origin !== location.origin) return
    const data = e.data as (SiteCommand & { source?: string }) | null
    if (!data || data.source !== 'td-site') return
    handle(backend, host, data)
  })
}

function handle(backend: Backend, host: HostBridge, cmd: SiteCommand): void {
  const app = host.app(MAIN_LABEL)
  switch (cmd.type) {
    case 'tour':
      if (cmd.action === 'stop') host.tour.stop()
      else host.tour.start()
      return
    case 'reset':
      host.reset()
      return
    case 'type': {
      if (!app || typeof cmd.text !== 'string') return
      const ws = app.workspace.useWorkspace.getState()
      const paneId = cmd.paneId ?? ws.tabs.find((t) => t.id === ws.activeTabId)?.activePaneId
      if (!paneId) return
      app.inputBus.sendToPane(paneId, cmd.text + (cmd.submit ? '\r' : ''))
      return
    }
    case 'theme':
      if (app && typeof cmd.theme === 'string') app.theme.useTheme.getState().setActive(cmd.theme)
      return
    case 'blackout':
      if (cmd.on === false) backend.blackout.lift()
      else backend.blackout.start('manual')
      return
    case 'focus':
      host.windows.focus(MAIN_LABEL)
      if (app && cmd.paneId) app.workspace.revealPane(cmd.paneId)
      return
  }
}
