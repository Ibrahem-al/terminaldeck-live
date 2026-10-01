/**
 * The HostBridge the backend talks to (contracts.ts): the desktop's window
 * manager, the notch overlay, the blackout cover and the tour, plus reach into
 * an app frame's renderer stores. Assembled once by host/main.ts.
 */
import {
  MAIN_LABEL,
  type Backend,
  type HostBlackout,
  type HostBridge,
  type TdStores,
  type TourHost,
  type WindowLabel
} from '../backend/contracts'
import type { FolderPicker } from './folderpicker'
import type { NotchOverlay } from './notch'
import type { PointerTracker } from './pointer'
import { postToSite } from './site'
import type { WindowManager } from './windows'

export function createHostBridge(opts: {
  backend: () => Backend
  embedded: boolean
  windows: WindowManager
  notch: NotchOverlay
  blackout: HostBlackout
  tour: TourHost
  tracker: PointerTracker
  folders: FolderPicker
}): HostBridge {
  const app = (label: WindowLabel = MAIN_LABEL): TdStores | null => {
    try {
      const win = opts.windows.frameElement(label)?.contentWindow as (Window & { __td?: TdStores }) | null | undefined
      return win?.__td ?? null
    } catch {
      return null
    }
  }

  return {
    embedded: opts.embedded,
    windows: opts.windows,
    notch: opts.notch,
    blackout: opts.blackout,
    tour: opts.tour,
    app,
    appToast(kind, title, detail) {
      app()?.toasts.toast(kind, title, detail)
    },
    post: postToSite,
    onUserInput(cb) {
      return opts.tracker.on((e) => {
        if (!e.trusted || (e.kind !== 'key' && e.kind !== 'down')) return
        cb({ kind: e.kind === 'key' ? 'key' : 'pointer', label: e.label })
      })
    },
    reset() {
      opts.tour.stop()
      opts.backend().storage.wipe()
      location.reload()
    },
    pickFolder: (start, title) => opts.folders.pick(start, title)
  }
}
