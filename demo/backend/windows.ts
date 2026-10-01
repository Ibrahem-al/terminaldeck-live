/**
 * window_* and plugin:window|* commands. The host draws the windows; this
 * module speaks the Rust half of the protocol — the close handshake
 * (`window:close-request` → the renderer confirms → `window_confirm_close`) and
 * `window:maximized` edges.
 */
import { NOTCH_LABEL, type Backend, type CommandModule, type ModuleInstance, type WindowService } from './contracts'

export function createWindows(backend: Backend): ModuleInstance<WindowService> {
  const service: WindowService = {
    labels: () => backend.frames().filter((l) => l !== NOTCH_LABEL),
    isMaximized: (label) => backend.host.windows.state(label) === 'maximized',
    notifyMaximized: (label, maximized) => backend.events.emitTo(label, 'window:maximized', maximized),
    requestClose: (label) => backend.events.emitTo(label, 'window:close-request', null)
  }

  const labelOf = (args: { label?: string } | undefined, fallback: string): string => args?.label ?? fallback

  const commands: CommandModule = {
    window_minimize: (_a, { label }) => {
      backend.host.windows.minimize(label)
      return null
    },
    // Rust's window_maximize toggles, like the caption button.
    window_maximize: (_a, { label }) => {
      backend.host.windows.toggleMaximize(label)
      return null
    },
    window_close: (_a, { label }) => {
      service.requestClose(label)
      return null
    },
    window_confirm_close: (_a, { label }) => {
      backend.host.windows.close(label)
      return null
    },
    window_new: () => {
      if (backend.host.windows.open() === null) {
        backend.host.appToast('info', 'One window in the web demo', 'The desktop app opens a second window here (Ctrl+Shift+M).')
      }
      return null
    },

    'plugin:window|is_maximized': (a: { label?: string }, { label }) => service.isMaximized(labelOf(a, label)),
    'plugin:window|start_dragging': (a: { label?: string }, { label }) => {
      backend.host.windows.startDrag(labelOf(a, label))
      return null
    },
    'plugin:window|toggle_maximize': (a: { label?: string }, { label }) => {
      backend.host.windows.toggleMaximize(labelOf(a, label))
      return null
    },
    'plugin:window|minimize': (a: { label?: string }, { label }) => {
      backend.host.windows.minimize(labelOf(a, label))
      return null
    },
    'plugin:window|set_focus': (a: { label?: string }, { label }) => {
      backend.host.windows.focus(labelOf(a, label))
      return null
    },
    'plugin:window|is_visible': (a: { label?: string }, { label }) => {
      const state = backend.host.windows.state(labelOf(a, label))
      return state !== 'minimized' && state !== 'closed'
    },
    'plugin:window|is_minimized': (a: { label?: string }, { label }) =>
      backend.host.windows.state(labelOf(a, label)) === 'minimized'
  }

  return { service, commands }
}
