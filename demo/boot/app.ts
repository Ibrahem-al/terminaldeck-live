/**
 * app.html: one TerminalDeck app window. `?label=win-2` makes a secondary
 * window; the default is the primary `main`. After the real entry has loaded,
 * the renderer's store modules are exposed as `window.__td` — dynamic imports
 * of the same paths the app imports, so they resolve to the same instances.
 */
import { MAIN_LABEL, type TdStores } from '../backend/contracts'
import { bootFrame } from './frame'

declare global {
  interface Window {
    __td?: TdStores
    __tdReady?: Promise<TdStores>
  }
}

const label = new URLSearchParams(location.search).get('label') ?? MAIN_LABEL
await bootFrame(label, label === MAIN_LABEL ? 'primary' : 'secondary')

let resolveReady: (stores: TdStores) => void = () => {}
window.__tdReady = new Promise((resolve) => (resolveReady = resolve))

await import('@renderer/main')

const [
  workspace,
  settings,
  projects,
  explorer,
  editor,
  theme,
  toasts,
  paneMessages,
  ptySessions,
  paneCwd,
  blackout,
  layout,
  inputBus
] = await Promise.all([
  import('@renderer/store/workspace'),
  import('@renderer/store/settings'),
  import('@renderer/store/projects'),
  import('@renderer/store/explorer'),
  import('@renderer/store/editor'),
  import('@renderer/store/theme'),
  import('@renderer/store/toasts'),
  import('@renderer/store/paneMessages'),
  import('@renderer/store/ptySessions'),
  import('@renderer/store/paneCwd'),
  import('@renderer/store/blackout'),
  import('@renderer/components/workspace/layout'),
  import('@renderer/components/terminal/inputBus')
])

window.__td = {
  workspace,
  settings,
  projects,
  explorer,
  editor,
  theme,
  toasts,
  paneMessages,
  ptySessions,
  paneCwd,
  blackout,
  layout,
  inputBus
}
resolveReady(window.__td)
