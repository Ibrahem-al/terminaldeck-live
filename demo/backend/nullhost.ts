/**
 * The host bridge used when an app frame runs standalone (app.html opened
 * directly, no desktop page around it): every call is accepted and ignored,
 * except what can still be done from inside the frame itself.
 */
import type { Backend, HostBridge, TdStores, WindowLabel } from './contracts'

export function createNullHost(backend: () => Backend): HostBridge {
  const stores = (label: WindowLabel = 'main'): TdStores | null =>
    ((backend().frame(label) as unknown as { __td?: TdStores } | undefined)?.__td ?? null)

  return {
    embedded: false,
    windows: {
      state: () => 'maximized',
      minimize: () => {},
      toggleMaximize: () => {},
      restore: () => {},
      close: (label) => backend().frame(label)?.location.reload(),
      open: () => null,
      startDrag: () => {},
      focus: (label) => backend().frame(label)?.focus(),
      frameElement: () => null
    },
    notch: {
      setUiRect: () => {},
      setIgnoreMouse: () => {},
      setVisible: () => {},
      visible: false,
      setScale: () => {},
      focus: () => {},
      onEdgeDwell: () => () => {}
    },
    blackout: { show: () => {}, hide: () => {} },
    tour: { register: () => {}, start: () => {}, stop: () => {}, running: false },
    app: stores,
    appToast: (kind, title, detail) => stores()?.toasts.toast(kind, title, detail),
    post: () => {},
    onUserInput: () => () => {},
    reset: () => {
      backend().storage.wipe()
      location.reload()
    },
    pickFolder: () => Promise.resolve(null)
  }
}
