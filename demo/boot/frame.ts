/**
 * Per-iframe boot, shared by app.html and notch.html. Runs BEFORE the real
 * renderer entry: the bridge reads `__QD_BOOT` and `getCurrentWindow().label`
 * at module evaluation (mock-events.md §0), so the mocks must already exist.
 *
 * Invokes go to the one backend in the host page (`parent.__tdBackend`); the
 * four `plugin:event|*` commands are routed through its EventBus here, because
 * the mocks' own `shouldMockEvents` ignores targets and leaks listeners.
 */
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks'
import type { Backend, FrameRole, ListenArgs, UnlistenArgs, WindowLabel } from '../backend/contracts'

declare global {
  interface Window {
    __QD_BOOT?: { platform: string; windowsBuild: number; role: FrameRole }
  }
}

const WINDOWS_BUILD = 26200

/** The host page's backend, or null when this frame runs on its own (or cross-origin). */
function parentBackend(): Backend | null {
  if (window.parent === window) return null
  try {
    return window.parent.__tdBackend ?? null
  } catch {
    return null
  }
}

export async function bootFrame(label: WindowLabel, role: FrameRole): Promise<Backend> {
  window.__QD_BOOT = { platform: 'win32', windowsBuild: WINDOWS_BUILD, role }
  mockWindows(label)

  let backend = parentBackend()
  if (!backend) {
    // Standalone: this frame hosts the simulated backend itself.
    const { createBackend } = await import('../backend/index')
    backend = createBackend()
    window.__tdBackend = backend
  }
  const b = backend

  mockIPC((cmd, args) => {
    const a = (args ?? {}) as Record<string, unknown>
    switch (cmd) {
      case 'plugin:event|listen':
        return b.events.listen(label, a as unknown as ListenArgs)
      case 'plugin:event|unlisten':
        b.events.unlisten(label, a as unknown as UnlistenArgs)
        return null
      case 'plugin:event|emit':
        b.events.emit(String(a.event), a.payload)
        return null
      case 'plugin:event|emit_to': {
        const target = a.target as string | { label?: string } | undefined
        const to = typeof target === 'string' ? target : target?.label
        if (to) b.events.emitTo(to, String(a.event), a.payload)
        else b.events.emit(String(a.event), a.payload)
        return null
      }
      default:
        return b.invoke(label, cmd, args)
    }
  })

  b.attach(label, window)
  // A reload or a closed window must not leave listeners and sessions behind.
  window.addEventListener('pagehide', () => b.detach(label, window))
  return b
}
